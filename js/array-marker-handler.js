import { generateMarkerMesh, getArucoBitPattern } from './aruco-utils.js';
import { blackMaterial, whiteMaterial } from './config.js';
import { getMaxIdFromSelect } from './ui-common-utils.js';

let uiElements_array;
let dictionaryData_array;
let mainObjectGroup_array;
let onUpdateCallbacks_array; // { clearScene, setSaveDisabled, setInfoMessage }

export function initArrayMarkerUI(uiElements, dict, mainGroup, onUpdate) {
    uiElements_array = uiElements;
    dictionaryData_array = dict;
    mainObjectGroup_array = mainGroup;
    onUpdateCallbacks_array = onUpdate;

    uiElements_array.selects.array.dict.addEventListener('change', () => { prefillArrayIds(); });
    uiElements_array.inputs.array.gridX.addEventListener('input', () => { prefillArrayIds(); });
    uiElements_array.inputs.array.gridY.addEventListener('input', () => { prefillArrayIds(); });
    uiElements_array.inputs.array.gap.addEventListener('input', updateMarkerArray);
    uiElements_array.textareas.array.ids.addEventListener('input', updateMarkerArray);
    uiElements_array.buttons.array_refillIds.addEventListener('click', prefillArrayIds);
    uiElements_array.buttons.array_randomizeIds.addEventListener('click', randomizeArrayIds);
    uiElements_array.inputs.array.dim.addEventListener('input', updateMarkerArray);
    uiElements_array.inputs.array.z1.addEventListener('input', updateMarkerArray);
    uiElements_array.inputs.array.z2.addEventListener('input', updateMarkerArray);
    uiElements_array.radios.array.extrusion.forEach(radio => radio.addEventListener('change', updateMarkerArray));
    uiElements_array.radios.array.gapFill.forEach(radio => radio.addEventListener('change', updateMarkerArray));
    uiElements_array.radios.array.cornerFill.forEach(radio => radio.addEventListener('change', updateMarkerArray));
    // startId event listener is implicit as prefillArrayIds reads it
}

