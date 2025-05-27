import { initThree } from './three-setup.js';
import { initControls, setDict as setUiDict } from './ui-handler.js';
import { setDict as setArucoUtilsDict } from './aruco-utils.js';

document.addEventListener('DOMContentLoaded', () => {
    // Ensure THREE.BufferGeometryUtils is available (fallback if not loaded via CDN)
    if (typeof THREE.BufferGeometryUtils === 'undefined') {
        console.warn("THREE.BufferGeometryUtils not found. Using basic fallback merge (less efficient).");
        // Basic fallback for mergeBufferGeometries (copy from original main.js if needed for full functionality)
        THREE.BufferGeometryUtils = {
            mergeBufferGeometries: function (geometries) {
                if (!geometries || geometries.length === 0) return null;
                const mergedGeometry = new THREE.BufferGeometry();
                // Simplified version: assumes all geometries have position attribute
                // For a full fallback, copy the original implementation
                const positions = [];
                geometries.forEach(geometry => {
                    if (geometry && geometry.attributes.position) {
                        const posArray = geometry.attributes.position.array;
                        for (let i = 0; i < posArray.length; i++) {
                            positions.push(posArray[i]);
                        }
                    }
                });
                mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                mergedGeometry.computeVertexNormals(); 
                return mergedGeometry;
            }
        };
    }

    initThree();

    const loadDictPromise = fetch('dict.json')
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(dictionaryData => {
            setUiDict(dictionaryData);       // Provide dictionary to UI handler
            setArucoUtilsDict(dictionaryData); // Provide dictionary to Aruco utils
            return dictionaryData; // Pass data for initControls if needed, or just to ensure it's loaded
        })
        .catch(err => {
            console.error("Failed to load dict.json:", err);
            document.querySelector('.marker-id').innerHTML = 'Error: Could not load dictionary data.';
            // Potentially disable UI or show a more prominent error message
            throw err; // Re-throw to prevent initControls from running without dict if it depends on it
        });

    // Initialize controls, passing the promise so it can wait for the dictionary
    initControls(loadDictPromise);
}); 