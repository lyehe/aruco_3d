import { scene } from './three-setup.js';
import { getArucoBitPattern, generateMarkerMesh, setDict as setArucoUtilDict } from './aruco-utils.js';

let dict;
let localMarkerObjectGroup;

export function setDict(dictionaryData) {
    dict = dictionaryData;
    setArucoUtilDict(dictionaryData);
}

export function initControls(loadDictPromise) {
    const dictSelect = document.querySelector('.setup select[name=dict]');
    const markerIdInput = document.querySelector('.setup input[name=id]');
    const dimInput = document.querySelector('.setup input[name=dim]');
    const z1Input = document.querySelector('.setup input[name=z1]');
    const z2Input = document.querySelector('.setup input[name=z2]');
    const saveStlButton = document.getElementById('save-stl-button');
    const saveGlbButton = document.getElementById('save-glb-button');

    function updateMarker() {
        if (!dict) {
            console.warn("Dictionary not loaded yet for updateMarker");
            if (saveStlButton) saveStlButton.disabled = true;
            if (saveGlbButton) saveGlbButton.disabled = true;
            return;
        }
        let markerIdNum = Number(markerIdInput.value);
        const dim = Number(dimInput.value);
        const z1_base = Number(z1Input.value);
        const z2_feature = Number(z2Input.value);
        const extrusionType = document.querySelector('input[name="extrusion"]:checked').value;

        const option = dictSelect.options[dictSelect.selectedIndex];
        const dictName = option.value;
        const patternWidth = Number(option.getAttribute('data-width'));
        const patternHeight = Number(option.getAttribute('data-height'));

        const errorDisplay = document.querySelector('.marker-id');
        if (dim <= 0 || z1_base < 0 || (extrusionType !== "flat" && z2_feature < 1e-5) || (extrusionType === "flat" && z1_base <0)) {
            if (localMarkerObjectGroup) {
                scene.remove(localMarkerObjectGroup);
                localMarkerObjectGroup.traverse(child => { if (child.isMesh && child.geometry) child.geometry.dispose(); });
                localMarkerObjectGroup.clear();
            }
            if (saveStlButton) saveStlButton.disabled = true;
            if (saveGlbButton) saveGlbButton.disabled = true;
            errorDisplay.innerHTML = 'Dimensions must be positive. Base height (z1) can be 0 for flat markers.'; 
            return;
        }

        const z2_actual = (extrusionType === "flat") ? 1e-5 : z2_feature;

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

        if (!dict[dictName] || !dict[dictName][markerIdNum]) {
             if (localMarkerObjectGroup) {
                scene.remove(localMarkerObjectGroup);
                localMarkerObjectGroup.traverse(child => { if (child.isMesh && child.geometry) child.geometry.dispose(); });
                localMarkerObjectGroup.clear();
            }
            if (saveStlButton) saveStlButton.disabled = true;
            if (saveGlbButton) saveGlbButton.disabled = true;
            errorDisplay.innerHTML = `ID ${markerIdNum} not found in ${dictName}`;
            return;
        }

        errorDisplay.innerHTML = ''; // Clear previous errors
        if (saveStlButton) saveStlButton.disabled = false;
        if (saveGlbButton) saveGlbButton.disabled = false;

        const fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
        if (localMarkerObjectGroup) {
            scene.remove(localMarkerObjectGroup);
            localMarkerObjectGroup.traverse(child => { if (child.isMesh && child.geometry) child.geometry.dispose(); });
            localMarkerObjectGroup.clear();
        }
        localMarkerObjectGroup = generateMarkerMesh(fullPattern, dim, dim, z1_base, z2_actual, extrusionType);
        scene.add(localMarkerObjectGroup);

        // Update UI text (moved from export functions as it's general)
        let currentFileNameTotalZ;
        if (extrusionType === "flat") {
            currentFileNameTotalZ = Math.max(z1_base, 0.1);
        } else {
            currentFileNameTotalZ = z1_base + z2_actual;
        }
        document.querySelector('.marker-id').innerHTML = `ID ${markerIdNum} (${dictName}) - ${extrusionType} (${currentFileNameTotalZ.toFixed(2)}mm)`;
    }

    function triggerDownload(blob, filename) {
        const link = document.createElement('a');
        link.style.display = 'none';
        document.body.appendChild(link);
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
        document.body.removeChild(link);
    }

    function exportSTL() {
        if (!localMarkerObjectGroup || localMarkerObjectGroup.children.length === 0) return;
        localMarkerObjectGroup.updateMatrixWorld(true);
        const exporter = new THREE.STLExporter();
        const stlString = exporter.parse(localMarkerObjectGroup, { binary: false });
        const blob = new Blob([stlString], { type: 'model/stl' });
        
        const dim = Number(dimInput.value);
        const z1_base = Number(z1Input.value);
        const z2_feature = Number(z2Input.value);
        const extrusionType = document.querySelector('input[name="extrusion"]:checked').value;
        const markerIdNum = Number(markerIdInput.value);
        const dictName = dictSelect.options[dictSelect.selectedIndex].value;
        const z2_actual = (extrusionType === "flat") ? 1e-5 : z2_feature;
        let fileNameTotalZ = (extrusionType === "flat") ? Math.max(z1_base, 0.1) : z1_base + z2_actual;
        const fileName = `${dictName}-${markerIdNum}_${dim}x${dim}x${fileNameTotalZ.toFixed(2)}mm_${extrusionType}.stl`;
        triggerDownload(blob, fileName);
    }

    function exportGLB() {
        if (!localMarkerObjectGroup || localMarkerObjectGroup.children.length === 0) return;
        localMarkerObjectGroup.updateMatrixWorld(true);
        const exporter = new THREE.GLTFExporter();
        exporter.parse(localMarkerObjectGroup, function (result) {
            const blob = new Blob([result], { type: 'model/gltf-binary' });
            const dim = Number(dimInput.value);
            const z1_base = Number(z1Input.value);
            const z2_feature = Number(z2Input.value);
            const extrusionType = document.querySelector('input[name="extrusion"]:checked').value;
            const markerIdNum = Number(markerIdInput.value);
            const dictName = dictSelect.options[dictSelect.selectedIndex].value;
            const z2_actual = (extrusionType === "flat") ? 1e-5 : z2_feature;
            let fileNameTotalZ = (extrusionType === "flat") ? Math.max(z1_base, 0.1) : z1_base + z2_actual;
            const fileName = `${dictName}-${markerIdNum}_${dim}x${dim}x${fileNameTotalZ.toFixed(2)}mm_${extrusionType}.glb`;
            triggerDownload(blob, fileName);
        }, { binary: true });
    }

    if (saveStlButton) saveStlButton.addEventListener('click', exportSTL);
    if (saveGlbButton) saveGlbButton.addEventListener('click', exportGLB);

    dictSelect.addEventListener('change', updateMarker);
    markerIdInput.addEventListener('input', updateMarker);
    dimInput.addEventListener('input', updateMarker);
    z1Input.addEventListener('input', updateMarker);
    z2Input.addEventListener('input', updateMarker);
    document.querySelectorAll('input[name="extrusion"]').forEach(radio => {
        radio.addEventListener('change', updateMarker);
    });

    loadDictPromise.then(() => {
        updateMarker();
    }).catch(err => {
        console.error("Error in initial marker update based on dictionary load:", err);
        if (saveStlButton) saveStlButton.disabled = true;
        if (saveGlbButton) saveGlbButton.disabled = true;
        document.querySelector('.marker-id').innerHTML = 'Error during initial setup.';
    });
} 