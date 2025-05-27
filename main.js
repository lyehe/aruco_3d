let dict;
let scene, camera, renderer, controls;
let markerObjectGroup;

const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, metalness: 0.2, roughness: 0.7, name: 'BlackMat' });
const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xF0F0F0, metalness: 0.2, roughness: 0.7, name: 'WhiteMat' });

const loadDict = fetch('dict.json')
    .then(res => res.json())
    .then(json => {
        dict = json;
    });

// --- Sharp 5x7 Font for Digits (0-9) with Clear Holes ---
const digitFont = {
    '0': [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1]
    ],
    '1': [
        [0, 0, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [1, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [1, 1, 1, 1, 1]
    ],
    '2': [
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 1],
        [0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0],
        [1, 0, 0, 0, 0],
        [1, 1, 1, 1, 1]
    ],
    '3': [
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 1],
        [0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 1],
        [0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1]
    ],
    '4': [
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 1],
        [0, 0, 0, 0, 1],
        [0, 0, 0, 0, 1]
    ],
    '5': [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0],
        [1, 0, 0, 0, 0],
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 1],
        [0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1]
    ],
    '6': [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0],
        [1, 0, 0, 0, 0],
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1]
    ],
    '7': [
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 1],
        [0, 0, 0, 1, 0],
        [0, 0, 1, 0, 0],
        [0, 1, 0, 0, 0],
        [0, 1, 0, 0, 0],
        [0, 1, 0, 0, 0]
    ],
    '8': [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1]
    ],
    '9': [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 1],
        [0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1]
    ]
};

function initThree() {
    const previewDiv = document.getElementById('stl-preview');
    const width = previewDiv.clientWidth;
    const height = previewDiv.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdedede);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(60, 60, 120);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    previewDiv.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(70, 120, 100);
    scene.add(directionalLight);

    const bottomLight = new THREE.DirectionalLight(0xccddee, 0.6);
    bottomLight.position.set(0, -30, -50);
    scene.add(bottomLight);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.target.set(0, 0, 0);

    function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
    animate();
    window.addEventListener('resize', () => {
        const newWidth = previewDiv.clientWidth;
        const newHeight = previewDiv.clientHeight;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
    });
}

