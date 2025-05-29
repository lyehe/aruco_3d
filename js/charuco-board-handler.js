import { generateMarkerMesh, getArucoBitPattern } from './aruco-utils.js';
import { blackMaterial, whiteMaterial } from './config.js';
import { getMaxIdFromSelect } from './ui-common-utils.js';

let uiElements_charuco;
let dictionaryData_charuco;
let mainObjectGroup_charuco;
let onUpdateCallbacks_charuco; // { clearScene, setSaveDisabled, setInfoMessage }

export function initCharucoUI(uiElements, dict, mainGroup, onUpdate) {
    uiElements_charuco = uiElements;
    dictionaryData_charuco = dict;
    mainObjectGroup_charuco = mainGroup;
    onUpdateCallbacks_charuco = onUpdate;

    uiElements_charuco.selects.charuco.dict.addEventListener('change', () => { prefillCharucoIds(); });
    uiElements_charuco.inputs.charuco.squaresX.addEventListener('input', () => { prefillCharucoIds(); });
    uiElements_charuco.inputs.charuco.squaresY.addEventListener('input', () => { prefillCharucoIds(); });
    uiElements_charuco.inputs.charuco.squareSize.addEventListener('input', updateCharucoBoard);
    uiElements_charuco.inputs.charuco.markerMargin.addEventListener('input', updateCharucoBoard);
    uiElements_charuco.radios.charuco.firstSquare.forEach(radio => radio.addEventListener('change', () => { prefillCharucoIds(); }));
    uiElements_charuco.textareas.charuco.ids.addEventListener('input', updateCharucoBoard);
    uiElements_charuco.buttons.charuco_refillIds.addEventListener('click', prefillCharucoIds);
    uiElements_charuco.buttons.charuco_randomizeIds.addEventListener('click', randomizeCharucoIds);
    uiElements_charuco.inputs.charuco.z1.addEventListener('input', updateCharucoBoard);
    uiElements_charuco.inputs.charuco.z2.addEventListener('input', updateCharucoBoard);
    uiElements_charuco.radios.charuco.extrusion.forEach(radio => radio.addEventListener('change', updateCharucoBoard));
    // startId event listener is implicit
}

