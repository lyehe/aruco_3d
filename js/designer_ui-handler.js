import { scene } from './three-setup.js';
import { getArucoBitPattern, generateMarkerMesh, setDict as setArucoUtilDict } from './aruco-utils.js';
import { blackMaterial, whiteMaterial } from './config.js';

let dict;
let currentMode = 'single'; // 'single', 'array', or 'charuco'
let mainObjectGroup = new THREE.Group(); // Shared group for all 3D content

// Store references to UI elements that are frequently accessed or mode-specific
const uiElements = {
    panels: {},
    buttons: {},
    inputs: { single: {}, array: {}, charuco: {} },
    selects: { single: {}, array: {}, charuco: {} },
    textareas: { single: {}, array: {}, charuco: {} },
    radios: { single: {}, array: {}, charuco: {} },
    infoDisplay: null
};

export function setDict(dictionaryData) {
    dict = dictionaryData;
    setArucoUtilDict(dictionaryData); 
}

function clearScene() {
    while (mainObjectGroup.children.length > 0) {
        const child = mainObjectGroup.children[0];
        mainObjectGroup.remove(child);
        if (child.isMesh && child.geometry) child.geometry.dispose();
        if (child.isGroup) {
            child.traverse(subChild => {
                if (subChild.isMesh && subChild.geometry) subChild.geometry.dispose();
            });
        }
    }
}

function switchMode(newMode) {
    if (currentMode === newMode) return;

    // Deactivate current mode's panel and button
    if (uiElements.panels[currentMode]) uiElements.panels[currentMode].classList.remove('active');
    if (uiElements.buttons[`mode_${currentMode}`]) uiElements.buttons[`mode_${currentMode}`].classList.remove('active');
    
    currentMode = newMode;
    clearScene();

    // Activate new mode's panel and button
    if (uiElements.panels[currentMode]) uiElements.panels[currentMode].classList.add('active');
    if (uiElements.buttons[`mode_${currentMode}`]) uiElements.buttons[`mode_${currentMode}`].classList.add('active');

    // Update display for the new mode
    triggerCurrentModeUpdate();
}

