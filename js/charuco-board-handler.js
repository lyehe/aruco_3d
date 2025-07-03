import { generateMarkerMesh, getArucoBitPattern, validateMarkerId, MIN_THICKNESS } from './aruco-utils.js';
import { blackMaterial, whiteMaterial } from './config.js';
import { getMaxIdFromSelect } from './ui-common-utils.js';
import { mergeAndDisposeGeometries, createBoxAt, validateDimensions } from './geometry-utils.js';

let uiElements_charuco;
let dictionaryData_charuco;
let mainObjectGroup_charuco;
let onUpdateCallbacks_charuco;

export function initCharucoUI(uiElements, dict, mainGroup, onUpdate) {
    uiElements_charuco = uiElements;
    dictionaryData_charuco = dict;
    mainObjectGroup_charuco = mainGroup;
    onUpdateCallbacks_charuco = onUpdate;

    // Event listeners
    const prefillTriggers = [
        uiElements_charuco.selects.charuco.dict,
        uiElements_charuco.inputs.charuco.squaresX,
        uiElements_charuco.inputs.charuco.squaresY
    ];

    prefillTriggers.forEach(element => {
        if (element) element.addEventListener('change', prefillCharucoIds);
    });

    const updateTriggers = [
        uiElements_charuco.inputs.charuco.squareSize,
        uiElements_charuco.inputs.charuco.markerMargin,
        uiElements_charuco.textareas.charuco.ids,
        uiElements_charuco.inputs.charuco.z1,
        uiElements_charuco.inputs.charuco.z2
    ];

    updateTriggers.forEach(element => {
        if (element) element.addEventListener('input', updateCharucoBoard);
    });

    uiElements_charuco.buttons.charuco_refillIds.addEventListener('click', prefillCharucoIds);
    uiElements_charuco.buttons.charuco_randomizeIds.addEventListener('click', randomizeCharucoIds);

    uiElements_charuco.radios.charuco.extrusion.forEach(radio =>
        radio.addEventListener('change', updateCharucoBoard)
    );
}

function getCharucoParameters() {
    return {
        squaresX: Number(uiElements_charuco.inputs.charuco.squaresX.value),
        squaresY: Number(uiElements_charuco.inputs.charuco.squaresY.value),
        squareSize: Number(uiElements_charuco.inputs.charuco.squareSize.value),
        markerMargin: Number(uiElements_charuco.inputs.charuco.markerMargin.value),
        markerIdsRaw: uiElements_charuco.textareas.charuco.ids.value
            .split(',')
            .map(s => s.trim())
            .filter(s => s !== ''),
        z1: Number(uiElements_charuco.inputs.charuco.z1.value),
        z2: Number(uiElements_charuco.inputs.charuco.z2.value),
        extrusionType: document.querySelector('input[name="charuco_extrusion"]:checked').value,
        firstSquareColor: 'black'
    };
}

function getDictionaryInfo() {
    const selectedDictElement = uiElements_charuco.selects.charuco.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];

    return {
        name: option.value,
        patternWidth: Number(option.getAttribute('data-width')),
        patternHeight: Number(option.getAttribute('data-height')),
        maxId: getMaxIdFromSelect(selectedDictElement, dictionaryData_charuco)
    };
}

function validateCharucoParameters(params, dictInfo) {
    const errors = [];

    // Basic dimension validation
    if (params.squareSize <= 0) {
        errors.push('Square size must be positive');
    }

    if (params.z1 < 0) {
        errors.push('Base height (z1) must be non-negative');
    }

    if (params.extrusionType !== 'flat' && params.z2 < MIN_THICKNESS) {
        errors.push('Feature height (z2) must be positive for non-flat boards');
    }

    // Marker margin validation
    if (params.markerMargin < 0 || params.markerMargin * 2 >= params.squareSize) {
        errors.push('Marker margin must be non-negative and less than half the square size');
    }

    // Calculate derived values
    const markerDim = params.squareSize - (2 * params.markerMargin);
    const numWhiteSquares = calculateNumWhiteSquares(
        params.squaresX,
        params.squaresY,
        params.firstSquareColor
    );

    if (markerDim <= 0 && numWhiteSquares > 0) {
        errors.push('Marker dimension (after margin) must be positive');
    }

    // ID validation
    if (params.markerIdsRaw.length !== numWhiteSquares) {
        errors.push(`Number of IDs (${params.markerIdsRaw.length}) does not match white squares (${numWhiteSquares})`);
        return errors;
    }

    // Validate each ID
    if (numWhiteSquares > 0) {
        const markerIds = params.markerIdsRaw.map(Number);
        for (const id of markerIds) {
            const validation = validateMarkerId(dictInfo.name, id, dictInfo.maxId);
            if (!validation.valid) {
                errors.push(validation.error);
                break;
            }
        }
    }

    return errors;
}