function determineIsWhiteSquare(r, c, firstSquareColor) {
    if (firstSquareColor === 'white') {
        return (r % 2 === c % 2);
    } else { // black
        return (r % 2 !== c % 2);
    }
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

    const squaresX = Number(uiElements_charuco.inputs.charuco.squaresX.value);
    const squaresY = Number(uiElements_charuco.inputs.charuco.squaresY.value);
    const squareSize = Number(uiElements_charuco.inputs.charuco.squareSize.value);
    const markerMargin = Number(uiElements_charuco.inputs.charuco.markerMargin.value);
    const markerIdsRaw = uiElements_charuco.textareas.charuco.ids.value.split(',').map(s => s.trim()).filter(s => s !== '');
    const z1_base_board = Number(uiElements_charuco.inputs.charuco.z1.value);
    const z2_feature_board = Number(uiElements_charuco.inputs.charuco.z2.value);
    const extrusionType = document.querySelector('input[name="charuco_extrusion"]:checked').value;
    const firstSquareColor = document.querySelector('input[name="charuco_firstSquare"]:checked').value;

    const selectedDictElement = uiElements_charuco.selects.charuco.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const patternWidth = Number(option.getAttribute('data-width'));
    const patternHeight = Number(option.getAttribute('data-height'));
    const maxId = getMaxIdFromSelect(selectedDictElement, dictionaryData_charuco);
    uiElements_charuco.inputs.charuco.startId.setAttribute('max', maxId);

    if (squareSize <= 0 || z1_base_board < 0 || (extrusionType !== "flat" && z2_feature_board < 1e-5)) {
        onUpdateCallbacks_charuco.setSaveDisabled(true);
        onUpdateCallbacks_charuco.setInfoMessage('Board dimensions must be positive. Base height (z1) must be non-negative. Feature height (z2) must be positive for non-flat extrusions.');
        return;
    }
    if (extrusionType === "flat" && z1_base_board < 0) {
        onUpdateCallbacks_charuco.setSaveDisabled(true);
        onUpdateCallbacks_charuco.setInfoMessage('Base height (z1) must be non-negative for flat boards.');
        return;
    }
    if (markerMargin < 0 || markerMargin * 2 >= squareSize) {
        onUpdateCallbacks_charuco.setSaveDisabled(true);
        onUpdateCallbacks_charuco.setInfoMessage('Marker margin must be non-negative and less than half the square size.');
        return;
    }
    const markerDim = squareSize - (2 * markerMargin);
    const numWhiteSquares = calculateNumWhiteSquares(squaresX, squaresY, firstSquareColor);
    if (markerDim <= 0 && numWhiteSquares > 0) {
        onUpdateCallbacks_charuco.setSaveDisabled(true);
        onUpdateCallbacks_charuco.setInfoMessage('Marker dimension (derived) must be positive when markers are present.');
        return;
    }
    if (markerIdsRaw.length !== numWhiteSquares) {
        onUpdateCallbacks_charuco.setSaveDisabled(true);
        onUpdateCallbacks_charuco.setInfoMessage(`Error: Number of IDs (${markerIdsRaw.length}) does not match white squares (${numWhiteSquares}).`);
        return;
    }
    const markerIds = markerIdsRaw.map(Number);
    let invalidIdFound = false;
    if (numWhiteSquares > 0) {
        for (const id of markerIds) {
            if (isNaN(id) || id < 0 || id > maxId || !dictionaryData_charuco[dictName] || !dictionaryData_charuco[dictName][id]) {
                onUpdateCallbacks_charuco.setInfoMessage(`Error: Invalid ArUco ID (ID: ${id}, Max: ${maxId} for ${dictName}).`);
                invalidIdFound = true; break;
            }
        }
    }
    if (invalidIdFound) {
        onUpdateCallbacks_charuco.setSaveDisabled(true);
        return;
    }

    onUpdateCallbacks_charuco.setInfoMessage('');
    onUpdateCallbacks_charuco.setSaveDisabled(false);

    let markerIdCounter = 0;
    const boardTotalWidth = squaresX * squareSize;
    const boardTotalHeight = squaresY * squareSize;

    if (extrusionType !== "flat" && z1_base_board >= 1e-5) {
        const basePlateMaterial = (extrusionType === "positive") ? whiteMaterial : blackMaterial;
        const boardBaseGeo = new THREE.BoxGeometry(boardTotalWidth, boardTotalHeight, z1_base_board);
        boardBaseGeo.translate(0, 0, z1_base_board / 2);
        const boardBaseMesh = new THREE.Mesh(boardBaseGeo, basePlateMaterial);
        boardBaseMesh.name = "charuco_base_plate";
        mainObjectGroup_charuco.add(boardBaseMesh);
    }

    const flatPieceThickness = (extrusionType === "flat") ? Math.max(z2_feature_board, 0.1) : Math.max(z1_base_board, 0.1);
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
                                marginMesh.position.set(squareCenterX, squareCenterY, 0); 
                                marginMesh.name = `flat_white_margin_${r_grid}_${c_grid}`;
                                mainObjectGroup_charuco.add(marginMesh);
                            }
                        }
                    }
                    const markerMeshGroup = generateMarkerMesh(fullPattern, markerDim, markerDim, flatPieceThickness, 1e-5, "flat", null);
                    markerMeshGroup.position.set(squareCenterX, squareCenterY, 0); 
                    markerMeshGroup.name = `marker_flat_${markerIdNum}`;
                    mainObjectGroup_charuco.add(markerMeshGroup);
                } else {
                    const blackSquareGeo = new THREE.BoxGeometry(squareSize, squareSize, flatPieceThickness);
                    blackSquareGeo.translate(0, 0, flatPieceZOffset);
                    const blackSquareMesh = new THREE.Mesh(blackSquareGeo, blackMaterial);
                    blackSquareMesh.position.set(squareCenterX, squareCenterY, 0);
                    blackSquareMesh.name = `flat_black_square_${r_grid}_${c_grid}`;
                    mainObjectGroup_charuco.add(blackSquareMesh);
                }
            } else if (extrusionType === "positive") {
                if (!isWhiteSq) {
                    const blackSquareGeo = new THREE.BoxGeometry(squareSize, squareSize, z2_feature_board);
                    blackSquareGeo.translate(squareCenterX, squareCenterY, z1_base_board + z2_feature_board / 2);
                    const blackSquareMesh = new THREE.Mesh(blackSquareGeo, blackMaterial);
                    blackSquareMesh.name = `positive_black_square_${r_grid}_${c_grid}`;
                    mainObjectGroup_charuco.add(blackSquareMesh);
                }
                if (isWhiteSq) {
                    const markerIdNum = markerIds[markerIdCounter++];
                    const fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
                    const markerMeshGroup = generateMarkerMesh(fullPattern, markerDim, markerDim, 0, z2_feature_board, "positive", null);
                    markerMeshGroup.position.set(squareCenterX, squareCenterY, z1_base_board); 
                    markerMeshGroup.name = `marker_positive_${markerIdNum}`;
                    mainObjectGroup_charuco.add(markerMeshGroup);
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
                                marginMeshN.position.set(squareCenterX, squareCenterY, z1_base_board + z2_feature_board / 2);
                                marginMeshN.name = `negative_white_margin_${r_grid}_${c_grid}`;
                                mainObjectGroup_charuco.add(marginMeshN);
                            }
                        }
                    }
                    const markerMeshGroup = generateMarkerMesh(fullPattern, markerDim, markerDim, 0, z2_feature_board, "negative", null);
                    markerMeshGroup.position.set(squareCenterX, squareCenterY, z1_base_board); 
                    markerMeshGroup.name = `marker_negative_${markerIdNum}`;
                    mainObjectGroup_charuco.add(markerMeshGroup);
                } else { 
                    if (z1_base_board < 1e-5) { 
                        const blackSquareActualHeight = Math.max(z2_feature_board, 0.1); 
                        const blackSquareGeo = new THREE.BoxGeometry(squareSize, squareSize, blackSquareActualHeight);
                        blackSquareGeo.translate(0,0, blackSquareActualHeight / 2); 
                        const blackSquareMesh = new THREE.Mesh(blackSquareGeo, blackMaterial);
                        blackSquareMesh.position.set(squareCenterX, squareCenterY, 0); 
                        blackSquareMesh.name = `negative_black_square_explicit_${r_grid}_${c_grid}`;
                        mainObjectGroup_charuco.add(blackSquareMesh);
                    }
                }
            }
        }
    }

    if (mainObjectGroup_charuco.children.length > 0) {
        mainObjectGroup_charuco.updateMatrixWorld(true);
        let currentFileNameTotalZ;
        if (extrusionType === "flat") {
            currentFileNameTotalZ = Math.max(z2_feature_board, 0.1);
        } else {
            currentFileNameTotalZ = z1_base_board + z2_feature_board;
        }
        onUpdateCallbacks_charuco.setInfoMessage(`ChArUco: ${squaresX}x${squaresY}, First: ${firstSquareColor}. Total Z: ${currentFileNameTotalZ.toFixed(2)}mm. Markers: ${markerIds.length}`);
    } else {
        onUpdateCallbacks_charuco.setInfoMessage('No ChArUco board generated.');
        onUpdateCallbacks_charuco.setSaveDisabled(true);
    }
}