function triggerCurrentModeUpdate() {
    if (!dict) {
        console.warn("Dictionary not loaded yet.");
        if(uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = "Dictionary loading...";
        setAllSaveButtonsDisabled(true);
        return;
    }
    setAllSaveButtonsDisabled(false);

    switch (currentMode) {
        case 'single':
            updateSingleMarker();
            break;
        case 'array':
            // Call prefill first for array as it often sets up IDs before full update
            if (uiElements.buttons.array_refillIds) prefillArrayIds(); // Check if button exists
            else updateMarkerArray(); // Fallback if no prefill button
            break;
        case 'charuco':
            // Call prefill first for charuco
            if (uiElements.buttons.charuco_refillIds) prefillCharucoIds(); // Check if button exists
            else updateCharucoBoard(); // Fallback if no prefill button
            break;
    }
}

function setAllSaveButtonsDisabled(disabled) {
    if (uiElements.buttons.saveWhiteStl) uiElements.buttons.saveWhiteStl.disabled = disabled;
    if (uiElements.buttons.saveBlackStl) uiElements.buttons.saveBlackStl.disabled = disabled;
    if (uiElements.buttons.saveGlb) uiElements.buttons.saveGlb.disabled = disabled;
}

// --- Common Helper Functions (adapted or to be adapted) ---
function getMaxIdForDict(dictNameKey, mode) {
    const selectedDictElement = uiElements.selects[mode][dictNameKey];
    if (!selectedDictElement) return 999; // Fallback
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;

    if (dict && dict[dictName]) {
        return dict[dictName].length - 1;
    }
    if (option && option.getAttribute('data-number')) {
        return Number(option.getAttribute('data-number')) - 1;
    }
    // Fallback based on name (less reliable)
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

// --- Single Marker Logic (Merged from js/ui-handler.js) ---
function updateSingleMarker() {
    let markerIdNum = Number(uiElements.inputs.single.id.value);

    if (!dict && markerIdNum >= 0) { // Dictionary only needed for ArUco IDs
        console.warn("Dictionary not loaded yet for ArUco marker update");
        setAllSaveButtonsDisabled(true);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'Error: Dictionary needed for ArUco ID.';
        return;
    }
    clearScene(); // Clear mainObjectGroup

    const dim = Number(uiElements.inputs.single.dim.value);
    const z1_base = Number(uiElements.inputs.single.z1.value);
    const z2_feature = Number(uiElements.inputs.single.z2.value);
    const extrusionType = document.querySelector('input[name="single_extrusion"]:checked').value;
    const borderWidth = Number(uiElements.inputs.single.borderWidth.value);
    const borderCornerType = document.querySelector('input[name="single_borderCornerType"]:checked').value;

    let isValid = true;
    let errorMsg = '';
    const PURE_MARKER_MIN_THICKNESS = 0.1;

    if (dim <= 0) {
        isValid = false;
        errorMsg = 'Marker dimension (X/Y) must be positive.';
    } else if (borderWidth > 1e-5 && borderWidth < 0.1) {
        isValid = false;
        errorMsg = 'Border width must be at least 0.1mm if specified (or 0 for no border).';
    } else if (markerIdNum === -1 || markerIdNum === -2) { // Pure white or pure black
        if (z1_base < 0 || z2_feature < 0) {
            isValid = false;
            errorMsg = 'Base (z1) and Feature (z2) heights cannot be negative.';
        }
    } else { // ArUco marker (ID >= 0)
        if (z1_base < 0) {
            isValid = false;
            errorMsg = 'Base height (z1) must be non-negative for ArUco markers.';
        } else if (extrusionType !== "flat" && z2_feature < 1e-5) {
            isValid = false;
            errorMsg = 'Feature height (z2) must be positive for non-flat ArUco markers.';
        }
    }

    if (!isValid) {
        setAllSaveButtonsDisabled(true);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = errorMsg;
        return;
    }

    let fullPattern = null;
    let specialMarkerType = null;
    let uiMessage = '';
    let totalCalculatedZ = 0;

    const selectedDictElement = uiElements.selects.single.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const patternWidth = Number(option.getAttribute('data-width'));
    const patternHeight = Number(option.getAttribute('data-height'));

    if (markerIdNum === -1 || markerIdNum === -2) {
        specialMarkerType = markerIdNum === -1 ? 'pureWhite' : 'pureBlack';
        let c1 = Math.max(0, z1_base);
        let c2_initial = Math.max(0, z2_feature);
        let c2_final_geom = c2_initial;

        if (extrusionType === "flat") {
            if (c1 < 1e-5) totalCalculatedZ = PURE_MARKER_MIN_THICKNESS;
            else totalCalculatedZ = c1;
            if (totalCalculatedZ < PURE_MARKER_MIN_THICKNESS) totalCalculatedZ = PURE_MARKER_MIN_THICKNESS;
        } else {
            const baseIsWhite = (extrusionType === "positive");
            const featureIsWhite = (specialMarkerType === 'pureWhite');
            if ((baseIsWhite && featureIsWhite) || (!baseIsWhite && !featureIsWhite)) {
                c2_final_geom = 0;
            }
            if (c1 < 1e-5 && c2_final_geom < 1e-5) {
                totalCalculatedZ = PURE_MARKER_MIN_THICKNESS;
            } else {
                totalCalculatedZ = c1 + c2_final_geom;
            }
        }
        const colorDesc = markerIdNum === -1 ? "Pure White" : "Pure Black";
        uiMessage = `${colorDesc} Block (${extrusionType}) - ${dim}x${dim}x${totalCalculatedZ.toFixed(2)}mm`;
    } else {
        const maxId = getMaxIdForDict('dict', 'single'); // Use common getMaxIdForDict
        uiElements.inputs.single.id.setAttribute('max', maxId);
        if (markerIdNum < 0 || markerIdNum > maxId) {
            uiElements.inputs.single.id.value = Math.max(0, Math.min(markerIdNum, maxId));
            markerIdNum = Number(uiElements.inputs.single.id.value);
        }
        if (!dict[dictName] || !dict[dictName][markerIdNum]) {
            setAllSaveButtonsDisabled(true);
            if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = `ID ${markerIdNum} not found in ${dictName}`;
            return;
        }
        fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
        const z2_actual_aruco = (extrusionType === "flat") ? 1e-5 : z2_feature;
        totalCalculatedZ = (extrusionType === "flat") ? Math.max(z1_base, 0.1) : z1_base + z2_actual_aruco;
        uiMessage = `ID ${markerIdNum} (${dictName}) - ${extrusionType} (${totalCalculatedZ.toFixed(2)}mm)`;
    }

    if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = '';
    setAllSaveButtonsDisabled(false);

    const coreMarkerGroup = generateMarkerMesh(fullPattern, dim, dim, z1_base, z2_feature, extrusionType, specialMarkerType);
    let finalOutputGroup = coreMarkerGroup; // This will be added to mainObjectGroup

    if (borderWidth > 1e-5) {
        finalOutputGroup = new THREE.Group(); // Create a new group to hold marker + border
        finalOutputGroup.add(coreMarkerGroup);

        const borderGroup = new THREE.Group();
        const actual_border_base_thickness = Math.max(z1_base, 0.1);
        const actual_border_base_z_offset = actual_border_base_thickness / 2;
        let actual_border_feature_thickness = 0;
        if (extrusionType !== 'flat' && z2_feature >= 1e-5) {
            actual_border_feature_thickness = Math.max(z2_feature, 0.1);
        }
        const actual_border_feature_z_offset = actual_border_base_thickness + actual_border_feature_thickness / 2;

        let borderBaseMaterial;
        let borderFeatureMaterial = null;

        if (extrusionType === 'negative') {
            borderBaseMaterial = blackMaterial;
            if (actual_border_feature_thickness > 0) borderFeatureMaterial = whiteMaterial;
        } else if (extrusionType === 'positive') {
            borderBaseMaterial = whiteMaterial;
            if (actual_border_feature_thickness > 0) borderFeatureMaterial = blackMaterial;
        } else { // flat
            borderBaseMaterial = whiteMaterial;
        }

        const halfDim = dim / 2;
        const halfBorderWidth = borderWidth / 2;

        const straightSegmentPositions = [
            { x: 0, y: halfDim + halfBorderWidth, w: dim, h: borderWidth }, 
            { x: 0, y: -halfDim - halfBorderWidth, w: dim, h: borderWidth },
            { x: -halfDim - halfBorderWidth, y: 0, w: borderWidth, h: dim },
            { x: halfDim + halfBorderWidth, y: 0, w: borderWidth, h: dim }
        ];

        for (const seg of straightSegmentPositions) {
            const baseGeo = new THREE.BoxGeometry(seg.w, seg.h, actual_border_base_thickness);
            baseGeo.translate(seg.x, seg.y, actual_border_base_z_offset);
            borderGroup.add(new THREE.Mesh(baseGeo, borderBaseMaterial));

            let addFeatureToStraightSegment = borderFeatureMaterial && actual_border_feature_thickness > 0;
             if (extrusionType === 'positive' && (borderCornerType === 'opposite' || borderCornerType === 'same')) {
                addFeatureToStraightSegment = false;
            }

            if (addFeatureToStraightSegment) {
                const featureGeo = new THREE.BoxGeometry(seg.w, seg.h, actual_border_feature_thickness);
                featureGeo.translate(seg.x, seg.y, actual_border_feature_z_offset);
                borderGroup.add(new THREE.Mesh(featureGeo, borderFeatureMaterial));
            }
        }

        const cornerPositions = [
            { x: -halfDim - halfBorderWidth, y: halfDim + halfBorderWidth },
            { x: halfDim + halfBorderWidth, y: halfDim + halfBorderWidth },
            { x: -halfDim - halfBorderWidth, y: -halfDim - halfBorderWidth },
            { x: halfDim + halfBorderWidth, y: -halfDim - halfBorderWidth }
        ];

        for (const pos of cornerPositions) {
            if (borderCornerType === 'same') {
                const cornerBaseGeo = new THREE.BoxGeometry(borderWidth, borderWidth, actual_border_base_thickness);
                cornerBaseGeo.translate(pos.x, pos.y, actual_border_base_z_offset);
                borderGroup.add(new THREE.Mesh(cornerBaseGeo, borderBaseMaterial));

                let addFeatureToCorner = borderFeatureMaterial && actual_border_feature_thickness > 0;
                 if (extrusionType === 'positive') {
                    addFeatureToCorner = false;
                }
                if (addFeatureToCorner) {
                    const cornerFeatureGeo = new THREE.BoxGeometry(borderWidth, borderWidth, actual_border_feature_thickness);
                    cornerFeatureGeo.translate(pos.x, pos.y, actual_border_feature_z_offset);
                    borderGroup.add(new THREE.Mesh(cornerFeatureGeo, borderFeatureMaterial));
                }
            } else { // 'opposite'
                if (extrusionType === 'flat') {
                    const flatOppositeCornerMaterial = blackMaterial;
                    const cornerGeo = new THREE.BoxGeometry(borderWidth, borderWidth, actual_border_base_thickness);
                    cornerGeo.translate(pos.x, pos.y, actual_border_base_z_offset);
                    borderGroup.add(new THREE.Mesh(cornerGeo, flatOppositeCornerMaterial));
                } else if (extrusionType === 'positive') {
                    const cornerBaseGeo = new THREE.BoxGeometry(borderWidth, borderWidth, actual_border_base_thickness);
                    cornerBaseGeo.translate(pos.x, pos.y, actual_border_base_z_offset);
                    borderGroup.add(new THREE.Mesh(cornerBaseGeo, borderBaseMaterial)); 
                    if (borderFeatureMaterial && actual_border_feature_thickness > 0) {
                        const cornerFeatureGeo = new THREE.BoxGeometry(borderWidth, borderWidth, actual_border_feature_thickness);
                        cornerFeatureGeo.translate(pos.x, pos.y, actual_border_feature_z_offset);
                        borderGroup.add(new THREE.Mesh(cornerFeatureGeo, borderFeatureMaterial));
                    }
                } else { // 'negative'
                    const cornerBaseGeo = new THREE.BoxGeometry(borderWidth, borderWidth, actual_border_base_thickness);
                    cornerBaseGeo.translate(pos.x, pos.y, actual_border_base_z_offset);
                    borderGroup.add(new THREE.Mesh(cornerBaseGeo, borderBaseMaterial));
                }
            }
        }
        finalOutputGroup.add(borderGroup);
    }

    mainObjectGroup.add(finalOutputGroup);
    if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = uiMessage;
}

function getSingleMarkerBaseFilename() {
    const dim = Number(uiElements.inputs.single.dim.value);
    const z1_base_val = Number(uiElements.inputs.single.z1.value);
    const z2_feature_val = Number(uiElements.inputs.single.z2.value);
    const extrusionType = document.querySelector('input[name="single_extrusion"]:checked').value;
    let markerIdNum = Number(uiElements.inputs.single.id.value);
    const selectedDictElement = uiElements.selects.single.dict;
    const dictName = selectedDictElement.options[selectedDictElement.selectedIndex].value;
    const PURE_MARKER_MIN_THICKNESS = 0.1;

    let idPart;
    let totalZ;

    if (markerIdNum === -1 || markerIdNum === -2) {
        idPart = markerIdNum === -1 ? 'PUREWHITE' : 'PUREBLACK';
        let c1 = Math.max(0, z1_base_val);
        let c2_initial = Math.max(0, z2_feature_val);
        let c2_final_geom = c2_initial;

        if (extrusionType === "flat") {
            if (c1 < 1e-5) totalZ = PURE_MARKER_MIN_THICKNESS;
            else totalZ = c1;
            if (totalZ < PURE_MARKER_MIN_THICKNESS) totalZ = PURE_MARKER_MIN_THICKNESS;
        } else {
            const baseIsWhite = (extrusionType === "positive");
            const featureIsWhite = (markerIdNum === -1);
            if ((baseIsWhite && featureIsWhite) || (!baseIsWhite && !featureIsWhite)) {
                c2_final_geom = 0;
            }
            if (c1 < 1e-5 && c2_final_geom < 1e-5) {
                totalZ = PURE_MARKER_MIN_THICKNESS;
            } else {
                totalZ = c1 + c2_final_geom;
            }
        }
    } else {
        idPart = markerIdNum;
        const z2_actual_aruco = (extrusionType === "flat") ? 1e-5 : z2_feature_val;
        totalZ = (extrusionType === "flat") ? Math.max(z1_base_val, 0.1) : z1_base_val + z2_actual_aruco;
    }

    let baseName = `${dictName}-${idPart}_${dim}x${dim}x${totalZ.toFixed(2)}mm_${extrusionType}`;
    const borderWidthValue = Number(uiElements.inputs.single.borderWidth.value);
    if (borderWidthValue > 1e-5) {
        baseName += `_border${borderWidthValue.toFixed(1)}mm`;
    }
    return baseName;
}

function getColoredElementsFromSingle(sourceGroup, targetMaterial) {
    const tempColorGroup = new THREE.Group();
    mainObjectGroup.traverse((object) => {
        if (object.isMesh && object.material === targetMaterial) {
            const newMesh = new THREE.Mesh(object.geometry.clone(), object.material);
            newMesh.applyMatrix4(object.matrixWorld);
            tempColorGroup.add(newMesh);
        }
    });
    return tempColorGroup;
}

// --- Marker Array Logic (Merged from js/array_ui-handler.js) ---
function updateMarkerArray() {
    if (!dict) {
        console.warn("Dictionary not loaded yet for updateMarkerArray");
        setAllSaveButtonsDisabled(true);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'Error: Dictionary loading or failed.';
        return;
    }
    clearScene();

    const gridX = Number(uiElements.inputs.array.gridX.value);
    const gridY = Number(uiElements.inputs.array.gridY.value);
    const gap = Number(uiElements.inputs.array.gap.value);
    const markerIdsRaw = uiElements.textareas.array.ids.value.split(',').map(s => s.trim()).filter(s => s !== '');
    const dim = Number(uiElements.inputs.array.dim.value);
    const z1_base = Number(uiElements.inputs.array.z1.value);
    const z2_feature = Number(uiElements.inputs.array.z2.value);
    const extrusionType = document.querySelector('input[name="array_extrusion"]:checked').value;
    const gapFillType = document.querySelector('input[name="array_gapFill"]:checked').value;
    const cornerFillType = document.querySelector('input[name="array_cornerFill"]:checked').value;

    const selectedDictElement = uiElements.selects.array.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const patternWidth = Number(option.getAttribute('data-width'));
    const patternHeight = Number(option.getAttribute('data-height'));
    const maxId = getMaxIdForDict('dict', 'array');
    uiElements.inputs.array.startId.setAttribute('max', maxId);

    if (dim <= 0 || z1_base < 0 || (extrusionType !== "flat" && z2_feature < 1e-5) || (extrusionType === "flat" && z1_base < 0)) {
        setAllSaveButtonsDisabled(true);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'Dimensions must be positive. Base height (z1) can be 0 for flat markers.';
        return;
    }
    if (gap < 0 || gap > 2 * dim) {
        setAllSaveButtonsDisabled(true);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'Gap width must be between 0 and 2x marker dimension.';
        return;
    }

    const z2_actual = (extrusionType === "flat") ? 1e-5 : z2_feature;
    const numRequiredIds = gridX * gridY;
    if (markerIdsRaw.length !== numRequiredIds) {
        setAllSaveButtonsDisabled(true);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = `Error: Number of IDs (${markerIdsRaw.length}) does not match grid size (${gridX}x${gridY}=${numRequiredIds}).`;
        return;
    }

    const markerIds = markerIdsRaw.map(Number);
    let invalidIdFound = false;
    for (const id of markerIds) {
        if (isNaN(id)) {
            if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = `Error: Non-numeric ID found.`;
            invalidIdFound = true; break;
        }
        if (id === -1 || id === -2) continue; // Special IDs are valid
        if (id < 0 || id > maxId || !dict[dictName] || !dict[dictName][id]) {
            if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = `Error: Invalid/out-of-range ArUco ID (ID: ${id}, Max: ${maxId} for ${dictName}). Special: -1 White, -2 Black.`;
            invalidIdFound = true; break;
        }
    }
    if (invalidIdFound) {
        setAllSaveButtonsDisabled(true);
        return;
    }

    if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = '';
    setAllSaveButtonsDisabled(false);

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
            mainObjectGroup.add(singleMarkerInstanceGroup);
        }
    }
    // --- Gap Filler Logic START ---
    const childrenToRemove = mainObjectGroup.children.filter(child => 
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
        mainObjectGroup.remove(child);
        if (child.isMesh && child.geometry) child.geometry.dispose();
    });

    if (gapFillType === 'black' || gapFillType === 'white') {
        const fillerMaterial = (gapFillType === 'black') ? blackMaterial : whiteMaterial;
        let cornerPieceMaterial = fillerMaterial;
        if (cornerFillType === 'opposite') {
            cornerPieceMaterial = (fillerMaterial === blackMaterial) ? whiteMaterial : blackMaterial;
        }
        const baseFillThickness = Math.max(z1_base, 0.1);
        const baseFillZOffset = baseFillThickness / 2;
        let actualFeatureHeightForCorners = 0;
        if (z2_feature >= 1e-5) {
            actualFeatureHeightForCorners = Math.max(z2_feature, 0.1);
        }
        const elevatedCornerZOffset = baseFillThickness + actualFeatureHeightForCorners / 2;
        const baseFillerGeometries = [];
        const markersAreaWidth = gridX * dim + Math.max(0, gridX - 1) * gap;
        const markersAreaHeight = gridY * dim + Math.max(0, gridY - 1) * gap;
        const borderWidth = gap; // For array, border width IS the gap width

        // Horizontal Gaps
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
        // Vertical Gaps
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
        // Inter-marker intersections
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
        // Outer Border (if gap is considered a border)
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
        if (baseFillerGeometries.length > 0) {
            const mergedBaseFill = THREE.BufferGeometryUtils.mergeBufferGeometries(baseFillerGeometries);
            if (mergedBaseFill) {
                const baseFillMesh = new THREE.Mesh(mergedBaseFill, fillerMaterial);
                baseFillMesh.name = 'gap_filler_base'; 
                mainObjectGroup.add(baseFillMesh);
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
                mainObjectGroup.add(cornerMesh);
            }
        }
    }
    // --- Gap Filler Logic END ---

    if (mainObjectGroup.children.length > 0) {
        mainObjectGroup.updateMatrixWorld(true);
        let currentFileNameTotalZ;
        if (extrusionType === "flat") {
            currentFileNameTotalZ = Math.max(z1_base, 0.1);
        } else {
            currentFileNameTotalZ = z1_base + z2_actual;
        }
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = `Array: ${gridX}x${gridY} of ${dictName}. Gap: ${gap}mm. Total Z: ${currentFileNameTotalZ.toFixed(2)}mm`;
    } else {
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'No markers generated for the array.';
        setAllSaveButtonsDisabled(true);
    }
}

