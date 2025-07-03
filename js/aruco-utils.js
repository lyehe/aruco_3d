import { blackMaterial, whiteMaterial } from './config.js';

let dict;

export function setDict(dictionary) {
    dict = dictionary;
}

// Validation constants
export const SPECIAL_MARKERS = {
    PURE_WHITE: -1,
    PURE_BLACK: -2
};

export const MIN_THICKNESS = 0.1;

export function isSpecialMarker(id) {
    return id === SPECIAL_MARKERS.PURE_WHITE || id === SPECIAL_MARKERS.PURE_BLACK;
}

export function validateMarkerId(dictName, id, maxId) {
    if (isSpecialMarker(id)) return { valid: true };

    if (isNaN(id) || id < 0 || id > maxId) {
        return { valid: false, error: `Invalid ID (${id}). Must be 0-${maxId} or special values ${SPECIAL_MARKERS.PURE_WHITE} (white), ${SPECIAL_MARKERS.PURE_BLACK} (black)` };
    }

    if (!dict || !dict[dictName] || !dict[dictName][id]) {
        return { valid: false, error: `ID ${id} not found in dictionary ${dictName}` };
    }

    return { valid: true };
}

export function getArucoBitPattern(dictName, id, patternWidth, patternHeight) {
    if (!dict) {
        console.error("Dictionary not set in aruco-utils. Call setDict first.");
        return [];
    }

    if (isSpecialMarker(id)) {
        return null; // Special markers don't have patterns
    }

    const bytes = dict[dictName][id];
    if (!bytes) {
        console.error(`Pattern not found for ${dictName} ID ${id}`);
        return [];
    }

    const bits = [];
    const bitsCount = patternWidth * patternHeight;

    for (let byteVal of bytes) {
        let start = bitsCount - bits.length;
        for (let i = Math.min(7, start - 1); i >= 0; i--) {
            bits.push((byteVal >> i) & 1);
        }
    }

    // Check if this is an AprilTag dictionary
    const isAprilTag = dictName.startsWith('april_');
    
    // If it's AprilTag, rotate the pattern 180 degrees
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

    // Add border
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

    return fullPattern;
}

// Helper to determine materials and heights for special markers
function getSpecialMarkerConfig(specialMarkerType, extrusionType, z1, z2) {
    const isWhite = specialMarkerType === 'pureWhite';
    let baseMaterial, featureMaterial;
    let actualZ1 = z1;
    let actualZ2 = z2;

    if (extrusionType === "flat") {
        // For flat mode, we always use z2 as the thickness (ignoring z1)
        // Ensure minimum thickness
        const flatThickness = Math.max(z2, MIN_THICKNESS);
        return {
            baseMaterial: isWhite ? whiteMaterial : blackMaterial,
            featureMaterial: null,
            z1: 0,
            z2: flatThickness,
            createBase: true,
            createFeature: false
        };
    }

    // For positive/negative extrusions
    baseMaterial = extrusionType === "positive" ? whiteMaterial : blackMaterial;
    featureMaterial = isWhite ? whiteMaterial : blackMaterial;

    // Suppress feature if same color as base
    const suppressFeature = (baseMaterial === featureMaterial);
    if (suppressFeature) {
        actualZ2 = 0;
    }

    // Ensure minimum thickness
    if (actualZ1 < MIN_THICKNESS && actualZ2 < MIN_THICKNESS) {
        actualZ1 = MIN_THICKNESS;
    }

    return {
        baseMaterial,
        featureMaterial,
        z1: actualZ1,
        z2: actualZ2,
        createBase: actualZ1 >= MIN_THICKNESS,
        createFeature: actualZ2 >= MIN_THICKNESS && !suppressFeature
    };
}

