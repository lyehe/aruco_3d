import { blackMaterial, whiteMaterial } from './config.js';
// import { scene } from './three-setup.js'; // No longer needed here

// export let markerObjectGroup; // Removed module-level group to prevent side-effects
let dict; // Will be set by setDict function

export function setDict(dictionary) {
    dict = dictionary;
}

export function getArucoBitPattern(dictName, id, patternWidth, patternHeight) {
    if (!dict) {
        console.error("Dictionary not set in aruco-utils. Call setDict first.");
        return []; // Or throw an error
    }
    const bytes = dict[dictName][id];
    const bits = [];
    const bitsCount = patternWidth * patternHeight;
    for (let byteVal of bytes) {
        let start = bitsCount - bits.length;
        for (let i = Math.min(7, start - 1); i >= 0; i--) { bits.push((byteVal >> i) & 1); }
    }
    const fullPatternWidth = patternWidth + 2;
    const fullPatternHeight = patternHeight + 2;
    const fullPattern = [];
    for (let r = 0; r < fullPatternHeight; r++) {
        const row = [];
        for (let c = 0; c < fullPatternWidth; c++) {
            if (r === 0 || r === fullPatternHeight - 1 || c === 0 || c === fullPatternWidth - 1) {
                row.push(0); // Black border
            } else { row.push(bits[(r - 1) * patternWidth + (c - 1)]); }
        }
        fullPattern.push(row);
    }
    return fullPattern;
}

