import { generateMarkerMesh, getArucoBitPattern, validateMarkerId, isSpecialMarker, SPECIAL_MARKERS, MIN_THICKNESS } from './aruco-utils.js';
import { blackMaterial, whiteMaterial } from './config.js';
import { getMaxIdFromSelect } from './ui-common-utils.js';
import { mergeAndDisposeGeometries, createBoxAt, validateDimensions } from './geometry-utils.js';

let uiElements_array;
let dictionaryData_array;
let mainObjectGroup_array;
let onUpdateCallbacks_array;

// Helper function similar to single-marker-handler's createMarkerWithBorder
// Adds border elements directly to the provided markerGroup
function addIndividualBorderToGroup(markerGroup, markerDim, borderWidth, extrusionType, z1, z2, borderCornerType) {
    const params = {
        dim: markerDim,
        borderWidth: borderWidth,
        extrusionType: extrusionType,
        z1: z1,
        z2: z2,
        borderCornerType: borderCornerType
    };

    // Calculate dimensions
    const halfDim = params.dim / 2;
    const halfBorder = params.borderWidth / 2;

    // Determine border materials and heights (adapted from single-marker-handler's getBorderConfig)
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

    const baseGeometries = [];
    const oppositeCornerBaseGeometries = [];
    const featureGeometries = [];

    const segments = [
        { x: 0, y: halfDim + halfBorder, w: params.dim, h: params.borderWidth },
        { x: 0, y: -halfDim - halfBorder, w: params.dim, h: params.borderWidth },
        { x: -halfDim - halfBorder, y: 0, w: params.borderWidth, h: params.dim },
        { x: halfDim + halfBorder, y: 0, w: params.borderWidth, h: params.dim }
    ];

    const corners = [
        { x: -halfDim - halfBorder, y: halfDim + halfBorder },
        { x: halfDim + halfBorder, y: halfDim + halfBorder },
        { x: -halfDim - halfBorder, y: -halfDim - halfBorder },
        { x: halfDim + halfBorder, y: -halfDim - halfBorder }
    ];

    segments.forEach(seg => {
        baseGeometries.push(
            createBoxAt(seg.w, seg.h, baseHeight, seg.x, seg.y, baseHeight / 2)
        );
    });

    corners.forEach(corner => {
        if (params.borderCornerType === 'opposite' && params.extrusionType === 'flat') {
            oppositeCornerBaseGeometries.push(
                createBoxAt(params.borderWidth, params.borderWidth, baseHeight,
                    corner.x, corner.y, baseHeight / 2)
            );
        } else {
            baseGeometries.push(
                createBoxAt(params.borderWidth, params.borderWidth, baseHeight,
                    corner.x, corner.y, baseHeight / 2)
            );
        }
    });

    if (baseGeometries.length > 0) {
        const baseMesh = mergeAndDisposeGeometries(baseGeometries, baseMaterial);
        if (baseMesh) {
            baseMesh.name = 'individual_border_base';
            markerGroup.add(baseMesh);
        }
    }
    if (oppositeCornerBaseGeometries.length > 0) {
        const cornerMesh = mergeAndDisposeGeometries(oppositeCornerBaseGeometries, blackMaterial);
        if (cornerMesh) {
            cornerMesh.name = 'individual_border_corners_opposite';
            markerGroup.add(cornerMesh);
        }
    }

    if (params.extrusionType !== 'flat' && featureMaterial && featureHeight > MIN_THICKNESS) {
        if (params.extrusionType === 'positive') {
            if (params.borderCornerType === 'opposite') {
                corners.forEach(corner => {
                    featureGeometries.push(
                        createBoxAt(params.borderWidth, params.borderWidth, featureHeight,
                            corner.x, corner.y, baseHeight + featureHeight / 2)
                    );
                });
            }
        } else { // negative
            segments.forEach(seg => {
                featureGeometries.push(
                    createBoxAt(seg.w, seg.h, featureHeight,
                        seg.x, seg.y, baseHeight + featureHeight / 2)
                );
            });
            if (params.borderCornerType === 'same') {
                corners.forEach(corner => {
                    featureGeometries.push(
                        createBoxAt(params.borderWidth, params.borderWidth, featureHeight,
                            corner.x, corner.y, baseHeight + featureHeight / 2)
                    );
                });
            }
        }

        if (featureGeometries.length > 0) {
            const featureMesh = mergeAndDisposeGeometries(featureGeometries, featureMaterial);
            if (featureMesh) {
                featureMesh.name = 'individual_border_features';
                markerGroup.add(featureMesh);
            }
        }
    }
}