function getArucoBitPattern(dictName, id, patternWidth, patternHeight) {
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

function generateMarkerMesh(markerIdStr, fullPattern, dimX, dimY, z1_baseThickness, z2_featureThickness, extrusionType, textHeight = 3) {
    if (markerObjectGroup) {
        scene.remove(markerObjectGroup);
        markerObjectGroup.traverse(child => {
            if (child.isMesh) { if (child.geometry) child.geometry.dispose(); }
        });
        markerObjectGroup.clear();
    }
    markerObjectGroup = new THREE.Group();

    const numRowsTotal = fullPattern.length;
    const numColsTotal = fullPattern[0].length;
    const cellWidth = dimX / numColsTotal;
    const cellHeight = dimY / numRowsTotal;

    let basePlateMaterial, featureMaterial, featureHeightActual, baseHeightActual;
    let createFeatureCondition;

    if (extrusionType === "positive") {
        basePlateMaterial = whiteMaterial; featureMaterial = blackMaterial;
        featureHeightActual = z2_featureThickness; baseHeightActual = z1_baseThickness;
        createFeatureCondition = (patternBit) => patternBit === 0;
    } else if (extrusionType === "negative") {
        basePlateMaterial = blackMaterial; featureMaterial = whiteMaterial;
        featureHeightActual = z2_featureThickness; baseHeightActual = z1_baseThickness;
        createFeatureCondition = (patternBit) => patternBit === 1;
    } else if (extrusionType === "flat") {
        basePlateMaterial = whiteMaterial; featureMaterial = blackMaterial;
        featureHeightActual = 1e-5;
        baseHeightActual = z1_baseThickness;
        createFeatureCondition = (patternBit) => patternBit === 0;
    } else {
        scene.add(markerObjectGroup); return markerObjectGroup;
    }

    const engravingDepth = 0.8;
    const actualEngravingDepth = Math.min(engravingDepth, Math.max(0, baseHeightActual - 1e-4));

    // Use simple text height in mm
    const engraveCharHeight = Math.max(textHeight, 2); // Minimum 2mm height
    const engraveCharPixelSize = engraveCharHeight / 7;
    const engraveCharWidth = engraveCharPixelSize * 5;
    const charSpacing = engraveCharPixelSize * 1.5;
    const marginFromEdge = engraveCharPixelSize * 2;

    const engraveGridCols = Math.ceil(dimX / engraveCharPixelSize);
    const engraveGridRows = Math.ceil(dimY / engraveCharPixelSize);
    const engravePixelActualWidth = dimX / engraveGridCols;
    const engravePixelActualHeight = dimY / engraveGridRows;

    let baseEngravingGrid = Array(engraveGridRows).fill(null).map(() => Array(engraveGridCols).fill(1));

    const textBlockStartY = dimY / 2 - marginFromEdge;
    let currentX_engraveCharOrigin = -dimX / 2 + marginFromEdge;

    for (const char of markerIdStr) {
        if (digitFont[char]) {
            const digitPattern = digitFont[char];
            for (let r_font = 0; r_font < 7; r_font++) {
                for (let c_font = 0; c_font < 5; c_font++) {
                    if (digitPattern[r_font][c_font] === 1) {
                        const fontPixelCenterX_normal = currentX_engraveCharOrigin + (c_font * engraveCharPixelSize) + (engraveCharPixelSize / 2);
                        const fontPixelCenterY_normal = textBlockStartY - (r_font * engraveCharPixelSize) - (engraveCharPixelSize / 2);

                        const gridC_natural = Math.floor((fontPixelCenterX_normal + dimX / 2) / engravePixelActualWidth);
                        const gridC = engraveGridCols - 1 - gridC_natural;
                        const gridR = Math.floor((-fontPixelCenterY_normal + dimY / 2) / engravePixelActualHeight);

                        if (gridR >= 0 && gridR < engraveGridRows && gridC >= 0 && gridC < engraveGridCols) {
                            baseEngravingGrid[gridR][gridC] = 0;
                        }
                    }
                }
            }
        }
        currentX_engraveCharOrigin += (engraveCharWidth + charSpacing);
    }

    if (extrusionType === "flat") {
        const flatPlateBaseMatGeos = [];
        const flatPlateFeatMatGeos = [];

        // Create pixelated base with engraving
        for (let r_eng = 0; r_eng < engraveGridRows; r_eng++) {
            for (let c_eng = 0; c_eng < engraveGridCols; c_eng++) {
                const pixelCenterX = (c_eng * engravePixelActualWidth + engravePixelActualWidth / 2) - (dimX / 2);
                const pixelCenterY = -((r_eng * engravePixelActualHeight + engravePixelActualHeight / 2) - (dimY / 2));

                let currentPixelThickness, pixelZOffset;
                if (baseEngravingGrid[r_eng][c_eng] === 1) {
                    currentPixelThickness = baseHeightActual;
                    pixelZOffset = currentPixelThickness / 2;
                } else {
                    currentPixelThickness = Math.max(1e-5, baseHeightActual - actualEngravingDepth);
                    pixelZOffset = actualEngravingDepth + currentPixelThickness / 2;
                }

                if (currentPixelThickness < 1e-4 && baseEngravingGrid[r_eng][c_eng] === 0) continue;

                const pixelGeo = new THREE.BoxGeometry(engravePixelActualWidth, engravePixelActualHeight, currentPixelThickness);
                pixelGeo.translate(pixelCenterX, pixelCenterY, pixelZOffset);

                const arucoCol = Math.min(numColsTotal - 1, Math.max(0, Math.floor((pixelCenterX + dimX / 2) / cellWidth)));
                const arucoRow = Math.min(numRowsTotal - 1, Math.max(0, Math.floor((-pixelCenterY + dimY / 2) / cellHeight)));
                const patternBit = fullPattern[arucoRow][arucoCol];

                if (createFeatureCondition(patternBit)) {
                    flatPlateFeatMatGeos.push(pixelGeo);
                } else {
                    flatPlateBaseMatGeos.push(pixelGeo);
                }
            }
        }

        if (flatPlateBaseMatGeos.length > 0) {
            markerObjectGroup.add(new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(flatPlateBaseMatGeos), basePlateMaterial));
        }
        if (flatPlateFeatMatGeos.length > 0) {
            markerObjectGroup.add(new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(flatPlateFeatMatGeos), featureMaterial));
        }
    } else {
        // For positive/negative extrusion
        const basePlatePixelGeos = [];
        
        // Create pixelated base with engraving
        for (let r_eng = 0; r_eng < engraveGridRows; r_eng++) {
            for (let c_eng = 0; c_eng < engraveGridCols; c_eng++) {
                const pixelCenterX = (c_eng * engravePixelActualWidth + engravePixelActualWidth / 2) - (dimX / 2);
                const pixelCenterY = -((r_eng * engravePixelActualHeight + engravePixelActualHeight / 2) - (dimY / 2));

                let currentPixelThickness, pixelZOffset;
                if (baseEngravingGrid[r_eng][c_eng] === 1) {
                    currentPixelThickness = baseHeightActual;
                    pixelZOffset = currentPixelThickness / 2;
                } else {
                    currentPixelThickness = Math.max(1e-5, baseHeightActual - actualEngravingDepth);
                    pixelZOffset = actualEngravingDepth + currentPixelThickness / 2;
                }

                if (currentPixelThickness < 1e-4 && baseEngravingGrid[r_eng][c_eng] === 0) continue;

                const pixelGeo = new THREE.BoxGeometry(engravePixelActualWidth, engravePixelActualHeight, currentPixelThickness);
                pixelGeo.translate(pixelCenterX, pixelCenterY, pixelZOffset);
                basePlatePixelGeos.push(pixelGeo);
            }
        }

        if (basePlatePixelGeos.length > 0) {
            markerObjectGroup.add(new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(basePlatePixelGeos), basePlateMaterial));
        }

        // Add feature cells (black/white pattern)
        if (featureHeightActual > 1e-5) {
            const featureCellGeometries = [];
            for (let r_aruco = 0; r_aruco < numRowsTotal; r_aruco++) {
                for (let c_aruco = 0; c_aruco < numColsTotal; c_aruco++) {
                    if (createFeatureCondition(fullPattern[r_aruco][c_aruco])) {
                        const cellCenterX = (c_aruco * cellWidth + cellWidth / 2) - (dimX / 2);
                        const cellCenterY = -((r_aruco * cellHeight + cellHeight / 2) - (dimY / 2));
                        
                        const featureGeo = new THREE.BoxGeometry(cellWidth, cellHeight, featureHeightActual);
                        featureGeo.translate(cellCenterX, cellCenterY, baseHeightActual + (featureHeightActual / 2));
                        featureCellGeometries.push(featureGeo);
                    }
                }
            }
            if (featureCellGeometries.length > 0) {
                markerObjectGroup.add(new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(featureCellGeometries), featureMaterial));
            }
        }
    }

    scene.add(markerObjectGroup);
    return markerObjectGroup;
}

