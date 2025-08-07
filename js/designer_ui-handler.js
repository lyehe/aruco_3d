import { scene } from './three-setup.js';
import { setDict as setArucoUtilDict, getArucoBitPattern, isSpecialMarker } from './aruco-utils.js';
import { blackMaterial, whiteMaterial } from './config.js';
import { triggerDownload } from './ui-common-utils.js';
import { disposeGroup } from './geometry-utils.js';
import { initSingleMarkerUI, updateSingleMarker, getSingleMarkerBaseFilename, getColoredElementsFromSingle, getSingleMarkerMetadataExport } from './single-marker-handler.js';
import { initArrayMarkerUI, updateMarkerArray, prefillArrayIds as prefillArrayIds_array, getArrayBaseFilename, getColoredElementsFromArray, getArrayMetadataExport, getArrayParameters, getDictionaryInfo as getArrayDictionaryInfo } from './array-marker-handler.js';
import { initCharucoUI, updateCharucoBoard, prefillCharucoIds as prefillCharucoIds_charuco, getCharucoBaseFilename, getColoredElementsFromCharuco, getCharucoMetadataExport, getCharucoParameters, getDictionaryInfo as getCharucoDictionaryInfo } from './charuco-board-handler.js';
import { initQrCodeUI, updateQrCode, getQrCodeBaseFilename, getColoredElementsFromQr, getQrCodeMetadataExport, generateQrCodePNG, generateQrCodeSVG } from './qr-code-handler.js';

let dict;
let currentMode = 'single';
let mainObjectGroup = new THREE.Group();

// UI elements storage
const uiElements = {
    panels: {},
    buttons: {},
    inputs: { single: {}, array: {}, charuco: {}, qr: {} },
    selects: { single: {}, array: {}, charuco: {}, qr: {} },
    textareas: { single: {}, array: {}, charuco: {}, qr: {} },
    radios: { single: {}, array: {}, charuco: {}, qr: {} },
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
        case 'qr':
            updateQrCode();
            break;
    }
}

function setAllSaveButtonsDisabled(disabled) {
    const buttons = ['saveWhiteStl', 'saveBlackStl', 'saveGlb', 'savePng', 'saveSvg', 'exportMetadata'];
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
        case 'qr':
            return getQrCodeBaseFilename();
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
        case 'qr':
            colorGroup = getColoredElementsFromQr(targetMaterial);
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

// Helper function to calculate 600 DPI canvas size for given physical dimensions in mm
function calculateCanvasSize(widthMm, heightMm) {
    // 600 DPI = 600 dots per inch = 600/25.4 dots per mm ≈ 23.62 dots per mm
    const dotsPerMm = 600 / 25.4;
    return {
        width: Math.round(widthMm * dotsPerMm),
        height: Math.round(heightMm * dotsPerMm)
    };
}

// Helper function to create a high-resolution canvas with proper scaling
function createHighResCanvas(widthMm, heightMm) {
    const { width, height } = calculateCanvasSize(widthMm, heightMm);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Set up high-quality rendering
    ctx.imageSmoothingEnabled = false; // For sharp pixel-perfect rendering
    ctx.fillStyle = '#ffffff'; // Default white background
    ctx.fillRect(0, 0, width, height);
    
    return { canvas, ctx, dotsPerMm: 600 / 25.4 };
}

// PNG generation functions for marker types
function generateSingleMarkerPNG() {
    // Get current single marker parameters
    const dictName = document.getElementById('frm-single-dict')?.value;
    const markerId = parseInt(document.getElementById('frm-single-id')?.value) || 0;
    const dimension = parseFloat(document.getElementById('frm-single-dim')?.value) || 50;
    const borderWidth = parseFloat(document.getElementById('frm-single-border-width')?.value) || 0;
    
    if (!dict || !dict[dictName]) {
        throw new Error('Dictionary not loaded or invalid');
    }
    
    // Calculate total dimensions including border
    const totalDimension = dimension + (2 * borderWidth);
    
    // Create high-resolution canvas at 600 DPI
    const dotsPerMm = 600 / 25.4;
    const canvasSize = Math.round(totalDimension * dotsPerMm);
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');
    
    // Set up high-quality rendering
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    
    // Handle special markers
    if (markerId === -1 || markerId === -2) {
        // Pure white (-1) or pure black (-2) marker
        ctx.fillStyle = markerId === -1 ? '#ffffff' : '#000000';
        const markerSizePixels = Math.round(dimension * dotsPerMm);
        const offsetPixels = Math.round(borderWidth * dotsPerMm);
        ctx.fillRect(offsetPixels, offsetPixels, markerSizePixels, markerSizePixels);
        return canvas;
    }
    
    // Get marker pattern
    const dictInfo = dict[dictName];
    const patternData = dictInfo[markerId];
    if (!patternData) {
        throw new Error(`Marker ID ${markerId} not found in dictionary ${dictName}`);
    }
    
    // Determine pattern dimensions
    const patternWidth = dictName === 'aruco' ? 5 : parseInt(dictName.split('x')[0]);
    const patternHeight = patternWidth;
    
    // Generate bit pattern (similar to aruco-utils.js logic)
    const bits = [];
    const bitsCount = patternWidth * patternHeight;
    
    for (let byteVal of patternData) {
        let start = bitsCount - bits.length;
        for (let i = Math.min(7, start - 1); i >= 0; i--) {
            bits.push((byteVal >> i) & 1);
        }
    }
    
    // Check if this is an AprilTag dictionary and rotate 180 degrees if needed
    const isAprilTag = dictName.startsWith('april_');
    
    if (isAprilTag) {
        // Create a 2D array from the bits
        const pattern2D = [];
        for (let r = 0; r < patternHeight; r++) {
            const row = [];
            for (let c = 0; c < patternWidth; c++) {
                row.push(bits[r * patternWidth + c]);
            }
            pattern2D.push(row);
        }
        
        // Rotate 180 degrees (reverse both rows and columns)
        const rotatedPattern2D = [];
        for (let r = patternHeight - 1; r >= 0; r--) {
            const row = [];
            for (let c = patternWidth - 1; c >= 0; c--) {
                row.push(pattern2D[r][c]);
            }
            rotatedPattern2D.push(row);
        }
        
        // Convert back to 1D array
        bits.length = 0; // Clear the array
        for (let r = 0; r < patternHeight; r++) {
            for (let c = 0; c < patternWidth; c++) {
                bits.push(rotatedPattern2D[r][c]);
            }
        }
    }
    
    // Add border to pattern (black border around the pattern)
    const fullPatternWidth = patternWidth + 2;
    const fullPatternHeight = patternHeight + 2;
    const fullPattern = [];
    
    for (let r = 0; r < fullPatternHeight; r++) {
        const row = [];
        for (let c = 0; c < fullPatternWidth; c++) {
            if (r === 0 || r === fullPatternHeight - 1 || c === 0 || c === fullPatternWidth - 1) {
                row.push(0); // Black border
            } else {
                row.push(bits[(r - 1) * patternWidth + (c - 1)]);
            }
        }
        fullPattern.push(row);
    }
    
    // Draw the marker pattern
    const markerSizePixels = Math.round(dimension * dotsPerMm);
    const borderSizePixels = Math.round(borderWidth * dotsPerMm);
    const moduleSize = markerSizePixels / fullPatternWidth;
    
    for (let row = 0; row < fullPatternHeight; row++) {
        for (let col = 0; col < fullPatternWidth; col++) {
            const bit = fullPattern[row][col];
            ctx.fillStyle = bit === 0 ? '#000000' : '#ffffff';
            const x = borderSizePixels + (col * moduleSize);
            const y = borderSizePixels + (row * moduleSize);
            ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(moduleSize), Math.ceil(moduleSize));
        }
    }
    
    return canvas;
}