export function prefillCharucoIds() { 
    const squaresX = Number(uiElements_charuco.inputs.charuco.squaresX.value);
    const squaresY = Number(uiElements_charuco.inputs.charuco.squaresY.value);
    const firstSquareColor = document.querySelector('input[name="charuco_firstSquare"]:checked').value;
    const numWhiteSquares = calculateNumWhiteSquares(squaresX, squaresY, firstSquareColor);
    const startId = Number(uiElements_charuco.inputs.charuco.startId.value);
    const selectedDictElement = uiElements_charuco.selects.charuco.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const maxId = getMaxIdFromSelect(selectedDictElement, dictionaryData_charuco);

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
    uiElements_charuco.textareas.charuco.ids.value = ids.join(',');
    updateCharucoBoard(); 
}

export function randomizeCharucoIds() { 
    const squaresX = Number(uiElements_charuco.inputs.charuco.squaresX.value);
    const squaresY = Number(uiElements_charuco.inputs.charuco.squaresY.value);
    const firstSquareColor = document.querySelector('input[name="charuco_firstSquare"]:checked').value;
    const numWhiteSquares = calculateNumWhiteSquares(squaresX, squaresY, firstSquareColor);
    const selectedDictElement = uiElements_charuco.selects.charuco.dict;
    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    const dictName = option.value;
    const maxId = getMaxIdFromSelect(selectedDictElement, dictionaryData_charuco);

    if (numWhiteSquares > (maxId + 1) && numWhiteSquares > 0) {
        onUpdateCallbacks_charuco.setInfoMessage(`Error: Cannot pick ${numWhiteSquares} unique IDs from pool of ${maxId + 1}.`);
        return;
    }
    if (numWhiteSquares === 0) {
        uiElements_charuco.textareas.charuco.ids.value = '';
        updateCharucoBoard();
        return;
    }

    const availableIds = [];
    for (let i = 0; i <= maxId; i++) availableIds.push(i);
    for (let i = availableIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableIds[i], availableIds[j]] = [availableIds[j], availableIds[i]];
    }
    uiElements_charuco.textareas.charuco.ids.value = availableIds.slice(0, numWhiteSquares).join(',');
    updateCharucoBoard(); 
}

