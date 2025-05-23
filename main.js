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
        [1,1,1,1,1],
        [1,0,0,0,1],
        [1,0,0,0,1],
        [1,0,0,0,1],
        [1,0,0,0,1],
        [1,0,0,0,1],
        [1,1,1,1,1]
    ],
    '1': [
        [0,0,1,0,0],
        [0,0,1,0,0],
        [1,0,1,0,0],
        [0,0,1,0,0],
        [0,0,1,0,0],
        [0,0,1,0,0],
        [0,0,1,0,0]
    ],
    '2': [
        [1,1,1,1,1],
        [0,0,0,0,1],
        [0,0,0,0,1],
        [1,1,1,1,1],
        [1,0,0,0,0],
        [1,0,0,0,0],
        [1,1,1,1,1]
    ],
    '3': [
        [1,1,1,1,1],
        [0,0,0,0,1],
        [0,0,0,0,1],
        [1,1,1,1,1],
        [0,0,0,0,1],
        [0,0,0,0,1],
        [1,1,1,1,1]
    ],
    '4': [
        [1,0,0,0,1],
        [1,0,0,0,1],
        [1,0,0,0,1],
        [1,1,1,1,1],
        [0,0,0,0,1],
        [0,0,0,0,1],
        [0,0,0,0,1]
    ],
    '5': [
        [1,1,1,1,1],
        [1,0,0,0,0],
        [1,0,0,0,0],
        [1,1,1,1,1],
        [0,0,0,0,1],
        [0,0,0,0,1],
        [1,1,1,1,1]
    ],
    '6': [
        [1,1,1,1,1],
        [1,0,0,0,0],
        [1,0,0,0,0],
        [1,1,1,1,1],
        [1,0,0,0,1],
        [1,0,0,0,1],
        [1,1,1,1,1]
    ],
    '7': [
        [1,1,1,1,1],
        [0,0,0,0,1],
        [0,0,0,0,1],
        [0,0,0,0,1],
        [0,0,0,0,1],
        [0,0,0,0,1],
        [0,0,0,0,1]
    ],
    '8': [
        [1,1,1,1,1],
        [1,0,0,0,1],
        [1,0,0,0,1],
        [1,1,1,1,1],
        [1,0,0,0,1],
        [1,0,0,0,1],
        [1,1,1,1,1]
    ],
    '9': [
        [1,1,1,1,1],
        [1,0,0,0,1],
        [1,0,0,0,1],
        [1,1,1,1,1],
        [0,0,0,0,1],
        [0,0,0,0,1],
        [1,1,1,1,1]
    ]
};


function initThree() { /* ... same as before ... */ 
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
    controls.target.set(0,0,0);

    function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
    animate();
    window.addEventListener('resize', () => { /* ... */ });
}

function getArucoBitPattern(dictName, id, patternWidth, patternHeight) { /* ... same as before ... */
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
                row.push(0);
            } else { row.push(bits[(r - 1) * patternWidth + (c - 1)]); }
        }
        fullPattern.push(row);
    }
    return fullPattern;
 }