function prefillArrayIds() { 
    const gridX = Number(uiElements.inputs.array.gridX.value);
    const gridY = Number(uiElements.inputs.array.gridY.value);
    const startId = Number(uiElements.inputs.array.startId.value);
    const numIds = gridX * gridY;
    const selectedDictElement = uiElements.selects.array.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const maxId = getMaxIdForDict('dict', 'array');

    const ids = [];
    for (let i = 0; i < numIds; i++) {
        let currentId = startId + i;
        if (currentId > maxId && currentId !== -1 && currentId !== -2) { // Allow special IDs to exceed for refill scenario
            console.warn(`Requested ID ${currentId} exceeds max ID ${maxId} for ${dictName}. Capping to max ID.`);
            currentId = maxId;
        }
        ids.push(currentId);
    }
    uiElements.textareas.array.ids.value = ids.join(',');
    updateMarkerArray(); 
}

function randomizeArrayIds() { 
    const gridX = Number(uiElements.inputs.array.gridX.value);
    const gridY = Number(uiElements.inputs.array.gridY.value);
    const numIds = gridX * gridY;
    const selectedDictElement = uiElements.selects.array.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const maxId = getMaxIdForDict('dict', 'array');

    if (numIds > (maxId + 1)) { // Max ID is 0-indexed, so pool size is maxId + 1
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = `Error: Cannot pick ${numIds} unique ArUco IDs from a pool of ${maxId + 1}. Reduce grid size or change dictionary.`;
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
    uiElements.textareas.array.ids.value = availableIds.slice(0, numIds).join(',');
    updateMarkerArray(); 
}

function getArrayBaseFilename() {
    const gridX = Number(uiElements.inputs.array.gridX.value);
    const gridY = Number(uiElements.inputs.array.gridY.value);
    const gap = Number(uiElements.inputs.array.gap.value);
    const dim = Number(uiElements.inputs.array.dim.value);
    const z1_base = Number(uiElements.inputs.array.z1.value);
    const z2_feature = Number(uiElements.inputs.array.z2.value);
    const extrusionType = document.querySelector('input[name="array_extrusion"]:checked').value;
    const selectedDictElement = uiElements.selects.array.dict;
    const dictName = selectedDictElement.options[selectedDictElement.selectedIndex].value;
    const z2_actual = (extrusionType === "flat") ? 1e-5 : z2_feature;
    let fileNameTotalZ = (extrusionType === "flat") ? Math.max(z1_base, 0.1) : z1_base + z2_actual;
    return `${dictName}_array-${gridX}x${gridY}_${dim}x${dim}x${fileNameTotalZ.toFixed(2)}mm_gap${gap}mm_${extrusionType}`;
}

function getColoredElementsFromArray(sourceGroup, targetMaterial) {
    const coloredGroup = new THREE.Group();
    if (!sourceGroup) return coloredGroup;
    sourceGroup.traverse((object) => {
        if (object.isMesh && object.material === targetMaterial) {
            const newMesh = new THREE.Mesh(object.geometry.clone(), object.material);
            newMesh.applyMatrix4(object.matrixWorld);
            coloredGroup.add(newMesh);
        }
    });
    return coloredGroup;
}

// --- ChArUco Board Logic (Merged from js/charuco_ui-handler.js) ---
function determineIsWhiteSquare(r, c, firstSquareColor) { // Helper for ChArUco
    if (firstSquareColor === 'white') {
        return (r % 2 === c % 2);
    } else { // black
        return (r % 2 !== c % 2);
    }
}

function calculateNumWhiteSquares(squaresX, squaresY, firstSquareColor) { // Helper for ChArUco
    let count = 0;
    for (let r = 0; r < squaresY; r++) {
        for (let c = 0; c < squaresX; c++) {
            if (determineIsWhiteSquare(r, c, firstSquareColor)) {
                count++;
            }
        }
    }
    return count;
}

function updateCharucoBoard() {
    if (!dict) {
        console.warn("Dictionary not loaded yet for updateCharucoBoard");
        setAllSaveButtonsDisabled(true);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'Error: Dictionary loading or failed.';
        return;
    }
    clearScene();

    const squaresX = Number(uiElements.inputs.charuco.squaresX.value);
    const squaresY = Number(uiElements.inputs.charuco.squaresY.value);
    const squareSize = Number(uiElements.inputs.charuco.squareSize.value);
    const markerMargin = Number(uiElements.inputs.charuco.markerMargin.value);
    const markerIdsRaw = uiElements.textareas.charuco.ids.value.split(',').map(s => s.trim()).filter(s => s !== '');
    const z1_base_board = Number(uiElements.inputs.charuco.z1.value);
    const z2_feature_board = Number(uiElements.inputs.charuco.z2.value);
    const extrusionType = document.querySelector('input[name="charuco_extrusion"]:checked').value;
    const firstSquareColor = document.querySelector('input[name="charuco_firstSquare"]:checked').value;

    const selectedDictElement = uiElements.selects.charuco.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const patternWidth = Number(option.getAttribute('data-width'));
    const patternHeight = Number(option.getAttribute('data-height'));
    const maxId = getMaxIdForDict('dict', 'charuco');
    uiElements.inputs.charuco.startId.setAttribute('max', maxId);

    if (squareSize <= 0 || z1_base_board < 0 || (extrusionType !== "flat" && z2_feature_board < 1e-5)) {
        setAllSaveButtonsDisabled(true);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'Board dimensions must be positive. Base height (z1) must be non-negative. Feature height (z2) must be positive for non-flat extrusions.';
        return;
    }
    if (extrusionType === "flat" && z1_base_board < 0) {
         setAllSaveButtonsDisabled(true);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'Base height (z1) must be non-negative for flat boards.';
        return;
    }
    if (markerMargin < 0 || markerMargin * 2 >= squareSize) {
        setAllSaveButtonsDisabled(true);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'Marker margin must be non-negative and less than half the square size.';
        return;
    }
    const markerDim = squareSize - (2 * markerMargin);
    const numWhiteSquares = calculateNumWhiteSquares(squaresX, squaresY, firstSquareColor);
    if (markerDim <= 0 && numWhiteSquares > 0) {
        setAllSaveButtonsDisabled(true);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'Marker dimension (derived) must be positive when markers are present.';
        return;
    }
    if (markerIdsRaw.length !== numWhiteSquares) {
        setAllSaveButtonsDisabled(true);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = `Error: Number of IDs (${markerIdsRaw.length}) does not match white squares (${numWhiteSquares}).`;
        return;
    }
    const markerIds = markerIdsRaw.map(Number);
    let invalidIdFound = false;
    if (numWhiteSquares > 0) {
        for (const id of markerIds) {
            if (isNaN(id) || id < 0 || id > maxId || !dict[dictName] || !dict[dictName][id]) {
                if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = `Error: Invalid ArUco ID (ID: ${id}, Max: ${maxId} for ${dictName}).`;
                invalidIdFound = true; break;
            }
        }
    }
    if (invalidIdFound) {
        setAllSaveButtonsDisabled(true);
        return;
    }

    if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = '';
    setAllSaveButtonsDisabled(false);

    let markerIdCounter = 0;
    const boardTotalWidth = squaresX * squareSize;
    const boardTotalHeight = squaresY * squareSize;

    if (extrusionType !== "flat" && z1_base_board >= 1e-5) {
        const basePlateMaterial = (extrusionType === "positive") ? whiteMaterial : blackMaterial;
        const boardBaseGeo = new THREE.BoxGeometry(boardTotalWidth, boardTotalHeight, z1_base_board);
        boardBaseGeo.translate(0, 0, z1_base_board / 2);
        const boardBaseMesh = new THREE.Mesh(boardBaseGeo, basePlateMaterial);
        boardBaseMesh.name = "charuco_base_plate";
        mainObjectGroup.add(boardBaseMesh);
    }

    const flatPieceThickness = Math.max(z1_base_board, 0.1);
    const flatPieceZOffset = flatPieceThickness / 2;

    for (let r_grid = 0; r_grid < squaresY; r_grid++) {
        for (let c_grid = 0; c_grid < squaresX; c_grid++) {
            const isWhiteSq = determineIsWhiteSquare(r_grid, c_grid, firstSquareColor);
            const squareCenterX = c_grid * squareSize - boardTotalWidth / 2 + squareSize / 2;
            const squareCenterY = -(r_grid * squareSize - boardTotalHeight / 2 + squareSize / 2);

            if (extrusionType === "flat") {
                if (isWhiteSq) {
                    const markerIdNum = markerIds[markerIdCounter++];
                    const fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
                    if (markerMargin > 1e-5) {
                        const marginGeometries = [];
                        marginGeometries.push(new THREE.BoxGeometry(squareSize, markerMargin, flatPieceThickness).translate(0, (squareSize/2) - (markerMargin/2), 0));
                        marginGeometries.push(new THREE.BoxGeometry(squareSize, markerMargin, flatPieceThickness).translate(0, -(squareSize/2) + (markerMargin/2), 0));
                        marginGeometries.push(new THREE.BoxGeometry(markerMargin, markerDim, flatPieceThickness).translate(-(squareSize/2) + (markerMargin/2), 0, 0));
                        marginGeometries.push(new THREE.BoxGeometry(markerMargin, markerDim, flatPieceThickness).translate((squareSize/2) - (markerMargin/2), 0, 0));
                        if (marginGeometries.length > 0) {
                            const mergedMarginGeo = THREE.BufferGeometryUtils.mergeBufferGeometries(marginGeometries);
                            if (mergedMarginGeo) {
                                mergedMarginGeo.translate(0, 0, flatPieceZOffset); // Apply Z offset after merge
                                const marginMesh = new THREE.Mesh(mergedMarginGeo, whiteMaterial);
                                marginMesh.position.set(squareCenterX, squareCenterY, 0); // Position the group containing translated geo
                                marginMesh.name = `flat_white_margin_${r_grid}_${c_grid}`;
                                mainObjectGroup.add(marginMesh);
                            }
                        }
                    }
                    const markerMeshGroup = generateMarkerMesh(fullPattern, markerDim, markerDim, flatPieceThickness, 1e-5, "flat", null);
                    markerMeshGroup.position.set(squareCenterX, squareCenterY, 0); // Z is handled by generateMarkerMesh for flat
                    markerMeshGroup.name = `marker_flat_${markerIdNum}`;
                    mainObjectGroup.add(markerMeshGroup);
                } else {
                    const blackSquareGeo = new THREE.BoxGeometry(squareSize, squareSize, flatPieceThickness);
                    blackSquareGeo.translate(0, 0, flatPieceZOffset);
                    const blackSquareMesh = new THREE.Mesh(blackSquareGeo, blackMaterial);
                    blackSquareMesh.position.set(squareCenterX, squareCenterY, 0);
                    blackSquareMesh.name = `flat_black_square_${r_grid}_${c_grid}`;
                    mainObjectGroup.add(blackSquareMesh);
                }
            } else if (extrusionType === "positive") {
                if (!isWhiteSq) {
                    const blackSquareGeo = new THREE.BoxGeometry(squareSize, squareSize, z2_feature_board);
                    // Position is relative to mainObjectGroup origin, base plate is at Z=0 if it exists.
                    blackSquareGeo.translate(squareCenterX, squareCenterY, z1_base_board + z2_feature_board / 2);
                    const blackSquareMesh = new THREE.Mesh(blackSquareGeo, blackMaterial);
                    blackSquareMesh.name = `positive_black_square_${r_grid}_${c_grid}`;
                    mainObjectGroup.add(blackSquareMesh);
                }
                if (isWhiteSq) {
                    const markerIdNum = markerIds[markerIdCounter++];
                    const fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
                    const markerMeshGroup = generateMarkerMesh(fullPattern, markerDim, markerDim, 0, z2_feature_board, "positive", null);
                    markerMeshGroup.position.set(squareCenterX, squareCenterY, z1_base_board); // Marker base sits on charuco base plate
                    markerMeshGroup.name = `marker_positive_${markerIdNum}`;
                    mainObjectGroup.add(markerMeshGroup);
                }
            } else { // extrusionType === "negative"
                if (isWhiteSq) {
                    const markerIdNum = markerIds[markerIdCounter++];
                    const fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
                    if (markerMargin > 1e-5) {
                        const marginGeometriesN = [];
                        marginGeometriesN.push(new THREE.BoxGeometry(squareSize, markerMargin, z2_feature_board).translate(0, (squareSize/2) - (markerMargin/2), 0));
                        marginGeometriesN.push(new THREE.BoxGeometry(squareSize, markerMargin, z2_feature_board).translate(0, -(squareSize/2) + (markerMargin/2), 0));
                        marginGeometriesN.push(new THREE.BoxGeometry(markerMargin, markerDim, z2_feature_board).translate(-(squareSize/2) + (markerMargin/2), 0, 0));
                        marginGeometriesN.push(new THREE.BoxGeometry(markerMargin, markerDim, z2_feature_board).translate((squareSize/2) - (markerMargin/2), 0, 0));
                        if (marginGeometriesN.length > 0) {
                            const mergedMarginGeoN = THREE.BufferGeometryUtils.mergeBufferGeometries(marginGeometriesN);
                            if (mergedMarginGeoN) {
                                const marginMeshN = new THREE.Mesh(mergedMarginGeoN, whiteMaterial);
                                // Position of white margin pieces on top of the base plate (if any)
                                marginMeshN.position.set(squareCenterX, squareCenterY, z1_base_board + z2_feature_board / 2);
                                marginMeshN.name = `negative_white_margin_${r_grid}_${c_grid}`;
                                mainObjectGroup.add(marginMeshN);
                            }
                        }
                    }
                    const markerMeshGroup = generateMarkerMesh(fullPattern, markerDim, markerDim, 0, z2_feature_board, "negative", null);
                    markerMeshGroup.position.set(squareCenterX, squareCenterY, z1_base_board); // Engraved into white square which is on black base
                    markerMeshGroup.name = `marker_negative_${markerIdNum}`;
                    mainObjectGroup.add(markerMeshGroup);
                } else { // Black square for negative extrusion
                    if (z1_base_board < 1e-5) { // No main black base, create explicit black square
                        const blackSquareActualHeight = Math.max(z2_feature_board, 0.1); 
                        const blackSquareGeo = new THREE.BoxGeometry(squareSize, squareSize, blackSquareActualHeight);
                        blackSquareGeo.translate(0,0, blackSquareActualHeight / 2); // Centered locally
                        const blackSquareMesh = new THREE.Mesh(blackSquareGeo, blackMaterial);
                        blackSquareMesh.position.set(squareCenterX, squareCenterY, 0); // Position at board Z=0
                        blackSquareMesh.name = `negative_black_square_explicit_${r_grid}_${c_grid}`;
                        mainObjectGroup.add(blackSquareMesh);
                    }
                    // If z1_base_board > 0, the black base plate itself forms the black squares.
                }
            }
        }
    }

    let flatPieceThicknessForFilename = Math.max(z1_base_board, 0.1);
    if (mainObjectGroup.children.length > 0) {
        mainObjectGroup.updateMatrixWorld(true);
        let currentFileNameTotalZ;
        if (extrusionType === "flat") {
            currentFileNameTotalZ = flatPieceThicknessForFilename;
        } else {
            currentFileNameTotalZ = z1_base_board + z2_feature_board;
        }
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = `ChArUco: ${squaresX}x${squaresY}, First: ${firstSquareColor}. Total Z: ${currentFileNameTotalZ.toFixed(2)}mm. Markers: ${markerIds.length}`;
    } else {
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'No ChArUco board generated.';
        setAllSaveButtonsDisabled(true);
    }
}

function prefillCharucoIds() { 
    const squaresX = Number(uiElements.inputs.charuco.squaresX.value);
    const squaresY = Number(uiElements.inputs.charuco.squaresY.value);
    const firstSquareColor = document.querySelector('input[name="charuco_firstSquare"]:checked').value;
    const numWhiteSquares = calculateNumWhiteSquares(squaresX, squaresY, firstSquareColor);
    const startId = Number(uiElements.inputs.charuco.startId.value);
    const selectedDictElement = uiElements.selects.charuco.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const maxId = getMaxIdForDict('dict', 'charuco');

    const ids = [];
    if (numWhiteSquares > 0) {
        for (let i = 0; i < numWhiteSquares; i++) {
            let currentId = startId + i;
            if (currentId > maxId) {
                console.warn(`Requested ID ${currentId} exceeds max ID ${maxId} for ${dictName}. Capping.`);
                currentId = maxId;
            }
            ids.push(currentId);
        }
    }
    uiElements.textareas.charuco.ids.value = ids.join(',');
    updateCharucoBoard(); 
}

function randomizeCharucoIds() { 
    const squaresX = Number(uiElements.inputs.charuco.squaresX.value);
    const squaresY = Number(uiElements.inputs.charuco.squaresY.value);
    const firstSquareColor = document.querySelector('input[name="charuco_firstSquare"]:checked').value;
    const numWhiteSquares = calculateNumWhiteSquares(squaresX, squaresY, firstSquareColor);
    const selectedDictElement = uiElements.selects.charuco.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const maxId = getMaxIdForDict('dict', 'charuco');

    if (numWhiteSquares > (maxId + 1) && numWhiteSquares > 0) {
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = `Error: Cannot pick ${numWhiteSquares} unique IDs from pool of ${maxId + 1}.`;
        return;
    }
    if (numWhiteSquares === 0) {
        uiElements.textareas.charuco.ids.value = '';
        updateCharucoBoard();
        return;
    }

    const availableIds = [];
    for (let i = 0; i <= maxId; i++) availableIds.push(i);
    for (let i = availableIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableIds[i], availableIds[j]] = [availableIds[j], availableIds[i]];
    }
    uiElements.textareas.charuco.ids.value = availableIds.slice(0, numWhiteSquares).join(',');
    updateCharucoBoard(); 
}

