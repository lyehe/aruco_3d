import { generateMarkerMesh, getArucoBitPattern, validateMarkerId, isSpecialMarker, SPECIAL_MARKERS, MIN_THICKNESS, disposeMarkerMesh } from './aruco-utils.js';
import { blackMaterial, whiteMaterial } from './config.js';
import { getMaxIdFromSelect } from './ui-common-utils.js';
import { mergeAndDisposeGeometries, createBoxAt, disposeGroup, validateDimensions } from './geometry-utils.js';

let uiElements_single;
let dictionaryData_single;
let mainObjectGroup_single;
let onUpdateCallbacks_single;

export function initSingleMarkerUI(uiElements, dict, mainGroup, onUpdate) {
    uiElements_single = uiElements;
    dictionaryData_single = dict;
    mainObjectGroup_single = mainGroup;
    onUpdateCallbacks_single = onUpdate;

    // Add event listeners - ensure both 'change' and 'input' events are handled
    const updateTriggers = [
        uiElements_single.selects.single.dict,
        uiElements_single.inputs.single.id,
        uiElements_single.inputs.single.dim,
        uiElements_single.inputs.single.z1,
        uiElements_single.inputs.single.z2,
        uiElements_single.inputs.single.borderWidth
    ];

    updateTriggers.forEach(element => {
        if (element) {
            element.addEventListener('change', updateSingleMarker);
            element.addEventListener('input', updateSingleMarker);
        }
    });

    uiElements_single.radios.single.extrusion.forEach(radio =>
        radio.addEventListener('change', updateSingleMarker)
    );
    uiElements_single.radios.single.borderCornerType.forEach(radio =>
        radio.addEventListener('change', updateSingleMarker)
    );
}

export function updateSingleMarker() {
    // Clear previous content
    onUpdateCallbacks_single.clearScene();

    // Get parameters
    const params = {
        dim: Number(uiElements_single.inputs.single.dim.value),
        z1: Number(uiElements_single.inputs.single.z1.value),
        z2: Number(uiElements_single.inputs.single.z2.value),
        extrusionType: document.querySelector('input[name="single_extrusion"]:checked').value,
        borderWidth: Number(uiElements_single.inputs.single.borderWidth.value),
        borderCornerType: document.querySelector('input[name="single_borderCornerType"]:checked').value,
        markerId: Number(uiElements_single.inputs.single.id.value)
    };

    // Get dictionary info
    const selectedDictElement = uiElements_single.selects.single.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictInfo = {
        name: option.value,
        patternWidth: Number(option.getAttribute('data-width')),
        patternHeight: Number(option.getAttribute('data-height'))
    };

    // Validate
    const errors = validateSingleMarker(params, dictInfo);
    if (errors.length > 0) {
        onUpdateCallbacks_single.setSaveDisabled(true);
        onUpdateCallbacks_single.setInfoMessage(errors[0]); // Show first error
        return;
    }

    // Generate marker
    try {
        const marker = generateSingleMarker(params, dictInfo);
        mainObjectGroup_single.add(marker);

        // Update UI
        const info = getMarkerInfo(params, dictInfo);
        onUpdateCallbacks_single.setInfoMessage(info);
        onUpdateCallbacks_single.setSaveDisabled(false);

    } catch (error) {
        console.error("Error generating single marker:", error);
        onUpdateCallbacks_single.setSaveDisabled(true);
        onUpdateCallbacks_single.setInfoMessage("Error generating marker");
    }
}

function validateSingleMarker(params, dictInfo) {
    const errors = [];

    // Dimension validation
    const dimErrors = validateDimensions(params);
    errors.push(...dimErrors);

    // Special marker validation
    if (!isSpecialMarker(params.markerId)) {
        // Need dictionary for regular markers
        if (!dictionaryData_single) {
            errors.push("Dictionary not loaded");
            return errors;
        }

        const maxId = getMaxIdFromSelect(uiElements_single.selects.single.dict, dictionaryData_single);
        const validation = validateMarkerId(dictInfo.name, params.markerId, maxId);

        if (!validation.valid) {
            errors.push(validation.error);
        }
    }

    return errors;
}