export function initArrayMarkerUI(uiElements, dict, mainGroup, onUpdate) {
    uiElements_array = uiElements;
    dictionaryData_array = dict;
    mainObjectGroup_array = mainGroup;
    onUpdateCallbacks_array = onUpdate;

    const updateTriggers = [
        { element: uiElements_array.selects.array.dict, handler: prefillArrayIds },
        { element: uiElements_array.inputs.array.gridX, handler: prefillArrayIds },
        { element: uiElements_array.inputs.array.gridY, handler: prefillArrayIds },
        { element: uiElements_array.inputs.array.gap, handler: updateMarkerArray },
        { element: uiElements_array.textareas.array.ids, handler: updateMarkerArray },
        { element: uiElements_array.inputs.array.dim, handler: updateMarkerArray },
        { element: uiElements_array.inputs.array.z1, handler: updateMarkerArray },
        { element: uiElements_array.inputs.array.z2, handler: updateMarkerArray },
        { element: uiElements_array.inputs.array.borderWidth, handler: updateMarkerArray }
    ];

    updateTriggers.forEach(({ element, handler }) => {
        if (element) element.addEventListener('input', handler);
    });

    uiElements_array.buttons.array_refillIds.addEventListener('click', prefillArrayIds);
    uiElements_array.buttons.array_randomizeIds.addEventListener('click', randomizeArrayIds);

    uiElements_array.radios.array.extrusion.forEach(radio =>
        radio.addEventListener('change', updateMarkerArray)
    );
    uiElements_array.radios.array.gapFill.forEach(radio =>
        radio.addEventListener('change', updateMarkerArray)
    );
    uiElements_array.radios.array.cornerFill.forEach(radio =>
        radio.addEventListener('change', updateMarkerArray)
    );
}

export function updateMarkerArray() {
    if (!dictionaryData_array) {
        console.warn("Dictionary not loaded yet for updateMarkerArray");
        onUpdateCallbacks_array.setSaveDisabled(true);
        onUpdateCallbacks_array.setInfoMessage('Error: Dictionary loading or failed.');
        return;
    }

    onUpdateCallbacks_array.clearScene();
    const params = getArrayParameters();
    const dictInfo = getDictionaryInfo();
    const errors = validateArrayParameters(params, dictInfo);

    if (errors.length > 0) {
        onUpdateCallbacks_array.setSaveDisabled(true);
        onUpdateCallbacks_array.setInfoMessage(errors[0]);
        return;
    }

    try {
        generateMarkerArrayElements(params, dictInfo);
        if (params.gapFillType === 'fill') {
            generateGapFillElements(params);
        }

        const totalZ = params.extrusionType === "flat" ?
            Math.max(params.z2, MIN_THICKNESS) :
            params.z1 + params.z2;

        onUpdateCallbacks_array.setInfoMessage(
            `Array: ${params.gridX}x${params.gridY} of ${dictInfo.name}. ` +
            `Gap: ${params.gap}mm. ` +
            (params.gapFillType === 'border' ? `Indiv. Border: ${params.individualBorderWidth}mm. ` : '') +
            `Total Z: ${totalZ.toFixed(2)}mm`
        );
        onUpdateCallbacks_array.setSaveDisabled(false);

    } catch (error) {
        console.error("Error generating marker array:", error);
        onUpdateCallbacks_array.setSaveDisabled(true);
        onUpdateCallbacks_array.setInfoMessage('Error generating array');
    }
}

export function getArrayParameters() {
    return {
        gridX: Number(uiElements_array.inputs.array.gridX.value),
        gridY: Number(uiElements_array.inputs.array.gridY.value),
        gap: Number(uiElements_array.inputs.array.gap.value),
        markerIdsRaw: uiElements_array.textareas.array.ids.value
            .split(',')
            .map(s => s.trim())
            .filter(s => s !== ''),
        dim: Number(uiElements_array.inputs.array.dim.value),
        z1: Number(uiElements_array.inputs.array.z1.value),
        z2: Number(uiElements_array.inputs.array.z2.value),
        extrusionType: document.querySelector('input[name="array_extrusion"]:checked').value,
        gapFillType: document.querySelector('input[name="array_gapFill"]:checked').value,
        cornerFillType: document.querySelector('input[name="array_cornerFill"]:checked').value,
        individualBorderWidth: Number(uiElements_array.inputs.array.borderWidth.value)
    };
}

export function getDictionaryInfo() {
    const selectedDictElement = uiElements_array.selects.array.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    return {
        name: option.value,
        patternWidth: Number(option.getAttribute('data-width')),
        patternHeight: Number(option.getAttribute('data-height')),
        maxId: getMaxIdFromSelect(selectedDictElement, dictionaryData_array)
    };
}