function getCharucoBaseFilename() {
    const squaresX = Number(uiElements.inputs.charuco.squaresX.value);
    const squaresY = Number(uiElements.inputs.charuco.squaresY.value);
    const squareSize = Number(uiElements.inputs.charuco.squareSize.value);
    const markerMargin = Number(uiElements.inputs.charuco.markerMargin.value);
    const z1_base_val = Number(uiElements.inputs.charuco.z1.value);
    const z2_feature_val = Number(uiElements.inputs.charuco.z2.value);
    const extrusionType = document.querySelector('input[name="charuco_extrusion"]:checked').value;
    const selectedDictElement = uiElements.selects.charuco.dict;
    const dictName = selectedDictElement.options[selectedDictElement.selectedIndex].value;
    const markerDimVal = squareSize - (2 * markerMargin);
    const firstSquareColor = document.querySelector('input[name="charuco_firstSquare"]:checked').value;
    let flatPieceThicknessForFilename = Math.max(z1_base_val, 0.1);

    let fileNameTotalZ;
    if (extrusionType === "flat") {
        fileNameTotalZ = flatPieceThicknessForFilename;
    } else {
        fileNameTotalZ = z1_base_val + z2_feature_val;
    }
    return `${dictName}_charuco-${squaresX}x${squaresY}_${firstSquareColor}Start_sq${squareSize}mm_mrg${markerMargin}mm_mdim${markerDimVal.toFixed(1)}mm_${extrusionType}_z${fileNameTotalZ.toFixed(2)}mm`;
}