function generateSingleMarker(params, dictInfo) {
    let fullPattern = null;
    let specialMarkerType = null;

    // Determine marker type
    if (params.markerId === SPECIAL_MARKERS.PURE_WHITE) {
        specialMarkerType = 'pureWhite';
    } else if (params.markerId === SPECIAL_MARKERS.PURE_BLACK) {
        specialMarkerType = 'pureBlack';
    } else {
        fullPattern = getArucoBitPattern(dictInfo.name, params.markerId,
            dictInfo.patternWidth, dictInfo.patternHeight);
    }

    // Generate core marker
    const coreMarkerGroup = generateMarkerMesh(
        fullPattern,
        params.dim,
        params.dim,
        params.z1,
        params.z2,
        params.extrusionType,
        specialMarkerType
    );

    // Add border if needed
    if (params.borderWidth > MIN_THICKNESS) {
        return createMarkerWithBorder(coreMarkerGroup, params);
    }

    return coreMarkerGroup;
}

function createMarkerWithBorder(coreMarkerGroup, params) {
    const finalGroup = new THREE.Group();
    finalGroup.add(coreMarkerGroup);

    // Calculate dimensions
    const halfDim = params.dim / 2;
    const halfBorder = params.borderWidth / 2;

    // Determine border materials and heights
    const { baseMaterial, featureMaterial, baseHeight, featureHeight } =
        getBorderConfig(params);

    // Create border segments (straight pieces)
    const segments = [
        { x: 0, y: halfDim + halfBorder, w: params.dim, h: params.borderWidth },
        { x: 0, y: -halfDim - halfBorder, w: params.dim, h: params.borderWidth },
        { x: -halfDim - halfBorder, y: 0, w: params.borderWidth, h: params.dim },
        { x: halfDim + halfBorder, y: 0, w: params.borderWidth, h: params.dim }
    ];

    // Create corners
    const corners = [
        { x: -halfDim - halfBorder, y: halfDim + halfBorder },
        { x: halfDim + halfBorder, y: halfDim + halfBorder },
        { x: -halfDim - halfBorder, y: -halfDim - halfBorder },
        { x: halfDim + halfBorder, y: -halfDim - halfBorder }
    ];

    // For base layer
    const baseGeometries = [];
    const oppositeCornerGeometries = [];

    // Add straight segments to base
    segments.forEach(seg => {
        baseGeometries.push(
            createBoxAt(seg.w, seg.h, baseHeight, seg.x, seg.y, baseHeight / 2)
        );
    });

    // Handle corners for base layer
    corners.forEach(corner => {
        if (params.borderCornerType === 'opposite' && params.extrusionType === 'flat') {
            // For flat mode with opposite corners, use black material
            oppositeCornerGeometries.push(
                createBoxAt(params.borderWidth, params.borderWidth, baseHeight,
                    corner.x, corner.y, baseHeight / 2)
            );
        } else {
            // For 'same' corners or non-flat modes, add to base
            baseGeometries.push(
                createBoxAt(params.borderWidth, params.borderWidth, baseHeight,
                    corner.x, corner.y, baseHeight / 2)
            );
        }
    });

    // Create base layer mesh
    if (baseGeometries.length > 0) {
        const baseMesh = mergeAndDisposeGeometries(baseGeometries, baseMaterial);
        if (baseMesh) {
            baseMesh.name = 'border_base';
            finalGroup.add(baseMesh);
        }
    }

    // Create opposite corner mesh for flat mode
    if (oppositeCornerGeometries.length > 0) {
        const cornerMesh = mergeAndDisposeGeometries(oppositeCornerGeometries, blackMaterial);
        if (cornerMesh) {
            cornerMesh.name = 'border_corners_opposite';
            finalGroup.add(cornerMesh);
        }
    }

    // Handle feature layer for non-flat modes
    // Handle feature layer for non-flat modes
    if (params.extrusionType !== 'flat' && featureMaterial && featureHeight > MIN_THICKNESS) {
        const featureGeometries = [];

        if (params.extrusionType === 'positive') {
            // For positive mode, borders are white (same as base)
            // Only add features for "Opposite" corners
            if (params.borderCornerType === 'opposite') {
                // Only corners get black features
                corners.forEach(corner => {
                    featureGeometries.push(
                        createBoxAt(params.borderWidth, params.borderWidth, featureHeight,
                            corner.x, corner.y, baseHeight + featureHeight / 2)
                    );
                });
            }
            // For "Same as Border", no features at all (pure white border)
        } else {
            // For negative mode
            // Always add straight segments (white features on black base)
            segments.forEach(seg => {
                featureGeometries.push(
                    createBoxAt(seg.w, seg.h, featureHeight,
                        seg.x, seg.y, baseHeight + featureHeight / 2)
                );
            });

            // Add corners only if "Same as Border"
            if (params.borderCornerType === 'same') {
                corners.forEach(corner => {
                    featureGeometries.push(
                        createBoxAt(params.borderWidth, params.borderWidth, featureHeight,
                            corner.x, corner.y, baseHeight + featureHeight / 2)
                    );
                });
            }
            // For negative + opposite, corners stay black (no white features)
        }

        if (featureGeometries.length > 0) {
            const featureMesh = mergeAndDisposeGeometries(featureGeometries, featureMaterial);
            if (featureMesh) {
                featureMesh.name = 'border_features';
                finalGroup.add(featureMesh);
            }
        }
    }
    return finalGroup;
}