export function getCharucoBaseFilename() {
    const squaresX = Number(uiElements_charuco.inputs.charuco.squaresX.value);
    const squaresY = Number(uiElements_charuco.inputs.charuco.squaresY.value);
    const squareSize = Number(uiElements_charuco.inputs.charuco.squareSize.value);
    const markerMargin = Number(uiElements_charuco.inputs.charuco.markerMargin.value);
    const z1_base_val = Number(uiElements_charuco.inputs.charuco.z1.value);
    const z2_feature_val = Number(uiElements_charuco.inputs.charuco.z2.value);
    const extrusionType = document.querySelector('input[name="charuco_extrusion"]:checked').value;
    const selectedDictElement = uiElements_charuco.selects.charuco.dict;
    const dictName = selectedDictElement.options[selectedDictElement.selectedIndex].value;
    const markerDimVal = squareSize - (2 * markerMargin);
    const firstSquareColor = document.querySelector('input[name="charuco_firstSquare"]:checked').value;

    let fileNameTotalZ;
    if (extrusionType === "flat") {
        fileNameTotalZ = Math.max(z2_feature_val, 0.1);
    } else {
        fileNameTotalZ = z1_base_val + z2_feature_val;
    }
    return `${dictName}_charuco-${squaresX}x${squaresY}_${firstSquareColor}Start_sq${squareSize}mm_mrg${markerMargin}mm_mdim${markerDimVal.toFixed(1)}mm_${extrusionType}_z${fileNameTotalZ.toFixed(2)}mm`;
}

export function getColoredElementsFromCharuco(targetMaterial) {
    const coloredGroup = new THREE.Group();
    if (!mainObjectGroup_charuco) return coloredGroup;
    mainObjectGroup_charuco.traverse((object) => {
        if (object.isMesh && object.material === targetMaterial) {
            const newMesh = new THREE.Mesh(object.geometry.clone(), object.material);
            newMesh.geometry.applyMatrix4(object.matrixWorld);
            coloredGroup.add(newMesh);
        }
    });
    return coloredGroup;
} 