function getColoredElementsFromCharuco(sourceGroup, targetMaterial) {
    const coloredGroup = new THREE.Group();
    if (!sourceGroup) return coloredGroup;
    // sourceGroup is mainObjectGroup
    sourceGroup.traverse((object) => {
        if (object.isMesh && object.material === targetMaterial) {
            const newMesh = new THREE.Mesh(object.geometry.clone(), object.material);
            newMesh.applyMatrix4(object.matrixWorld);
            coloredGroup.add(newMesh);
        }
    });
    return coloredGroup;
}

// --- Filename and Export Logic (Shared, but mode-aware) ---
function getCurrentModeBaseFilename() {
    switch (currentMode) {
        case 'single':
            return getSingleMarkerBaseFilename(); 
        case 'array':
            return getArrayBaseFilename(); 
        case 'charuco':
            return getCharucoBaseFilename(); 
        default:
            return 'export';
    }
}

function exportSTLColor(colorName) {
    if (!mainObjectGroup || mainObjectGroup.children.length === 0) {
        console.warn("No model to process for STL color export.");
        alert("No model generated to export.");
        return;
    }
    mainObjectGroup.updateMatrixWorld(true);
    const targetMaterial = colorName === 'white' ? whiteMaterial : blackMaterial;
    let colorGroup; 

    switch (currentMode) {
        case 'single':
            colorGroup = getColoredElementsFromSingle(mainObjectGroup, targetMaterial); 
            break;
        case 'array':
            colorGroup = getColoredElementsFromArray(mainObjectGroup, targetMaterial); 
            break;
        case 'charuco':
            colorGroup = getColoredElementsFromCharuco(mainObjectGroup, targetMaterial); 
            break;
        default:
            colorGroup = mainObjectGroup; // Fallback
            break;
    }

    if (colorGroup && colorGroup.children.length > 0) {
        const exporter = new THREE.STLExporter();
        const stlString = exporter.parse(colorGroup, { binary: false }); 
        const baseFilename = getCurrentModeBaseFilename();
        triggerDownload(new Blob([stlString], { type: 'model/stl' }), `${baseFilename}_${colorName}.stl`);
    } else {
        alert(`No ${colorName} elements found in the current ${currentMode} model to export for STL.`);
    }
}

