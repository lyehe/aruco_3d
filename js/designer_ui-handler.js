import { scene } from './three-setup.js';
import { setDict as setArucoUtilDict } from './aruco-utils.js';
import { blackMaterial, whiteMaterial } from './config.js';
import { triggerDownload } from './ui-common-utils.js';
import { disposeGroup } from './geometry-utils.js';
import { initSingleMarkerUI, updateSingleMarker, getSingleMarkerBaseFilename, getColoredElementsFromSingle, getSingleMarkerMetadataExport } from './single-marker-handler.js';
import { initArrayMarkerUI, updateMarkerArray, prefillArrayIds as prefillArrayIds_array, getArrayBaseFilename, getColoredElementsFromArray, getArrayMetadataExport } from './array-marker-handler.js';
import { initCharucoUI, updateCharucoBoard, prefillCharucoIds as prefillCharucoIds_charuco, getCharucoBaseFilename, getColoredElementsFromCharuco, getCharucoMetadataExport } from './charuco-board-handler.js';

let dict;
let currentMode = 'single';
let mainObjectGroup = new THREE.Group();

// UI elements storage
const uiElements = {
    panels: {},
    buttons: {},
    inputs: { single: {}, array: {}, charuco: {} },
    selects: { single: {}, array: {}, charuco: {} },
    textareas: { single: {}, array: {}, charuco: {} },
    radios: { single: {}, array: {}, charuco: {} },
    infoDisplay: null
};

// Callbacks for handlers
const onUpdateCallbacks = {
    clearScene: () => clearSceneInternal(),
    setSaveDisabled: (disabled) => setAllSaveButtonsDisabled(disabled),
    setInfoMessage: (message) => {
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = message;
    }
};

export function setDict(dictionaryData) {
    dict = dictionaryData;
    setArucoUtilDict(dictionaryData);
}

function clearSceneInternal() {
    disposeGroup(mainObjectGroup);
}

function switchMode(newMode) {
    if (currentMode === newMode) return;

    // Hide current panel
    if (uiElements.panels[currentMode]) {
        uiElements.panels[currentMode].classList.remove('active');
    }
    if (uiElements.buttons[`mode_${currentMode}`]) {
        uiElements.buttons[`mode_${currentMode}`].classList.remove('active');
    }

    currentMode = newMode;
    onUpdateCallbacks.clearScene();

    // Show new panel
    if (uiElements.panels[currentMode]) {
        uiElements.panels[currentMode].classList.add('active');
    }
    if (uiElements.buttons[`mode_${currentMode}`]) {
        uiElements.buttons[`mode_${currentMode}`].classList.add('active');
    }

    triggerCurrentModeUpdate();
}

function triggerCurrentModeUpdate() {
    if (!dict) {
        console.warn("Dictionary not loaded yet. Cannot update UI.");
        onUpdateCallbacks.setInfoMessage("Dictionary loading...");
        onUpdateCallbacks.setSaveDisabled(true);
        return;
    }

    onUpdateCallbacks.setSaveDisabled(false);

    switch (currentMode) {
        case 'single':
            updateSingleMarker();
            break;
        case 'array':
            if (uiElements.buttons.array_refillIds) {
                prefillArrayIds_array();
            } else {
                updateMarkerArray();
            }
            break;
        case 'charuco':
            if (uiElements.buttons.charuco_refillIds) {
                prefillCharucoIds_charuco();
            } else {
                updateCharucoBoard();
            }
            break;
    }
}

function setAllSaveButtonsDisabled(disabled) {
    const buttons = ['saveWhiteStl', 'saveBlackStl', 'saveGlb', 'exportMetadata'];
    buttons.forEach(btnName => {
        if (uiElements.buttons[btnName]) {
            uiElements.buttons[btnName].disabled = disabled;
        }
    });
}

