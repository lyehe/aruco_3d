import { initThree } from './three-setup.js';
import { initControls, setDict as setDesignerUiDict } from './designer_ui-handler.js';
import { setDict as setArucoUtilsDict } from './aruco-utils.js';

document.addEventListener('DOMContentLoaded', () => {
    // Ensure THREE.BufferGeometryUtils is available (fallback if not loaded via CDN)
    if (typeof THREE.BufferGeometryUtils === 'undefined') {
        console.warn("THREE.BufferGeometryUtils not found. Using basic fallback merge (less efficient).");
        THREE.BufferGeometryUtils = {
            mergeBufferGeometries: function (geometries) {
                if (!geometries || geometries.length === 0) return null;
                const mergedGeometry = new THREE.BufferGeometry();
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
            setDesignerUiDict(dictionaryData); // Provide dictionary to new UI handler
            setArucoUtilsDict(dictionaryData); // Provide dictionary to Aruco utils
            return dictionaryData; 
        })
        .catch(err => {
            console.error("Failed to load dict.json:", err);
            const errorDisplay = document.querySelector('.info-display') || document.createElement('div');
            errorDisplay.innerHTML = 'Error: Could not load dictionary data.';
            // If created, append to a visible part if .info-display isn't found (though it should be in designer.html)
            if (!document.querySelector('.info-display')) { 
                const form = document.querySelector('.setup') || document.body;
                form.prepend(errorDisplay);
            }
            throw err; 
        });

    // Initialize controls, passing the promise so it can wait for the dictionary
    initControls(loadDictPromise);
}); 