import { generateMarkerMesh, MIN_THICKNESS } from './aruco-utils.js';
import { validateDimensions, createBoxAt, mergeAndDisposeGeometries } from './geometry-utils.js';
import { blackMaterial, whiteMaterial } from './config.js';

let uiElements_qr;
let mainObjectGroup_qr;
let onUpdateCallbacks_qr;

export function initQrCodeUI(uiElements, mainGroup, onUpdate) {
    uiElements_qr = uiElements;
    mainObjectGroup_qr = mainGroup;
    onUpdateCallbacks_qr = onUpdate;

    // Add event listeners for QR code form elements
    const updateTriggers = [
        uiElements_qr.textareas.qr.content,
        uiElements_qr.selects.qr.errorCorrection,
        uiElements_qr.inputs.qr.dim,
        uiElements_qr.inputs.qr.borderWidth,
        uiElements_qr.inputs.qr.z1,
        uiElements_qr.inputs.qr.z2
    ];

    updateTriggers.forEach(element => {
        if (element) {
            element.addEventListener('change', updateQrCode);
            element.addEventListener('input', updateQrCode);
        }
    });

    // Add radio button listeners
    if (uiElements_qr.radios.qr.extrusion) {
        Array.from(uiElements_qr.radios.qr.extrusion).forEach(radio => {
            radio.addEventListener('change', updateQrCode);
        });
    }
}

export function updateQrCode() {
    if (!uiElements_qr) {
        console.error("QR code UI not initialized");
        return;
    }

    try {
        onUpdateCallbacks_qr.clearScene();
        
        const qrData = getQrCodeParameters();
        if (!qrData.valid) {
            onUpdateCallbacks_qr.setInfoMessage(`Error: ${qrData.error}`);
            onUpdateCallbacks_qr.setSaveDisabled(true);
            return;
        }

        // Generate QR code bit pattern (now synchronous)
        onUpdateCallbacks_qr.setInfoMessage("Generating QR code...");
        onUpdateCallbacks_qr.setSaveDisabled(true);
        
        generateQrBitPattern(qrData.content, qrData.errorCorrection).then(bitPattern => {
            if (!bitPattern) {
                onUpdateCallbacks_qr.setInfoMessage("Error: Failed to generate QR code");
                onUpdateCallbacks_qr.setSaveDisabled(true);
                return;
            }

            // Verify pattern is square
            const patternHeight = bitPattern.length;
            const patternWidth = bitPattern[0] ? bitPattern[0].length : 0;
            
            if (patternWidth !== patternHeight) {
                onUpdateCallbacks_qr.setInfoMessage(`Error: QR pattern is not square (${patternWidth}×${patternHeight})`);
                onUpdateCallbacks_qr.setSaveDisabled(true);
                return;
            }

            // Calculate module size automatically to fit desired dimension
            const patternSize = patternHeight;
            const moduleSize = qrData.dimension / patternSize;
            const qrDimension = qrData.dimension;
            
            // Generate core QR code mesh
            const coreQrGroup = generateMarkerMesh(
                bitPattern,
                qrDimension,
                qrDimension,
                qrData.z1,
                qrData.z2,
                qrData.extrusionType,
                null // No special marker type for QR codes
            );

            // Create final group that may include border
            const finalGroup = new THREE.Group();
            
            if (coreQrGroup) {
                coreQrGroup.name = 'QR_Core';
                finalGroup.add(coreQrGroup);
            }

            // Add border if specified
            if (qrData.borderWidth > MIN_THICKNESS) {
                const borderMesh = createQrBorder(qrDimension, qrData.borderWidth, qrData.z1, qrData.z2, qrData.extrusionType);
                if (borderMesh) {
                    borderMesh.name = 'QR_Border';
                    finalGroup.add(borderMesh);
                }
            }

            if (finalGroup) {
                finalGroup.name = 'QR_Code';
                mainObjectGroup_qr.add(finalGroup);
            }

            // Update info display with calculated dimensions
            const totalDimension = qrDimension + (2 * qrData.borderWidth);
            const borderInfo = qrData.borderWidth > MIN_THICKNESS ? `, border: ${qrData.borderWidth}mm` : '';
            onUpdateCallbacks_qr.setInfoMessage(
                `QR Code: ${patternSize}×${patternSize} modules, ${moduleSize.toFixed(2)}mm per module${borderInfo}, total size: ${totalDimension.toFixed(1)}×${totalDimension.toFixed(1)}mm`
            );
            onUpdateCallbacks_qr.setSaveDisabled(false);
        }).catch(error => {
            console.error("Error in QR code generation:", error);
            onUpdateCallbacks_qr.setInfoMessage(`Error: ${error.message}`);
            onUpdateCallbacks_qr.setSaveDisabled(true);
        });

    } catch (error) {
        console.error("Error updating QR code:", error);
        onUpdateCallbacks_qr.setInfoMessage(`Error: ${error.message}`);
        onUpdateCallbacks_qr.setSaveDisabled(true);
    }
}

