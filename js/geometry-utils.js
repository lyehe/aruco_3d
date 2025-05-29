import { blackMaterial, whiteMaterial } from './config.js';

// Properly merge geometries and dispose sources
export function mergeAndDisposeGeometries(geometries, material) {
    if (!geometries || geometries.length === 0) return null;

    try {
        const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(geometries);

        // Dispose source geometries
        geometries.forEach(geo => {
            if (geo && geo.dispose) geo.dispose();
        });

        if (merged) {
            return new THREE.Mesh(merged, material);
        }
    } catch (error) {
        console.error("Error merging geometries:", error);
        // Ensure cleanup even on error
        geometries.forEach(geo => {
            if (geo && geo.dispose) geo.dispose();
        });
    }

    return null;
}

// Create box geometry helper with automatic position
export function createBoxAt(width, height, depth, x, y, z) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    geo.translate(x, y, z);
    return geo;
}

// Dispose a group and all its children
export function disposeGroup(group) {
    if (!group) return;

    const toDispose = [];

    group.traverse(child => {
        if (child.isMesh) {
            if (child.geometry) toDispose.push(child.geometry);
            // Note: We don't dispose materials as they're shared
        }
    });

    // Clear the group
    while (group.children.length > 0) {
        group.remove(group.children[0]);
    }

    // Dispose geometries
    toDispose.forEach(geo => geo.dispose());
}

// Validation helper for dimensions
export function validateDimensions(params) {
    const errors = [];

    if (params.dim !== undefined && params.dim <= 0) {
        errors.push("Dimension must be positive");
    }

    if (params.z1 !== undefined && params.z1 < 0) {
        errors.push("Base height (z1) must be non-negative");
    }

    if (params.z2 !== undefined) {
        if (params.extrusionType !== 'flat' && params.z2 < 0.001) {
            errors.push("Feature height (z2) must be positive for non-flat extrusions");
        }
    }

    if (params.borderWidth !== undefined) {
        if (params.borderWidth > 0 && params.borderWidth < 0.1) {
            errors.push("Border width must be at least 0.1mm if specified");
        }
        if (params.borderWidth > params.dim / 2) {
            errors.push("Border width cannot exceed half the marker dimension");
        }
    }

    return errors;
}