function generateMarkerMesh(markerIdStr, fullPattern, dimX, dimY, z1_baseThickness, z2_featureThickness, extrusionType, holeD, holeDepth) {
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
        featureHeightActual = 1e-5; baseHeightActual = z1_baseThickness;
        createFeatureCondition = (patternBit) => patternBit === 0;
    } else {
        scene.add(markerObjectGroup); return markerObjectGroup;
    }

    // Validate and limit hole depth
    const maxHoleDepth = Math.max(0, baseHeightActual - 0.2);
    const actualHoleDepth = Math.min(holeDepth, maxHoleDepth);

    // --- Create Marker (Front Face) ---
    const baseCellGeometries = [];
    const featureCellGeometries = [];
    if (extrusionType === "flat") {
        for (let r = 0; r < numRowsTotal; r++) {
            for (let c = 0; c < numColsTotal; c++) {
                const patternBit = fullPattern[r][c];
                const cellGeo = new THREE.BoxGeometry(cellWidth, cellHeight, baseHeightActual);
                cellGeo.translate(
                    (c * cellWidth + cellWidth / 2) - (dimX / 2),
                    -((r * cellHeight + cellHeight / 2) - (dimY / 2)),
                    baseHeightActual / 2  
                );
                if (createFeatureCondition(patternBit)) {
                    featureCellGeometries.push(cellGeo);
                } else {
                    baseCellGeometries.push(cellGeo);
                }
            }
        }
        if (baseCellGeometries.length > 0) {
            markerObjectGroup.add(new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(baseCellGeometries), basePlateMaterial));
        }
        if (featureCellGeometries.length > 0) {
            markerObjectGroup.add(new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(featureCellGeometries), featureMaterial));
        }
    } else { 
        if (baseHeightActual > 1e-5) {
            const basePlateGeometry = new THREE.BoxGeometry(dimX, dimY, baseHeightActual);
            basePlateGeometry.translate(0, 0, baseHeightActual / 2); 
            markerObjectGroup.add(new THREE.Mesh(basePlateGeometry, basePlateMaterial));
        }
        if (featureHeightActual > 1e-5) {
            for (let r = 0; r < numRowsTotal; r++) {
                for (let c = 0; c < numColsTotal; c++) {
                    if (createFeatureCondition(fullPattern[r][c])) {
                        const featureGeo = new THREE.BoxGeometry(cellWidth, cellHeight, featureHeightActual);
                        featureGeo.translate(
                            (c * cellWidth + cellWidth / 2) - (dimX / 2),
                            -((r * cellHeight + cellHeight / 2) - (dimY / 2)),
                            baseHeightActual + (featureHeightActual / 2) 
                        );
                        featureCellGeometries.push(featureGeo);
                    }
                }
            }
            if (featureCellGeometries.length > 0) {
                markerObjectGroup.add(new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(featureCellGeometries), featureMaterial));
            }
        }
    }

    // --- Add Mounting Hole (if diameter > 0 and depth > 0) ---
    if (holeD > 0 && actualHoleDepth > 0) {
        const holeRadius = holeD / 2;
        const holeGeometry = new THREE.CylinderGeometry(holeRadius, holeRadius, actualHoleDepth, 16);
        // Position hole at center back, going from back surface into the base
        holeGeometry.translate(0, 0, baseHeightActual - (actualHoleDepth / 2));
        const holeMesh = new THREE.Mesh(holeGeometry, basePlateMaterial);
        
        // Use CSG-like approach by creating a "negative" hole geometry
        // For simplicity, we'll create a visual representation
        // In a real implementation, you'd use CSG operations
        holeMesh.material = new THREE.MeshStandardMaterial({ 
            color: 0x333333, 
            metalness: 0.8, 
            roughness: 0.2,
            transparent: true,
            opacity: 0.7
        });
        markerObjectGroup.add(holeMesh);
    }

    // --- "Engraved" ID on a Backing Layer (Top-Left Corner) ---
    const backingPlateThickness = 0.4; 
    const backingPlateZOffset = -backingPlateThickness / 2; 

    const engraveCharHeight = Math.min(dimY * 0.15, 6); 
    const engraveCharPixelSize = engraveCharHeight / 7;
    const engraveCharWidth = engraveCharPixelSize * 5;
    const charSpacing = engraveCharPixelSize * 1.5; 
    
    const marginFromEdge = engraveCharPixelSize * 1;
    const startX = -dimX / 2 + marginFromEdge;
    const startY = dimY / 2 - marginFromEdge; // Start from top instead of subtracting character height
    
    let currentX_engrave = startX;

    const backingPlatePartsGeos = []; 
    const backingGridCols = Math.ceil(dimX / engraveCharPixelSize); 
    const backingGridRows = Math.ceil(dimY / engraveCharPixelSize);
    const backingPixelActualWidth = dimX / backingGridCols;
    const backingPixelActualHeight = dimY / backingGridRows;
    let backingGrid = Array(backingGridRows).fill(null).map(() => Array(backingGridCols).fill(1));

    // Convert markerIdStr to array and reverse it to flip the order
    const reversedChars = markerIdStr.split('').reverse();
    
    for (const char of reversedChars) {
        if (digitFont[char]) {
            const digitPattern = digitFont[char]; 
            for (let r_font = 0; r_font < 7; r_font++) {
                for (let c_font = 0; c_font < 5; c_font++) {
                    if (digitPattern[r_font][c_font] === 1) { 
                        // Flip each digit horizontally by using (4 - c_font)
                        const worldX = currentX_engrave + ((4 - c_font) * engraveCharPixelSize) + (engraveCharPixelSize / 2);
                        const worldY = startY - (r_font * engraveCharPixelSize) - (engraveCharPixelSize / 2);

                        const gridC = Math.floor((worldX + dimX / 2) / backingPixelActualWidth);
                        const gridR = Math.floor((dimY / 2 - worldY) / backingPixelActualHeight); 

                        if (gridR >= 0 && gridR < backingGridRows && gridC >= 0 && gridC < backingGridCols) {
                            backingGrid[gridR][gridC] = 0; 
                        }
                    }
                }
            }
        }
        currentX_engrave += (engraveCharWidth + charSpacing);
    }

    // Create backing plate with hole cutout
    for (let r_grid = 0; r_grid < backingGridRows; r_grid++) {
        for (let c_grid = 0; c_grid < backingGridCols; c_grid++) {
            if (backingGrid[r_grid][c_grid] === 1) {
                const pixelCenterX = (c_grid * backingPixelActualWidth + backingPixelActualWidth / 2) - (dimX / 2);
                const pixelCenterY = -((r_grid * backingPixelActualHeight + backingPixelActualHeight / 2) - (dimY / 2));
                
                // Skip pixels that are inside the mounting hole area
                if (holeD > 0 && actualHoleDepth > 0) {
                    const distanceFromCenter = Math.sqrt(pixelCenterX * pixelCenterX + pixelCenterY * pixelCenterY);
                    if (distanceFromCenter <= holeD / 2) {
                        continue; // Skip this pixel as it's inside the hole
                    }
                }
                
                const pixelGeo = new THREE.BoxGeometry(backingPixelActualWidth, backingPixelActualHeight, backingPlateThickness);
                pixelGeo.translate(pixelCenterX, pixelCenterY, backingPlateZOffset);
                backingPlatePartsGeos.push(pixelGeo);
            }
        }
    }
    
    if (backingPlatePartsGeos.length > 0) {
        const mergedBackingGeo = THREE.BufferGeometryUtils.mergeBufferGeometries(backingPlatePartsGeos);
        let backingMaterialToUse = (extrusionType === "negative") ? blackMaterial : whiteMaterial;
        markerObjectGroup.add(new THREE.Mesh(mergedBackingGeo, backingMaterialToUse));
    }
    
    scene.add(markerObjectGroup);
    return markerObjectGroup;
}