function exportGLB() {
    if (!mainObjectGroup || mainObjectGroup.children.length === 0) {
        console.warn("No model generated to export for GLB.");
        alert("No model generated to export.");
        return;
    }
    mainObjectGroup.updateMatrixWorld(true);
    const exporter = new THREE.GLTFExporter();
    exporter.parse(mainObjectGroup, function (result) {
        const blob = new Blob([result], { type: 'model/gltf-binary' });
        const fileName = getCurrentModeBaseFilename() + '.glb';
        triggerDownload(blob, fileName);
    }, { binary: true });
}

export function initControls(loadDictPromise) {
    scene.add(mainObjectGroup);

    // Cache panel elements
    uiElements.panels.single = document.getElementById('panel-single');
    uiElements.panels.array = document.getElementById('panel-array');
    uiElements.panels.charuco = document.getElementById('panel-charuco');

    // Cache mode buttons
    uiElements.buttons.mode_single = document.getElementById('btn-mode-single');
    uiElements.buttons.mode_array = document.getElementById('btn-mode-array');
    uiElements.buttons.mode_charuco = document.getElementById('btn-mode-charuco');

    // Shared elements
    uiElements.infoDisplay = document.querySelector('.info-display');
    uiElements.buttons.saveWhiteStl = document.getElementById('save-white-stl-button');
    uiElements.buttons.saveBlackStl = document.getElementById('save-black-stl-button');
    uiElements.buttons.saveGlb = document.getElementById('save-glb-button');

    // --- Single Marker UI Elements ---
    uiElements.selects.single.dict = document.getElementById('frm-single-dict');
    uiElements.inputs.single.id = document.getElementById('frm-single-id');
    uiElements.inputs.single.dim = document.getElementById('frm-single-dim');
    uiElements.inputs.single.z1 = document.getElementById('frm-single-z1');
    uiElements.inputs.single.z2 = document.getElementById('frm-single-z2');
    uiElements.inputs.single.borderWidth = document.getElementById('frm-single-border-width');
    uiElements.radios.single.extrusion = document.querySelectorAll('input[name="single_extrusion"]');
    uiElements.radios.single.borderCornerType = document.querySelectorAll('input[name="single_borderCornerType"]');

    // --- Marker Array UI Elements ---
    uiElements.selects.array.dict = document.getElementById('frm-array-dict');
    uiElements.inputs.array.gridX = document.getElementById('frm-array-grid-x');
    uiElements.inputs.array.gridY = document.getElementById('frm-array-grid-y');
    uiElements.inputs.array.gap = document.getElementById('frm-array-gap');
    uiElements.inputs.array.startId = document.getElementById('frm-array-start-id');
    uiElements.textareas.array.ids = document.getElementById('frm-array-ids');
    uiElements.buttons.array_refillIds = document.getElementById('btn-array-refill-ids');
    uiElements.buttons.array_randomizeIds = document.getElementById('btn-array-randomize-ids');
    uiElements.inputs.array.dim = document.getElementById('frm-array-dim');
    uiElements.inputs.array.z1 = document.getElementById('frm-array-z1');
    uiElements.inputs.array.z2 = document.getElementById('frm-array-z2');
    uiElements.radios.array.extrusion = document.querySelectorAll('input[name="array_extrusion"]');
    uiElements.radios.array.gapFill = document.querySelectorAll('input[name="array_gapFill"]');
    uiElements.radios.array.cornerFill = document.querySelectorAll('input[name="array_cornerFill"]');

    // --- ChArUco Board UI Elements ---
    uiElements.selects.charuco.dict = document.getElementById('frm-charuco-dict');
    uiElements.inputs.charuco.squaresX = document.getElementById('frm-charuco-squares-x');
    uiElements.inputs.charuco.squaresY = document.getElementById('frm-charuco-squares-y');
    uiElements.inputs.charuco.squareSize = document.getElementById('frm-charuco-square-size');
    uiElements.inputs.charuco.markerMargin = document.getElementById('frm-charuco-marker-margin');
    uiElements.radios.charuco.firstSquare = document.querySelectorAll('input[name="charuco_firstSquare"]');
    uiElements.textareas.charuco.ids = document.getElementById('frm-charuco-ids');
    uiElements.inputs.charuco.startId = document.getElementById('frm-charuco-start-id');
    uiElements.buttons.charuco_refillIds = document.getElementById('btn-charuco-refill-ids');
    uiElements.buttons.charuco_randomizeIds = document.getElementById('btn-charuco-randomize-ids');
    uiElements.inputs.charuco.z1 = document.getElementById('frm-charuco-z1');
    uiElements.inputs.charuco.z2 = document.getElementById('frm-charuco-z2');
    uiElements.radios.charuco.extrusion = document.querySelectorAll('input[name="charuco_extrusion"]');

    // Mode switching listeners
    uiElements.buttons.mode_single.addEventListener('click', () => switchMode('single'));
    uiElements.buttons.mode_array.addEventListener('click', () => switchMode('array'));
    uiElements.buttons.mode_charuco.addEventListener('click', () => switchMode('charuco'));

    // Shared save button listeners
    uiElements.buttons.saveWhiteStl.addEventListener('click', () => exportSTLColor('white'));
    uiElements.buttons.saveBlackStl.addEventListener('click', () => exportSTLColor('black'));
    uiElements.buttons.saveGlb.addEventListener('click', exportGLB);

    // --- Event Listeners for Single Marker Mode ---
    uiElements.selects.single.dict.addEventListener('change', updateSingleMarker);
    uiElements.inputs.single.id.addEventListener('input', updateSingleMarker);
    uiElements.inputs.single.dim.addEventListener('input', updateSingleMarker);
    uiElements.inputs.single.z1.addEventListener('input', updateSingleMarker);
    uiElements.inputs.single.z2.addEventListener('input', updateSingleMarker);
    uiElements.inputs.single.borderWidth.addEventListener('input', updateSingleMarker);
    uiElements.radios.single.extrusion.forEach(radio => radio.addEventListener('change', updateSingleMarker));
    uiElements.radios.single.borderCornerType.forEach(radio => radio.addEventListener('change', updateSingleMarker));

    // --- Event Listeners for Marker Array Mode ---
    uiElements.selects.array.dict.addEventListener('change', () => { prefillArrayIds(); /* then updateMarkerArray is called by prefill */ });
    uiElements.inputs.array.gridX.addEventListener('input', () => { prefillArrayIds(); });
    uiElements.inputs.array.gridY.addEventListener('input', () => { prefillArrayIds(); });
    uiElements.inputs.array.gap.addEventListener('input', updateMarkerArray);
    uiElements.textareas.array.ids.addEventListener('input', updateMarkerArray);
    uiElements.buttons.array_refillIds.addEventListener('click', prefillArrayIds);
    uiElements.buttons.array_randomizeIds.addEventListener('click', randomizeArrayIds);
    uiElements.inputs.array.dim.addEventListener('input', updateMarkerArray);
    uiElements.inputs.array.z1.addEventListener('input', updateMarkerArray);
    uiElements.inputs.array.z2.addEventListener('input', updateMarkerArray);
    uiElements.radios.array.extrusion.forEach(radio => radio.addEventListener('change', updateMarkerArray));
    uiElements.radios.array.gapFill.forEach(radio => radio.addEventListener('change', updateMarkerArray));
    uiElements.radios.array.cornerFill.forEach(radio => radio.addEventListener('change', updateMarkerArray));
    uiElements.inputs.array.startId.addEventListener('input', () => { /* prefill handles reading this */ });


    // --- Event Listeners for ChArUco Mode ---
    uiElements.selects.charuco.dict.addEventListener('change', () => { prefillCharucoIds(); });
    uiElements.inputs.charuco.squaresX.addEventListener('input', () => { prefillCharucoIds(); });
    uiElements.inputs.charuco.squaresY.addEventListener('input', () => { prefillCharucoIds(); });
    uiElements.inputs.charuco.squareSize.addEventListener('input', updateCharucoBoard);
    uiElements.inputs.charuco.markerMargin.addEventListener('input', updateCharucoBoard);
    uiElements.radios.charuco.firstSquare.forEach(radio => radio.addEventListener('change', () => { prefillCharucoIds(); }));
    uiElements.textareas.charuco.ids.addEventListener('input', updateCharucoBoard); 
    uiElements.inputs.charuco.startId.addEventListener('input', () => { /* prefill handles reading this */ });
    uiElements.buttons.charuco_refillIds.addEventListener('click', prefillCharucoIds);
    uiElements.buttons.charuco_randomizeIds.addEventListener('click', randomizeCharucoIds);
    uiElements.inputs.charuco.z1.addEventListener('input', updateCharucoBoard);
    uiElements.inputs.charuco.z2.addEventListener('input', updateCharucoBoard);
    uiElements.radios.charuco.extrusion.forEach(radio => radio.addEventListener('change', updateCharucoBoard));

    loadDictPromise.then(() => {
        console.log("Dictionary loaded. Initializing default mode view.");
        triggerCurrentModeUpdate(); // Initial update for the default mode (single marker)
    }).catch(err => {
        console.error("Error in initial setup based on dictionary load:", err);
        if(uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'Error during initial setup.';
        setAllSaveButtonsDisabled(true);
    });
} 