function determineIsWhiteSquare(row, col, firstSquareColor) {
    const isEvenPosition = (row % 2 === col % 2);
    return firstSquareColor === 'white' ? isEvenPosition : !isEvenPosition;
}

function calculateNumWhiteSquares(squaresX, squaresY, firstSquareColor) {
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

export function updateCharucoBoard() {
    if (!dictionaryData_charuco) {
        console.warn("Dictionary not loaded yet for updateCharucoBoard");
        onUpdateCallbacks_charuco.setSaveDisabled(true);
        onUpdateCallbacks_charuco.setInfoMessage('Error: Dictionary loading or failed.');
        return;
    }

    onUpdateCallbacks_charuco.clearScene();

    // Get parameters
    const params = getCharucoParameters();
    const dictInfo = getDictionaryInfo();

    // Update max ID
    uiElements_charuco.inputs.charuco.startId.setAttribute('max', dictInfo.maxId);

    // Validate
    const errors = validateCharucoParameters(params, dictInfo);
    if (errors.length > 0) {
        onUpdateCallbacks_charuco.setSaveDisabled(true);
        onUpdateCallbacks_charuco.setInfoMessage(errors[0]);
        return;
    }

    // Generate board
    try {
        generateCharucoBoard(params, dictInfo);

        // Update UI
        const totalZ = params.extrusionType === "flat" ?
            Math.max(params.z2, MIN_THICKNESS) :
            params.z1 + params.z2;

        const numWhiteSquares = calculateNumWhiteSquares(
            params.squaresX,
            params.squaresY,
            params.firstSquareColor
        );

        onUpdateCallbacks_charuco.setInfoMessage(
            `ChArUco: ${params.squaresX}x${params.squaresY}, ` +
            `Total Z: ${totalZ.toFixed(2)}mm. ` +
            `Markers: ${numWhiteSquares}`
        );
        onUpdateCallbacks_charuco.setSaveDisabled(false);

    } catch (error) {
        console.error("Error generating ChArUco board:", error);
        onUpdateCallbacks_charuco.setSaveDisabled(true);
        onUpdateCallbacks_charuco.setInfoMessage('Error generating board');
    }
}

function generateCharucoBoard(params, dictInfo) {
    const markerIds = params.markerIdsRaw.map(Number);
    const markerDim = params.squareSize - (2 * params.markerMargin);
    const boardWidth = params.squaresX * params.squareSize;
    const boardHeight = params.squaresY * params.squareSize;

    let markerIdIndex = 0;

    // Create base plate for non-flat extrusions
    if (params.extrusionType !== "flat" && params.z1 >= MIN_THICKNESS) {
        const baseMaterial = params.extrusionType === "positive" ? whiteMaterial : blackMaterial;
        const baseGeo = createBoxAt(boardWidth, boardHeight, params.z1, 0, 0, params.z1 / 2);
        const baseMesh = new THREE.Mesh(baseGeo, baseMaterial);
        baseMesh.name = "charuco_base_plate";
        mainObjectGroup_charuco.add(baseMesh);
    }

    // Generate squares
    for (let row = 0; row < params.squaresY; row++) {
        for (let col = 0; col < params.squaresX; col++) {
            const isWhite = determineIsWhiteSquare(row, col, params.firstSquareColor);
            const squareCenterX = col * params.squareSize - boardWidth / 2 + params.squareSize / 2;
            const squareCenterY = -(row * params.squareSize - boardHeight / 2 + params.squareSize / 2);

            if (params.extrusionType === "flat") {
                generateFlatSquare(params, dictInfo, isWhite, squareCenterX, squareCenterY,
                    markerIds, markerIdIndex, markerDim, row, col);
                if (isWhite) markerIdIndex++;
            } else {
                generateExtrudedSquare(params, dictInfo, isWhite, squareCenterX, squareCenterY,
                    markerIds, markerIdIndex, markerDim, row, col);
                if (isWhite) markerIdIndex++;
            }
        }
    }
}
function generateFlatSquare(params, dictInfo, isWhite, centerX, centerY,
    markerIds, markerIndex, markerDim, row, col) {
    const thickness = Math.max(params.z2, MIN_THICKNESS);

    if (isWhite) {
        // White square with marker
        const markerId = markerIds[markerIndex];

        // Generate margin if needed
        if (params.markerMargin > MIN_THICKNESS) {
            const marginGeometries = [
                createBoxAt(params.squareSize, params.markerMargin, thickness,
                    0, (params.squareSize / 2) - (params.markerMargin / 2), thickness / 2),
                createBoxAt(params.squareSize, params.markerMargin, thickness,
                    0, -(params.squareSize / 2) + (params.markerMargin / 2), thickness / 2),
                createBoxAt(params.markerMargin, markerDim, thickness,
                    -(params.squareSize / 2) + (params.markerMargin / 2), 0, thickness / 2),
                createBoxAt(params.markerMargin, markerDim, thickness,
                    (params.squareSize / 2) - (params.markerMargin / 2), 0, thickness / 2)
            ];

            const marginMesh = mergeAndDisposeGeometries(marginGeometries, whiteMaterial);
            if (marginMesh) {
                marginMesh.position.set(centerX, centerY, 0);
                marginMesh.name = `flat_white_margin_${row}_${col}`;
                mainObjectGroup_charuco.add(marginMesh);
            }
        }

        // Generate marker
        // IMPORTANT: For flat mode, pass 0 as z1 and thickness as z2
        const fullPattern = getArucoBitPattern(dictInfo.name, markerId,
            dictInfo.patternWidth, dictInfo.patternHeight);
        const markerGroup = generateMarkerMesh(fullPattern, markerDim, markerDim,
            0, thickness, "flat", null);
        markerGroup.position.set(centerX, centerY, 0);
        markerGroup.name = `marker_flat_${markerId}`;
        mainObjectGroup_charuco.add(markerGroup);

    } else {
        // Black square
        const blackGeo = createBoxAt(params.squareSize, params.squareSize, thickness,
            0, 0, thickness / 2);
        const blackMesh = new THREE.Mesh(blackGeo, blackMaterial);
        blackMesh.position.set(centerX, centerY, 0);
        blackMesh.name = `flat_black_square_${row}_${col}`;
        mainObjectGroup_charuco.add(blackMesh);
    }
}

function generateExtrudedSquare(params, dictInfo, isWhite, centerX, centerY,
    markerIds, markerIndex, markerDim, row, col) {
    if (params.extrusionType === "positive") {
        if (!isWhite) {
            // Black squares are raised in positive mode
            const blackGeo = createBoxAt(params.squareSize, params.squareSize, params.z2,
                centerX, centerY, params.z1 + params.z2 / 2);
            const blackMesh = new THREE.Mesh(blackGeo, blackMaterial);
            blackMesh.name = `positive_black_square_${row}_${col}`;
            mainObjectGroup_charuco.add(blackMesh);
        } else {
            // White square with marker
            const markerId = markerIds[markerIndex];
            const fullPattern = getArucoBitPattern(dictInfo.name, markerId,
                dictInfo.patternWidth, dictInfo.patternHeight);
            const markerGroup = generateMarkerMesh(fullPattern, markerDim, markerDim,
                0, params.z2, "positive", null);
            markerGroup.position.set(centerX, centerY, params.z1);
            markerGroup.name = `marker_positive_${markerId}`;
            mainObjectGroup_charuco.add(markerGroup);
        }
    } else { // negative
        if (isWhite) {
            // White squares with markers
            const markerId = markerIds[markerIndex];

            // Generate margin if needed
            if (params.markerMargin > MIN_THICKNESS) {
                const marginGeometries = [
                    createBoxAt(params.squareSize, params.markerMargin, params.z2,
                        0, (params.squareSize / 2) - (params.markerMargin / 2), 0),
                    createBoxAt(params.squareSize, params.markerMargin, params.z2,
                        0, -(params.squareSize / 2) + (params.markerMargin / 2), 0),
                    createBoxAt(params.markerMargin, markerDim, params.z2,
                        -(params.squareSize / 2) + (params.markerMargin / 2), 0, 0),
                    createBoxAt(params.markerMargin, markerDim, params.z2,
                        (params.squareSize / 2) - (params.markerMargin / 2), 0, 0)
                ];

                const marginMesh = mergeAndDisposeGeometries(marginGeometries, whiteMaterial);
                if (marginMesh) {
                    marginMesh.position.set(centerX, centerY, params.z1 + params.z2 / 2);
                    marginMesh.name = `negative_white_margin_${row}_${col}`;
                    mainObjectGroup_charuco.add(marginMesh);
                }
            }

            // Generate marker
            const fullPattern = getArucoBitPattern(dictInfo.name, markerId,
                dictInfo.patternWidth, dictInfo.patternHeight);
            const markerGroup = generateMarkerMesh(fullPattern, markerDim, markerDim,
                0, params.z2, "negative", null);
            markerGroup.position.set(centerX, centerY, params.z1);
            markerGroup.name = `marker_negative_${markerId}`;
            mainObjectGroup_charuco.add(markerGroup);

        } else if (params.z1 < MIN_THICKNESS) {
            // Black squares need explicit geometry when no base plate
            const blackHeight = Math.max(params.z2, MIN_THICKNESS);
            const blackGeo = createBoxAt(params.squareSize, params.squareSize, blackHeight,
                0, 0, blackHeight / 2);
            const blackMesh = new THREE.Mesh(blackGeo, blackMaterial);
            blackMesh.position.set(centerX, centerY, 0);
            blackMesh.name = `negative_black_square_explicit_${row}_${col}`;
            mainObjectGroup_charuco.add(blackMesh);
        }
    }
}

export function prefillCharucoIds() {
    const params = getCharucoParameters();
    const dictInfo = getDictionaryInfo();
    const numWhiteSquares = calculateNumWhiteSquares(
        params.squaresX,
        params.squaresY,
        params.firstSquareColor
    );
    const startId = Number(uiElements_charuco.inputs.charuco.startId.value);

    const ids = [];
    if (numWhiteSquares > 0) {
        for (let i = 0; i < numWhiteSquares; i++) {
            let currentId = startId + i;
            if (currentId > dictInfo.maxId) {
                console.warn(`ID ${currentId} exceeds max ID ${dictInfo.maxId}. Capping.`);
                currentId = dictInfo.maxId;
            }
            ids.push(currentId);
        }
    }

    uiElements_charuco.textareas.charuco.ids.value = ids.join(',');
    updateCharucoBoard();
}

export function randomizeCharucoIds() {
    const params = getCharucoParameters();
    const dictInfo = getDictionaryInfo();
    const numWhiteSquares = calculateNumWhiteSquares(
        params.squaresX,
        params.squaresY,
        params.firstSquareColor
    );

    if (numWhiteSquares === 0) {
        uiElements_charuco.textareas.charuco.ids.value = '';
        updateCharucoBoard();
        return;
    }

    if (numWhiteSquares > (dictInfo.maxId + 1)) {
        onUpdateCallbacks_charuco.setInfoMessage(
            `Error: Cannot pick ${numWhiteSquares} unique IDs from pool of ${dictInfo.maxId + 1}.`
        );
        return;
    }

    // Create pool and shuffle
    const availableIds = [];
    for (let i = 0; i <= dictInfo.maxId; i++) {
        availableIds.push(i);
    }

    // Fisher-Yates shuffle
    for (let i = availableIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableIds[i], availableIds[j]] = [availableIds[j], availableIds[i]];
    }

    uiElements_charuco.textareas.charuco.ids.value = availableIds.slice(0, numWhiteSquares).join(',');
    updateCharucoBoard();
}