function validateArrayParameters(params, dictInfo) {
    const errors = [];
    const dimErrors = validateDimensions({
        dim: params.dim,
        z1: params.z1,
        z2: params.z2,
        extrusionType: params.extrusionType,
        borderWidth: (params.gapFillType === 'border' ? params.individualBorderWidth : undefined)
    });
    errors.push(...dimErrors);

    if (params.gap < 0) {
        errors.push('Gap width must be non-negative.');
    }
    if (params.gapFillType === 'border' && params.individualBorderWidth < 0) {
        errors.push("Individual marker border width must be non-negative.");
    }

    const numRequiredIds = params.gridX * params.gridY;
    if (params.markerIdsRaw.length !== numRequiredIds) {
        errors.push(`Number of IDs (${params.markerIdsRaw.length}) does not match grid size (${numRequiredIds}).`);
        return errors;
    }

    const markerIds = params.markerIdsRaw.map(Number);
    for (const id of markerIds) {
        if (isSpecialMarker(id)) continue;
        const validation = validateMarkerId(dictInfo.name, id, dictInfo.maxId);
        if (!validation.valid) {
            errors.push(validation.error);
            break;
        }
    }
    return errors;
}

function generateMarkerArrayElements(params, dictInfo) {
    const markerIds = params.markerIdsRaw.map(Number);
    for (let y = 0; y < params.gridY; y++) {
        for (let x = 0; x < params.gridX; x++) {
            const index = y * params.gridX + x;
            const markerId = markerIds[index];
            let fullPattern = null;
            let specialMarkerType = null;

            if (markerId === SPECIAL_MARKERS.PURE_WHITE) specialMarkerType = 'pureWhite';
            else if (markerId === SPECIAL_MARKERS.PURE_BLACK) specialMarkerType = 'pureBlack';
            else fullPattern = getArucoBitPattern(dictInfo.name, markerId, dictInfo.patternWidth, dictInfo.patternHeight);

            const markerGroup = generateMarkerMesh(
                fullPattern, params.dim, params.dim, params.z1, params.z2,
                params.extrusionType, specialMarkerType
            );

            let stepSizeX = params.dim;
            let stepSizeY = params.dim;

            if (params.gapFillType === 'border' && params.individualBorderWidth > MIN_THICKNESS) {
                addIndividualBorderToGroup(markerGroup, params.dim, params.individualBorderWidth, params.extrusionType, params.z1, params.z2, params.cornerFillType);
                stepSizeX += 2 * params.individualBorderWidth;
                stepSizeY += 2 * params.individualBorderWidth;
            }

            stepSizeX += params.gap;
            stepSizeY += params.gap;

            markerGroup.position.set(
                x * stepSizeX - (params.gridX - 1) * stepSizeX / 2,
                (params.gridY - 1 - y) * stepSizeY - (params.gridY - 1) * stepSizeY / 2,
                0
            );
            markerGroup.name = `marker_array_item_${markerId}_${x}_${y}`;
            mainObjectGroup_array.add(markerGroup);
        }
    }
}

function generateGapFillElements(params) {
    if (params.gapFillType === 'fill') {
        generateFillTypeGapsWithOuterBorder(params);
    }
}

function generateFillTypeGapsWithOuterBorder(params) {
    const baseHeight = params.extrusionType === 'flat' ?
        Math.max(params.z2, MIN_THICKNESS) :
        Math.max(params.z1, MIN_THICKNESS);
    const featureHeight = params.extrusionType === 'flat' ? 0 : params.z2;

    let baseMaterial, featureMaterial, cornerBaseMaterial, cornerFeatureMaterial;

    if (params.extrusionType === 'positive') {
        baseMaterial = whiteMaterial;
        featureMaterial = null;
        cornerBaseMaterial = whiteMaterial;
        cornerFeatureMaterial = params.cornerFillType === 'opposite' ? blackMaterial : null;
    } else if (params.extrusionType === 'negative') {
        baseMaterial = blackMaterial;
        featureMaterial = featureHeight > MIN_THICKNESS ? whiteMaterial : null;
        if (params.cornerFillType === 'opposite') {
            cornerBaseMaterial = whiteMaterial;
            cornerFeatureMaterial = featureHeight > MIN_THICKNESS ? blackMaterial : null;
        } else { // 'same'
            cornerBaseMaterial = baseMaterial;
            cornerFeatureMaterial = featureMaterial;
        }
    } else { // flat
        baseMaterial = whiteMaterial;
        featureMaterial = null;
        cornerBaseMaterial = params.cornerFillType === 'opposite' ? blackMaterial : whiteMaterial;
        cornerFeatureMaterial = null;
    }

    const geometries = { base: [], features: [], cornerBase: [], cornerFeatures: [] };
    const materialConfig = { baseMaterial, featureMaterial, cornerBaseMaterial, cornerFeatureMaterial };

    generateInternalFillAndOuterBorderGeometries(params, baseHeight, featureHeight, geometries, materialConfig);
    createFillMeshes(geometries, baseMaterial, featureMaterial, cornerBaseMaterial, cornerFeatureMaterial);
}