function getQrCodeParameters() {
    const content = uiElements_qr.textareas.qr.content?.value?.trim() || '';
    const errorCorrection = uiElements_qr.selects.qr.errorCorrection?.value || 'M';
    const dimension = parseFloat(uiElements_qr.inputs.qr.dim?.value) || 50;
    const borderWidth = parseFloat(uiElements_qr.inputs.qr.borderWidth?.value) || 0;
    const z1 = parseFloat(uiElements_qr.inputs.qr.z1?.value) || 2;
    const z2 = parseFloat(uiElements_qr.inputs.qr.z2?.value) || 1;
    
    // Get selected extrusion type
    let extrusionType = 'positive';
    if (uiElements_qr.radios.qr.extrusion) {
        const selectedRadio = Array.from(uiElements_qr.radios.qr.extrusion).find(radio => radio.checked);
        if (selectedRadio) extrusionType = selectedRadio.value;
    }

    // Validation
    if (!content) {
        return { valid: false, error: 'Content cannot be empty' };
    }

    const dimErrors = validateDimensions({
        dim: dimension,
        z1: z1,
        z2: z2,
        borderWidth: borderWidth,
        extrusionType: extrusionType
    });
    if (dimErrors.length > 0) {
        return { valid: false, error: dimErrors.join(', ') };
    }

    return {
        valid: true,
        content,
        errorCorrection,
        dimension,
        borderWidth,
        z1,
        z2,
        extrusionType
    };
}

function generateQrBitPattern(content, errorCorrectionLevel) {
    try {
        // Check if QRCode.js library is loaded
        if (typeof QRCode === 'undefined') {
            console.error('QRCode.js library not loaded');
            return Promise.resolve(null);
        }

        // Use a different approach - create QR code without DOM and extract modules programmatically
        // QRCode.js uses qrcode-generator internally, let's access that
        
        // Map error correction levels to QRCode.js constants
        const errorCorrectionMap = {
            'L': QRCode.CorrectLevel.L, // ~7%
            'M': QRCode.CorrectLevel.M, // ~15% 
            'Q': QRCode.CorrectLevel.Q, // ~25%
            'H': QRCode.CorrectLevel.H  // ~30%
        };

        const correctLevel = errorCorrectionMap[errorCorrectionLevel] || QRCode.CorrectLevel.M;
        
        // Create QR code instance without DOM element
        const tempDiv = document.createElement('div');
        tempDiv.style.display = 'none';
        document.body.appendChild(tempDiv);
        
        return new Promise((resolve) => {
            let qrCodeInstance;
            try {
                // Create QR code instance
                qrCodeInstance = new QRCode(tempDiv, {
                    text: content,
                    width: 256,
                    height: 256,
                    colorDark: "#000000",
                    colorLight: "#ffffff", 
                    correctLevel: correctLevel
                });
                
                // Wait for QR code generation to complete
                setTimeout(() => {
                    try {
                        // Access the internal qr code object
                        // QRCode.js stores the QR data in qrCodeInstance._oQRCode
                        const qrData = qrCodeInstance._oQRCode;
                        
                        if (!qrData) {
                            throw new Error('Could not access QR code data');
                        }
            
                        const moduleCount = qrData.getModuleCount();
                        console.log(`Generated QR Code: ${moduleCount}×${moduleCount} modules`);
                        
                        // Extract bit pattern directly from QR modules
                        const bitPattern = [];
                        let blackCount = 0, whiteCount = 0;
                        
                        for (let row = 0; row < moduleCount; row++) {
                            const bitRow = [];
                            for (let col = 0; col < moduleCount; col++) {
                                // Get module state - true = dark, false = light
                                const isDark = qrData.isDark(row, col);
                                // Convert to ArUco convention: 0 = black, 1 = white
                                const moduleValue = isDark ? 0 : 1;
                                bitRow.push(moduleValue);
                                
                                if (moduleValue === 0) blackCount++;
                                else whiteCount++;
                            }
                            bitPattern.push(bitRow);
                        }
                        
                        console.log(`QR Code pattern: ${blackCount} black modules, ${whiteCount} white modules`);
                        
                        // Clean up
                        document.body.removeChild(tempDiv);
                        
                        resolve(bitPattern);
                        
                    } catch (error) {
                        // Clean up on error
                        if (tempDiv.parentNode) {
                            document.body.removeChild(tempDiv);
                        }
                        console.error('Error extracting QR data:', error);
                        resolve(null);
                    }
                }, 100); // Wait 100ms for QR generation
                
            } catch (error) {
                // Clean up on error
                if (tempDiv.parentNode) {
                    document.body.removeChild(tempDiv);
                }
                console.error('Error creating QR instance:', error);
                resolve(null);
            }
        });

    } catch (error) {
        console.error('Error generating QR bit pattern:', error);
        return Promise.resolve(null);
    }
}



