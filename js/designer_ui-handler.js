import { scene } from './three-setup.js';
import { setDict as setArucoUtilDict } from './aruco-utils.js'; // Still need to pass dict to aruco-utils
import { blackMaterial, whiteMaterial } from './config.js';
import { triggerDownload } from './ui-common-utils.js';
import { initSingleMarkerUI, updateSingleMarker, getSingleMarkerBaseFilename, getColoredElementsFromSingle } from './single-marker-handler.js';
import { initArrayMarkerUI, updateMarkerArray, prefillArrayIds as prefillArrayIds_array, getArrayBaseFilename, getColoredElementsFromArray } from './array-marker-handler.js';
import { initCharucoUI, updateCharucoBoard, prefillCharucoIds as prefillCharucoIds_charuco, getCharucoBaseFilename, getColoredElementsFromCharuco } from './charuco-board-handler.js';


let dict; // The master dictionary data
let currentMode = 'single'; // 'single', 'array', or 'charuco'
let mainObjectGroup = new THREE.Group(); // Shared group for all 3D content

// Store references to UI elements
const uiElements = {
    panels: {},
    buttons: {},
    inputs: { single: {}, array: {}, charuco: {} },
    selects: { single: {}, array: {}, charuco: {} },
    textareas: { single: {}, array: {}, charuco: {} },
    radios: { single: {}, array: {}, charuco: {} },
    infoDisplay: null
};

// Callbacks to pass to individual handlers
const onUpdateCallbacks = {
    clearScene: () => clearSceneInternal(), // Renamed to avoid conflict
    setSaveDisabled: (disabled) => setAllSaveButtonsDisabled(disabled),
    setInfoMessage: (message) => {
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = message;
    }
};


export function setDict(dictionaryData) {
    dict = dictionaryData;
    setArucoUtilDict(dictionaryData); 
}

function clearSceneInternal() { // Renamed from clearScene
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

    if (uiElements.panels[currentMode]) uiElements.panels[currentMode].classList.remove('active');
    if (uiElements.buttons[`mode_${currentMode}`]) uiElements.buttons[`mode_${currentMode}`].classList.remove('active');
    
    currentMode = newMode;
    onUpdateCallbacks.clearScene(); // Use the callback

    if (uiElements.panels[currentMode]) uiElements.panels[currentMode].classList.add('active');
    if (uiElements.buttons[`mode_${currentMode}`]) uiElements.buttons[`mode_${currentMode}`].classList.add('active');

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
            updateSingleMarker(); // This function is now imported
            break;
        case 'array':
            // Array handler's prefill/update functions are self-contained or receive dict via init
            if (uiElements.buttons.array_refillIds) prefillArrayIds_array();
            else updateMarkerArray(); // This function is now imported
            break;
        case 'charuco':
            if (uiElements.buttons.charuco_refillIds) prefillCharucoIds_charuco();
            else updateCharucoBoard(); // This function is now imported
            break;
    }
}

function setAllSaveButtonsDisabled(disabled) {
    if (uiElements.buttons.saveWhiteStl) uiElements.buttons.saveWhiteStl.disabled = disabled;
    if (uiElements.buttons.saveBlackStl) uiElements.buttons.saveBlackStl.disabled = disabled;
    if (uiElements.buttons.saveGlb) uiElements.buttons.saveGlb.disabled = disabled;
}

// --- Common Helper Functions (adapted or to be adapted) ---
// Removed getMaxIdForDict - it's now part of ui-common-utils.js and used by individual handlers if needed

// Removed triggerDownload - it's now in ui-common-utils.js

// --- Single Marker Logic ---
// All functions moved to single-marker-handler.js

// --- Marker Array Logic ---
// All functions moved to array-marker-handler.js