function generateInternalFillAndOuterBorderGeometries(params, baseHeight, featureHeight, geometries, materialConfig) {
    const halfGap = params.gap / 2;
    const halfDim = params.dim / 2;
    const outerBorderThickness = params.gap;

    // --- 1. Internal Gaps & Intersections ---
    if (params.gridY > 1 && params.gap > MIN_THICKNESS) { // Horizontal internal gaps
        for (let r = 0; r < params.gridY - 1; r++) {
            for (let c = 0; c < params.gridX; c++) {
                const x = c * (params.dim + params.gap) - (params.gridX - 1) * (params.dim + params.gap) / 2;
                const y = (params.gridY - 1 - (r + 1)) * (params.dim + params.gap) - (params.gridY - 1) * (params.dim + params.gap) / 2 + halfDim + halfGap;
                geometries.base.push(createBoxAt(params.dim, params.gap, baseHeight, x, y, baseHeight / 2));
                if (featureHeight > MIN_THICKNESS && materialConfig.featureMaterial) {
                    geometries.features.push(createBoxAt(params.dim, params.gap, featureHeight, x, y, baseHeight + featureHeight / 2));
                }
            }
        }
    }
    if (params.gridX > 1 && params.gap > MIN_THICKNESS) { // Vertical internal gaps
        for (let c = 0; c < params.gridX - 1; c++) {
            for (let r = 0; r < params.gridY; r++) {
                const x = c * (params.dim + params.gap) - (params.gridX - 1) * (params.dim + params.gap) / 2 + halfDim + halfGap;
                const y = (params.gridY - 1 - r) * (params.dim + params.gap) - (params.gridY - 1) * (params.dim + params.gap) / 2;
                geometries.base.push(createBoxAt(params.gap, params.dim, baseHeight, x, y, baseHeight / 2));
                if (featureHeight > MIN_THICKNESS && materialConfig.featureMaterial) {
                    geometries.features.push(createBoxAt(params.gap, params.dim, featureHeight, x, y, baseHeight + featureHeight / 2));
                }
            }
        }
    }
    if (params.gridX > 1 && params.gridY > 1 && params.gap > MIN_THICKNESS) { // Inner '+' intersections
        for (let r = 0; r < params.gridY - 1; r++) {
            for (let c = 0; c < params.gridX - 1; c++) {
                const x = c * (params.dim + params.gap) - (params.gridX - 1) * (params.dim + params.gap) / 2 + halfDim + halfGap;
                const y = (params.gridY - 1 - (r + 1)) * (params.dim + params.gap) - (params.gridY - 1) * (params.dim + params.gap) / 2 + halfDim + halfGap;
                const isOpposite = params.cornerFillType === 'opposite';
                const baseList = isOpposite ? geometries.cornerBase : geometries.base;
                const featureList = isOpposite ? geometries.cornerFeatures : geometries.features;
                const featMat = isOpposite ? materialConfig.cornerFeatureMaterial : materialConfig.featureMaterial;
                baseList.push(createBoxAt(params.gap, params.gap, baseHeight, x, y, baseHeight / 2));
                if (featureHeight > MIN_THICKNESS && featMat) {
                    featureList.push(createBoxAt(params.gap, params.gap, featureHeight, x, y, baseHeight + featureHeight / 2));
                }
            }
        }
    }

    // --- 2. Outer Border ---
    if (outerBorderThickness > MIN_THICKNESS) {
        const markerBlockWidth = params.gridX * params.dim + Math.max(0, params.gridX - 1) * params.gap;
        const markerBlockHeight = params.gridY * params.dim + Math.max(0, params.gridY - 1) * params.gap;
        const halfMarkerBlockWidth = markerBlockWidth / 2;
        const halfMarkerBlockHeight = markerBlockHeight / 2;
        const halfOuterBorder = outerBorderThickness / 2;

        if (params.extrusionType === 'flat' && params.cornerFillType === 'opposite') {
            // Create white border pieces (geometries.base) that fit *between* black corners/TJs for FLAT/OPPOSITE
            const segmentEdgeH = outerBorderThickness;
            const segmentEdgeW = outerBorderThickness;
            const topY = halfMarkerBlockHeight + halfOuterBorder;
            for (let i = 0; i < params.gridX; i++) {
                const pieceWidth = params.dim;
                if (pieceWidth > MIN_THICKNESS) {
                    const markerCenterX = i * (params.dim + params.gap) - (params.gridX - 1) * (params.dim + params.gap) / 2;
                    geometries.base.push(createBoxAt(pieceWidth, segmentEdgeH, baseHeight, markerCenterX, topY, baseHeight / 2));
                }
            }
            const bottomY = -(halfMarkerBlockHeight + halfOuterBorder);
            for (let i = 0; i < params.gridX; i++) {
                const pieceWidth = params.dim;
                if (pieceWidth > MIN_THICKNESS) {
                    const markerCenterX = i * (params.dim + params.gap) - (params.gridX - 1) * (params.dim + params.gap) / 2;
                    geometries.base.push(createBoxAt(pieceWidth, segmentEdgeH, baseHeight, markerCenterX, bottomY, baseHeight / 2));
                }
            }
            const leftX = -(halfMarkerBlockWidth + halfOuterBorder);
            for (let i = 0; i < params.gridY; i++) {
                const pieceHeight = params.dim;
                if (pieceHeight > MIN_THICKNESS) {
                    const markerCenterY = (params.gridY - 1 - i) * (params.dim + params.gap) - (params.gridY - 1) * (params.dim + params.gap) / 2;
                    geometries.base.push(createBoxAt(segmentEdgeW, pieceHeight, baseHeight, leftX, markerCenterY, baseHeight / 2));
                }
            }
            const rightX = halfMarkerBlockWidth + halfOuterBorder;
            for (let i = 0; i < params.gridY; i++) {
                const pieceHeight = params.dim;
                if (pieceHeight > MIN_THICKNESS) {
                    const markerCenterY = (params.gridY - 1 - i) * (params.dim + params.gap) - (params.gridY - 1) * (params.dim + params.gap) / 2;
                    geometries.base.push(createBoxAt(segmentEdgeW, pieceHeight, baseHeight, rightX, markerCenterY, baseHeight / 2));
                }
            }
        } else if (params.extrusionType === 'negative' && params.cornerFillType === 'opposite' && featureHeight > MIN_THICKNESS) {
            // For NEGATIVE/OPPOSITE with features:
            // 1. Continuous black BASE segments for the border
            const segments = [
                { x: 0, y: halfMarkerBlockHeight + halfOuterBorder, w: markerBlockWidth, h: outerBorderThickness },
                { x: 0, y: -(halfMarkerBlockHeight + halfOuterBorder), w: markerBlockWidth, h: outerBorderThickness },
                { x: -(halfMarkerBlockWidth + halfOuterBorder), y: 0, w: outerBorderThickness, h: markerBlockHeight },
                { x: halfMarkerBlockWidth + halfOuterBorder, y: 0, w: outerBorderThickness, h: markerBlockHeight }
            ];
            segments.forEach(seg => {
                geometries.base.push(createBoxAt(seg.w, seg.h, baseHeight, seg.x, seg.y, baseHeight / 2));
            });

            // 2. Segmented white FEATURE pieces for the border (materialConfig.featureMaterial is whiteMaterial)
            const segmentEdgeH = outerBorderThickness;
            const segmentEdgeW = outerBorderThickness;
            const topY = halfMarkerBlockHeight + halfOuterBorder;
            for (let i = 0; i < params.gridX; i++) {
                const pieceWidth = params.dim;
                if (pieceWidth > MIN_THICKNESS) {
                    const markerCenterX = i * (params.dim + params.gap) - (params.gridX - 1) * (params.dim + params.gap) / 2;
                    geometries.features.push(createBoxAt(pieceWidth, segmentEdgeH, featureHeight, markerCenterX, topY, baseHeight + featureHeight / 2));
                }
            }
            const bottomY = -(halfMarkerBlockHeight + halfOuterBorder);
            for (let i = 0; i < params.gridX; i++) {
                const pieceWidth = params.dim;
                if (pieceWidth > MIN_THICKNESS) {
                    const markerCenterX = i * (params.dim + params.gap) - (params.gridX - 1) * (params.dim + params.gap) / 2;
                    geometries.features.push(createBoxAt(pieceWidth, segmentEdgeH, featureHeight, markerCenterX, bottomY, baseHeight + featureHeight / 2));
                }
            }
            const leftX = -(halfMarkerBlockWidth + halfOuterBorder);
            for (let i = 0; i < params.gridY; i++) {
                const pieceHeight = params.dim;
                if (pieceHeight > MIN_THICKNESS) {
                    const markerCenterY = (params.gridY - 1 - i) * (params.dim + params.gap) - (params.gridY - 1) * (params.dim + params.gap) / 2;
                    geometries.features.push(createBoxAt(segmentEdgeW, pieceHeight, featureHeight, leftX, markerCenterY, baseHeight + featureHeight / 2));
                }
            }
            const rightX = halfMarkerBlockWidth + halfOuterBorder;
            for (let i = 0; i < params.gridY; i++) {
                const pieceHeight = params.dim;
                if (pieceHeight > MIN_THICKNESS) {
                    const markerCenterY = (params.gridY - 1 - i) * (params.dim + params.gap) - (params.gridY - 1) * (params.dim + params.gap) / 2;
                    geometries.features.push(createBoxAt(segmentEdgeW, pieceHeight, featureHeight, rightX, markerCenterY, baseHeight + featureHeight / 2));
                }
            }
        } else {
            // Original logic for continuous border segments (base and feature) for all other cases
            const segments = [
                { x: 0, y: halfMarkerBlockHeight + halfOuterBorder, w: markerBlockWidth, h: outerBorderThickness }, // Top
                { x: 0, y: -(halfMarkerBlockHeight + halfOuterBorder), w: markerBlockWidth, h: outerBorderThickness }, // Bottom
                { x: -(halfMarkerBlockWidth + halfOuterBorder), y: 0, w: outerBorderThickness, h: markerBlockHeight }, // Left
                { x: halfMarkerBlockWidth + halfOuterBorder, y: 0, w: outerBorderThickness, h: markerBlockHeight }  // Right
            ];
            segments.forEach(seg => {
                geometries.base.push(createBoxAt(seg.w, seg.h, baseHeight, seg.x, seg.y, baseHeight / 2));
                if (featureHeight > MIN_THICKNESS && materialConfig.featureMaterial) {
                    geometries.features.push(createBoxAt(seg.w, seg.h, featureHeight, seg.x, seg.y, baseHeight + featureHeight / 2));
                }
            });
        }

        const extremeCornerPositions = [
            { x: -(halfMarkerBlockWidth + halfOuterBorder), y: (halfMarkerBlockHeight + halfOuterBorder) },
            { x: (halfMarkerBlockWidth + halfOuterBorder), y: (halfMarkerBlockHeight + halfOuterBorder) },
            { x: -(halfMarkerBlockWidth + halfOuterBorder), y: -(halfMarkerBlockHeight + halfOuterBorder) },
            { x: (halfMarkerBlockWidth + halfOuterBorder), y: -(halfMarkerBlockHeight + halfOuterBorder) }
        ];
        extremeCornerPositions.forEach(pos => {
            const isOpposite = params.cornerFillType === 'opposite';
            const baseList = isOpposite ? geometries.cornerBase : geometries.base;
            const featureList = isOpposite ? geometries.cornerFeatures : geometries.features;
            const featMat = isOpposite ? materialConfig.cornerFeatureMaterial : materialConfig.featureMaterial; // Use corner feature material for these
            baseList.push(createBoxAt(outerBorderThickness, outerBorderThickness, baseHeight, pos.x, pos.y, baseHeight / 2));
            if (featureHeight > MIN_THICKNESS && featMat) {
                featureList.push(createBoxAt(outerBorderThickness, outerBorderThickness, featureHeight, pos.x, pos.y, baseHeight + featureHeight / 2));
            }
        });

        // T-junctions (where internal gaps meet outer border)
        const isOppositeStyleForTJunctions = params.cornerFillType === 'opposite';

        if (params.gridX > 1 && params.gap > MIN_THICKNESS) { // Top & Bottom T-junctions
            for (let c = 0; c < params.gridX - 1; c++) {
                const xT = c * (params.dim + params.gap) - (params.gridX - 1) * (params.dim + params.gap) / 2 + halfDim + halfGap;
                [halfMarkerBlockHeight + halfOuterBorder, -(halfMarkerBlockHeight + halfOuterBorder)].forEach(yT => {
                    if (isOppositeStyleForTJunctions) {
                        geometries.cornerBase.push(createBoxAt(params.gap, outerBorderThickness, baseHeight, xT, yT, baseHeight / 2));
                        if (featureHeight > MIN_THICKNESS && materialConfig.cornerFeatureMaterial) {
                            geometries.cornerFeatures.push(createBoxAt(params.gap, outerBorderThickness, featureHeight, xT, yT, baseHeight + featureHeight / 2));
                        }
                    } else {
                        geometries.base.push(createBoxAt(params.gap, outerBorderThickness, baseHeight, xT, yT, baseHeight / 2));
                        if (featureHeight > MIN_THICKNESS && materialConfig.featureMaterial) {
                            geometries.features.push(createBoxAt(params.gap, outerBorderThickness, featureHeight, xT, yT, baseHeight + featureHeight / 2));
                        }
                    }
                });
            }
        }
        if (params.gridY > 1 && params.gap > MIN_THICKNESS) { // Left & Right T-junctions
            for (let r = 0; r < params.gridY - 1; r++) {
                const yT = (params.gridY - 1 - (r + 1)) * (params.dim + params.gap) - (params.gridY - 1) * (params.dim + params.gap) / 2 + halfDim + halfGap;
                [-(halfMarkerBlockWidth + halfOuterBorder), halfMarkerBlockWidth + halfOuterBorder].forEach(xT => {
                    if (isOppositeStyleForTJunctions) {
                        geometries.cornerBase.push(createBoxAt(outerBorderThickness, params.gap, baseHeight, xT, yT, baseHeight / 2));
                        if (featureHeight > MIN_THICKNESS && materialConfig.cornerFeatureMaterial) {
                            geometries.cornerFeatures.push(createBoxAt(outerBorderThickness, params.gap, featureHeight, xT, yT, baseHeight + featureHeight / 2));
                        }
                    } else {
                        geometries.base.push(createBoxAt(outerBorderThickness, params.gap, baseHeight, xT, yT, baseHeight / 2));
                        if (featureHeight > MIN_THICKNESS && materialConfig.featureMaterial) {
                            geometries.features.push(createBoxAt(outerBorderThickness, params.gap, featureHeight, xT, yT, baseHeight + featureHeight / 2));
                        }
                    }
                });
            }
        }
    }
}