function createQrBorder(qrDimension, borderWidth, z1, z2, extrusionType) {
    // Calculate border geometry similar to single marker implementation
    const halfQr = qrDimension / 2;
    const halfBorder = borderWidth / 2;

    // Determine border materials and heights based on extrusion type
    let baseMaterial, featureMaterial, baseHeight, featureHeight;
    
    if (extrusionType === 'flat') {
        baseMaterial = whiteMaterial;
        featureMaterial = null;
        baseHeight = Math.max(z2, MIN_THICKNESS);
        featureHeight = 0;
    } else if (extrusionType === 'positive') {
        baseMaterial = whiteMaterial;
        featureMaterial = null; // Border stays white
        baseHeight = z1;
        featureHeight = z2;
    } else { // negative
        baseMaterial = blackMaterial;
        featureMaterial = whiteMaterial;
        baseHeight = z1;
        featureHeight = z2;
    }

    const baseGeometries = [];
    const featureGeometries = [];

    // Create border segments (4 rectangles around the QR code)
    const segments = [
        // Top border
        { x: 0, y: halfQr + halfBorder, w: qrDimension, h: borderWidth },
        // Bottom border
        { x: 0, y: -halfQr - halfBorder, w: qrDimension, h: borderWidth },
        // Left border
        { x: -halfQr - halfBorder, y: 0, w: borderWidth, h: qrDimension },
        // Right border
        { x: halfQr + halfBorder, y: 0, w: borderWidth, h: qrDimension }
    ];

    // Create corner segments
    const corners = [
        { x: -halfQr - halfBorder, y: halfQr + halfBorder },   // Top-left
        { x: halfQr + halfBorder, y: halfQr + halfBorder },    // Top-right
        { x: -halfQr - halfBorder, y: -halfQr - halfBorder },  // Bottom-left
        { x: halfQr + halfBorder, y: -halfQr - halfBorder }    // Bottom-right
    ];

    // Add base geometries
    segments.forEach(segment => {
        baseGeometries.push(
            createBoxAt(segment.w, segment.h, baseHeight,
                segment.x, segment.y, baseHeight / 2)
        );
    });

    corners.forEach(corner => {
        baseGeometries.push(
            createBoxAt(borderWidth, borderWidth, baseHeight,
                corner.x, corner.y, baseHeight / 2)
        );
    });

    // Add feature geometries for negative extrusion
    if (extrusionType === 'negative' && featureHeight > 0) {
        segments.forEach(segment => {
            featureGeometries.push(
                createBoxAt(segment.w, segment.h, featureHeight,
                    segment.x, segment.y, baseHeight + featureHeight / 2)
            );
        });

        corners.forEach(corner => {
            featureGeometries.push(
                createBoxAt(borderWidth, borderWidth, featureHeight,
                    corner.x, corner.y, baseHeight + featureHeight / 2)
            );
        });
    }

    // Create meshes
    const borderGroup = new THREE.Group();

    if (baseGeometries.length > 0) {
        const baseMesh = mergeAndDisposeGeometries(baseGeometries, baseMaterial);
        if (baseMesh) {
            baseMesh.name = 'qr_border_base';
            borderGroup.add(baseMesh);
        }
    }

    if (featureGeometries.length > 0) {
        const featureMesh = mergeAndDisposeGeometries(featureGeometries, featureMaterial);
        if (featureMesh) {
            featureMesh.name = 'qr_border_feature';
            borderGroup.add(featureMesh);
        }
    }

    return borderGroup;
}

export function getQrCodeBaseFilename() {
    const content = uiElements_qr.textareas.qr.content?.value?.trim() || 'qrcode';
    // Create safe filename from content
    const safeContent = content.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    return `QR_${safeContent}`;
}

export function getColoredElementsFromQr(targetMaterial) {
    const coloredGroup = new THREE.Group();

    // Recursively traverse the entire QR object hierarchy to find matching meshes
    mainObjectGroup_qr.traverse((object) => {
        if (object.isMesh && object.material === targetMaterial) {
            // Clone the mesh with proper world transformation
            const newMesh = new THREE.Mesh(object.geometry.clone(), object.material);
            newMesh.geometry.applyMatrix4(object.matrixWorld);
            coloredGroup.add(newMesh);
        }
    });

    return coloredGroup;
}

export function getQrCodeMetadataExport() {
    const qrData = getQrCodeParameters();
    if (!qrData.valid) return null;

    return {
        type: 'QR Code',
        content: qrData.content,
        errorCorrection: qrData.errorCorrection,
        dimensions: {
            qrCodeSize: qrData.dimension,
            baseHeight: qrData.z1,
            featureHeight: qrData.z2
        },
        extrusionType: qrData.extrusionType,
        generatedAt: new Date().toISOString()
    };
}