export function generateMarkerMesh(fullPattern, dimX, dimY, z1_baseThickness, z2_featureThickness, extrusionType, specialMarkerType) {
    const meshGroup = new THREE.Group();
    const geometriesToDispose = []; // Track geometries for cleanup

    try {
        if (specialMarkerType) {
            const config = getSpecialMarkerConfig(specialMarkerType, extrusionType, z1_baseThickness, z2_featureThickness);

            if (extrusionType === "flat") {
                // For flat special markers, create a single block at the correct height
                const geo = new THREE.BoxGeometry(dimX, dimY, config.z2);
                geo.translate(0, 0, config.z2 / 2);
                geometriesToDispose.push(geo);
                meshGroup.add(new THREE.Mesh(geo, config.baseMaterial));
            } else {
                if (config.createBase) {
                    const baseGeo = new THREE.BoxGeometry(dimX, dimY, config.z1);
                    baseGeo.translate(0, 0, config.z1 / 2);
                    geometriesToDispose.push(baseGeo);
                    meshGroup.add(new THREE.Mesh(baseGeo, config.baseMaterial));
                }

                if (config.createFeature) {
                    const featureGeo = new THREE.BoxGeometry(dimX, dimY, config.z2);
                    featureGeo.translate(0, 0, config.z1 + config.z2 / 2);
                    geometriesToDispose.push(featureGeo);
                    meshGroup.add(new THREE.Mesh(featureGeo, config.featureMaterial));
                }
            }

            return meshGroup;
        }

        // Regular ArUco pattern generation
        if (!fullPattern || fullPattern.length === 0) {
            console.error("No pattern provided for ArUco marker generation");
            return meshGroup;
        }

        const numRowsTotal = fullPattern.length;
        const numColsTotal = fullPattern[0].length;
        const cellWidth = dimX / numColsTotal;
        const cellHeight = dimY / numRowsTotal;

        if (extrusionType === "flat") {
            // For flat mode, use z2 as the thickness (ignoring z1)
            const flatThickness = Math.max(z2_featureThickness, MIN_THICKNESS);

            for (let r = 0; r < numRowsTotal; r++) {
                for (let c = 0; c < numColsTotal; c++) {
                    const bit = fullPattern[r][c];
                    const cellMaterial = bit === 0 ? blackMaterial : whiteMaterial;
                    const cellGeo = new THREE.BoxGeometry(cellWidth, cellHeight, flatThickness);

                    const cellCenterX = (c * cellWidth + cellWidth / 2) - (dimX / 2);
                    const cellCenterY = -((r * cellHeight + cellHeight / 2) - (dimY / 2));
                    cellGeo.translate(cellCenterX, cellCenterY, flatThickness / 2);

                    geometriesToDispose.push(cellGeo);
                    meshGroup.add(new THREE.Mesh(cellGeo, cellMaterial));
                }
            }
        } else {
            // Positive/Negative extrusion
            const baseMaterial = extrusionType === "positive" ? whiteMaterial : blackMaterial;
            const featureMaterial = extrusionType === "positive" ? blackMaterial : whiteMaterial;
            const createFeatureCondition = extrusionType === "positive" ?
                (bit) => bit === 0 : (bit) => bit === 1;

            // Base plate
            if (z1_baseThickness >= MIN_THICKNESS) {
                const baseGeo = new THREE.BoxGeometry(dimX, dimY, z1_baseThickness);
                baseGeo.translate(0, 0, z1_baseThickness / 2);
                geometriesToDispose.push(baseGeo);
                meshGroup.add(new THREE.Mesh(baseGeo, baseMaterial));
            }

            // Feature cells
            if (z2_featureThickness >= MIN_THICKNESS) {
                const featureGeometries = [];
                const featureZOffset = z1_baseThickness + z2_featureThickness / 2;

                for (let r = 0; r < numRowsTotal; r++) {
                    for (let c = 0; c < numColsTotal; c++) {
                        if (createFeatureCondition(fullPattern[r][c])) {
                            const cellCenterX = (c * cellWidth + cellWidth / 2) - (dimX / 2);
                            const cellCenterY = -((r * cellHeight + cellHeight / 2) - (dimY / 2));

                            const featureGeo = new THREE.BoxGeometry(cellWidth, cellHeight, z2_featureThickness);
                            featureGeo.translate(cellCenterX, cellCenterY, featureZOffset);
                            featureGeometries.push(featureGeo);
                        }
                    }
                }

                if (featureGeometries.length > 0) {
                    const mergedGeo = THREE.BufferGeometryUtils.mergeBufferGeometries(featureGeometries);

                    // Dispose individual geometries after merge
                    featureGeometries.forEach(geo => geo.dispose());

                    if (mergedGeo) {
                        geometriesToDispose.push(mergedGeo);
                        meshGroup.add(new THREE.Mesh(mergedGeo, featureMaterial));
                    }
                }
            }
        }

    } catch (error) {
        console.error("Error in generateMarkerMesh:", error);
        // Clean up any geometries created before error
        geometriesToDispose.forEach(geo => geo.dispose());
        throw error;
    }

    // Store geometries for later disposal
    meshGroup.userData.geometries = geometriesToDispose;

    return meshGroup;
}

// Helper function to properly dispose a marker mesh group
export function disposeMarkerMesh(meshGroup) {
    if (!meshGroup) return;

    // Dispose stored geometries
    if (meshGroup.userData.geometries) {
        meshGroup.userData.geometries.forEach(geo => geo.dispose());
    }

    // Dispose any child mesh geometries
    meshGroup.traverse(child => {
        if (child.isMesh && child.geometry) {
            child.geometry.dispose();
        }
    });
}