function getBorderConfig(params) {
    let baseMaterial, featureMaterial, baseHeight, featureHeight;

    if (params.extrusionType === 'flat') {
        baseMaterial = whiteMaterial;
        featureMaterial = null;
        baseHeight = Math.max(params.z2, MIN_THICKNESS);
        featureHeight = 0;
    } else {
        baseMaterial = params.extrusionType === 'positive' ? whiteMaterial : blackMaterial;
        featureMaterial = params.extrusionType === 'positive' ? blackMaterial : whiteMaterial;
        baseHeight = Math.max(params.z1, MIN_THICKNESS);
        featureHeight = params.z2;
    }

    return { baseMaterial, featureMaterial, baseHeight, featureHeight };
}

function getMarkerInfo(params, dictInfo) {
    let totalZ;

    if (isSpecialMarker(params.markerId)) {
        // Calculate actual Z for special markers
        if (params.extrusionType === "flat") {
            totalZ = Math.max(params.z2, MIN_THICKNESS);
        } else {
            const baseIsWhite = params.extrusionType === "positive";
            const markerIsWhite = params.markerId === SPECIAL_MARKERS.PURE_WHITE;
            const suppressFeature = (baseIsWhite === markerIsWhite);

            const actualZ1 = Math.max(params.z1, 0);
            const actualZ2 = suppressFeature ? 0 : Math.max(params.z2, 0);

            totalZ = (actualZ1 < MIN_THICKNESS && actualZ2 < MIN_THICKNESS) ?
                MIN_THICKNESS : actualZ1 + actualZ2;
        }

        const colorDesc = params.markerId === SPECIAL_MARKERS.PURE_WHITE ? "Pure White" : "Pure Black";
        return `${colorDesc} Block (${params.extrusionType}) - ${params.dim}x${params.dim}x${totalZ.toFixed(2)}mm`;
    } else {
        totalZ = params.extrusionType === "flat" ?
            Math.max(params.z2, MIN_THICKNESS) :
            params.z1 + params.z2;

        return `ID ${params.markerId} (${dictInfo.name}) - ${params.extrusionType} (${totalZ.toFixed(2)}mm)`;
    }
}