function createFillMeshes(geometries, baseMaterial, featureMaterial, cornerBaseMaterial, cornerFeatureMaterial) {
    if (geometries.base.length > 0) {
        const mesh = mergeAndDisposeGeometries(geometries.base, baseMaterial);
        if (mesh) { mesh.name = 'gap_fill_base_main'; mainObjectGroup_array.add(mesh); }
    }
    if (geometries.features.length > 0 && featureMaterial) {
        const mesh = mergeAndDisposeGeometries(geometries.features, featureMaterial);
        if (mesh) { mesh.name = 'gap_fill_features_main'; mainObjectGroup_array.add(mesh); }
    }
    if (geometries.cornerBase.length > 0) {
        const mesh = mergeAndDisposeGeometries(geometries.cornerBase, cornerBaseMaterial);
        if (mesh) { mesh.name = 'gap_fill_corner_base_opposite'; mainObjectGroup_array.add(mesh); }
    }
    if (geometries.cornerFeatures.length > 0 && cornerFeatureMaterial) {
        const mesh = mergeAndDisposeGeometries(geometries.cornerFeatures, cornerFeatureMaterial);
        if (mesh) { mesh.name = 'gap_fill_corner_features_opposite'; mainObjectGroup_array.add(mesh); }
    }
}

export function prefillArrayIds() {
    const params = {
        gridX: Number(uiElements_array.inputs.array.gridX.value),
        gridY: Number(uiElements_array.inputs.array.gridY.value),
        startId: Number(uiElements_array.inputs.array.startId.value)
    };
    const dictInfo = getDictionaryInfo();
    const numIds = params.gridX * params.gridY;
    const ids = [];
    for (let i = 0; i < numIds; i++) {
        let currentId = params.startId + i;
        if (currentId > dictInfo.maxId && !isSpecialMarker(currentId)) {
            currentId = dictInfo.maxId;
        }
        ids.push(currentId);
    }
    uiElements_array.textareas.array.ids.value = ids.join(',');
    updateMarkerArray();
}