export function updateMarkerArray() {
    if (!dictionaryData_array) {
        console.warn("Dictionary not loaded yet for updateMarkerArray");
        onUpdateCallbacks_array.setSaveDisabled(true);
        onUpdateCallbacks_array.setInfoMessage('Error: Dictionary loading or failed.');
        return;
    }
    onUpdateCallbacks_array.clearScene();

    const gridX = Number(uiElements_array.inputs.array.gridX.value);
    const gridY = Number(uiElements_array.inputs.array.gridY.value);
    const gap = Number(uiElements_array.inputs.array.gap.value);
    const markerIdsRaw = uiElements_array.textareas.array.ids.value.split(',').map(s => s.trim()).filter(s => s !== '');
    const dim = Number(uiElements_array.inputs.array.dim.value);
    const z1_base = Number(uiElements_array.inputs.array.z1.value);
    const z2_feature = Number(uiElements_array.inputs.array.z2.value);
    const extrusionType = document.querySelector('input[name="array_extrusion"]:checked').value;
    const gapFillType = document.querySelector('input[name="array_gapFill"]:checked').value;
    const cornerFillType = document.querySelector('input[name="array_cornerFill"]:checked').value;

    const selectedDictElement = uiElements_array.selects.array.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const patternWidth = Number(option.getAttribute('data-width'));
    const patternHeight = Number(option.getAttribute('data-height'));
    const maxId = getMaxIdFromSelect(selectedDictElement, dictionaryData_array);
    uiElements_array.inputs.array.startId.setAttribute('max', maxId);

    if (dim <= 0 || z1_base < 0 || (extrusionType !== "flat" && z2_feature < 1e-5) || (extrusionType === "flat" && z1_base < 0)) {
        onUpdateCallbacks_array.setSaveDisabled(true);
        onUpdateCallbacks_array.setInfoMessage('Dimensions must be positive. Base height (z1) can be 0 for flat markers.');
        return;
    }
    if (gap < 0 || gap > 2 * dim) {
        onUpdateCallbacks_array.setSaveDisabled(true);
        onUpdateCallbacks_array.setInfoMessage('Gap width must be between 0 and 2x marker dimension.');
        return;
    }

    const z2_actual = (extrusionType === "flat") ? Math.max(z2_feature, 0.1) : z2_feature;
    const numRequiredIds = gridX * gridY;
    if (markerIdsRaw.length !== numRequiredIds) {
        onUpdateCallbacks_array.setSaveDisabled(true);
        onUpdateCallbacks_array.setInfoMessage(`Error: Number of IDs (${markerIdsRaw.length}) does not match grid size (${gridX}x${gridY}=${numRequiredIds}).`);
        return;
    }

    const markerIds = markerIdsRaw.map(Number);
    let invalidIdFound = false;
    for (const id of markerIds) {
        if (isNaN(id)) {
            onUpdateCallbacks_array.setInfoMessage(`Error: Non-numeric ID found.`);
            invalidIdFound = true; break;
        }
        if (id === -1 || id === -2) continue; // Special IDs are valid
        if (id < 0 || id > maxId || !dictionaryData_array[dictName] || !dictionaryData_array[dictName][id]) {
            onUpdateCallbacks_array.setInfoMessage(`Error: Invalid/out-of-range ArUco ID (ID: ${id}, Max: ${maxId} for ${dictName}). Special: -1 White, -2 Black.`);
            invalidIdFound = true; break;
        }
    }
    if (invalidIdFound) {
        onUpdateCallbacks_array.setSaveDisabled(true);
        return;
    }

    onUpdateCallbacks_array.setInfoMessage('');
    onUpdateCallbacks_array.setSaveDisabled(false);

    for (let y_grid = 0; y_grid < gridY; y_grid++) {
        for (let x_grid = 0; x_grid < gridX; x_grid++) {
            const markerIndex = y_grid * gridX + x_grid;
            const markerIdNum = markerIds[markerIndex];
            let singleMarkerInstanceGroup;
            let fullPattern = null;
            let specialMarkerTypeStr = null;

            if (markerIdNum === -1) specialMarkerTypeStr = 'pureWhite';
            else if (markerIdNum === -2) specialMarkerTypeStr = 'pureBlack';
            else fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
            
            singleMarkerInstanceGroup = generateMarkerMesh(fullPattern, dim, dim, z1_base, z2_actual, extrusionType, specialMarkerTypeStr);
            singleMarkerInstanceGroup.position.set(
                x_grid * (dim + gap) - (gridX - 1) * (dim + gap) / 2,
                (gridY - 1 - y_grid) * (dim + gap) - (gridY - 1) * (dim + gap) / 2,
                0
            );
            singleMarkerInstanceGroup.name = `marker_array_item_${markerIdNum}_${x_grid}_${y_grid}`;
            mainObjectGroup_array.add(singleMarkerInstanceGroup);
        }
    }

    const childrenToRemove = mainObjectGroup_array.children.filter(child => 
        child.name === 'gap_filler_base' || 
        child.name.startsWith('intersection_fill_') || 
        child.name.startsWith('outer_corner_') ||    
        child.name.startsWith('edge_top_corner_') ||   
        child.name.startsWith('edge_bottom_corner_') || 
        child.name.startsWith('edge_left_corner_') ||  
        child.name.startsWith('edge_right_corner_') || 
        child.name.startsWith('elevated_') || 
        child.name.startsWith('flat_opposite_')
    );
    childrenToRemove.forEach(child => {
        mainObjectGroup_array.remove(child);
        if (child.isMesh && child.geometry) child.geometry.dispose();
    });

    if (gapFillType === 'black' || gapFillType === 'white') {
        const fillerMaterial = (gapFillType === 'black') ? blackMaterial : whiteMaterial;
        let cornerPieceMaterial = fillerMaterial;
        if (cornerFillType === 'opposite') {
            cornerPieceMaterial = (fillerMaterial === blackMaterial) ? whiteMaterial : blackMaterial;
        }
        let baseFillThickness;
        if (extrusionType === "flat") {
            baseFillThickness = Math.max(z2_feature, 0.1);
        } else {
            baseFillThickness = Math.max(z1_base, 0.1);
        }
        const baseFillZOffset = baseFillThickness / 2;
        let actualFeatureHeightForCorners = 0;
        if (z2_feature >= 1e-5) {
            actualFeatureHeightForCorners = Math.max(z2_feature, 0.1);
        }
        const elevatedCornerZOffset = baseFillThickness + actualFeatureHeightForCorners / 2;
        const baseFillerGeometries = [];
        const markersAreaWidth = gridX * dim + Math.max(0, gridX - 1) * gap;
        const markersAreaHeight = gridY * dim + Math.max(0, gridY - 1) * gap;
        const borderWidth = gap;

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
        if (borderWidth > 1e-5) {
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
            if (gridX > 1) {
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
            if (gridY > 1) {
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
            for (let c_marker = 0; c_marker < gridX; c_marker++) {
                const sbsGeoTop = new THREE.BoxGeometry(dim, borderWidth, baseFillThickness);
                sbsGeoTop.translate(c_marker*(dim+gap) - (gridX-1)*(dim+gap)/2, markersAreaHeight/2 + borderWidth/2, baseFillZOffset);
                baseFillerGeometries.push(sbsGeoTop);
                const sbsGeoBottom = new THREE.BoxGeometry(dim, borderWidth, baseFillThickness);
                sbsGeoBottom.translate(c_marker*(dim+gap) - (gridX-1)*(dim+gap)/2, -markersAreaHeight/2 - borderWidth/2, baseFillZOffset);
                baseFillerGeometries.push(sbsGeoBottom);
            }
            for (let r_marker = 0; r_marker < gridY; r_marker++) {
                const sbsGeoLeft = new THREE.BoxGeometry(borderWidth, dim, baseFillThickness);
                sbsGeoLeft.translate(-markersAreaWidth/2 - borderWidth/2, (gridY-1-r_marker)*(dim+gap) - (gridY-1)*(dim+gap)/2, baseFillZOffset);
                baseFillerGeometries.push(sbsGeoLeft);
                const sbsGeoRight = new THREE.BoxGeometry(borderWidth, dim, baseFillThickness);
                sbsGeoRight.translate(markersAreaWidth/2 + borderWidth/2, (gridY-1-r_marker)*(dim+gap) - (gridY-1)*(dim+gap)/2, baseFillZOffset);
                baseFillerGeometries.push(sbsGeoRight);
            }
        }
        if (baseFillerGeometries.length > 0) {
            const mergedBaseFill = THREE.BufferGeometryUtils.mergeBufferGeometries(baseFillerGeometries);
            if (mergedBaseFill) {
                const baseFillMesh = new THREE.Mesh(mergedBaseFill, fillerMaterial);
                baseFillMesh.name = 'gap_filler_base'; 
                mainObjectGroup_array.add(baseFillMesh);
            }
        }

        if (cornerPieceMaterial !== fillerMaterial) {
            const cornerPieceGeoDefs = [];
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
            if (borderWidth > 1e-5) {
                const outerCorners = [
                    { x: -markersAreaWidth/2 - borderWidth/2, y: markersAreaHeight/2 + borderWidth/2, name: 'outer_corner_tl' },
                    { x: markersAreaWidth/2 + borderWidth/2,  y: markersAreaHeight/2 + borderWidth/2, name: 'outer_corner_tr' },
                    { x: -markersAreaWidth/2 - borderWidth/2, y: -markersAreaHeight/2 - borderWidth/2, name: 'outer_corner_bl' },
                    { x: markersAreaWidth/2 + borderWidth/2,  y: -markersAreaHeight/2 - borderWidth/2, name: 'outer_corner_br' }
                ];
                outerCorners.forEach(c => cornerPieceGeoDefs.push({ width: borderWidth, depth: borderWidth, centerX: c.x, centerY: c.y, namePrefix: c.name.substring(0, c.name.lastIndexOf('_')) , r_idx: c.name.split('_')[2] }) );
                if (gridX > 1) {
                    for (let c_edge = 0; c_edge < gridX - 1; c_edge++) {
                        const edgeX = c_edge*(dim+gap) - (gridX-1)*(dim+gap)/2 + (dim/2) + (gap/2);
                        cornerPieceGeoDefs.push({ width: gap, depth: borderWidth, centerX: edgeX, centerY: markersAreaHeight/2 + borderWidth/2, namePrefix: 'edge_top_corner', r_idx: 0, c_idx: c_edge });
                        cornerPieceGeoDefs.push({ width: gap, depth: borderWidth, centerX: edgeX, centerY: -markersAreaHeight/2 - borderWidth/2, namePrefix: 'edge_bottom_corner', r_idx: 0, c_idx: c_edge });
                    }
                }
                if (gridY > 1) {
                    for (let r_edge = 0; r_edge < gridY - 1; r_edge++) {
                        const edgeY = (gridY-1-(r_edge+1))*(dim+gap) - (gridY-1)*(dim+gap)/2 + (dim/2) + (gap/2);
                        cornerPieceGeoDefs.push({ width: borderWidth, depth: gap, centerX: -markersAreaWidth/2 - borderWidth/2, centerY: edgeY, namePrefix: 'edge_left_corner', r_idx: r_edge, c_idx: 0 });
                        cornerPieceGeoDefs.push({ width: borderWidth, depth: gap, centerX: markersAreaWidth/2 + borderWidth/2, centerY: edgeY, namePrefix: 'edge_right_corner', r_idx: r_edge, c_idx: 0 });
                    }
                }
            }
            for (const def of cornerPieceGeoDefs) {
                let pieceHeight, pieceZOffset;
                let finalNamePrefix = def.namePrefix;
                let currentMaterial = cornerPieceMaterial;
                if (extrusionType === 'flat') {
                    pieceHeight = baseFillThickness;
                    pieceZOffset = baseFillZOffset;
                    finalNamePrefix = 'flat_opposite_' + def.namePrefix; 
                } else {
                    if (actualFeatureHeightForCorners < 1e-5) continue; 
                    pieceHeight = actualFeatureHeightForCorners;
                    pieceZOffset = elevatedCornerZOffset;
                    finalNamePrefix = 'elevated_' + def.namePrefix;
                }
                const cornerMeshGeo = new THREE.BoxGeometry(def.width, def.depth, pieceHeight);
                cornerMeshGeo.translate(def.centerX, def.centerY, pieceZOffset);
                const cornerMesh = new THREE.Mesh(cornerMeshGeo, currentMaterial);
                let name = finalNamePrefix;
                if (def.r_idx !== undefined && String(def.r_idx).match(/^[a-zA-Z]{2}$/)) {
                    name += `_${def.r_idx}`;
                } else {
                    if (def.r_idx !== undefined) name += `_${def.r_idx}`;
                    if (def.c_idx !== undefined) name += `_${def.c_idx}`;
                }
                cornerMesh.name = name;
                mainObjectGroup_array.add(cornerMesh);
            }
        }
    }

    if (mainObjectGroup_array.children.length > 0) {
        mainObjectGroup_array.updateMatrixWorld(true);
        let currentFileNameTotalZ;
        if (extrusionType === "flat") {
            currentFileNameTotalZ = Math.max(z2_feature, 0.1);
        } else {
            const z2_actual_for_non_flat = (extrusionType === "flat") ? 1e-5 : z2_feature;
            currentFileNameTotalZ = z1_base + z2_actual_for_non_flat;
        }
        onUpdateCallbacks_array.setInfoMessage(`Array: ${gridX}x${gridY} of ${dictName}. Gap: ${gap}mm. Total Z: ${currentFileNameTotalZ.toFixed(2)}mm`);
    } else {
        onUpdateCallbacks_array.setInfoMessage('No markers generated for the array.');
        onUpdateCallbacks_array.setSaveDisabled(true);
    }
}

export function prefillArrayIds() { 
    const gridX = Number(uiElements_array.inputs.array.gridX.value);
    const gridY = Number(uiElements_array.inputs.array.gridY.value);
    const startId = Number(uiElements_array.inputs.array.startId.value);
    const numIds = gridX * gridY;
    const selectedDictElement = uiElements_array.selects.array.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const maxId = getMaxIdFromSelect(selectedDictElement, dictionaryData_array);

    const ids = [];
    for (let i = 0; i < numIds; i++) {
        let currentId = startId + i;
        if (currentId > maxId && currentId !== -1 && currentId !== -2) {
            console.warn(`Requested ID ${currentId} exceeds max ID ${maxId} for ${dictName}. Capping to max ID.`);
            currentId = maxId;
        }
        ids.push(currentId);
    }
    uiElements_array.textareas.array.ids.value = ids.join(',');
    updateMarkerArray(); 
}

export function randomizeArrayIds() { 
    const gridX = Number(uiElements_array.inputs.array.gridX.value);
    const gridY = Number(uiElements_array.inputs.array.gridY.value);
    const numIds = gridX * gridY;
    const selectedDictElement = uiElements_array.selects.array.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const maxId = getMaxIdFromSelect(selectedDictElement, dictionaryData_array);

    if (numIds > (maxId + 1)) { 
        onUpdateCallbacks_array.setInfoMessage(`Error: Cannot pick ${numIds} unique ArUco IDs from a pool of ${maxId + 1}. Reduce grid size or change dictionary.`);
        return;
    }

    const availableIds = [];
    for (let i = 0; i <= maxId; i++) {
        availableIds.push(i);
    }
    for (let i = availableIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableIds[i], availableIds[j]] = [availableIds[j], availableIds[i]];
    }
    uiElements_array.textareas.array.ids.value = availableIds.slice(0, numIds).join(',');
    updateMarkerArray(); 
}

export function getArrayBaseFilename() {
    const gridX = Number(uiElements_array.inputs.array.gridX.value);
    const gridY = Number(uiElements_array.inputs.array.gridY.value);
    const gap = Number(uiElements_array.inputs.array.gap.value);
    const dim = Number(uiElements_array.inputs.array.dim.value);
    const z1_base = Number(uiElements_array.inputs.array.z1.value);
    const z2_feature = Number(uiElements_array.inputs.array.z2.value);
    const extrusionType = document.querySelector('input[name="array_extrusion"]:checked').value;
    const selectedDictElement = uiElements_array.selects.array.dict;
    const dictName = selectedDictElement.options[selectedDictElement.selectedIndex].value;
    let fileNameTotalZ;
    if (extrusionType === "flat") {
        fileNameTotalZ = Math.max(z2_feature, 0.1);
    } else {
        fileNameTotalZ = z1_base + z2_feature;
    }
    return `${dictName}_array-${gridX}x${gridY}_${dim}x${dim}x${fileNameTotalZ.toFixed(2)}mm_gap${gap}mm_${extrusionType}`;
}

export function getColoredElementsFromArray(targetMaterial) {
    const coloredGroup = new THREE.Group();
    if (!mainObjectGroup_array) return coloredGroup;
    mainObjectGroup_array.traverse((object) => {
        if (object.isMesh && object.material === targetMaterial) {
            const newMesh = new THREE.Mesh(object.geometry.clone(), object.material);
            newMesh.geometry.applyMatrix4(object.matrixWorld);
            coloredGroup.add(newMesh);
        }
    });
    return coloredGroup;
} 