export function getCharucoBaseFilename() {
    const params = getCharucoParameters();
    const dictInfo = getDictionaryInfo();
    const markerDim = params.squareSize - (2 * params.markerMargin);

    const totalZ = params.extrusionType === "flat" ?
        Math.max(params.z2, MIN_THICKNESS) :
        params.z1 + params.z2;

    return `${dictInfo.name}_charuco-${params.squaresX}x${params.squaresY}_` +
        `sq${params.squareSize}mm_` +
        `mrg${params.markerMargin}mm_mdim${markerDim.toFixed(1)}mm_` +
        `${params.extrusionType}_z${totalZ.toFixed(2)}mm`;
}

export function getColoredElementsFromCharuco(targetMaterial) {
    const coloredGroup = new THREE.Group();

    mainObjectGroup_charuco.traverse((object) => {
        if (object.isMesh && object.material === targetMaterial) {
            const newMesh = new THREE.Mesh(object.geometry.clone(), object.material);
            newMesh.geometry.applyMatrix4(object.matrixWorld);
            coloredGroup.add(newMesh);
        }
    });

    return coloredGroup;
}
export function getCharucoMetadataExport() {
    const params = getCharucoParameters();
    const dictInfo = getDictionaryInfo();
    const markerIds = params.markerIdsRaw.map(Number);
    const markerDim = params.squareSize - (2 * params.markerMargin);

    const totalZ = params.extrusionType === "flat" ?
        Math.max(params.z2, MIN_THICKNESS) :
        params.z1 + params.z2;

    const boardWidth = params.squaresX * params.squareSize;
    const boardHeight = params.squaresY * params.squareSize;

    const metadata = {
        timestamp: new Date().toISOString(),
        mode: 'charuco',
        setup: {
            dictionary: dictInfo.name,
            squaresX: params.squaresX,
            squaresY: params.squaresY,
            squareSize: params.squareSize,
            markerMargin: params.markerMargin,
            markerDimension: markerDim,
            firstSquareColor: 'black',
            z1_baseHeight: params.z1,
            z2_featureHeight: params.z2,
            totalHeight: totalZ,
            extrusionType: params.extrusionType,
            boardWidth: boardWidth,
            boardHeight: boardHeight,
            units: 'mm'
        },
        markers: [],
        checkerboardCorners: [],
        calibrationPoints: {
            boardCorners: {
                topLeft: { x: -boardWidth / 2, y: boardHeight / 2, z: totalZ },
                topRight: { x: boardWidth / 2, y: boardHeight / 2, z: totalZ },
                bottomLeft: { x: -boardWidth / 2, y: -boardHeight / 2, z: totalZ },
                bottomRight: { x: boardWidth / 2, y: -boardHeight / 2, z: totalZ }
            },
            boundingBox: {
                min: { x: -boardWidth / 2, y: -boardHeight / 2, z: 0 },
                max: { x: boardWidth / 2, y: boardHeight / 2, z: totalZ }
            }
        }
    };

    // Add checkerboard corners (intersection points)
    for (let row = 0; row <= params.squaresY; row++) {
        for (let col = 0; col <= params.squaresX; col++) {
            const x = col * params.squareSize - boardWidth / 2;
            const y = -(row * params.squareSize - boardHeight / 2);

            metadata.checkerboardCorners.push({
                gridPosition: { x: col, y: row },
                position: { x: x, y: y, z: totalZ },
                isInterior: (row > 0 && row < params.squaresY && col > 0 && col < params.squaresX)
            });
        }
    }

    // Add marker information
    let markerIndex = 0;
    for (let row = 0; row < params.squaresY; row++) {
        for (let col = 0; col < params.squaresX; col++) {
            // Use the existing determineIsWhiteSquare function
            const isWhite = determineIsWhiteSquare(row, col, params.firstSquareColor);

            if (isWhite) {
                const markerId = markerIds[markerIndex];
                const squareCenterX = col * params.squareSize - boardWidth / 2 + params.squareSize / 2;
                const squareCenterY = -(row * params.squareSize - boardHeight / 2 + params.squareSize / 2);
                const halfMarkerDim = markerDim / 2;

                metadata.markers.push({
                    id: markerId,
                    squarePosition: { x: col, y: row },
                    center: { x: squareCenterX, y: squareCenterY, z: totalZ / 2 },
                    corners: {
                        topLeft: { x: squareCenterX - halfMarkerDim, y: squareCenterY + halfMarkerDim, z: totalZ },
                        topRight: { x: squareCenterX + halfMarkerDim, y: squareCenterY + halfMarkerDim, z: totalZ },
                        bottomLeft: { x: squareCenterX - halfMarkerDim, y: squareCenterY - halfMarkerDim, z: totalZ },
                        bottomRight: { x: squareCenterX + halfMarkerDim, y: squareCenterY - halfMarkerDim, z: totalZ }
                    }
                });

                markerIndex++;
            }
        }
    }

    return metadata;
}