function generateArrayMarkerPNG() {
    // For now, throw a helpful error message
    throw new Error("Array marker PNG export will be implemented in a future update. Use individual marker export for now.");
}

function generateCharucoPNG() {
    // For now, throw a helpful error message  
    throw new Error("ChArUco PNG export will be implemented in a future update. Use STL export for now.");
}

function exportPNG() {
    if (!mainObjectGroup || mainObjectGroup.children.length === 0) {
        alert("No model generated to export PNG.");
        return;
    }

    const baseFilename = getCurrentModeBaseFilename();
    
    // Helper function to handle canvas download
    function downloadCanvas(canvas) {
        if (canvas) {
            canvas.toBlob((blob) => {
                if (blob) {
                    triggerDownload(blob, `${baseFilename}_600dpi.png`);
                } else {
                    alert("Failed to generate PNG file.");
                }
            }, 'image/png', 1.0);
        }
    }

    try {
        switch (currentMode) {
            case 'single':
                downloadCanvas(generateSingleMarkerPNG());
                break;
            case 'array':
                downloadCanvas(generateArrayMarkerPNG());
                break;
            case 'charuco':
                downloadCanvas(generateCharucoPNG());
                break;
            case 'qr':
                // QR generation is async
                generateQrCodePNG()
                    .then(downloadCanvas)
                    .catch(error => {
                        console.error("Error generating QR PNG:", error);
                        alert("Error generating QR PNG: " + error.message);
                    });
                break;
            default:
                throw new Error(`PNG export not implemented for mode: ${currentMode}`);
        }

    } catch (error) {
        console.error("Error exporting PNG:", error);
        alert("Error generating PNG export: " + error.message);
    }
}

