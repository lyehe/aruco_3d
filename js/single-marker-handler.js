import { generateMarkerMesh, getArucoBitPattern } from './aruco-utils.js';
import { blackMaterial, whiteMaterial } from './config.js';
import { getMaxIdFromSelect } from './ui-common-utils.js';

let uiElements_single; // To be set by init
let dictionaryData_single; // To be set by init
let mainObjectGroup_single; // To be set by init
let onUpdateCallbacks_single; // { clearScene, setSaveDisabled, setInfoMessage }

export function initSingleMarkerUI(uiElements, dict, mainGroup, onUpdate) {
    uiElements_single = uiElements;
    dictionaryData_single = dict;
    mainObjectGroup_single = mainGroup;
    onUpdateCallbacks_single = onUpdate;

    uiElements_single.selects.single.dict.addEventListener('change', updateSingleMarker);
    uiElements_single.inputs.single.id.addEventListener('input', updateSingleMarker);
    uiElements_single.inputs.single.dim.addEventListener('input', updateSingleMarker);
    uiElements_single.inputs.single.z1.addEventListener('input', updateSingleMarker);
    uiElements_single.inputs.single.z2.addEventListener('input', updateSingleMarker);
    uiElements_single.inputs.single.borderWidth.addEventListener('input', updateSingleMarker);
    uiElements_single.radios.single.extrusion.forEach(radio => radio.addEventListener('change', updateSingleMarker));
    uiElements_single.radios.single.borderCornerType.forEach(radio => radio.addEventListener('change', updateSingleMarker));
}

export function updateSingleMarker() {
    if (!dictionaryData_single && Number(uiElements_single.inputs.single.id.value) >= 0) {
        console.warn("Dictionary not loaded yet for ArUco marker update (single)");
        onUpdateCallbacks_single.setSaveDisabled(true);
        onUpdateCallbacks_single.setInfoMessage('Error: Dictionary needed for ArUco ID.');
        return;
    }
    onUpdateCallbacks_single.clearScene();

    const dim = Number(uiElements_single.inputs.single.dim.value);
    const z1_base = Number(uiElements_single.inputs.single.z1.value);
    const z2_feature = Number(uiElements_single.inputs.single.z2.value);
    const extrusionType = document.querySelector('input[name="single_extrusion"]:checked').value;
    const borderWidth = Number(uiElements_single.inputs.single.borderWidth.value);
    const borderCornerType = document.querySelector('input[name="single_borderCornerType"]:checked').value;
    let markerIdNum = Number(uiElements_single.inputs.single.id.value);

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
        onUpdateCallbacks_single.setSaveDisabled(true);
        onUpdateCallbacks_single.setInfoMessage(errorMsg);
        return;
    }

    let fullPattern = null;
    let specialMarkerType = null;
    let uiMessage = '';
    let totalCalculatedZ = 0;

    const selectedDictElement = uiElements_single.selects.single.dict;
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
            totalCalculatedZ = Math.max(c2_initial, PURE_MARKER_MIN_THICKNESS);
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
        const maxId = getMaxIdFromSelect(selectedDictElement, dictionaryData_single);
        uiElements_single.inputs.single.id.setAttribute('max', maxId);
        if (markerIdNum < 0 || markerIdNum > maxId) {
            uiElements_single.inputs.single.id.value = Math.max(0, Math.min(markerIdNum, maxId));
            markerIdNum = Number(uiElements_single.inputs.single.id.value);
        }
        if (!dictionaryData_single[dictName] || !dictionaryData_single[dictName][markerIdNum]) {
            onUpdateCallbacks_single.setSaveDisabled(true);
            onUpdateCallbacks_single.setInfoMessage(`ID ${markerIdNum} not found in ${dictName}`);
            return;
        }
        fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
        if (extrusionType === "flat") {
            totalCalculatedZ = Math.max(z2_feature, 0.1);
        } else {
            totalCalculatedZ = z1_base + z2_feature;
        }
        uiMessage = `ID ${markerIdNum} (${dictName}) - ${extrusionType} (${totalCalculatedZ.toFixed(2)}mm)`;
    }

    onUpdateCallbacks_single.setInfoMessage('');
    onUpdateCallbacks_single.setSaveDisabled(false);

    const coreMarkerGroup = generateMarkerMesh(fullPattern, dim, dim, z1_base, z2_feature, extrusionType, specialMarkerType);
    let finalOutputGroup = coreMarkerGroup;

    if (borderWidth > 1e-5) {
        finalOutputGroup = new THREE.Group();
        finalOutputGroup.add(coreMarkerGroup);

        const borderGroup = new THREE.Group();
        let actual_border_base_thickness;
        if (extrusionType === 'flat') {
            actual_border_base_thickness = Math.max(z2_feature, 0.1);
        } else {
            actual_border_base_thickness = Math.max(z1_base, 0.1);
        }
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

    mainObjectGroup_single.add(finalOutputGroup);
    onUpdateCallbacks_single.setInfoMessage(uiMessage);
}

export function getSingleMarkerBaseFilename() {
    const dim = Number(uiElements_single.inputs.single.dim.value);
    const z1_base_val = Number(uiElements_single.inputs.single.z1.value);
    const z2_feature_val = Number(uiElements_single.inputs.single.z2.value);
    const extrusionType = document.querySelector('input[name="single_extrusion"]:checked').value;
    let markerIdNum = Number(uiElements_single.inputs.single.id.value);
    const selectedDictElement = uiElements_single.selects.single.dict;
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
            totalZ = Math.max(c2_initial, PURE_MARKER_MIN_THICKNESS);
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
        if (extrusionType === "flat") {
            totalZ = Math.max(z2_feature_val, 0.1);
        } else {
            totalZ = z1_base_val + z2_feature_val;
        }
    }

    let baseName = `${dictName}-${idPart}_${dim}x${dim}x${totalZ.toFixed(2)}mm_${extrusionType}`;
    const borderWidthValue = Number(uiElements_single.inputs.single.borderWidth.value);
    if (borderWidthValue > 1e-5) {
        baseName += `_border${borderWidthValue.toFixed(1)}mm`;
    }
    return baseName;
}

export function getColoredElementsFromSingle(targetMaterial) {
    const tempColorGroup = new THREE.Group();
    mainObjectGroup_single.traverse((object) => {
        if (object.isMesh && object.material === targetMaterial) {
            const newMesh = new THREE.Mesh(object.geometry.clone(), object.material);
            newMesh.geometry.applyMatrix4(object.matrixWorld);
            tempColorGroup.add(newMesh);
        }
    });
    return tempColorGroup;
} 