export function generateMarkerMesh(fullPattern, dimX, dimY, z1_baseThickness, z2_featureThickness, extrusionType, specialMarkerType) {
    const newMeshGroup = new THREE.Group();

    if (specialMarkerType === 'pureWhite' || specialMarkerType === 'pureBlack') {
        // let actual_z1 = z1_baseThickness; // z1 is not used for thickness in flat mode for special markers
        let initial_actual_z2 = z2_featureThickness; 

        if (extrusionType === "flat") {
            const flatSpecialMaterial = specialMarkerType === 'pureWhite' ? whiteMaterial : blackMaterial;
            let flatThickness = Math.max(initial_actual_z2, 1e-5); // Use feature height (z2) for thickness
            if (flatThickness < 0.1) flatThickness = 0.1; // Ensure minimum thickness

            const flatSpecialGeo = new THREE.BoxGeometry(dimX, dimY, flatThickness);
            flatSpecialGeo.translate(0, 0, flatThickness / 2);
            newMeshGroup.add(new THREE.Mesh(flatSpecialGeo, flatSpecialMaterial));
        } else { // For "positive" or "negative" extrusionType
            let baseMaterialForSpecial;
            let final_actual_z2 = initial_actual_z2; // This will be adjusted

            if (extrusionType === "positive") {
                baseMaterialForSpecial = whiteMaterial;
            } else if (extrusionType === "negative") {
                baseMaterialForSpecial = blackMaterial;
            } else {
                console.error(`Special marker (${specialMarkerType}) with unexpected extrusion type: "${extrusionType}". Defaulting base to white.`);
                baseMaterialForSpecial = whiteMaterial; // Fallback
            }

            const intendedFeatureMaterialForSpecial = specialMarkerType === 'pureWhite' ? whiteMaterial : blackMaterial;

            // Suppress feature layer if it's the same color as the base
            if (baseMaterialForSpecial === intendedFeatureMaterialForSpecial) {
                final_actual_z2 = 0;
            }

            // Handle the minimal thickness case (applies if z1 is zero and z2 is zero *or* z2 was suppressed)
            if (z1_baseThickness < 1e-5 && final_actual_z2 < 1e-5) {
                z1_baseThickness = 0.1;
                // final_actual_z2 remains 0, as established by suppression or initial value
            }


            // Create Base plate (z1)
            if (z1_baseThickness >= 1e-5) {
                const basePlateGeo = new THREE.BoxGeometry(dimX, dimY, z1_baseThickness);
                basePlateGeo.translate(0, 0, z1_baseThickness / 2);
                newMeshGroup.add(new THREE.Mesh(basePlateGeo, baseMaterialForSpecial));
            }

            // Create Feature layer (z2) on top, if final_actual_z2 is significant
            if (final_actual_z2 >= 1e-5) {
                const featureLayerGeo = new THREE.BoxGeometry(dimX, dimY, final_actual_z2);
                const baseHeightForFeatureStack = (z1_baseThickness >= 1e-5) ? z1_baseThickness : 0;
                featureLayerGeo.translate(0, 0, baseHeightForFeatureStack + final_actual_z2 / 2);
                newMeshGroup.add(new THREE.Mesh(featureLayerGeo, intendedFeatureMaterialForSpecial));
            }
        }
        return newMeshGroup;
    }

    // Existing ArUco pattern generation logic follows
    if (!fullPattern || fullPattern.length === 0) {
        console.error("No pattern provided for ArUco marker generation and not a special marker type.");
        return newMeshGroup; // Return empty group if no pattern and not special
    }

    const numRowsTotal = fullPattern.length;
    const numColsTotal = fullPattern[0].length;
    const cellWidth = dimX / numColsTotal;
    const cellHeight = dimY / numRowsTotal;

    let basePlateMaterial, featureMaterial, featureHeightActual;
    let createFeatureCondition;

    if (extrusionType === "positive") {
        basePlateMaterial = whiteMaterial; featureMaterial = blackMaterial;
        featureHeightActual = z2_featureThickness;
        createFeatureCondition = (patternBit) => patternBit === 0;
    } else if (extrusionType === "negative") {
        basePlateMaterial = blackMaterial; featureMaterial = whiteMaterial;
        featureHeightActual = z2_featureThickness;
        createFeatureCondition = (patternBit) => patternBit === 1;
    } else if (extrusionType === "flat") {
        // Flat logic specific handling
    } else {
        console.error("Invalid extrusion type:", extrusionType);
        return newMeshGroup;
    }

    if (extrusionType === "flat") {
        const flatCellThickness = Math.max(z2_featureThickness, 0.1); // Use feature height (z2) for cell thickness
        for (let r = 0; r < numRowsTotal; r++) {
            for (let c = 0; c < numColsTotal; c++) {
                const bit = fullPattern[r][c];
                const cellMaterial = (bit === 0) ? blackMaterial : whiteMaterial;
                const cellGeo = new THREE.BoxGeometry(cellWidth, cellHeight, flatCellThickness);
                const cellCenterX = (c * cellWidth + cellWidth / 2) - (dimX / 2);
                const cellCenterY = -((r * cellHeight + cellHeight / 2) - (dimY / 2));
                cellGeo.translate(cellCenterX, cellCenterY, flatCellThickness / 2);
                newMeshGroup.add(new THREE.Mesh(cellGeo, cellMaterial));
            }
        }
    } else { // For "positive" and "negative" extrusions
        let actualBaseThickness = z1_baseThickness;
        if (actualBaseThickness >= 1e-5) {
            const mainBasePlateGeo = new THREE.BoxGeometry(dimX, dimY, actualBaseThickness);
            mainBasePlateGeo.translate(0, 0, actualBaseThickness / 2);
            newMeshGroup.add(new THREE.Mesh(mainBasePlateGeo, basePlateMaterial));
        }
        const arucoFeaturesBaseZ = actualBaseThickness;
        const currentFeatureHeight = featureHeightActual;
        if (currentFeatureHeight >= 1e-5) {
            const featureCellGeometries = [];
            const featureZOffset = arucoFeaturesBaseZ + currentFeatureHeight / 2;
            for (let r_aruco = 0; r_aruco < numRowsTotal; r_aruco++) {
                for (let c_aruco = 0; c_aruco < numColsTotal; c_aruco++) {
                    if (createFeatureCondition(fullPattern[r_aruco][c_aruco])) {
                        const cellCenterX = (c_aruco * cellWidth + cellWidth / 2) - (dimX / 2);
                        const cellCenterY = -((r_aruco * cellHeight + cellHeight / 2) - (dimY / 2));
                        const featureGeo = new THREE.BoxGeometry(cellWidth, cellHeight, currentFeatureHeight);
                        featureGeo.translate(cellCenterX, cellCenterY, featureZOffset);
                        featureCellGeometries.push(featureGeo);
                    }
                }
            }
            if (featureCellGeometries.length > 0) {
                const mergedFeaturesGeo = THREE.BufferGeometryUtils.mergeBufferGeometries(featureCellGeometries);
                if (mergedFeaturesGeo) {
                    newMeshGroup.add(new THREE.Mesh(mergedFeaturesGeo, featureMaterial));
                }
            }
        }
    }
    return newMeshGroup;
} 