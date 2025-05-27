import { scene } from './three-setup.js';
import { getArucoBitPattern, generateMarkerMesh, setDict as setArucoUtilDict } from './aruco-utils.js';
import { blackMaterial, whiteMaterial } from './config.js'; // Import materials

let dict;
let markerArrayObjectGroup = new THREE.Group(); // Group to hold all marker meshes

export function setDict(dictionaryData) {
    dict = dictionaryData;
    setArucoUtilDict(dictionaryData); // also set it in aruco-utils
}

function getMaxIdForDict(dictName, option) {
    if (dict && dict[dictName]) {
        return dict[dictName].length - 1;
    }
    if (option && option.getAttribute('data-number')) {
        return Number(option.getAttribute('data-number')) - 1;
    }
    // Fallback logic from original ui-handler (can be refined)
    return (dictName.includes("4x4")) ? 999 :
           (dictName.includes("5x5")) ? 999 :
           (dictName.includes("6x6_1000")) ? 999 :
           (dictName.includes("7x7")) ? 999 :
           (dictName === "mip_36h12") ? 249 :
           (dictName === "april_16h5") ? 29 :
           (dictName === "april_25h9") ? 34 :
           (dictName === "april_36h10") ? 2319 :
           (dictName === "april_36h11") ? 586 :
           (dictName === "aruco") ? 1023 : 999;
}