export function randomizeArrayIds() {
    const params = getArrayParameters();
    const dictInfo = getDictionaryInfo();
    const numIds = params.gridX * params.gridY;
    if (numIds > (dictInfo.maxId + 1)) {
        onUpdateCallbacks_array.setInfoMessage(`Error: Cannot pick ${numIds} unique IDs from pool of ${dictInfo.maxId + 1}.`);
        return;
    }
    const availableIds = Array.from({ length: dictInfo.maxId + 1 }, (_, i) => i);
    for (let i = availableIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableIds[i], availableIds[j]] = [availableIds[j], availableIds[i]];
    }
    uiElements_array.textareas.array.ids.value = availableIds.slice(0, numIds).join(',');
    updateMarkerArray();
}

export function getArrayBaseFilename() {
    const params = getArrayParameters();
    const dictInfo = getDictionaryInfo();
    const totalZ = params.extrusionType === "flat" ? Math.max(params.z2, MIN_THICKNESS) : params.z1 + params.z2;
    let filename = `${dictInfo.name}_array-${params.gridX}x${params.gridY}_${params.dim}x${params.dim}x${totalZ.toFixed(2)}mm_gap${params.gap}mm_${params.extrusionType}`;
    if (params.gapFillType === 'border' && params.individualBorderWidth > MIN_THICKNESS) {
        filename += `_indivBorder${params.individualBorderWidth.toFixed(1)}mm`;
    }
    if (params.gapFillType === 'fill') filename += `_fillWithOuterBorder`;
    return filename;
}

