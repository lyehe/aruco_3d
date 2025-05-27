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
    const saveStlArrayButton = document.getElementById('save-stl-array-button');
    const saveGlbArrayButton = document.getElementById('save-glb-array-button');

    function updateMarkerArray() {
        if (!dict) {
            console.warn("Dictionary not loaded yet for updateMarkerArray");
            if (saveStlArrayButton) saveStlArrayButton.disabled = true;
            if (saveGlbArrayButton) saveGlbArrayButton.disabled = true;
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

        const option = dictSelect.options[dictSelect.selectedIndex];
        const dictName = option.value;
        const patternWidth = Number(option.getAttribute('data-width'));
        const patternHeight = Number(option.getAttribute('data-height'));
        const maxId = getMaxIdForDict(dictName, option);
        startIdInput.setAttribute('max', maxId);

        const errorDisplay = document.querySelector('.marker-id');

        if (dim <= 0 || z1_base < 0 || (extrusionType !== "flat" && z2_feature < 1e-5) || (extrusionType === "flat" && z1_base < 0)) {
            while (markerArrayObjectGroup.children.length > 0) {
                const child = markerArrayObjectGroup.children[0];
                markerArrayObjectGroup.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.isGroup) { child.traverse(subChild => { if (subChild.isMesh && subChild.geometry) subChild.geometry.dispose(); });}
            }
            if (saveStlArrayButton) saveStlArrayButton.disabled = true;
            if (saveGlbArrayButton) saveGlbArrayButton.disabled = true;
            errorDisplay.innerHTML = 'Dimensions must be positive. Base height (z1) can be 0 for flat markers.';
            return;
        }

        if (gap < 0 || gap > 2 * dim) {
            if (saveStlArrayButton) saveStlArrayButton.disabled = true;
            if (saveGlbArrayButton) saveGlbArrayButton.disabled = true;
            errorDisplay.innerHTML = 'Gap width must be between 0 and 2x marker dimension.';
            return;
        }

        const z2_actual = (extrusionType === "flat") ? 1e-5 : z2_feature;

        const numRequiredIds = gridX * gridY;
        if (markerIdsRaw.length !== numRequiredIds) {
            if (saveStlArrayButton) saveStlArrayButton.disabled = true;
            if (saveGlbArrayButton) saveGlbArrayButton.disabled = true;
            errorDisplay.innerHTML = `Error: Number of IDs (${markerIdsRaw.length}) does not match grid size (${gridX}x${gridY}=${numRequiredIds}).`;
            return;
        }

        const markerIds = markerIdsRaw.map(Number);
        let invalidIdFound = false;
        for (const id of markerIds) {
            if (isNaN(id) || id < 0 || id > maxId || !dict[dictName] || !dict[dictName][id]) {
                if (saveStlArrayButton) saveStlArrayButton.disabled = true;
                if (saveGlbArrayButton) saveGlbArrayButton.disabled = true;
                errorDisplay.innerHTML = `Error: Invalid or out-of-range ID found (ID: ${id}, Max: ${maxId} for ${dictName}).`;
                invalidIdFound = true;
                break;
            }
        }
        if (invalidIdFound) return;

        errorDisplay.innerHTML = ''; // Clear previous errors
        if (saveStlArrayButton) saveStlArrayButton.disabled = false;
        if (saveGlbArrayButton) saveGlbArrayButton.disabled = false;

        for (let y_grid = 0; y_grid < gridY; y_grid++) {
            for (let x_grid = 0; x_grid < gridX; x_grid++) {
                const markerIndex = y_grid * gridX + x_grid;
                const markerIdNum = markerIds[markerIndex];

                const fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
                const singleMarkerInstanceGroup = generateMarkerMesh(fullPattern, dim, dim, z1_base, z2_actual, extrusionType);
                
                singleMarkerInstanceGroup.position.set(
                    x_grid * (dim + gap) - (gridX - 1) * (dim + gap) / 2,
                    (gridY - 1 - y_grid) * (dim + gap) - (gridY - 1) * (dim + gap) / 2, 
                    0
                );
                markerArrayObjectGroup.add(singleMarkerInstanceGroup);
            }
        }

        // --- Gap Filler Logic START ---
        // 1. Clear any *previously created MERGED gap_filler mesh* by its name
        const existingFiller = markerArrayObjectGroup.getObjectByName('gap_filler');
        if (existingFiller) {
            markerArrayObjectGroup.remove(existingFiller);
            if (existingFiller.geometry) existingFiller.geometry.dispose();
        }

        // 2. If a fill type is selected (black or white), create and add new fillers
        if (gapFillType === 'black' || gapFillType === 'white') {
            const fillerMaterial = (gapFillType === 'black') ? blackMaterial : whiteMaterial;
            let fillerThickness = z1_base; 
            if (extrusionType === 'flat') {
                 fillerThickness = Math.max(z1_base, 0.1); 
            } else {
                 fillerThickness = Math.max(z1_base, 0.1); 
            }
            if (fillerThickness < 1e-5) fillerThickness = 0.1; 

            const fillerZOffset = fillerThickness / 2; 
            const fillerGeometries = [];

            // Horizontal gap segments
            if (gridY > 1 && gap > 1e-5) {
                for (let r_gap = 0; r_gap < gridY - 1; r_gap++) {
                    for (let c_marker = 0; c_marker < gridX; c_marker++) {
                        const hGapGeo = new THREE.BoxGeometry(dim, gap, fillerThickness);
                        const segmentX = c_marker * (dim + gap) - (gridX - 1) * (dim + gap) / 2;
                        const segmentY = (gridY - 1 - (r_gap + 1)) * (dim + gap) - (gridY - 1) * (dim + gap) / 2 + (dim / 2) + (gap / 2);
                        hGapGeo.translate(segmentX, segmentY, fillerZOffset);
                        fillerGeometries.push(hGapGeo);
                    }
                }
            }

            // Vertical gap segments
            if (gridX > 1 && gap > 1e-5) {
                for (let c_gap = 0; c_gap < gridX - 1; c_gap++) {
                    for (let r_marker = 0; r_marker < gridY; r_marker++) {
                        const vGapGeo = new THREE.BoxGeometry(gap, dim, fillerThickness);
                        const segmentX = c_gap * (dim + gap) - (gridX - 1) * (dim + gap) / 2 + (dim/2) + (gap/2);
                        const segmentY = (gridY - 1 - r_marker) * (dim + gap) - (gridY - 1) * (dim + gap) / 2;
                        vGapGeo.translate(segmentX, segmentY, fillerZOffset);
                        fillerGeometries.push(vGapGeo);
                    }
                }
            }

            // Intersection gap segments
            if (gridX > 1 && gridY > 1 && gap > 1e-5) {
                for (let r_intersect = 0; r_intersect < gridY - 1; r_intersect++) {
                    for (let c_intersect = 0; c_intersect < gridX - 1; c_intersect++) {
                        const iGapGeo = new THREE.BoxGeometry(gap, gap, fillerThickness);
                        const intersectX = c_intersect * (dim + gap) - (gridX - 1) * (dim + gap) / 2 + (dim/2) + (gap/2);
                        const intersectY = (gridY - 1 - (r_intersect + 1)) * (dim + gap) - (gridY - 1) * (dim + gap) / 2 + (dim / 2) + (gap / 2);
                        iGapGeo.translate(intersectX, intersectY, fillerZOffset);
                        fillerGeometries.push(iGapGeo);
                    }
                }
            }

            // --- Add Border Segments START ---
            const borderWidth = gap; // Border width is same as gap width
            if (borderWidth > 1e-5) { // Only add border if gap (and thus borderWidth) is significant
                const markersAreaWidth = gridX * dim + Math.max(0, gridX - 1) * gap;
                const markersAreaHeight = gridY * dim + Math.max(0, gridY - 1) * gap;
                const fullFrameHeight = markersAreaHeight + 2 * borderWidth; // Total height including top/bottom border strips

                // Top border
                const topBorderGeo = new THREE.BoxGeometry(markersAreaWidth + 2 * borderWidth, borderWidth, fillerThickness);
                topBorderGeo.translate(0, markersAreaHeight / 2 + borderWidth / 2, fillerZOffset);
                fillerGeometries.push(topBorderGeo);

                // Bottom border
                const bottomBorderGeo = new THREE.BoxGeometry(markersAreaWidth + 2 * borderWidth, borderWidth, fillerThickness);
                bottomBorderGeo.translate(0, -markersAreaHeight / 2 - borderWidth / 2, fillerZOffset);
                fillerGeometries.push(bottomBorderGeo);

                // Left border (height now spans the full outer frame height)
                const leftBorderGeo = new THREE.BoxGeometry(borderWidth, fullFrameHeight, fillerThickness);
                leftBorderGeo.translate(-markersAreaWidth / 2 - borderWidth / 2, 0, fillerZOffset);
                fillerGeometries.push(leftBorderGeo);
                
                // Right border (height now spans the full outer frame height)
                const rightBorderGeo = new THREE.BoxGeometry(borderWidth, fullFrameHeight, fillerThickness); 
                rightBorderGeo.translate(markersAreaWidth / 2 + borderWidth / 2, 0, fillerZOffset);
                fillerGeometries.push(rightBorderGeo);
            }
            // --- Add Border Segments END ---
            
            if(fillerGeometries.length > 0){
                const mergedFillers = THREE.BufferGeometryUtils.mergeBufferGeometries(fillerGeometries);
                if(mergedFillers){
                    const fillerMesh = new THREE.Mesh(mergedFillers, fillerMaterial);
                    fillerMesh.name = 'gap_filler'; // Name for easy removal and identification
                    markerArrayObjectGroup.add(fillerMesh);
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

    function exportSTLArray() {
        if (!markerArrayObjectGroup || markerArrayObjectGroup.children.length === 0) return;
        markerArrayObjectGroup.updateMatrixWorld(true);
        const exporter = new THREE.STLExporter();
        const stlString = exporter.parse(markerArrayObjectGroup, { binary: false });
        const blob = new Blob([stlString], { type: 'model/stl' });

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
        const fileName = `${dictName}_array-${gridX}x${gridY}_${dim}x${dim}x${fileNameTotalZ.toFixed(2)}mm_gap${gap}mm_${extrusionType}.stl`;
        triggerDownload(blob, fileName);
    }

    function exportGLBArray() {
        if (!markerArrayObjectGroup || markerArrayObjectGroup.children.length === 0) return;
        markerArrayObjectGroup.updateMatrixWorld(true);
        const exporter = new THREE.GLTFExporter();
        exporter.parse(markerArrayObjectGroup, function (result) {
            const blob = new Blob([result], { type: 'model/gltf-binary' });
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
            const fileName = `${dictName}_array-${gridX}x${gridY}_${dim}x${dim}x${fileNameTotalZ.toFixed(2)}mm_gap${gap}mm_${extrusionType}.glb`;
            triggerDownload(blob, fileName);
        }, { binary: true });
    }

    if (saveStlArrayButton) saveStlArrayButton.addEventListener('click', exportSTLArray);
    if (saveGlbArrayButton) saveGlbArrayButton.addEventListener('click', exportGLBArray);

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
    document.querySelectorAll('input[name="gapFill"]').forEach(radio => { // Add listener for gap fill type
        radio.addEventListener('change', updateMarkerArray);
    });
    refillButton.addEventListener('click', prefillIds);
    randomizeButton.addEventListener('click', randomizeIds);
    startIdInput.addEventListener('input', () => { /* Just an input, prefill handles it */ });

    loadDictPromise.then(() => {
        prefillIds(); // Prefill IDs based on default grid size and start ID
        updateMarkerArray();
    }).catch(err => {
        console.error("Error in initial marker array update based on dictionary load:", err);
        if (saveStlArrayButton) saveStlArrayButton.disabled = true;
        if (saveGlbArrayButton) saveGlbArrayButton.disabled = true;
        document.querySelector('.marker-id').innerHTML = 'Error during initial array setup.';
    });
} 