// SVG generation functions for marker types
function generateSingleMarkerSVG() {
    // Get current single marker parameters
    const dictName = document.getElementById('frm-single-dict')?.value;
    const markerId = parseInt(document.getElementById('frm-single-id')?.value) || 0;
    const dimension = parseFloat(document.getElementById('frm-single-dim')?.value) || 50;
    const borderWidth = parseFloat(document.getElementById('frm-single-border-width')?.value) || 0;
    
    if (!dict || !dict[dictName]) {
        throw new Error('Dictionary not loaded or invalid');
    }
    
    // Calculate total dimensions including border
    const totalDimension = dimension + (2 * borderWidth);
    
    // Handle special markers
    if (markerId === -1 || markerId === -2) {
        // Pure white (-1) or pure black (-2) marker
        const markerColor = markerId === -1 ? '#ffffff' : '#000000';
        const borderColor = '#ffffff';
        
        let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDimension} ${totalDimension}" width="${totalDimension}mm" height="${totalDimension}mm">
  <desc>ArUco Marker - Special ${markerId === -1 ? 'White' : 'Black'} Marker</desc>`;
        
        // Add border if specified
        if (borderWidth > 0) {
            svgContent += `
  <rect x="0" y="0" width="${totalDimension}" height="${totalDimension}" fill="${borderColor}" stroke="none"/>`;
        }
        
        // Add marker rectangle
        svgContent += `
  <rect x="${borderWidth}" y="${borderWidth}" width="${dimension}" height="${dimension}" fill="${markerColor}" stroke="none"/>
</svg>`;
        
        return svgContent;
    }
    
    // Get marker pattern
    const dictInfo = dict[dictName];
    const patternData = dictInfo[markerId];
    if (!patternData) {
        throw new Error(`Marker ID ${markerId} not found in dictionary ${dictName}`);
    }
    
    // Determine pattern dimensions
    const patternWidth = dictName === 'aruco' ? 5 : parseInt(dictName.split('x')[0]);
    const patternHeight = patternWidth;
    
    // Generate bit pattern (similar to aruco-utils.js logic)
    const bits = [];
    const bitsCount = patternWidth * patternHeight;
    
    for (let byteVal of patternData) {
        let start = bitsCount - bits.length;
        for (let i = Math.min(7, start - 1); i >= 0; i--) {
            bits.push((byteVal >> i) & 1);
        }
    }
    
    // Check if this is an AprilTag dictionary and rotate 180 degrees if needed
    const isAprilTag = dictName.startsWith('april_');
    
    if (isAprilTag) {
        // Create a 2D array from the bits
        const pattern2D = [];
        for (let r = 0; r < patternHeight; r++) {
            const row = [];
            for (let c = 0; c < patternWidth; c++) {
                row.push(bits[r * patternWidth + c]);
            }
            pattern2D.push(row);
        }
        
        // Rotate 180 degrees (reverse both rows and columns)
        const rotatedPattern2D = [];
        for (let r = patternHeight - 1; r >= 0; r--) {
            const row = [];
            for (let c = patternWidth - 1; c >= 0; c--) {
                row.push(pattern2D[r][c]);
            }
            rotatedPattern2D.push(row);
        }
        
        // Convert back to 1D array
        bits.length = 0; // Clear the array
        for (let r = 0; r < patternHeight; r++) {
            for (let c = 0; c < patternWidth; c++) {
                bits.push(rotatedPattern2D[r][c]);
            }
        }
    }
    
    // Add border to pattern (black border around the pattern)
    const fullPatternWidth = patternWidth + 2;
    const fullPatternHeight = patternHeight + 2;
    const fullPattern = [];
    
    for (let r = 0; r < fullPatternHeight; r++) {
        const row = [];
        for (let c = 0; c < fullPatternWidth; c++) {
            if (r === 0 || r === fullPatternHeight - 1 || c === 0 || c === fullPatternWidth - 1) {
                row.push(0); // Black border
            } else {
                row.push(bits[(r - 1) * patternWidth + (c - 1)]);
            }
        }
        fullPattern.push(row);
    }
    
    // Generate SVG
    const moduleSize = dimension / fullPatternWidth;
    
    let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDimension} ${totalDimension}" width="${totalDimension}mm" height="${totalDimension}mm">
  <desc>ArUco Marker - Dictionary: ${dictName}, ID: ${markerId}</desc>`;
    
    // Add white background
    svgContent += `
  <rect x="0" y="0" width="${totalDimension}" height="${totalDimension}" fill="#ffffff" stroke="none"/>`;
    
    // Draw the marker pattern using a single path to avoid hairlines
    let pathData = '';
    for (let row = 0; row < fullPatternHeight; row++) {
        for (let col = 0; col < fullPatternWidth; col++) {
            const bit = fullPattern[row][col];
            if (bit === 0) { // Black module
                const x = borderWidth + (col * moduleSize);
                const y = borderWidth + (row * moduleSize);
                pathData += `M${x.toFixed(3)},${y.toFixed(3)} h${moduleSize.toFixed(3)} v${moduleSize.toFixed(3)} h-${moduleSize.toFixed(3)} z `;
            }
        }
    }
    
    if (pathData) {
        svgContent += `
  <path d="${pathData}" fill="#000000" fill-rule="evenodd"/>`;
    }
    
    svgContent += `
</svg>`;
    
    return svgContent;
}

// QR SVG generation is handled by the imported generateQrCodeSVG function

function generateArrayMarkerSVG() {
    const arrayParams = getArrayParameters();
    const dictInfo = getArrayDictionaryInfo();
    
    if (!dict || !dict[dictInfo.name]) {
        throw new Error('Dictionary not loaded or invalid');
    }
    
    // Parse marker IDs
    const markerIds = arrayParams.markerIdsRaw.map(s => parseInt(s.trim()));
    
    // Calculate total dimensions
    const markerSize = arrayParams.dim;
    const gap = arrayParams.gap;
    const totalWidth = (arrayParams.gridX * markerSize) + ((arrayParams.gridX - 1) * gap);
    const totalHeight = (arrayParams.gridY * markerSize) + ((arrayParams.gridY - 1) * gap);
    
    // Add border space if needed
    const borderSpace = arrayParams.gapFillType === 'border' ? arrayParams.individualBorderWidth * 2 : 0;
    const svgWidth = totalWidth + borderSpace;
    const svgHeight = totalHeight + borderSpace;
    
    let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}mm" height="${svgHeight}mm">
  <desc>ArUco Array - Dictionary: ${dictInfo.name}, Grid: ${arrayParams.gridX}x${arrayParams.gridY}</desc>`;
    
    // Add white background
    svgContent += `
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="#ffffff" stroke="none"/>`;
    
    // Collect all black modules in a single path to avoid hairlines
    let pathData = '';
    
    // Generate each marker in the array
    for (let row = 0; row < arrayParams.gridY; row++) {
        for (let col = 0; col < arrayParams.gridX; col++) {
            const markerIndex = row * arrayParams.gridX + col;
            if (markerIndex >= markerIds.length) continue;
            
            const markerId = markerIds[markerIndex];
            const markerX = (borderSpace / 2) + col * (markerSize + gap);
            const markerY = (borderSpace / 2) + row * (markerSize + gap);
            
            // Handle special markers
            if (isSpecialMarker(markerId)) {
                if (markerId === -2) { // Black marker
                    pathData += `M${markerX},${markerY} h${markerSize} v${markerSize} h-${markerSize} z `;
                }
                // White markers are already handled by background
                continue;
            }
            
            // Get marker pattern
            const fullPattern = getArucoBitPattern(dictInfo.name, markerId, dictInfo.patternWidth, dictInfo.patternHeight);
            if (!fullPattern || fullPattern.length === 0) {
                console.warn(`Skipping marker ${markerId}: pattern not found`);
                continue;
            }
            
            const patternHeight = fullPattern.length;
            const patternWidth = fullPattern[0].length;
            const moduleSize = markerSize / patternWidth;
            
            // Add marker pattern to path
            for (let patternRow = 0; patternRow < patternHeight; patternRow++) {
                for (let patternCol = 0; patternCol < patternWidth; patternCol++) {
                    const bit = fullPattern[patternRow][patternCol];
                    if (bit === 0) { // Black module
                        const x = markerX + (patternCol * moduleSize);
                        const y = markerY + (patternRow * moduleSize);
                        pathData += `M${x.toFixed(3)},${y.toFixed(3)} h${moduleSize.toFixed(3)} v${moduleSize.toFixed(3)} h-${moduleSize.toFixed(3)} z `;
                    }
                }
            }
        }
    }
    
    // Add all black modules as a single path
    if (pathData) {
        svgContent += `
  <path d="${pathData}" fill="#000000" fill-rule="evenodd"/>`;
    }
    
    // Add gap fill if needed
    if (arrayParams.gapFillType === 'fill') {
        // Fill gaps between markers with white (already done by background)
        // Add black outlines around each marker if needed
        for (let row = 0; row < arrayParams.gridY; row++) {
            for (let col = 0; col < arrayParams.gridX; col++) {
                const markerX = col * (markerSize + gap);
                const markerY = row * (markerSize + gap);
                svgContent += `
  <rect x="${markerX}" y="${markerY}" width="${markerSize}" height="${markerSize}" fill="none" stroke="#000000" stroke-width="0.1"/>`;
            }
        }
    }
    
    svgContent += `
