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

export function generateMarkerMesh(fullPattern, dimX, dimY, z1_baseThickness, z2_featureThickness, extrusionType) {
    const newMeshGroup = new THREE.Group();

    const numRowsTotal = fullPattern.length; // For ArUco pattern
    const numColsTotal = fullPattern[0].length; // For ArUco pattern
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
        // For "flat", materials are assigned per cell, not globally as base/feature.
        // featureHeightActual and createFeatureCondition are not used in the new flat logic.
        // The z2_featureThickness input is effectively ignored for flat markers.
    } else {
        console.error("Invalid extrusion type:", extrusionType);
        return newMeshGroup;
    }

    // --- Geometry Construction ---

    if (extrusionType === "flat") {
        const flatCellThickness = Math.max(z1_baseThickness, 0.1); // Ensure a minimum thickness
        const cellGeometries = [];

        for (let r = 0; r < numRowsTotal; r++) {
            for (let c = 0; c < numColsTotal; c++) {
                const bit = fullPattern[r][c];
                const cellMaterial = (bit === 0) ? blackMaterial : whiteMaterial;

                const cellGeo = new THREE.BoxGeometry(cellWidth, cellHeight, flatCellThickness);
                const cellCenterX = (c * cellWidth + cellWidth / 2) - (dimX / 2);
                const cellCenterY = -((r * cellHeight + cellHeight / 2) - (dimY / 2)); // Y inverted
                cellGeo.translate(cellCenterX, cellCenterY, flatCellThickness / 2); // Base at z=0
                
                // Create a mesh for each cell and add it. For STLExporter, they should be individual meshes if materials differ.
                // If we were to merge, we would need to group by material first.
                newMeshGroup.add(new THREE.Mesh(cellGeo, cellMaterial));
            }
        }
        // No merging needed here if STLExporter handles multiple meshes with different materials in a group correctly.
        // If merging is desired for performance/single object STL (though STL is usually material-agnostic),
        // we would collect geometries for black and white cells separately and merge them.
        // For now, assume STLExporter handles a group of individual black/white meshes.

    } else { // For "positive" and "negative" extrusions
        let actualBaseThickness = z1_baseThickness;
        // This condition was for flat, which now has its own path.
        // if (extrusionType === "flat" && z1_baseThickness < 1e-5) {
        //     actualBaseThickness = 0; 
        // }

        if (actualBaseThickness >= 1e-5) {
            const mainBasePlateGeo = new THREE.BoxGeometry(dimX, dimY, actualBaseThickness);
            mainBasePlateGeo.translate(0, 0, actualBaseThickness / 2);
            newMeshGroup.add(new THREE.Mesh(mainBasePlateGeo, basePlateMaterial));
        } else if (z1_baseThickness >= 1e-5) { // Catch-all for non-flat, very thin base (should not be hit if z1_baseThickness is used)
            const tinyPlaceholderBase = new THREE.BoxGeometry(dimX, dimY, z1_baseThickness);
            tinyPlaceholderBase.translate(0, 0, z1_baseThickness / 2);
            newMeshGroup.add(new THREE.Mesh(tinyPlaceholderBase, basePlateMaterial));
        }

        const arucoFeaturesBaseZ = actualBaseThickness;
        // effectiveFeatureHeightForGeo was for flat, now positive/negative use featureHeightActual directly
        // const effectiveFeatureHeightForGeo = (extrusionType === "flat") ? 1e-5 : featureHeightActual;
        const currentFeatureHeight = featureHeightActual; // Use the already determined featureHeightActual

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