// --- ChArUco Board Logic ---
// All functions moved to charuco-board-handler.js


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
            colorGroup = getColoredElementsFromSingle(targetMaterial); // Corrected: No mainObjectGroup passed
            break;
        case 'array':
            colorGroup = getColoredElementsFromArray(targetMaterial); // Corrected
            break;
        case 'charuco':
            colorGroup = getColoredElementsFromCharuco(targetMaterial); // Corrected
            break;
        default:
            console.error("ExportSTLColor: Unknown mode - ", currentMode);
            const fallbackGroup = new THREE.Group();
            mainObjectGroup.traverse((object) => {
                if (object.isMesh && object.material === targetMaterial) {
                    const newMesh = new THREE.Mesh(object.geometry.clone(), object.material);
                    newMesh.geometry.applyMatrix4(object.matrixWorld);
                    fallbackGroup.add(newMesh);
                }
            });
            colorGroup = fallbackGroup;
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

    uiElements.panels.single = document.getElementById('panel-single');
    uiElements.panels.array = document.getElementById('panel-array');
    uiElements.panels.charuco = document.getElementById('panel-charuco');

    uiElements.buttons.mode_single = document.getElementById('btn-mode-single');
    uiElements.buttons.mode_array = document.getElementById('btn-mode-array');
    uiElements.buttons.mode_charuco = document.getElementById('btn-mode-charuco');

    uiElements.infoDisplay = document.querySelector('.info-display');
    uiElements.buttons.saveWhiteStl = document.getElementById('save-white-stl-button');
    uiElements.buttons.saveBlackStl = document.getElementById('save-black-stl-button');
    uiElements.buttons.saveGlb = document.getElementById('save-glb-button');

    // --- Populate UI Element References for Each Mode ---
    uiElements.selects.single.dict = document.getElementById('frm-single-dict');
    uiElements.inputs.single.id = document.getElementById('frm-single-id');
    uiElements.inputs.single.dim = document.getElementById('frm-single-dim');
    uiElements.inputs.single.z1 = document.getElementById('frm-single-z1');
    uiElements.inputs.single.z2 = document.getElementById('frm-single-z2');
    uiElements.inputs.single.borderWidth = document.getElementById('frm-single-border-width');
    uiElements.radios.single.extrusion = document.querySelectorAll('input[name="single_extrusion"]');
    uiElements.radios.single.borderCornerType = document.querySelectorAll('input[name="single_borderCornerType"]');

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

    if (uiElements.buttons.mode_single) uiElements.buttons.mode_single.addEventListener('click', () => switchMode('single'));
    if (uiElements.buttons.mode_array) uiElements.buttons.mode_array.addEventListener('click', () => switchMode('array'));
    if (uiElements.buttons.mode_charuco) uiElements.buttons.mode_charuco.addEventListener('click', () => switchMode('charuco'));

    if (uiElements.buttons.saveWhiteStl) uiElements.buttons.saveWhiteStl.addEventListener('click', () => exportSTLColor('white'));
    if (uiElements.buttons.saveBlackStl) uiElements.buttons.saveBlackStl.addEventListener('click', () => exportSTLColor('black'));
    if (uiElements.buttons.saveGlb) uiElements.buttons.saveGlb.addEventListener('click', exportGLB);

    loadDictPromise.then((dictionaryData) => {
        console.log("Dictionary loaded. Initializing mode-specific UI handlers.");

        initSingleMarkerUI(uiElements, dictionaryData, mainObjectGroup, onUpdateCallbacks);
        initArrayMarkerUI(uiElements, dictionaryData, mainObjectGroup, onUpdateCallbacks);
        initCharucoUI(uiElements, dictionaryData, mainObjectGroup, onUpdateCallbacks);

        triggerCurrentModeUpdate();

    }).catch(err => {
        console.error("Error during initControls after dictionary promise:", err);
        if (uiElements.infoDisplay) uiElements.infoDisplay.innerHTML = 'Fatal Error: Could not initialize controls after dictionary load.';
        setAllSaveButtonsDisabled(true);
    });
} 