export function initControls(loadDictPromise) {
    scene.add(markerArrayObjectGroup); // Added here: scene is now initialized
    const dictSelect = document.querySelector('.setup select[name=dict]');
    const gridXInput = document.querySelector('.setup input[name=gridX]');
    const gridYInput = document.querySelector('.setup input[name=gridY]');
    const gapInput = document.querySelector('.setup input[name=gap]');
    const idsTextarea = document.querySelector('.setup textarea[name=ids]');
    const startIdInput = document.querySelector('.setup input[name=startId]');
    const refillButton = document.getElementById('btn-refill-ids');
    const randomizeButton = document.getElementById('btn-randomize-ids');

    const dimInput = document.querySelector('.setup input[name=dim]');
    const z1Input = document.querySelector('.setup input[name=z1]');
    const z2Input = document.querySelector('.setup input[name=z2]');
    const saveWhiteStlArrayButton = document.getElementById('save-white-stl-array-button');
    const saveBlackStlArrayButton = document.getElementById('save-black-stl-array-button');
    const saveGlbArrayButton = document.getElementById('save-glb-array-button');

    function updateMarkerArray() {
        const allActiveButtons = [saveWhiteStlArrayButton, saveBlackStlArrayButton, saveGlbArrayButton];

        if (!dict) {
            console.warn("Dictionary not loaded yet for updateMarkerArray");
            allActiveButtons.forEach(btn => { if(btn) btn.disabled = true; });
            return;
        }

        // Clear previous array
        while (markerArrayObjectGroup.children.length > 0) {
            const child = markerArrayObjectGroup.children[0];
            markerArrayObjectGroup.remove(child);
            if (child.isMesh && child.geometry) child.geometry.dispose();
            if (child.isGroup) { // If markers are groups themselves
                 child.traverse(subChild => {
                    if (subChild.isMesh && subChild.geometry) subChild.geometry.dispose();
                });
            }
        }

        const gridX = Number(gridXInput.value);
        const gridY = Number(gridYInput.value);
        const gap = Number(gapInput.value);
        const markerIdsRaw = idsTextarea.value.split(',').map(s => s.trim()).filter(s => s !== '');
        
        const dim = Number(dimInput.value);
        const z1_base = Number(z1Input.value);
        const z2_feature = Number(z2Input.value);
        const extrusionType = document.querySelector('input[name="extrusion"]:checked').value;
        const gapFillType = document.querySelector('input[name="gapFill"]:checked').value;
        const cornerFillType = document.querySelector('input[name="cornerFill"]:checked').value;

        const option = dictSelect.options[dictSelect.selectedIndex];
        const dictName = option.value;
        const patternWidth = Number(option.getAttribute('data-width'));
        const patternHeight = Number(option.getAttribute('data-height'));
        const maxId = getMaxIdForDict(dictName, option);
        startIdInput.setAttribute('max', maxId);

        const errorDisplay = document.querySelector('.marker-id');

        if (dim <= 0 || z1_base < 0 || (extrusionType !== "flat" && z2_feature < 1e-5) || (extrusionType === "flat" && z1_base < 0)) {
            allActiveButtons.forEach(btn => { if(btn) btn.disabled = true; });
            errorDisplay.innerHTML = 'Dimensions must be positive. Base height (z1) can be 0 for flat markers.';
            return;
        }

        if (gap < 0 || gap > 2 * dim) {
            allActiveButtons.forEach(btn => { if(btn) btn.disabled = true; });
            errorDisplay.innerHTML = 'Gap width must be between 0 and 2x marker dimension.';
            return;
        }

        const z2_actual = (extrusionType === "flat") ? 1e-5 : z2_feature;

        const numRequiredIds = gridX * gridY;
        if (markerIdsRaw.length !== numRequiredIds) {
            allActiveButtons.forEach(btn => { if(btn) btn.disabled = true; });
            errorDisplay.innerHTML = `Error: Number of IDs (${markerIdsRaw.length}) does not match grid size (${gridX}x${gridY}=${numRequiredIds}).`;
            return;
        }

        const markerIds = markerIdsRaw.map(Number);
        let invalidIdFound = false;
        for (const id of markerIds) {
            if (isNaN(id)) {
                errorDisplay.innerHTML = `Error: Non-numeric ID found.`;
                invalidIdFound = true;
                break;
            }
            if (id === -1 || id === -2) {
                // Special IDs are valid, skip dictionary check for them
                continue;
            }
            // For ArUco IDs (>=0), check against dictionary and maxId
            if (id < 0 || id > maxId || !dict[dictName] || !dict[dictName][id]) {
                allActiveButtons.forEach(btn => { if(btn) btn.disabled = true; });
                errorDisplay.innerHTML = `Error: Invalid or out-of-range ArUco ID found (ID: ${id}, Max: ${maxId} for ${dictName}). Special IDs -1 (white) & -2 (black) are allowed.`;
                invalidIdFound = true;
                break;
            }
        }
        if (invalidIdFound) {
            allActiveButtons.forEach(btn => { if(btn) btn.disabled = true; });
            return;
        }

        errorDisplay.innerHTML = ''; // Clear previous errors
        allActiveButtons.forEach(btn => { if(btn) btn.disabled = false; });

        for (let y_grid = 0; y_grid < gridY; y_grid++) {
            for (let x_grid = 0; x_grid < gridX; x_grid++) {
                const markerIndex = y_grid * gridX + x_grid;
                const markerIdNum = markerIds[markerIndex];
                let singleMarkerInstanceGroup;
                let fullPattern = null;
                let specialMarkerTypeStr = null;

                if (markerIdNum === -1) {
                    specialMarkerTypeStr = 'pureWhite';
                } else if (markerIdNum === -2) {
                    specialMarkerTypeStr = 'pureBlack';
                } else {
                    // Regular ArUco ID
                    fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
                }
                
                // z2_actual is already defined based on extrusion type for the whole array
                singleMarkerInstanceGroup = generateMarkerMesh(fullPattern, dim, dim, z1_base, z2_actual, extrusionType, specialMarkerTypeStr);
                
                singleMarkerInstanceGroup.position.set(
                    x_grid * (dim + gap) - (gridX - 1) * (dim + gap) / 2,
                    (gridY - 1 - y_grid) * (dim + gap) - (gridY - 1) * (dim + gap) / 2, 
                    0
                );
                markerArrayObjectGroup.add(singleMarkerInstanceGroup);
            }
        }

        // --- Gap Filler Logic START ---
        // 1. Clear any previously created filler/corner meshes by name.
        const childrenToRemove = markerArrayObjectGroup.children.filter(child => 
            child.name === 'gap_filler_base' || // Changed from gap_filler
            child.name.startsWith('intersection_fill_') || // Will be removed if we simplify to base + optional elevated
            child.name.startsWith('outer_corner_') ||     // Will be removed
            child.name.startsWith('edge_top_corner_') ||    // Will be removed
            child.name.startsWith('edge_bottom_corner_') || // Will be removed
            child.name.startsWith('edge_left_corner_') ||  // Will be removed
            child.name.startsWith('edge_right_corner_') || // Will be removed
            child.name.startsWith('elevated_') || // For new elevated corners
            child.name.startsWith('flat_opposite_') // For new flat opposite corners
        );
        childrenToRemove.forEach(child => {
            markerArrayObjectGroup.remove(child);
            if (child.isMesh && child.geometry) child.geometry.dispose();
        });

        if (gapFillType === 'black' || gapFillType === 'white') {
            const fillerMaterial = (gapFillType === 'black') ? blackMaterial : whiteMaterial;
            let cornerPieceMaterial = fillerMaterial;
            if (cornerFillType === 'opposite') {
                cornerPieceMaterial = (fillerMaterial === blackMaterial) ? whiteMaterial : blackMaterial;
            }

            const baseFillThickness = Math.max(z1_base, 0.1);
            // Ensure flat extrusion has min thickness if z1_base is 0
            // This is now implicitly handled by Math.max(z1_base, 0.1) as z1_base >= 0 constraint exists
            const baseFillZOffset = baseFillThickness / 2;
            
            // Use z2_feature for elevated corner height, ensuring a minimum if it's positive, or 0 if z2_feature is 0
            let actualFeatureHeightForCorners = 0;
            if (z2_feature >= 1e-5) { // Only consider if z2_feature is meant to be there
                actualFeatureHeightForCorners = Math.max(z2_feature, 0.1);
            }
            const elevatedCornerZOffset = baseFillThickness + actualFeatureHeightForCorners / 2;

            const baseFillerGeometries = [];
            const markersAreaWidth = gridX * dim + Math.max(0, gridX - 1) * gap;
            const markersAreaHeight = gridY * dim + Math.max(0, gridY - 1) * gap;
            const borderWidth = gap;

            // --- Step 1: Define geometries for the continuous base layer ---
            // For flat mode with different corner material, corner areas are NOT added to baseFillerGeometries.

            // 1A. Horizontal straight gap segments (always part of base if fill is active)
            if (gridY > 1 && gap > 1e-5) {
                for (let r_gap = 0; r_gap < gridY - 1; r_gap++) {
                    for (let c_marker = 0; c_marker < gridX; c_marker++) {
                        const hGapGeo = new THREE.BoxGeometry(dim, gap, baseFillThickness);
                        hGapGeo.translate(c_marker * (dim + gap) - (gridX - 1) * (dim + gap) / 2, 
                                          (gridY - 1 - (r_gap + 1)) * (dim + gap) - (gridY - 1) * (dim + gap) / 2 + (dim / 2) + (gap / 2), 
                                          baseFillZOffset);
                        baseFillerGeometries.push(hGapGeo);
                    }
                }
            }

            // 1B. Vertical straight gap segments (always part of base if fill is active)
            if (gridX > 1 && gap > 1e-5) {
                for (let c_gap = 0; c_gap < gridX - 1; c_gap++) {
                    for (let r_marker = 0; r_marker < gridY; r_marker++) {
                        const vGapGeo = new THREE.BoxGeometry(gap, dim, baseFillThickness);
                        vGapGeo.translate(c_gap * (dim + gap) - (gridX - 1) * (dim + gap) / 2 + (dim/2) + (gap/2), 
                                          (gridY - 1 - r_marker) * (dim + gap) - (gridY - 1) * (dim + gap) / 2, 
                                          baseFillZOffset);
                        baseFillerGeometries.push(vGapGeo);
                    }
                }
            }

            // 1C. Inter-marker intersections (gap x gap squares)
            if (gridX > 1 && gridY > 1 && gap > 1e-5) {
                for (let r_intersect = 0; r_intersect < gridY - 1; r_intersect++) {
                    for (let c_intersect = 0; c_intersect < gridX - 1; c_intersect++) {
                        if (cornerPieceMaterial === fillerMaterial || extrusionType !== 'flat') {
                            const iGapGeo = new THREE.BoxGeometry(gap, gap, baseFillThickness);
                            iGapGeo.translate(c_intersect * (dim + gap) - (gridX - 1) * (dim + gap) / 2 + (dim/2) + (gap/2), 
                                              (gridY - 1 - (r_intersect + 1)) * (dim + gap) - (gridY - 1) * (dim + gap) / 2 + (dim / 2) + (gap / 2), 
                                              baseFillZOffset);
                            baseFillerGeometries.push(iGapGeo);
                        }
                    }
                }
            }
            
            // 1D. Outer Border (all parts contributing to the base layer)
            if (borderWidth > 1e-5) {
                // Outermost Border Corner pieces (4 of them)
                const outerCornerBasePositions = [
                    { x: -markersAreaWidth / 2 - borderWidth / 2, y: markersAreaHeight / 2 + borderWidth / 2 }, 
                    { x: markersAreaWidth / 2 + borderWidth / 2,  y: markersAreaHeight / 2 + borderWidth / 2 }, 
                    { x: -markersAreaWidth / 2 - borderWidth / 2, y: -markersAreaHeight / 2 - borderWidth / 2 }, 
                    { x: markersAreaWidth / 2 + borderWidth / 2,  y: -markersAreaHeight / 2 - borderWidth / 2 }  
                ];
                for (const corner of outerCornerBasePositions) {
                    if (cornerPieceMaterial === fillerMaterial || extrusionType !== 'flat') {
                        const outerCornerBaseGeo = new THREE.BoxGeometry(borderWidth, borderWidth, baseFillThickness);
                        outerCornerBaseGeo.translate(corner.x, corner.y, baseFillZOffset);
                        baseFillerGeometries.push(outerCornerBaseGeo);
                    }
                }

                // Edge Intersections (Marker-to-Border corners)
                if (gridX > 1) { // Top and Bottom edge intersections
                    for (let c_edge = 0; c_edge < gridX - 1; c_edge++) {
                        const edgeCornerX = c_edge * (dim + gap) - (gridX - 1) * (dim + gap) / 2 + (dim/2) + (gap/2);
                        if (cornerPieceMaterial === fillerMaterial || extrusionType !== 'flat') {
                            const topEdgeBaseGeo = new THREE.BoxGeometry(gap, borderWidth, baseFillThickness);
                            topEdgeBaseGeo.translate(edgeCornerX, markersAreaHeight / 2 + borderWidth / 2, baseFillZOffset);
                            baseFillerGeometries.push(topEdgeBaseGeo);
                            const bottomEdgeBaseGeo = new THREE.BoxGeometry(gap, borderWidth, baseFillThickness);
                            bottomEdgeBaseGeo.translate(edgeCornerX, -markersAreaHeight / 2 - borderWidth / 2, baseFillZOffset);
                            baseFillerGeometries.push(bottomEdgeBaseGeo);
                        }
                    }
                }
                if (gridY > 1) { // Left and Right edge intersections
                    for (let r_edge = 0; r_edge < gridY - 1; r_edge++) {
                        const edgeCornerY = (gridY - 1 - (r_edge + 1)) * (dim + gap) - (gridY - 1) * (dim + gap) / 2 + (dim / 2) + (gap / 2);
                        if (cornerPieceMaterial === fillerMaterial || extrusionType !== 'flat') {
                            const leftEdgeBaseGeo = new THREE.BoxGeometry(borderWidth, gap, baseFillThickness);
                            leftEdgeBaseGeo.translate(-markersAreaWidth / 2 - borderWidth / 2, edgeCornerY, baseFillZOffset);
                            baseFillerGeometries.push(leftEdgeBaseGeo);
                            const rightEdgeBaseGeo = new THREE.BoxGeometry(borderWidth, gap, baseFillThickness);
                            rightEdgeBaseGeo.translate(markersAreaWidth / 2 + borderWidth / 2, edgeCornerY, baseFillZOffset);
                            baseFillerGeometries.push(rightEdgeBaseGeo);
                        }
                    }
                }

                // Straight Border Segments (dim-length pieces, always part of base)
                for (let c_marker = 0; c_marker < gridX; c_marker++) { // Top & Bottom straight border parts
                    const sbsGeoTop = new THREE.BoxGeometry(dim, borderWidth, baseFillThickness);
                    sbsGeoTop.translate(c_marker*(dim+gap) - (gridX-1)*(dim+gap)/2, markersAreaHeight/2 + borderWidth/2, baseFillZOffset);
                    baseFillerGeometries.push(sbsGeoTop);
                    const sbsGeoBottom = new THREE.BoxGeometry(dim, borderWidth, baseFillThickness);
                    sbsGeoBottom.translate(c_marker*(dim+gap) - (gridX-1)*(dim+gap)/2, -markersAreaHeight/2 - borderWidth/2, baseFillZOffset);
                    baseFillerGeometries.push(sbsGeoBottom);
                }
                for (let r_marker = 0; r_marker < gridY; r_marker++) { // Left & Right straight border parts
                    const sbsGeoLeft = new THREE.BoxGeometry(borderWidth, dim, baseFillThickness);
                    sbsGeoLeft.translate(-markersAreaWidth/2 - borderWidth/2, (gridY-1-r_marker)*(dim+gap) - (gridY-1)*(dim+gap)/2, baseFillZOffset);
                    baseFillerGeometries.push(sbsGeoLeft);
                    const sbsGeoRight = new THREE.BoxGeometry(borderWidth, dim, baseFillThickness);
                    sbsGeoRight.translate(markersAreaWidth/2 + borderWidth/2, (gridY-1-r_marker)*(dim+gap) - (gridY-1)*(dim+gap)/2, baseFillZOffset);
                    baseFillerGeometries.push(sbsGeoRight);
                }
            }
            
            // Merge and add the continuous base layer
            if (baseFillerGeometries.length > 0) {
                const mergedBaseFill = THREE.BufferGeometryUtils.mergeBufferGeometries(baseFillerGeometries);
                if (mergedBaseFill) {
                    const baseFillMesh = new THREE.Mesh(mergedBaseFill, fillerMaterial);
                    baseFillMesh.name = 'gap_filler_base'; 
                    markerArrayObjectGroup.add(baseFillMesh);
                }
            }

            // --- Step 2: Add separate/elevated corner pieces if materials differ ---
            if (cornerPieceMaterial !== fillerMaterial) {
                // Helper to create a named mesh for a corner piece
                function createCornerPieceMesh(geometry, namePrefix, r_idx, c_idx, zOffset, height) {
                    const geo = geometry.clone(); // Use a clone if base geo is reused
                    geo.translate(0,0,0); // Reset translation, apply based on parameters
                    const newMesh = new THREE.Mesh(new THREE.BoxGeometry(geo.parameters.width, geo.parameters.height, height), cornerPieceMaterial);
                    
                    // Re-calculate translation for the specific piece based on its type and indices
                    // This part is tricky because geometry passed might not have its final translation state.
                    // It's better to pass dimensions and center coordinates directly to this helper.

                    // Let's redefine: createCornerPieceMesh(dims, centerPos, namePrefix, r_idx, c_idx, material, zOffset, height)
                    // For now, sticking to geometry as input means previous translate was for base layer.
                    // We need to re-calculate world position for the center of the piece, then apply new Z.
                }

                const cornerPieceGeoDefs = []; // To store {width, depth, centerX, centerY, namePrefix, r_idx, c_idx}

                // A. Inter-marker intersections
                if (gridX > 1 && gridY > 1 && gap > 1e-5) {
                    for (let r_intersect = 0; r_intersect < gridY - 1; r_intersect++) {
                        for (let c_intersect = 0; c_intersect < gridX - 1; c_intersect++) {
                            cornerPieceGeoDefs.push({
                                width: gap, depth: gap, 
                                centerX: c_intersect * (dim + gap) - (gridX - 1) * (dim + gap) / 2 + (dim/2) + (gap/2),
                                centerY: (gridY - 1 - (r_intersect + 1)) * (dim + gap) - (gridY - 1) * (dim + gap) / 2 + (dim / 2) + (gap / 2),
                                namePrefix: 'intersection_fill', r_idx: r_intersect, c_idx: c_intersect
                            });
                        }
                    }
                }

                // B. Outer Border Corners (4 of them)
                if (borderWidth > 1e-5) {
                    const outerCorners = [
                        { x: -markersAreaWidth/2 - borderWidth/2, y: markersAreaHeight/2 + borderWidth/2, name: 'outer_corner_tl' },
                        { x: markersAreaWidth/2 + borderWidth/2,  y: markersAreaHeight/2 + borderWidth/2, name: 'outer_corner_tr' },
                        { x: -markersAreaWidth/2 - borderWidth/2, y: -markersAreaHeight/2 - borderWidth/2, name: 'outer_corner_bl' },
                        { x: markersAreaWidth/2 + borderWidth/2,  y: -markersAreaHeight/2 - borderWidth/2, name: 'outer_corner_br' }
                    ];
                    outerCorners.forEach(c => cornerPieceGeoDefs.push({ width: borderWidth, depth: borderWidth, centerX: c.x, centerY: c.y, namePrefix: c.name.substring(0, c.name.lastIndexOf('_')) , r_idx: c.name.split('_')[2] }) ); // थोड़ा hacky name parsing
                
                    // C. Edge Intersections
                    if (gridX > 1) { // Top & Bottom edges
                        for (let c_edge = 0; c_edge < gridX - 1; c_edge++) {
                            const edgeX = c_edge*(dim+gap) - (gridX-1)*(dim+gap)/2 + (dim/2) + (gap/2);
                            cornerPieceGeoDefs.push({ width: gap, depth: borderWidth, centerX: edgeX, centerY: markersAreaHeight/2 + borderWidth/2, namePrefix: 'edge_top_corner', r_idx: 0, c_idx: c_edge });
                            cornerPieceGeoDefs.push({ width: gap, depth: borderWidth, centerX: edgeX, centerY: -markersAreaHeight/2 - borderWidth/2, namePrefix: 'edge_bottom_corner', r_idx: 0, c_idx: c_edge });
                        }
                    }
                    if (gridY > 1) { // Left & Right edges
                        for (let r_edge = 0; r_edge < gridY - 1; r_edge++) {
                            const edgeY = (gridY-1-(r_edge+1))*(dim+gap) - (gridY-1)*(dim+gap)/2 + (dim/2) + (gap/2);
                            cornerPieceGeoDefs.push({ width: borderWidth, depth: gap, centerX: -markersAreaWidth/2 - borderWidth/2, centerY: edgeY, namePrefix: 'edge_left_corner', r_idx: r_edge, c_idx: 0 });
                            cornerPieceGeoDefs.push({ width: borderWidth, depth: gap, centerX: markersAreaWidth/2 + borderWidth/2, centerY: edgeY, namePrefix: 'edge_right_corner', r_idx: r_edge, c_idx: 0 });
                        }
                    }
                }

                // Now create meshes from definitions
                for (const def of cornerPieceGeoDefs) {
                    let pieceHeight, pieceZOffset;
                    let finalNamePrefix = def.namePrefix;
                    let currentMaterial = cornerPieceMaterial; // Use cornerPieceMaterial by default

                    if (extrusionType === 'flat') {
                        // This branch is now only entered if cornerPieceMaterial !== fillerMaterial
                        pieceHeight = baseFillThickness;
                        pieceZOffset = baseFillZOffset; // Co-planar with the (now gapped) base layer
                        finalNamePrefix = 'flat_opposite_' + def.namePrefix; 
                    } else { // Positive or Negative extrusion, so elevate
                        // This branch is only entered if cornerPieceMaterial !== fillerMaterial
                        if (actualFeatureHeightForCorners < 1e-5) continue; 
                        pieceHeight = actualFeatureHeightForCorners;
                        pieceZOffset = elevatedCornerZOffset;
                        finalNamePrefix = 'elevated_' + def.namePrefix;
                    }
                    const cornerMeshGeo = new THREE.BoxGeometry(def.width, def.depth, pieceHeight);
                    cornerMeshGeo.translate(def.centerX, def.centerY, pieceZOffset);
                    const cornerMesh = new THREE.Mesh(cornerMeshGeo, currentMaterial);
                    // Construct name carefully based on indices presence
                    let name = finalNamePrefix;
                    if (def.r_idx !== undefined && String(def.r_idx).match(/^[a-zA-Z]{2}$/)) { // For tl, tr, bl, br from outer_corner_XX
                        name += `_${def.r_idx}`;
                    } else {
                        if (def.r_idx !== undefined) name += `_${def.r_idx}`;
                        if (def.c_idx !== undefined) name += `_${def.c_idx}`;
                    }
                    cornerMesh.name = name;
                    markerArrayObjectGroup.add(cornerMesh);
                }
            }
        }
        // --- Gap Filler Logic END ---

        if (markerArrayObjectGroup.children.length > 0) {
            // Ensure all world matrices are up to date before export
            markerArrayObjectGroup.updateMatrixWorld(true); // true forces update for all descendants

            let currentFileNameTotalZ;
            if (extrusionType === "flat") {
                currentFileNameTotalZ = Math.max(z1_base, 0.1);
            } else {
                currentFileNameTotalZ = z1_base + z2_actual;
            }
            errorDisplay.innerHTML = `Array: ${gridX}x${gridY} of ${dictName}. Gap: ${gap}mm. Total Z: ${currentFileNameTotalZ.toFixed(2)}mm`;
        } else {
            errorDisplay.innerHTML = 'No markers generated for the array.';
            allActiveButtons.forEach(btn => { if(btn) btn.disabled = true; });
        }
    }

    function prefillIds() {
        const gridX = Number(gridXInput.value);
        const gridY = Number(gridYInput.value);
        const startId = Number(startIdInput.value);
        const numIds = gridX * gridY;
        const option = dictSelect.options[dictSelect.selectedIndex];
        const dictName = option.value;
        const maxId = getMaxIdForDict(dictName, option);

        const ids = [];
        for (let i = 0; i < numIds; i++) {
            let currentId = startId + i;
            if (currentId > maxId) { // Wrap around or cap, here we cap and warn
                console.warn(`Requested ID ${currentId} exceeds max ID ${maxId} for ${dictName}. Capping to max ID.`);
                currentId = maxId;
            }
            ids.push(currentId);
        }
        idsTextarea.value = ids.join(',');
        updateMarkerArray();
    }

    function randomizeIds() {
        const gridX = Number(gridXInput.value);
        const gridY = Number(gridYInput.value);
        const numIds = gridX * gridY;
        const option = dictSelect.options[dictSelect.selectedIndex];
        const dictName = option.value;
        const maxId = getMaxIdForDict(dictName, option);

        if (numIds > (maxId + 1)) {
            document.querySelector('.marker-id').innerHTML = `Error: Cannot pick ${numIds} unique IDs from a pool of ${maxId + 1}. Reduce grid size or change dictionary.`;
            return;
        }

        const availableIds = [];
        for (let i = 0; i <= maxId; i++) {
            availableIds.push(i);
        }

        // Fisher-Yates shuffle
        for (let i = availableIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableIds[i], availableIds[j]] = [availableIds[j], availableIds[i]];
        }

        idsTextarea.value = availableIds.slice(0, numIds).join(',');
        updateMarkerArray();
    }

    function triggerDownload(blob, filename) {
        const link = document.createElement('a');
        link.style.display = 'none';
        document.body.appendChild(link);
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
        document.body.removeChild(link);
    }

    function getArrayBaseFilename() {
        const gridX = Number(gridXInput.value);
        const gridY = Number(gridYInput.value);
        const gap = Number(gapInput.value);
        const dim = Number(dimInput.value);
        const z1_base = Number(z1Input.value);
        const z2_feature = Number(z2Input.value);
        const extrusionType = document.querySelector('input[name="extrusion"]:checked').value;
        const dictName = dictSelect.options[dictSelect.selectedIndex].value;
        const z2_actual = (extrusionType === "flat") ? 1e-5 : z2_feature;
        let fileNameTotalZ = (extrusionType === "flat") ? Math.max(z1_base, 0.1) : z1_base + z2_actual;
        return `${dictName}_array-${gridX}x${gridY}_${dim}x${dim}x${fileNameTotalZ.toFixed(2)}mm_gap${gap}mm_${extrusionType}`;
    }

    // Kept exportGLBArray (exports full colored array)
    function exportGLBArray() {
        if (!markerArrayObjectGroup || markerArrayObjectGroup.children.length === 0) {
            console.warn("No array generated to export for GLB.");
            return;
        }
        markerArrayObjectGroup.updateMatrixWorld(true);
        const exporter = new THREE.GLTFExporter();
        exporter.parse(markerArrayObjectGroup, function (result) {
            const blob = new Blob([result], { type: 'model/gltf-binary' });
            const fileName = getArrayBaseFilename() + '.glb'; // Full GLB array filename
            triggerDownload(blob, fileName);
        }, { binary: true });
    }

    function getColoredElementsFromArray(mainArrayGroup, targetMaterial) {
        const coloredGroup = new THREE.Group();
        if (!mainArrayGroup) return coloredGroup;
        mainArrayGroup.updateMatrixWorld(true);

        mainArrayGroup.children.forEach(child => {
            if (child.isMesh) {
                // Handle base filler and individually named corner pieces
                if (child.name === 'gap_filler_base' || 
                    child.name.startsWith('elevated_') || 
                    child.name.startsWith('flat_opposite_')) {
                    if (child.material === targetMaterial) {
                        const clonedMesh = new THREE.Mesh(child.geometry.clone(), child.material);
                        // These meshes are already positioned correctly relative to the mainArrayGroup origin
                        coloredGroup.add(clonedMesh);
                    }
                }
                // Potentially other direct meshes if any, but primary focus is above and groups below
            } else if (child.isGroup) { // These are the marker groups
                child.updateMatrixWorld(true); // Ensure marker group's matrix is current
                child.children.forEach(meshInMarker => {
                    if (meshInMarker.isMesh && meshInMarker.material === targetMaterial) {
                        const clonedMesh = new THREE.Mesh(meshInMarker.geometry.clone(), meshInMarker.material);
                        // Apply the world matrix of the mesh within the marker to position it correctly in the exported group
                        meshInMarker.updateWorldMatrix(true, false);
                        clonedMesh.applyMatrix4(meshInMarker.matrixWorld);
                        coloredGroup.add(clonedMesh);
                    }
                });
            }
        });
        return coloredGroup;
    }

    // Kept exportSTLArrayColor for white/black STL array export
    function exportSTLArrayColor(colorName) {
        if (!markerArrayObjectGroup || markerArrayObjectGroup.children.length === 0) {
            console.warn("No array to process for STL color export.");
            return;
        }
        markerArrayObjectGroup.updateMatrixWorld(true);
        const targetMaterial = colorName === 'white' ? whiteMaterial : blackMaterial;
        const colorGroup = getColoredElementsFromArray(markerArrayObjectGroup, targetMaterial);
        if (colorGroup.children.length > 0) {
            const exporter = new THREE.STLExporter();
            colorGroup.updateMatrixWorld(true);
            const stlString = exporter.parse(colorGroup, { binary: false });
            const baseFilename = getArrayBaseFilename();
            triggerDownload(new Blob([stlString], { type: 'model/stl' }), `${baseFilename}_${colorName}.stl`);
        } else {
            alert(`No ${colorName} elements found in array to export for STL.`);
            console.warn(`No ${colorName} elements in array to export for STL.`);
        }
    }

    // Updated Event listeners
    if (saveWhiteStlArrayButton) saveWhiteStlArrayButton.addEventListener('click', () => exportSTLArrayColor('white'));
    if (saveBlackStlArrayButton) saveBlackStlArrayButton.addEventListener('click', () => exportSTLArrayColor('black'));
    if (saveGlbArrayButton) saveGlbArrayButton.addEventListener('click', exportGLBArray); // Exports full colored GLB array

    dictSelect.addEventListener('change', () => { prefillIds(); updateMarkerArray(); });
    gridXInput.addEventListener('input', () => { prefillIds(); updateMarkerArray(); });
    gridYInput.addEventListener('input', () => { prefillIds(); updateMarkerArray(); });
    gapInput.addEventListener('input', updateMarkerArray);
    idsTextarea.addEventListener('input', updateMarkerArray);
    dimInput.addEventListener('input', updateMarkerArray);
    z1Input.addEventListener('input', updateMarkerArray);
    z2Input.addEventListener('input', updateMarkerArray);
    document.querySelectorAll('input[name="extrusion"]').forEach(radio => {
        radio.addEventListener('change', updateMarkerArray);
    });
    document.querySelectorAll('input[name="gapFill"]').forEach(radio => { 
        radio.addEventListener('change', updateMarkerArray);
    });
    document.querySelectorAll('input[name="cornerFill"]').forEach(radio => { 
        radio.addEventListener('change', updateMarkerArray);
    });
    refillButton.addEventListener('click', prefillIds);
    randomizeButton.addEventListener('click', randomizeIds);
    startIdInput.addEventListener('input', () => { /* Just an input, prefill handles it */ });

    loadDictPromise.then(() => {
        prefillIds(); 
        updateMarkerArray();
    }).catch(err => {
        console.error("Error in initial marker array update based on dictionary load:", err);
        const allActiveButtons = [saveWhiteStlArrayButton, saveBlackStlArrayButton, saveGlbArrayButton];
        allActiveButtons.forEach(btn => { if(btn) btn.disabled = true; });
        document.querySelector('.marker-id').innerHTML = 'Error during initial array setup.';
    });
} 