export function getColoredElementsFromArray(targetMaterial) {
    const coloredGroup = new THREE.Group();
    mainObjectGroup_array.traverse((object) => {
        if (object.isMesh && object.material === targetMaterial) {
            const newMesh = new THREE.Mesh(object.geometry.clone(), object.material);
            newMesh.geometry.applyMatrix4(object.matrixWorld);
            coloredGroup.add(newMesh);
        }
    });
    return coloredGroup;
}

export function getArrayMetadataExport() {
    const params = getArrayParameters();
    const dictInfo = getDictionaryInfo();
    const markerIds = params.markerIdsRaw.map(Number);
    const totalZ = params.extrusionType === "flat" ? Math.max(params.z2, MIN_THICKNESS) : params.z1 + params.z2;

    let markerStepX = params.dim + (params.gapFillType === 'border' && params.individualBorderWidth > MIN_THICKNESS ? 2 * params.individualBorderWidth : 0) + params.gap;
    let markerStepY = params.dim + (params.gapFillType === 'border' && params.individualBorderWidth > MIN_THICKNESS ? 2 * params.individualBorderWidth : 0) + params.gap;

    const markerGridWidth = params.gridX * markerStepX - (params.gridX > 0 ? params.gap : 0);
    const markerGridHeight = params.gridY * markerStepY - (params.gridY > 0 ? params.gap : 0);
    const effectiveOuterBorderWidth = params.gapFillType === 'fill' ? params.gap : 0;
    const totalWidth = markerGridWidth + (params.gapFillType === 'fill' ? 2 * effectiveOuterBorderWidth : 0);
    const totalHeight = markerGridHeight + (params.gapFillType === 'fill' ? 2 * effectiveOuterBorderWidth : 0);

    const metadata = {
        timestamp: new Date().toISOString(), mode: 'array',
        setup: {
            dictionary: dictInfo.name, gridX: params.gridX, gridY: params.gridY,
            markerDimension: params.dim, gapWidth: params.gap,
            individualBorderWidth: params.gapFillType === 'border' ? params.individualBorderWidth : 0,
            gapFillType: params.gapFillType, cornerFillType: params.cornerFillType,
            z1_baseHeight: params.z1, z2_featureHeight: params.z2, totalHeight: totalZ,
            extrusionType: params.extrusionType, markerGridWidth, markerGridHeight, totalWidth, totalHeight, units: 'mm'
        },
        markers: [],
        calibrationPoints: {
            gridCorners: [], outerBorder: null,
            boundingBox: { min: { x: -totalWidth / 2, y: -totalHeight / 2, z: 0 }, max: { x: totalWidth / 2, y: totalHeight / 2, z: totalZ } }
        }
    };

    for (let y = 0; y < params.gridY; y++) {
        for (let x = 0; x < params.gridX; x++) {
            const index = y * params.gridX + x;
            const markerId = markerIds[index];
            const centerX = x * markerStepX - (params.gridX - 1) * markerStepX / 2;
            const centerY = (params.gridY - 1 - y) * markerStepY - (params.gridY - 1) * markerStepY / 2;
            const halfCoreDim = params.dim / 2;
            metadata.markers.push({
                id: markerId, gridPosition: { x, y }, center: { x: centerX, y: centerY, z: totalZ / 2 },
                coreCorners: {
                    topLeft: { x: centerX - halfCoreDim, y: centerY + halfCoreDim, z: totalZ },
                    topRight: { x: centerX + halfCoreDim, y: centerY + halfCoreDim, z: totalZ },
                    bottomLeft: { x: centerX - halfCoreDim, y: centerY - halfCoreDim, z: totalZ },
                    bottomRight: { x: centerX + halfCoreDim, y: centerY - halfCoreDim, z: totalZ }
                }
            });
        }
    }

    if (params.gap > MIN_THICKNESS || (params.gapFillType === 'border' && params.individualBorderWidth > MIN_THICKNESS)) {
        const effectiveDimX = params.dim + (params.gapFillType === 'border' ? 2 * params.individualBorderWidth : 0);
        const effectiveDimY = params.dim + (params.gapFillType === 'border' ? 2 * params.individualBorderWidth : 0);
        for (let r = 0; r < params.gridY - 1; r++) {
            for (let c = 0; c < params.gridX - 1; c++) {
                const posX = c * markerStepX - (params.gridX - 1) * markerStepX / 2 + effectiveDimX / 2 + params.gap / 2;
                const posY = (params.gridY - 1 - r) * markerStepY - (params.gridY - 1) * markerStepY / 2 - effectiveDimY / 2 - params.gap / 2;
                metadata.calibrationPoints.gridCorners.push({
                    type: 'internal_plus_intersection', gridIntersectionIndices: { x_idx: c, y_idx: r },
                    position: { x: posX, y: posY, z: totalZ }
                });
            }
        }
    }

    if (params.gapFillType === 'fill' && effectiveOuterBorderWidth > MIN_THICKNESS) {
        metadata.calibrationPoints.outerBorder = {
            topLeft: { x: -totalWidth / 2, y: totalHeight / 2, z: totalZ },
            topRight: { x: totalWidth / 2, y: totalHeight / 2, z: totalZ },
            bottomLeft: { x: -totalWidth / 2, y: -totalHeight / 2, z: totalZ },
            bottomRight: { x: totalWidth / 2, y: -totalHeight / 2, z: totalZ }
        };
    }
    return metadata;
}