export function getSingleMarkerBaseFilename() {
    const params = {
        dim: Number(uiElements_single.inputs.single.dim.value),
        z1: Number(uiElements_single.inputs.single.z1.value),
        z2: Number(uiElements_single.inputs.single.z2.value),
        extrusionType: document.querySelector('input[name="single_extrusion"]:checked').value,
        markerId: Number(uiElements_single.inputs.single.id.value),
        borderWidth: Number(uiElements_single.inputs.single.borderWidth.value)
    };

    const dictName = uiElements_single.selects.single.dict.value;

    let idPart = isSpecialMarker(params.markerId) ?
        (params.markerId === SPECIAL_MARKERS.PURE_WHITE ? 'PUREWHITE' : 'PUREBLACK') :
        params.markerId;

    const totalZ = calculateTotalZ(params);

    let filename = `${dictName}-${idPart}_${params.dim}x${params.dim}x${totalZ.toFixed(2)}mm_${params.extrusionType}`;

    if (params.borderWidth > MIN_THICKNESS) {
        filename += `_border${params.borderWidth.toFixed(1)}mm`;
    }

    return filename;
}

function calculateTotalZ(params) {
    if (isSpecialMarker(params.markerId)) {
        // Extract Z from the info message
        const info = getMarkerInfo(params, {});
        const match = info.match(/(\d+\.\d+)mm/);
        return match ? parseFloat(match[1]) : 0;
    }

    return params.extrusionType === "flat" ?
        Math.max(params.z2, MIN_THICKNESS) :
        params.z1 + params.z2;
}

export function getColoredElementsFromSingle(targetMaterial) {
    const coloredGroup = new THREE.Group();

    mainObjectGroup_single.traverse((object) => {
        if (object.isMesh && object.material === targetMaterial) {
            const newMesh = new THREE.Mesh(object.geometry.clone(), object.material);
            newMesh.geometry.applyMatrix4(object.matrixWorld);
            coloredGroup.add(newMesh);
        }
    });

    return coloredGroup;
}

export function getSingleMarkerMetadataExport() {
    const params = {
        dim: Number(uiElements_single.inputs.single.dim.value),
        z1: Number(uiElements_single.inputs.single.z1.value),
        z2: Number(uiElements_single.inputs.single.z2.value),
        extrusionType: document.querySelector('input[name="single_extrusion"]:checked').value,
        borderWidth: Number(uiElements_single.inputs.single.borderWidth.value),
        borderCornerType: document.querySelector('input[name="single_borderCornerType"]:checked').value,
        markerId: Number(uiElements_single.inputs.single.id.value)
    };

    const dictName = uiElements_single.selects.single.dict.value;
    const totalZ = calculateTotalZ(params);
    const halfDim = params.dim / 2;
    const halfBorder = params.borderWidth / 2;
    const totalDim = params.dim + 2 * params.borderWidth;

    const metadata = {
        timestamp: new Date().toISOString(),
        mode: 'single',
        setup: {
            dictionary: dictName,
            markerId: params.markerId,
            markerDimension: params.dim,
            borderWidth: params.borderWidth,
            borderCornerType: params.borderCornerType,
            z1_baseHeight: params.z1,
            z2_featureHeight: params.z2,
            totalHeight: totalZ,
            extrusionType: params.extrusionType,
            units: 'mm'
        },
        markers: [{
            id: params.markerId,
            center: { x: 0, y: 0, z: totalZ / 2 },
            corners: {
                topLeft: { x: -halfDim, y: halfDim, z: totalZ },
                topRight: { x: halfDim, y: halfDim, z: totalZ },
                bottomLeft: { x: -halfDim, y: -halfDim, z: totalZ },
                bottomRight: { x: halfDim, y: -halfDim, z: totalZ }
            }
        }],
        calibrationPoints: {
            outerBorder: params.borderWidth > MIN_THICKNESS ? {
                topLeft: { x: -totalDim / 2, y: totalDim / 2, z: totalZ },
                topRight: { x: totalDim / 2, y: totalDim / 2, z: totalZ },
                bottomLeft: { x: -totalDim / 2, y: -totalDim / 2, z: totalZ },
                bottomRight: { x: totalDim / 2, y: -totalDim / 2, z: totalZ }
            } : null,
            boundingBox: {
                min: { x: -totalDim / 2, y: -totalDim / 2, z: 0 },
                max: { x: totalDim / 2, y: totalDim / 2, z: totalZ }
            }
        }
    };

    return metadata;
}