function initControls() {
    const dictSelect = document.querySelector('.setup select[name=dict]');
    const markerIdInput = document.querySelector('.setup input[name=id]');
    const dimXInput = document.querySelector('.setup input[name=dimX]');
    const dimYInput = document.querySelector('.setup input[name=dimY]');
    const z1Input = document.querySelector('.setup input[name=z1]');
    const z2Input = document.querySelector('.setup input[name=z2]');
    const holeDInput = document.querySelector('.setup input[name=holeD]');
    const holeDepthInput = document.querySelector('.setup input[name=holeDepth]');
    const saveButton = document.querySelector('.save-button');

    function updateMarker() {
        let markerIdNum = Number(markerIdInput.value); 
        const markerIdStr = markerIdInput.value; 
        const dimX = Number(dimXInput.value);
        const dimY = Number(dimYInput.value);
        const z1_base = Number(z1Input.value);
        const z2_feature = Number(z2Input.value);
        const holeD = Number(holeDInput.value);
        const holeDepth = Number(holeDepthInput.value);
        const extrusionType = document.querySelector('input[name="extrusion"]:checked').value;

        const option = dictSelect.options[dictSelect.selectedIndex];
        const dictName = option.value;
        const patternWidth = Number(option.getAttribute('data-width'));
        const patternHeight = Number(option.getAttribute('data-height'));
        
        let maxId = 0;
        if (dict && dict[dictName]) { maxId = dict[dictName].length - 1;
        } else if (option.getAttribute('data-number')) { maxId = Number(option.getAttribute('data-number')) - 1;
        } else { maxId = (dictName.includes("4x4"))?999:(dictName.includes("5x5"))?999:(dictName.includes("6x6_1000"))?999:(dictName.includes("7x7"))?999:(dictName==="mip_36h12")?249:(dictName==="april_16h5")?29:(dictName==="april_25h9")?34:(dictName==="april_36h10")?2319:(dictName==="april_36h11")?586:(dictName==="aruco")?1023:999; }
        markerIdInput.setAttribute('max', maxId);
        if (markerIdNum > maxId) { markerIdInput.value = maxId; markerIdNum = maxId; }
        if (markerIdNum < 0) { markerIdInput.value = 0; markerIdNum = 0; }
        
        if (dimX <= 0 || dimY <= 0 || z1_base <= 1e-5 || (extrusionType !== "flat" && z2_feature < 1e-5) ) {
             if (markerObjectGroup) scene.remove(markerObjectGroup);
             saveButton.removeAttribute('href'); saveButton.removeAttribute('download');
             document.querySelector('.marker-id').innerHTML = 'Dimensions must be positive & > 0.00001mm.'; return;
        }
        
        const z2_actual = (extrusionType === "flat") ? 1e-5 : z2_feature;

        loadDict.then(() => {
            if (dict && dict[dictName]) {
                maxId = dict[dictName].length - 1; markerIdInput.setAttribute('max', maxId);
                if (markerIdNum > maxId) { markerIdInput.value = maxId; markerIdNum = maxId; }
            } else {
                document.querySelector('.marker-id').innerHTML = `Dict '${dictName}' not found.`;
                if (markerObjectGroup) scene.remove(markerObjectGroup);
                saveButton.removeAttribute('href'); saveButton.removeAttribute('download'); return;
            }
            if (!dict[dictName][markerIdNum]) {
                if (markerObjectGroup) scene.remove(markerObjectGroup);
                saveButton.removeAttribute('href'); saveButton.removeAttribute('download');
                document.querySelector('.marker-id').innerHTML = `ID ${markerIdNum} not found in ${dictName}`; return;
            }

            const fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
            const currentMarkerMeshGroup = generateMarkerMesh(markerIdStr, fullPattern, dimX, dimY, z1_base, z2_actual, extrusionType, holeD, holeDepth);

            const exporter = new THREE.STLExporter();
            const stlString = exporter.parse(currentMarkerMeshGroup, { binary: false }); 

            saveButton.href = 'data:model/stl;base64,' + btoa(stlString);
            const totalZforFile = (extrusionType === "flat") ? z1_base : z1_base + z2_actual;
            const backingPlateThickness = 0.4; 
            const fileNameTotalZ = totalZforFile + backingPlateThickness;

            saveButton.download = `${dictName}-${markerIdNum}_${dimX}x${dimY}x${fileNameTotalZ.toFixed(2)}mm_${extrusionType}_engraved.stl`;
            document.querySelector('.marker-id').innerHTML = `ID ${markerIdNum} (${dictName}) - ${extrusionType}`;
        }).catch(err => {
            console.error("Error loading/processing dictionary:", err);
            document.querySelector('.marker-id').innerHTML = 'Error loading dictionary';
        });
    }

    dictSelect.addEventListener('change', updateMarker);
    markerIdInput.addEventListener('input', updateMarker);
    dimXInput.addEventListener('input', updateMarker);
    dimYInput.addEventListener('input', updateMarker);
    z1Input.addEventListener('input', updateMarker);
    z2Input.addEventListener('input', updateMarker);
    holeDInput.addEventListener('input', updateMarker);
    holeDepthInput.addEventListener('input', updateMarker);
    document.querySelectorAll('input[name="extrusion"]').forEach(radio => {
        radio.addEventListener('change', updateMarker);
    });
    loadDict.then(updateMarker).catch(err => { /* ... */ });
}

document.addEventListener('DOMContentLoaded', () => {
    initThree();
    initControls();
});