function getCurrentModeBaseFilename() {
    switch (currentMode) {
        case 'single':
            return getSingleMarkerBaseFilename();
        case 'array':
            return getArrayBaseFilename();
        case 'charuco':
            return getCharucoBaseFilename();
        default:
            console.warn("Unknown mode for filename:", currentMode);
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
            colorGroup = getColoredElementsFromSingle(targetMaterial);
            break;
        case 'array':
            colorGroup = getColoredElementsFromArray(targetMaterial);
            break;
        case 'charuco':
            colorGroup = getColoredElementsFromCharuco(targetMaterial);
            break;
        default:
            console.error("ExportSTLColor: Unknown mode - ", currentMode);
            return;
    }

    if (colorGroup && colorGroup.children.length > 0) {
        const exporter = new THREE.STLExporter();
        const stlString = exporter.parse(colorGroup, { binary: false });
        const baseFilename = getCurrentModeBaseFilename();
        const blob = new Blob([stlString], { type: 'model/stl' });
        triggerDownload(blob, `${baseFilename}_${colorName}.stl`);

        // Clean up the temporary color group
        disposeGroup(colorGroup);
    } else {
        alert(`No ${colorName} elements found in the current ${currentMode} model to export.`);
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

function exportMetadata() {
    if (!mainObjectGroup || mainObjectGroup.children.length === 0) {
        alert("No model generated to export metadata.");
        return;
    }

    let metadata;

    try {
        switch (currentMode) {
            case 'single':
                metadata = getSingleMarkerMetadataExport();
                break;
            case 'array':
                metadata = getArrayMetadataExport();
                break;
            case 'charuco':
                metadata = getCharucoMetadataExport();
                break;
        }

        const jsonString = JSON.stringify(metadata, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const filename = getCurrentModeBaseFilename() + '_metadata.json';
        triggerDownload(blob, filename);

    } catch (error) {
        console.error("Error exporting metadata:", error);
        alert("Error generating metadata export.");
    }
}

// Initialize all UI elements
function collectUIElements() {
    // Panels
    uiElements.panels.single = document.getElementById('panel-single');
    uiElements.panels.array = document.getElementById('panel-array');
    uiElements.panels.charuco = document.getElementById('panel-charuco');

    // Mode buttons
    uiElements.buttons.mode_single = document.getElementById('btn-mode-single');
    uiElements.buttons.mode_array = document.getElementById('btn-mode-array');
    uiElements.buttons.mode_charuco = document.getElementById('btn-mode-charuco');

    // Common elements
    uiElements.infoDisplay = document.querySelector('.info-display');
    uiElements.buttons.saveWhiteStl = document.getElementById('save-white-stl-button');
    uiElements.buttons.saveBlackStl = document.getElementById('save-black-stl-button');
    uiElements.buttons.saveGlb = document.getElementById('save-glb-button');
    uiElements.buttons.exportMetadata = document.getElementById('export-metadata-button');

    // Single marker elements
    uiElements.selects.single.dict = document.getElementById('frm-single-dict');
    uiElements.inputs.single.id = document.getElementById('frm-single-id');
    uiElements.inputs.single.dim = document.getElementById('frm-single-dim');
    uiElements.inputs.single.z1 = document.getElementById('frm-single-z1');
    uiElements.inputs.single.z2 = document.getElementById('frm-single-z2');
    uiElements.inputs.single.borderWidth = document.getElementById('frm-single-border-width');
    uiElements.radios.single.extrusion = document.querySelectorAll('input[name="single_extrusion"]');
    uiElements.radios.single.borderCornerType = document.querySelectorAll('input[name="single_borderCornerType"]');

    // Array elements
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
    uiElements.inputs.array.borderWidth = document.getElementById('frm-array-border-width'); // Added for individual marker border width
    uiElements.radios.array.extrusion = document.querySelectorAll('input[name="array_extrusion"]');
    uiElements.radios.array.gapFill = document.querySelectorAll('input[name="array_gapFill"]');
    uiElements.radios.array.cornerFill = document.querySelectorAll('input[name="array_cornerFill"]');

    // ChArUco elements
    uiElements.selects.charuco.dict = document.getElementById('frm-charuco-dict');
    uiElements.inputs.charuco.squaresX = document.getElementById('frm-charuco-squares-x');
    uiElements.inputs.charuco.squaresY = document.getElementById('frm-charuco-squares-y');
    uiElements.inputs.charuco.squareSize = document.getElementById('frm-charuco-square-size');
    uiElements.inputs.charuco.markerMargin = document.getElementById('frm-charuco-marker-margin');
    uiElements.textareas.charuco.ids = document.getElementById('frm-charuco-ids');
    uiElements.inputs.charuco.startId = document.getElementById('frm-charuco-start-id');
    uiElements.buttons.charuco_refillIds = document.getElementById('btn-charuco-refill-ids');
    uiElements.buttons.charuco_randomizeIds = document.getElementById('btn-charuco-randomize-ids');
    uiElements.inputs.charuco.z1 = document.getElementById('frm-charuco-z1');
    uiElements.inputs.charuco.z2 = document.getElementById('frm-charuco-z2');
    uiElements.radios.charuco.extrusion = document.querySelectorAll('input[name="charuco_extrusion"]');
}

function setupEventListeners() {
    // Mode switching
    if (uiElements.buttons.mode_single) {
        uiElements.buttons.mode_single.addEventListener('click', () => switchMode('single'));
    }
    if (uiElements.buttons.mode_array) {
        uiElements.buttons.mode_array.addEventListener('click', () => switchMode('array'));
    }
    if (uiElements.buttons.mode_charuco) {
        uiElements.buttons.mode_charuco.addEventListener('click', () => switchMode('charuco'));
    }

    // Export buttons
    if (uiElements.buttons.saveWhiteStl) {
        uiElements.buttons.saveWhiteStl.addEventListener('click', () => exportSTLColor('white'));
    }
    if (uiElements.buttons.saveBlackStl) {
        uiElements.buttons.saveBlackStl.addEventListener('click', () => exportSTLColor('black'));
    }
    if (uiElements.buttons.saveGlb) {
        uiElements.buttons.saveGlb.addEventListener('click', exportGLB);
    }
    if (uiElements.buttons.exportMetadata) {
        uiElements.buttons.exportMetadata.addEventListener('click', exportMetadata);
    }
}

export function initControls(loadDictPromise) {
    scene.add(mainObjectGroup);

    // Collect all UI elements
    collectUIElements();

    // Set up basic event listeners
    setupEventListeners();

    // Wait for dictionary to load
    loadDictPromise.then((dictionaryData) => {
        console.log("Dictionary loaded. Initializing mode-specific UI handlers.");

        // Initialize mode handlers
        initSingleMarkerUI(uiElements, dictionaryData, mainObjectGroup, onUpdateCallbacks);
        initArrayMarkerUI(uiElements, dictionaryData, mainObjectGroup, onUpdateCallbacks);
        initCharucoUI(uiElements, dictionaryData, mainObjectGroup, onUpdateCallbacks);

        // Trigger initial update
        triggerCurrentModeUpdate();

    }).catch(err => {
        console.error("Error during initControls after dictionary promise:", err);
        if (uiElements.infoDisplay) {
            uiElements.infoDisplay.innerHTML = 'Fatal Error: Could not initialize controls.';
        }
        setAllSaveButtonsDisabled(true);
    });
}