</svg>`;
    
    return svgContent;
}

function generateCharucoSVG() {
    const charucoParams = getCharucoParameters();
    const dictInfo = getCharucoDictionaryInfo();
    
    if (!dict || !dict[dictInfo.name]) {
        throw new Error('Dictionary not loaded or invalid');
    }
    
    // Parse marker IDs
    const markerIds = charucoParams.markerIdsRaw.map(s => parseInt(s.trim()));
    
    // Calculate dimensions
    const squareSize = charucoParams.squareSize;
    const markerMargin = charucoParams.markerMargin;
    const totalWidth = charucoParams.squaresX * squareSize;
    const totalHeight = charucoParams.squaresY * squareSize;
    
    let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}mm" height="${totalHeight}mm">
  <desc>ChArUco Board - Dictionary: ${dictInfo.name}, Squares: ${charucoParams.squaresX}x${charucoParams.squaresY}</desc>`;
    
    // Add white background
    svgContent += `
  <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#ffffff" stroke="none"/>`;
    
    // Collect all black elements in a single path to avoid hairlines
    let pathData = '';
    let markerIndex = 0;
    
    // Generate checkerboard pattern with embedded markers
    for (let row = 0; row < charucoParams.squaresY; row++) {
        for (let col = 0; col < charucoParams.squaresX; col++) {
            const x = col * squareSize;
            const y = row * squareSize;
            
            // Determine square color (checkerboard pattern, starting with black in top-left)
            const isBlack = (row + col) % 2 === 0;
            
            if (isBlack) {
                // Add black square to path
                pathData += `M${x},${y} h${squareSize} v${squareSize} h-${squareSize} z `;
            } else {
                // White square - add ArUco marker if we have one
                if (markerIndex < markerIds.length) {
                    const markerId = markerIds[markerIndex];
                    markerIndex++;
                    
                    // Calculate marker dimensions within the white square
                    const markerSize = squareSize - (2 * markerMargin);
                    const markerX = x + markerMargin;
                    const markerY = y + markerMargin;
                    
                    if (markerSize > 0) {
                        // Handle special markers
                        if (isSpecialMarker(markerId)) {
                            if (markerId === -2) { // Black marker
                                pathData += `M${markerX},${markerY} h${markerSize} v${markerSize} h-${markerSize} z `;
                            }
                            // White markers are already handled by background
                        } else {
                            // Get marker pattern
                            const fullPattern = getArucoBitPattern(dictInfo.name, markerId, dictInfo.patternWidth, dictInfo.patternHeight);
                            if (fullPattern && fullPattern.length > 0) {
                                const patternHeight = fullPattern.length;
                                const patternWidth = fullPattern[0].length;
                                const moduleSize = markerSize / patternWidth;
                                
                                // Add marker pattern to path
                                for (let patternRow = 0; patternRow < patternHeight; patternRow++) {
                                    for (let patternCol = 0; patternCol < patternWidth; patternCol++) {
                                        const bit = fullPattern[patternRow][patternCol];
                                        if (bit === 0) { // Black module
                                            const moduleX = markerX + (patternCol * moduleSize);
                                            const moduleY = markerY + (patternRow * moduleSize);
                                            pathData += `M${moduleX.toFixed(3)},${moduleY.toFixed(3)} h${moduleSize.toFixed(3)} v${moduleSize.toFixed(3)} h-${moduleSize.toFixed(3)} z `;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Add all black elements as a single path
    if (pathData) {
        svgContent += `
  <path d="${pathData}" fill="#000000" fill-rule="evenodd"/>`;
    }
    
    svgContent += `
</svg>`;
    
    return svgContent;
}

function exportSVG() {
    if (!mainObjectGroup || mainObjectGroup.children.length === 0) {
        alert("No model generated to export SVG.");
        return;
    }

    const baseFilename = getCurrentModeBaseFilename();
    
    // Helper function to handle SVG download
    function downloadSVG(svgContent) {
        if (svgContent) {
            const blob = new Blob([svgContent], { type: 'image/svg+xml' });
            triggerDownload(blob, `${baseFilename}.svg`);
        }
    }

    try {
        switch (currentMode) {
            case 'single':
                downloadSVG(generateSingleMarkerSVG());
                break;
            case 'array':
                downloadSVG(generateArrayMarkerSVG());
                break;
            case 'charuco':
                downloadSVG(generateCharucoSVG());
                break;
            case 'qr':
                // QR generation is async
                generateQrCodeSVG()
                    .then(downloadSVG)
                    .catch(error => {
                        console.error("Error generating QR SVG:", error);
                        alert("Error generating QR SVG: " + error.message);
                    });
                break;
            default:
                throw new Error(`SVG export not implemented for mode: ${currentMode}`);
        }

    } catch (error) {
        console.error("Error exporting SVG:", error);
        alert("Error generating SVG export: " + error.message);
    }
}

function exportConfig() {
    try {
        const config = getCurrentConfiguration();
        const yamlString = jsyaml.dump(config, {
            indent: 2,
            lineWidth: 120,
            noRefs: true
        });
        
        const blob = new Blob([yamlString], { type: 'text/yaml' });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filename = `aruco-config-${currentMode}-${timestamp}.yaml`;
        triggerDownload(blob, filename);
        
    } catch (error) {
        console.error("Error exporting configuration:", error);
        alert("Error generating configuration export: " + error.message);
    }
}

// Compress configuration to a human-readable single line format
function compressConfig() {
    try {
        const config = getCurrentConfiguration();
        const settings = config.settings;
        
        // Create human-readable format based on mode
        let readable = `${config.mode}:`;
        
        switch (config.mode) {
            case 'single':
                readable += `dict=${settings.dictionary}`;
                readable += `,id=${settings.markerId}`;
                readable += `,size=${settings.dimension}`;
                readable += `,border=${settings.borderWidth}`;
                readable += `,base=${settings.baseHeight}`;
                readable += `,height=${settings.featureHeight}`;
                readable += `,ext=${settings.extrusionType}`;
                if (settings.borderCornerType !== 'same') {
                    readable += `,corner=${settings.borderCornerType}`;
                }
                break;
                
            case 'array':
                readable += `dict=${settings.dictionary}`;
                readable += `,grid=${settings.gridX}x${settings.gridY}`;
                readable += `,gap=${settings.gap}`;
                readable += `,size=${settings.dimension}`;
                readable += `,base=${settings.baseHeight}`;
                readable += `,height=${settings.featureHeight}`;
                readable += `,ext=${settings.extrusionType}`;
                readable += `,fill=${settings.gapFill}`;
                if (settings.cornerFill !== 'same') {
                    readable += `,corner=${settings.cornerFill}`;
                }
                if (settings.borderWidth > 0) {
                    readable += `,border=${settings.borderWidth}`;
                }
                // Encode IDs in a compact way
                const ids = settings.markerIds.split(',').map(id => id.trim());
                readable += `,ids=${ids.join('+')}`;
                break;
                
            case 'charuco':
                readable += `dict=${settings.dictionary}`;
                readable += `,board=${settings.squaresX}x${settings.squaresY}`;
                readable += `,square=${settings.squareSize}`;
                readable += `,margin=${settings.markerMargin}`;
                readable += `,base=${settings.baseHeight}`;
                readable += `,height=${settings.featureHeight}`;
                readable += `,ext=${settings.extrusionType}`;
                if (settings.markerIds) {
                    const ids = settings.markerIds.split(',').map(id => id.trim()).filter(id => id);
                    if (ids.length > 0) {
                        readable += `,ids=${ids.join('+')}`;
                    }
                }
                break;
                
            case 'qr':
                readable += `content=${encodeURIComponent(settings.content)}`;
                readable += `,error=${settings.errorCorrection}`;
                readable += `,size=${settings.dimension}`;
                readable += `,border=${settings.borderWidth}`;
                readable += `,base=${settings.baseHeight}`;
                readable += `,height=${settings.featureHeight}`;
                readable += `,ext=${settings.extrusionType}`;
                break;
        }
        
        return readable;
    } catch (error) {
        console.error("Error compressing configuration:", error);
        return null;
    }
}

// Decompress configuration from human-readable format
function decompressConfig(readableConfig) {
    try {
        // Parse the readable format
        const colonIndex = readableConfig.indexOf(':');
        if (colonIndex === -1) {
            throw new Error('Invalid format: missing mode separator ":"');
        }
        
        const mode = readableConfig.substring(0, colonIndex);
        const paramsString = readableConfig.substring(colonIndex + 1);
        
        // Parse parameters
        const params = {};
        const pairs = paramsString.split(',');
        
        for (const pair of pairs) {
            const equalIndex = pair.indexOf('=');
            if (equalIndex === -1) continue;
            
            const key = pair.substring(0, equalIndex).trim();
            const value = pair.substring(equalIndex + 1).trim();
            params[key] = value;
        }
        
        // Convert back to full settings format
        let settings = {};
        
        switch (mode) {
            case 'single':
                settings = {
                    dictionary: params.dict || '4x4_1000',
                    markerId: parseInt(params.id) || 0,
                    dimension: parseFloat(params.size) || 50,
                    borderWidth: parseFloat(params.border) || 5,
                    baseHeight: parseFloat(params.base) || 2,
                    featureHeight: parseFloat(params.height) || 1,
                    extrusionType: params.ext || 'positive',
                    borderCornerType: params.corner || 'same'
                };
                break;
                
            case 'array':
                const gridParts = (params.grid || '3x3').split('x');
                const ids = params.ids ? params.ids.split('+').join(',') : '0,1,2,3,4,5,6,7,8';
                settings = {
                    dictionary: params.dict || '4x4_1000',
                    gridX: parseInt(gridParts[0]) || 3,
                    gridY: parseInt(gridParts[1]) || 3,
                    gap: parseFloat(params.gap) || 5,
                    startId: parseInt(params.startId) || 0,
                    markerIds: ids,
                    dimension: parseFloat(params.size) || 50,
                    baseHeight: parseFloat(params.base) || 2,
                    featureHeight: parseFloat(params.height) || 1,
                    borderWidth: parseFloat(params.border) || 0,
                    extrusionType: params.ext || 'positive',
                    gapFill: params.fill || 'none',
                    cornerFill: params.corner || 'same'
                };
                break;
                
            case 'charuco':
                const boardParts = (params.board || '5x4').split('x');
                const charucoIds = params.ids ? params.ids.split('+').join(',') : '';
                settings = {
                    dictionary: params.dict || '4x4_1000',
                    squaresX: parseInt(boardParts[0]) || 5,
                    squaresY: parseInt(boardParts[1]) || 4,
                    squareSize: parseFloat(params.square) || 60,
                    markerMargin: parseFloat(params.margin) || 5,
                    markerIds: charucoIds,
                    startId: parseInt(params.startId) || 0,
                    baseHeight: parseFloat(params.base) || 2,
                    featureHeight: parseFloat(params.height) || 1,
                    extrusionType: params.ext || 'positive'
                };
                break;
                
            case 'qr':
                settings = {
                    content: decodeURIComponent(params.content) || 'https://example.com',
                    errorCorrection: params.error || 'M',
                    dimension: parseFloat(params.size) || 50,
                    borderWidth: parseFloat(params.border) || 5,
                    baseHeight: parseFloat(params.base) || 2,
                    featureHeight: parseFloat(params.height) || 1,
                    extrusionType: params.ext || 'positive'
                };
                break;
                
            default:
                throw new Error(`Unknown mode: ${mode}`);
        }
        
        // Return expanded format
        return {
            version: '1.0',
            mode: mode,
            generatedAt: new Date().toISOString(),
            settings: settings
        };
    } catch (error) {
        console.error("Error decompressing configuration:", error);
        return null;
    }
}

// Generate shareable URL with current configuration
function generateShareURL() {
    const compressed = compressConfig();
    if (!compressed) {
        alert("Error generating share URL");
        return;
    }
    
    const baseURL = window.location.href.split('?')[0];
    const shareURL = `${baseURL}?config=${compressed}`;
    
    // Copy to clipboard and show user
    navigator.clipboard.writeText(shareURL).then(() => {
        const shortUrl = shareURL.length > 100 ? shareURL.substring(0, 97) + '...' : shareURL;
        alert(`Share URL copied to clipboard!\n\n${shortUrl}`);
    }).catch(() => {
        // Fallback for browsers without clipboard API
        prompt("Copy this share URL:", shareURL);
    });
}

// Copy compressed config to clipboard
function copyCompressedConfig() {
    const compressed = compressConfig();
    if (!compressed) {
        alert("Error generating compressed config");
        return;
    }
    
    navigator.clipboard.writeText(compressed).then(() => {
        const shortConfig = compressed.length > 50 ? compressed.substring(0, 47) + '...' : compressed;
        alert(`Compressed config copied to clipboard!\n\n${shortConfig}\n\nPaste this into the "Import Compressed Config" field to restore settings.`);
    }).catch(() => {
        // Fallback for browsers without clipboard API
        prompt("Copy this compressed config:", compressed);
    });
}

// Import from compressed config string
function importCompressedConfig() {
    const compressedConfig = prompt("Paste compressed configuration string:");
    if (!compressedConfig || compressedConfig.trim() === '') {
        return;
    }
    
    try {
        const config = decompressConfig(compressedConfig.trim());
        if (!config) {
            throw new Error('Invalid compressed configuration format');
        }
        
        applyConfiguration(config);
        alert(`Configuration imported successfully!\nMode: ${config.mode}\nCompressed size: ${compressedConfig.length} characters`);
        
    } catch (error) {
        console.error("Error importing compressed configuration:", error);
        alert("Error importing compressed configuration: " + error.message);
    }
}

// Load configuration from URL parameter
function loadConfigFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const configParam = urlParams.get('config');
    
    if (configParam) {
        try {
            const config = decompressConfig(configParam);
            if (config) {
                // Apply after a short delay to ensure UI is initialized
                setTimeout(() => {
                    applyConfiguration(config);
                }, 500);
            }
        } catch (error) {
            console.error("Error loading configuration from URL:", error);
            alert("Invalid configuration in URL parameter");
        }
    }
}

function importConfig() {
    // Trigger file input click
    if (uiElements.inputs.configFile) {
        uiElements.inputs.configFile.click();
    }
}

function handleConfigFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const yamlContent = e.target.result;
            const config = jsyaml.load(yamlContent);
            
            if (!config || typeof config !== 'object') {
                throw new Error('Invalid configuration file format');
            }
            
            applyConfiguration(config);
            alert(`Configuration imported successfully!\nMode: ${config.mode || 'unknown'}\nGenerated: ${config.generatedAt || 'unknown'}`);
            
        } catch (error) {
            console.error("Error importing configuration:", error);
            alert("Error importing configuration: " + error.message);
        }
        
        // Reset file input
        event.target.value = '';
    };
    
    reader.readAsText(file);
}

function getCurrentConfiguration() {
    const config = {
        version: '1.0',
        mode: currentMode,
        generatedAt: new Date().toISOString(),
        settings: {}
    };
    
    switch (currentMode) {
        case 'single':
            config.settings = {
                dictionary: uiElements.selects.single.dict?.value || '4x4_1000',
                markerId: parseInt(uiElements.inputs.single.id?.value) || 0,
                dimension: parseFloat(uiElements.inputs.single.dim?.value) || 50,
                baseHeight: parseFloat(uiElements.inputs.single.z1?.value) || 2,
                featureHeight: parseFloat(uiElements.inputs.single.z2?.value) || 1,
                borderWidth: parseFloat(uiElements.inputs.single.borderWidth?.value) || 5,
                extrusionType: Array.from(uiElements.radios.single.extrusion).find(r => r.checked)?.value || 'positive',
                borderCornerType: Array.from(uiElements.radios.single.borderCornerType).find(r => r.checked)?.value || 'same'
            };
            break;
            
        case 'array':
            config.settings = {
                dictionary: uiElements.selects.array.dict?.value || '4x4_1000',
                gridX: parseInt(uiElements.inputs.array.gridX?.value) || 3,
                gridY: parseInt(uiElements.inputs.array.gridY?.value) || 3,
                gap: parseFloat(uiElements.inputs.array.gap?.value) || 5,
                startId: parseInt(uiElements.inputs.array.startId?.value) || 0,
                markerIds: uiElements.textareas.array.ids?.value || '0,1,2,3,4,5,6,7,8',
                dimension: parseFloat(uiElements.inputs.array.dim?.value) || 50,
                baseHeight: parseFloat(uiElements.inputs.array.z1?.value) || 2,
                featureHeight: parseFloat(uiElements.inputs.array.z2?.value) || 1,
                borderWidth: parseFloat(uiElements.inputs.array.borderWidth?.value) || 0,
                extrusionType: Array.from(uiElements.radios.array.extrusion).find(r => r.checked)?.value || 'positive',
                gapFill: Array.from(uiElements.radios.array.gapFill).find(r => r.checked)?.value || 'none',
                cornerFill: Array.from(uiElements.radios.array.cornerFill).find(r => r.checked)?.value || 'same'
            };
            break;
            
        case 'charuco':
            config.settings = {
                dictionary: uiElements.selects.charuco.dict?.value || '4x4_1000',
                squaresX: parseInt(uiElements.inputs.charuco.squaresX?.value) || 5,
                squaresY: parseInt(uiElements.inputs.charuco.squaresY?.value) || 4,
                squareSize: parseFloat(uiElements.inputs.charuco.squareSize?.value) || 60,
                markerMargin: parseFloat(uiElements.inputs.charuco.markerMargin?.value) || 5,
                markerIds: uiElements.textareas.charuco.ids?.value || '',
                startId: parseInt(uiElements.inputs.charuco.startId?.value) || 0,
                baseHeight: parseFloat(uiElements.inputs.charuco.z1?.value) || 2,
                featureHeight: parseFloat(uiElements.inputs.charuco.z2?.value) || 1,
                extrusionType: Array.from(uiElements.radios.charuco.extrusion).find(r => r.checked)?.value || 'positive'
            };
            break;
            
        case 'qr':
            config.settings = {
                content: uiElements.textareas.qr.content?.value || 'https://example.com',
                errorCorrection: uiElements.selects.qr.errorCorrection?.value || 'M',
                dimension: parseFloat(uiElements.inputs.qr.dim?.value) || 50,
                borderWidth: parseFloat(uiElements.inputs.qr.borderWidth?.value) || 5,
                baseHeight: parseFloat(uiElements.inputs.qr.z1?.value) || 2,
                featureHeight: parseFloat(uiElements.inputs.qr.z2?.value) || 1,
                extrusionType: Array.from(uiElements.radios.qr.extrusion).find(r => r.checked)?.value || 'positive'
            };
            break;
    }
    
    return config;
}

function applyConfiguration(config) {
    if (!config.mode || !config.settings) {
        throw new Error('Invalid configuration: missing mode or settings');
    }
    
    // Switch to the correct mode first
    if (config.mode !== currentMode) {
        switchMode(config.mode);
        // Wait a moment for mode switch to complete
        setTimeout(() => applySettingsToUI(config), 100);
    } else {
        applySettingsToUI(config);
    }
}

function applySettingsToUI(config) {
    const settings = config.settings;
    
    try {
        switch (config.mode) {
            case 'single':
                if (uiElements.selects.single.dict) uiElements.selects.single.dict.value = settings.dictionary || '4x4_1000';
                if (uiElements.inputs.single.id) uiElements.inputs.single.id.value = settings.markerId || 0;
                if (uiElements.inputs.single.dim) uiElements.inputs.single.dim.value = settings.dimension || 50;
                if (uiElements.inputs.single.z1) uiElements.inputs.single.z1.value = settings.baseHeight || 2;
                if (uiElements.inputs.single.z2) uiElements.inputs.single.z2.value = settings.featureHeight || 1;
                if (uiElements.inputs.single.borderWidth) uiElements.inputs.single.borderWidth.value = settings.borderWidth || 5;
                
                // Set radio buttons
                Array.from(uiElements.radios.single.extrusion).forEach(radio => {
                    radio.checked = radio.value === (settings.extrusionType || 'positive');
                });
                Array.from(uiElements.radios.single.borderCornerType).forEach(radio => {
                    radio.checked = radio.value === (settings.borderCornerType || 'same');
                });
                break;
                
            case 'array':
                if (uiElements.selects.array.dict) uiElements.selects.array.dict.value = settings.dictionary || '4x4_1000';
                if (uiElements.inputs.array.gridX) uiElements.inputs.array.gridX.value = settings.gridX || 3;
                if (uiElements.inputs.array.gridY) uiElements.inputs.array.gridY.value = settings.gridY || 3;
                if (uiElements.inputs.array.gap) uiElements.inputs.array.gap.value = settings.gap || 5;
                if (uiElements.inputs.array.startId) uiElements.inputs.array.startId.value = settings.startId || 0;
                if (uiElements.textareas.array.ids) uiElements.textareas.array.ids.value = settings.markerIds || '0,1,2,3,4,5,6,7,8';
                if (uiElements.inputs.array.dim) uiElements.inputs.array.dim.value = settings.dimension || 50;
                if (uiElements.inputs.array.z1) uiElements.inputs.array.z1.value = settings.baseHeight || 2;
                if (uiElements.inputs.array.z2) uiElements.inputs.array.z2.value = settings.featureHeight || 1;
                if (uiElements.inputs.array.borderWidth) uiElements.inputs.array.borderWidth.value = settings.borderWidth || 0;
                
                // Set radio buttons
                Array.from(uiElements.radios.array.extrusion).forEach(radio => {
                    radio.checked = radio.value === (settings.extrusionType || 'positive');
                });
                Array.from(uiElements.radios.array.gapFill).forEach(radio => {
                    radio.checked = radio.value === (settings.gapFill || 'none');
                });
                Array.from(uiElements.radios.array.cornerFill).forEach(radio => {
                    radio.checked = radio.value === (settings.cornerFill || 'same');
                });
                break;
                
            case 'charuco':
                if (uiElements.selects.charuco.dict) uiElements.selects.charuco.dict.value = settings.dictionary || '4x4_1000';
                if (uiElements.inputs.charuco.squaresX) uiElements.inputs.charuco.squaresX.value = settings.squaresX || 5;
                if (uiElements.inputs.charuco.squaresY) uiElements.inputs.charuco.squaresY.value = settings.squaresY || 4;
                if (uiElements.inputs.charuco.squareSize) uiElements.inputs.charuco.squareSize.value = settings.squareSize || 60;
                if (uiElements.inputs.charuco.markerMargin) uiElements.inputs.charuco.markerMargin.value = settings.markerMargin || 5;
                if (uiElements.textareas.charuco.ids) uiElements.textareas.charuco.ids.value = settings.markerIds || '';
                if (uiElements.inputs.charuco.startId) uiElements.inputs.charuco.startId.value = settings.startId || 0;
                if (uiElements.inputs.charuco.z1) uiElements.inputs.charuco.z1.value = settings.baseHeight || 2;
                if (uiElements.inputs.charuco.z2) uiElements.inputs.charuco.z2.value = settings.featureHeight || 1;
                
                // Set radio buttons
                Array.from(uiElements.radios.charuco.extrusion).forEach(radio => {
                    radio.checked = radio.value === (settings.extrusionType || 'positive');
                });
                break;
                
            case 'qr':
                if (uiElements.textareas.qr.content) uiElements.textareas.qr.content.value = settings.content || 'https://example.com';
                if (uiElements.selects.qr.errorCorrection) uiElements.selects.qr.errorCorrection.value = settings.errorCorrection || 'M';
                if (uiElements.inputs.qr.dim) uiElements.inputs.qr.dim.value = settings.dimension || 50;
                if (uiElements.inputs.qr.borderWidth) uiElements.inputs.qr.borderWidth.value = settings.borderWidth || 5;
                if (uiElements.inputs.qr.z1) uiElements.inputs.qr.z1.value = settings.baseHeight || 2;
                if (uiElements.inputs.qr.z2) uiElements.inputs.qr.z2.value = settings.featureHeight || 1;
                
                // Set radio buttons
                Array.from(uiElements.radios.qr.extrusion).forEach(radio => {
                    radio.checked = radio.value === (settings.extrusionType || 'positive');
                });
                break;
        }
        
        // Trigger update to apply the new settings
        triggerCurrentModeUpdate();
        
    } catch (error) {
        console.error("Error applying settings to UI:", error);
        throw new Error('Failed to apply settings: ' + error.message);
    }
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
            case 'qr':
                metadata = getQrCodeMetadataExport();
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
    uiElements.panels.qr = document.getElementById('panel-qr');

    // Mode buttons
    uiElements.buttons.mode_single = document.getElementById('btn-mode-single');
    uiElements.buttons.mode_array = document.getElementById('btn-mode-array');
    uiElements.buttons.mode_charuco = document.getElementById('btn-mode-charuco');
    uiElements.buttons.mode_qr = document.getElementById('btn-mode-qr');

    // Common elements
    uiElements.infoDisplay = document.querySelector('.info-display');
    uiElements.buttons.saveWhiteStl = document.getElementById('save-white-stl-button');
    uiElements.buttons.saveBlackStl = document.getElementById('save-black-stl-button');
    uiElements.buttons.saveGlb = document.getElementById('save-glb-button');
    uiElements.buttons.savePng = document.getElementById('save-png-button');
    uiElements.buttons.saveSvg = document.getElementById('save-svg-button');
    uiElements.buttons.exportMetadata = document.getElementById('export-metadata-button');
    uiElements.buttons.exportConfig = document.getElementById('export-config-button');
    uiElements.buttons.importConfig = document.getElementById('import-config-button');
    uiElements.buttons.shareUrl = document.getElementById('share-url-button');
    uiElements.buttons.copyCompressed = document.getElementById('copy-compressed-button');
    uiElements.buttons.importCompressed = document.getElementById('import-compressed-button');
    uiElements.inputs.configFile = document.getElementById('config-file-input');

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

    // QR Code elements
    uiElements.textareas.qr.content = document.getElementById('frm-qr-content');
    uiElements.selects.qr.errorCorrection = document.getElementById('frm-qr-error-correction');
    uiElements.inputs.qr.dim = document.getElementById('frm-qr-dim');
    uiElements.inputs.qr.borderWidth = document.getElementById('frm-qr-border-width');
    uiElements.inputs.qr.z1 = document.getElementById('frm-qr-z1');
    uiElements.inputs.qr.z2 = document.getElementById('frm-qr-z2');
    uiElements.radios.qr.extrusion = document.querySelectorAll('input[name="qr_extrusion"]');
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
    if (uiElements.buttons.mode_qr) {
        uiElements.buttons.mode_qr.addEventListener('click', () => switchMode('qr'));
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
    if (uiElements.buttons.savePng) {
        uiElements.buttons.savePng.addEventListener('click', exportPNG);
    }
    if (uiElements.buttons.saveSvg) {
        uiElements.buttons.saveSvg.addEventListener('click', exportSVG);
    }
    if (uiElements.buttons.exportMetadata) {
        uiElements.buttons.exportMetadata.addEventListener('click', exportMetadata);
    }
    if (uiElements.buttons.exportConfig) {
        uiElements.buttons.exportConfig.addEventListener('click', exportConfig);
    }
    if (uiElements.buttons.importConfig) {
        uiElements.buttons.importConfig.addEventListener('click', importConfig);
    }
    if (uiElements.buttons.shareUrl) {
        uiElements.buttons.shareUrl.addEventListener('click', generateShareURL);
    }
    if (uiElements.buttons.copyCompressed) {
        uiElements.buttons.copyCompressed.addEventListener('click', copyCompressedConfig);
    }
    if (uiElements.buttons.importCompressed) {
        uiElements.buttons.importCompressed.addEventListener('click', importCompressedConfig);
    }
    if (uiElements.inputs.configFile) {
        uiElements.inputs.configFile.addEventListener('change', handleConfigFileImport);
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

        // Initialize mode handlers
        initSingleMarkerUI(uiElements, dictionaryData, mainObjectGroup, onUpdateCallbacks);
        initArrayMarkerUI(uiElements, dictionaryData, mainObjectGroup, onUpdateCallbacks);
        initCharucoUI(uiElements, dictionaryData, mainObjectGroup, onUpdateCallbacks);
        initQrCodeUI(uiElements, mainObjectGroup, onUpdateCallbacks);

        // Load configuration from URL if present
        loadConfigFromURL();

        // Trigger initial update (or will be triggered by URL config loading)
        if (!window.location.search.includes('config=')) {
            triggerCurrentModeUpdate();
        }

    }).catch(err => {
        console.error("Error during initControls after dictionary promise:", err);
        if (uiElements.infoDisplay) {
            uiElements.infoDisplay.innerHTML = 'Fatal Error: Could not initialize controls.';
        }
        setAllSaveButtonsDisabled(true);
    });
}