function initControls() {
    const dictSelect = document.querySelector('.setup select[name=dict]');
    const markerIdInput = document.querySelector('.setup input[name=id]');
    const dimInput = document.querySelector('.setup input[name=dim]');
    const textHeightInput = document.querySelector('.setup input[name=textHeight]');
    const z1Input = document.querySelector('.setup input[name=z1]');
    const z2Input = document.querySelector('.setup input[name=z2]');
    const saveButton = document.querySelector('.save-button');

    function updateMarker() {
        let markerIdNum = Number(markerIdInput.value);
        const markerIdStr = markerIdInput.value;
        const dim = Number(dimInput.value);
        const textHeight = textHeightInput ? Number(textHeightInput.value) : 3;
        const z1_base = Number(z1Input.value);
        const z2_feature = Number(z2Input.value);
        const extrusionType = document.querySelector('input[name="extrusion"]:checked').value;

        const option = dictSelect.options[dictSelect.selectedIndex];
        const dictName = option.value;
        const patternWidth = Number(option.getAttribute('data-width'));
        const patternHeight = Number(option.getAttribute('data-height'));

        if (dim <= 0 || z1_base <= 1e-5 || (extrusionType !== "flat" && z2_feature < 1e-5)) {
            if (markerObjectGroup) scene.remove(markerObjectGroup);
            saveButton.removeAttribute('href'); saveButton.removeAttribute('download');
            document.querySelector('.marker-id').innerHTML = 'Dimensions must be positive & > 0.00001mm.'; return;
        }

        const z2_actual = (extrusionType === "flat") ? 1e-5 : z2_feature;

        loadDict.then(() => {
            let maxId = 0;
            if (dict && dict[dictName]) {
                maxId = dict[dictName].length - 1;
            } else if (option.getAttribute('data-number')) {
                maxId = Number(option.getAttribute('data-number')) - 1;
            } else {
                maxId = (dictName.includes("4x4")) ? 999 :
                    (dictName.includes("5x5")) ? 999 :
                        (dictName.includes("6x6_1000")) ? 999 :
                            (dictName.includes("7x7")) ? 999 :
                                (dictName === "mip_36h12") ? 249 :
                                    (dictName === "april_16h5") ? 29 :
                                        (dictName === "april_25h9") ? 34 :
                                            (dictName === "april_36h10") ? 2319 :
                                                (dictName === "april_36h11") ? 586 :
                                                    (dictName === "aruco") ? 1023 : 999;
            }
            markerIdInput.setAttribute('max', maxId);
            if (markerIdNum > maxId) { markerIdInput.value = maxId; markerIdNum = maxId; }
            if (markerIdNum < 0) { markerIdInput.value = 0; markerIdNum = 0; }

            if (!dict[dictName]) {
                document.querySelector('.marker-id').innerHTML = `Dict '${dictName}' not found.`;
                if (markerObjectGroup) scene.remove(markerObjectGroup);
                saveButton.removeAttribute('href'); saveButton.removeAttribute('download');
                return;
            }
            if (!dict[dictName][markerIdNum]) {
                if (markerObjectGroup) scene.remove(markerObjectGroup);
                saveButton.removeAttribute('href'); saveButton.removeAttribute('download');
                document.querySelector('.marker-id').innerHTML = `ID ${markerIdNum} not found in ${dictName}`;
                return;
            }

            const fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
            const currentMarkerMeshGroup = generateMarkerMesh(markerIdStr, fullPattern, dim, dim, z1_base, z2_actual, extrusionType, textHeight);

            const exporter = new THREE.STLExporter();
            const stlString = exporter.parse(currentMarkerMeshGroup, { binary: false });

            saveButton.href = 'data:model/stl;base64,' + btoa(stlString);

            const fileNameTotalZ = (extrusionType === "flat") ? z1_base : z1_base + z2_actual;
            
            let fileName = `${dictName}-${markerIdNum}_${dim}x${dim}x${fileNameTotalZ.toFixed(2)}mm_${extrusionType}_engravedID.stl`;

            saveButton.download = fileName;
            document.querySelector('.marker-id').innerHTML = `ID ${markerIdNum} (${dictName}) - ${extrusionType} (ID engraved)`;
        }).catch(err => {
            console.error("Error loading/processing dictionary:", err);
            document.querySelector('.marker-id').innerHTML = 'Error loading dictionary';
            if (markerObjectGroup) scene.remove(markerObjectGroup);
            saveButton.removeAttribute('href'); saveButton.removeAttribute('download');
        });
    }

    dictSelect.addEventListener('change', updateMarker);
    markerIdInput.addEventListener('input', updateMarker);
    dimInput.addEventListener('input', updateMarker);
    if (textHeightInput) textHeightInput.addEventListener('input', updateMarker);
    z1Input.addEventListener('input', updateMarker);
    z2Input.addEventListener('input', updateMarker);
    document.querySelectorAll('input[name="extrusion"]').forEach(radio => {
        radio.addEventListener('change', updateMarker);
    });
    loadDict.then(updateMarker).catch(err => {
        console.error("Initial dictionary load failed:", err);
        document.querySelector('.marker-id').innerHTML = 'Error: Could not load dictionary data.';
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Ensure THREE.BufferGeometryUtils is available
    if (typeof THREE.BufferGeometryUtils === 'undefined') {
        console.warn("THREE.BufferGeometryUtils not found. Using basic fallback merge (less efficient).");
        THREE.BufferGeometryUtils = {
            mergeBufferGeometries: function (geometries) {
                if (!geometries || geometries.length === 0) return null;
                const mergedGeometry = new THREE.BufferGeometry();
                const attributes = {};
                let totalVertices = 0;
                let totalIndices = 0;
                let hasIndices = false;

                geometries.forEach(geometry => {
                    if (!geometry) return;
                    if (geometry.index) hasIndices = true;
                    totalVertices += geometry.attributes.position.count;
                    if (geometry.index) totalIndices += geometry.index.count;

                    for (const name in geometry.attributes) {
                        if (!attributes[name]) {
                            attributes[name] = {
                                array: [],
                                itemSize: geometry.attributes[name].itemSize,
                                normalized: geometry.attributes[name].normalized
                            };
                        }
                    }
                });

                const mergedPositions = new Float32Array(totalVertices * 3);
                let mergedNormals;
                if (attributes.normal) mergedNormals = new Float32Array(totalVertices * 3);
                let mergedUvs;
                if (attributes.uv) mergedUvs = new Float32Array(totalVertices * 2);

                let mergedIndices;
                if (hasIndices) mergedIndices = new Uint32Array(totalIndices);

                let vertexOffset = 0;
                let indexOffset = 0;

                geometries.forEach(geometry => {
                    if (!geometry) return;
                    mergedPositions.set(geometry.attributes.position.array, vertexOffset * 3);
                    if (mergedNormals && geometry.attributes.normal) {
                        mergedNormals.set(geometry.attributes.normal.array, vertexOffset * 3);
                    }
                    if (mergedUvs && geometry.attributes.uv) {
                        mergedUvs.set(geometry.attributes.uv.array, vertexOffset * 2);
                    }

                    if (hasIndices && geometry.index) {
                        for (let i = 0; i < geometry.index.count; i++) {
                            mergedIndices[indexOffset + i] = geometry.index.array[i] + vertexOffset;
                        }
                        indexOffset += geometry.index.count;
                    }
                    vertexOffset += geometry.attributes.position.count;
                });

                mergedGeometry.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
                if (mergedNormals) mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
                if (mergedUvs) mergedGeometry.setAttribute('uv', new THREE.BufferAttribute(mergedUvs, 2));
                if (hasIndices) mergedGeometry.setIndex(new THREE.BufferAttribute(mergedIndices, 1));

                if (!mergedNormals && !hasIndices) mergedGeometry.computeVertexNormals();

                return mergedGeometry;
            }
        };
    }

    initThree();
    initControls();
});