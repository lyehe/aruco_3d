import { scene } from './three-setup.js';
import { getArucoBitPattern, generateMarkerMesh, setDict as setArucoUtilDict } from './aruco-utils.js';
import { whiteMaterial, blackMaterial } from './config.js';

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

    // Border UI elements
    const enableBorderCheckbox = document.getElementById('frm-enable-border');
    const borderWidthField = document.getElementById('border-width-field');
    const borderWidthInput = document.getElementById('frm-border-width');
    const borderCornerField = document.getElementById('border-corner-field');
    // const borderCornerTypeRadios = document.querySelectorAll('input[name="borderCornerType"]'); // Read in updateMarker

    // Button selectors for the simplified set
    const saveWhiteStlButton = document.getElementById('save-white-stl-button');
    const saveBlackStlButton = document.getElementById('save-black-stl-button');
    const saveGlbButton = document.getElementById('save-glb-button'); // For full colored GLB

    // Set min for ID input to allow -1 and -2
    markerIdInput.setAttribute('min', '-2');

    function updateMarker() {
        const allActiveButtons = [saveWhiteStlButton, saveBlackStlButton, saveGlbButton];
        
        if (!dict && Number(markerIdInput.value) >= 0) { // Dictionary only needed for ArUco IDs
            console.warn("Dictionary not loaded yet for ArUco marker update");
            allActiveButtons.forEach(btn => { if(btn) btn.disabled = true; });
            return;
        }
        
        let markerIdNum = Number(markerIdInput.value);
        const dim = Number(dimInput.value);
        const z1_base = Number(z1Input.value);
        const z2_feature = Number(z2Input.value);
        const extrusionType = document.querySelector('input[name="extrusion"]:checked').value;
        const errorDisplay = document.querySelector('.marker-id');

        // Read border values
        const enableBorder = enableBorderCheckbox.checked;
        const borderWidth = Number(borderWidthInput.value);
        const borderCornerType = document.querySelector('input[name="borderCornerType"]:checked').value;

        // Validation: dim must be positive. At least one thickness (z1 or z2) must be positive for special markers.
        // For ArUco non-flat, z2 must be positive.
        let PURE_MARKER_MIN_THICKNESS = 0.1; // If both z1 and z2 are zero for pure, this will be the default in utils.
        let isValid = true;
        let errorMsg = '';

        if (dim <= 0) {
            isValid = false;
            errorMsg = 'Marker dimension (X/Y) must be positive.';
        } else if (enableBorder && borderWidth < 0.1) {
            isValid = false;
            errorMsg = 'Border width must be at least 0.1mm.';
        } else if (markerIdNum === -1 || markerIdNum === -2) { // Pure white or pure black
            if (z1_base < 0 || z2_feature < 0) {
                 isValid = false;
                 errorMsg = 'Base (z1) and Feature (z2) heights cannot be negative.';
            } else if (z1_base < 1e-5 && z2_feature < 1e-5) {
                // This case is handled by aruco-utils to create a 0.1mm plate, so it's valid from a generation POV.
                // UI will reflect 0.1mm total thickness.
            }
        } else { // ArUco marker (ID >= 0)
            if (z1_base < 0) {
                isValid = false;
                errorMsg = 'Base height (z1) must be non-negative for ArUco markers.';
            } else if (extrusionType !== "flat" && z2_feature < 1e-5) {
                isValid = false;
                errorMsg = 'Feature height (z2) must be positive for non-flat ArUco markers.';
            }
        }

        if (!isValid) {
            if (localMarkerObjectGroup) {
                scene.remove(localMarkerObjectGroup);
                localMarkerObjectGroup.traverse(child => { if (child.isMesh && child.geometry) child.geometry.dispose(); });
                localMarkerObjectGroup.clear();
            }
            allActiveButtons.forEach(btn => { if(btn) btn.disabled = true; });
            errorDisplay.innerHTML = errorMsg;
            return;
        }

        let fullPattern = null;
        let specialMarkerType = null;
        let uiMessage = '';
        let totalCalculatedZ = 0;

        const option = dictSelect.options[dictSelect.selectedIndex];
        const dictName = option.value;
        const patternWidth = Number(option.getAttribute('data-width'));
        const patternHeight = Number(option.getAttribute('data-height'));

        if (markerIdNum === -1 || markerIdNum === -2) { 
            specialMarkerType = markerIdNum === -1 ? 'pureWhite' : 'pureBlack';
            let c1 = Math.max(0, z1_base); 
            let c2_initial = Math.max(0, z2_feature); // User's requested z2
            let c2_final_geom = c2_initial; // Actual z2 used for geometry, may be zeroed out

            if (extrusionType === "flat") {
                // For flat special, total Z is based on c1 (min 0.1), c2 is ignored for geometry
                if (c1 < 1e-5) totalCalculatedZ = PURE_MARKER_MIN_THICKNESS;
                else totalCalculatedZ = c1;
                if (totalCalculatedZ < PURE_MARKER_MIN_THICKNESS) totalCalculatedZ = PURE_MARKER_MIN_THICKNESS;
                // c2_final_geom is effectively 0 for flat special in terms of *added* height
            } else { // positive or negative extrusion for special marker
                const baseIsWhite = (extrusionType === "positive");
                const featureIsWhite = (specialMarkerType === 'pureWhite');

                if ((baseIsWhite && featureIsWhite) || (!baseIsWhite && !featureIsWhite)) {
                    c2_final_geom = 0; // Suppress feature layer if colors match
                }

                if (c1 < 1e-5 && c2_final_geom < 1e-5) { // Both z1 and actual z2_geom are zero
                    totalCalculatedZ = PURE_MARKER_MIN_THICKNESS; // Default to 0.1mm total (will be just c1)
                } else {
                    totalCalculatedZ = c1 + c2_final_geom; // Sum of base and *actual* feature height
                }
            }
            const colorDesc = markerIdNum === -1 ? "Pure White" : "Pure Black";
            uiMessage = `${colorDesc} Block (${extrusionType}) - ${dim}x${dim}x${totalCalculatedZ.toFixed(2)}mm`;
        } else { 
            const maxId = (dict && dict[dictName]) ? (dict[dictName].length - 1) : Number(option.getAttribute('data-number')) -1 || 999;
            markerIdInput.setAttribute('max', maxId);
            if (markerIdNum < 0 || markerIdNum > maxId) {
                markerIdInput.value = Math.max(0, Math.min(markerIdNum, maxId));
                markerIdNum = Number(markerIdInput.value);
            }
            if (!dict[dictName] || !dict[dictName][markerIdNum]) {
                if (localMarkerObjectGroup) {
                    scene.remove(localMarkerObjectGroup);
                    localMarkerObjectGroup.traverse(child => { if (child.isMesh && child.geometry) child.geometry.dispose(); });
                    localMarkerObjectGroup.clear();
                }
                allActiveButtons.forEach(btn => { if(btn) btn.disabled = true; });
                errorDisplay.innerHTML = `ID ${markerIdNum} not found in ${dictName}`;
                return;
            }
            fullPattern = getArucoBitPattern(dictName, markerIdNum, patternWidth, patternHeight);
            const z2_actual_aruco = (extrusionType === "flat") ? 1e-5 : z2_feature;
            totalCalculatedZ = (extrusionType === "flat") ? Math.max(z1_base, 0.1) : z1_base + z2_actual_aruco;
            uiMessage = `ID ${markerIdNum} (${dictName}) - ${extrusionType} (${totalCalculatedZ.toFixed(2)}mm)`;
        }

        errorDisplay.innerHTML = ''; 
        allActiveButtons.forEach(btn => { if(btn) btn.disabled = false; });

        // Cleanup previous marker and border
        if (localMarkerObjectGroup) {
            scene.remove(localMarkerObjectGroup); // localMarkerObjectGroup might be finalMarkerWithBorderGroup
            localMarkerObjectGroup.traverse(child => { 
                if (child.isMesh && child.geometry) child.geometry.dispose();
                if (child.isGroup) { // Handle nested groups like the original marker or border group
                    child.traverse(subChild => {
                        if (subChild.isMesh && subChild.geometry) subChild.geometry.dispose();
                    });
                }
            });
            localMarkerObjectGroup.clear(); // Clear all children from the group
        }
        
        const coreMarkerGroup = generateMarkerMesh(fullPattern, dim, dim, z1_base, z2_feature, extrusionType, specialMarkerType);

        if (enableBorder && borderWidth > 0) {
            const finalMarkerWithBorderGroup = new THREE.Group();
            finalMarkerWithBorderGroup.add(coreMarkerGroup); // Add the original marker

            const borderGroup = new THREE.Group();
            const actual_border_base_thickness = Math.max(z1_base, 0.1); 
            const actual_border_base_z_offset = actual_border_base_thickness / 2; 

            let actual_border_feature_thickness = 0;
            // Feature layer for border only exists if z2_feature is significant AND it's not flat extrusion
            if (extrusionType !== 'flat' && z2_feature >= 1e-5) {
                actual_border_feature_thickness = Math.max(z2_feature, 0.1);
            }
            const actual_border_feature_z_offset = actual_border_base_thickness + actual_border_feature_thickness / 2;

            let borderBaseMaterial;
            let borderFeatureMaterial = null; // Default to no feature material

            if (extrusionType === 'negative') {
                borderBaseMaterial = blackMaterial;
                if (actual_border_feature_thickness > 0) borderFeatureMaterial = whiteMaterial; // White features on black base
            } else if (extrusionType === 'positive') {
                borderBaseMaterial = whiteMaterial;
                if (actual_border_feature_thickness > 0) borderFeatureMaterial = blackMaterial; // Black features on white base
            } else { // extrusionType === 'flat'
                borderBaseMaterial = whiteMaterial; // Flat border is primarily white
                // No feature layer for flat border, so borderFeatureMaterial remains null
            }

            const halfDim = dim / 2;
            const halfBorderWidth = borderWidth / 2;

            // --- Straight Border Segments ---
            const straightSegmentPositions = [
                { x: 0, y: halfDim + halfBorderWidth, w: dim, h: borderWidth }, // Top
                { x: 0, y: -halfDim - halfBorderWidth, w: dim, h: borderWidth },// Bottom
                { x: -halfDim - halfBorderWidth, y: 0, w: borderWidth, h: dim },// Left
                { x: halfDim + halfBorderWidth, y: 0, w: borderWidth, h: dim }  // Right
            ];

            for (const seg of straightSegmentPositions) {
                // Base part of the straight segment
                const baseGeo = new THREE.BoxGeometry(seg.w, seg.h, actual_border_base_thickness);
                baseGeo.translate(seg.x, seg.y, actual_border_base_z_offset);
                borderGroup.add(new THREE.Mesh(baseGeo, borderBaseMaterial));

                // Feature part of the straight segment (if applicable)
                let addFeatureToStraightSegment = borderFeatureMaterial && actual_border_feature_thickness > 0;
                if (extrusionType === 'positive' && (borderCornerType === 'opposite' || borderCornerType === 'same')) {
                    // For Positive extrusion:
                    // - If 'opposite' corners: straight segments are base only (feature appears on corners). This is correct.
                    // - If 'same' corners: straight segments are base only ("white (empty)"). This is the fix.
                    addFeatureToStraightSegment = false;
                }
                // For Negative extrusion, straight segments get their feature if defined (borderFeatureMaterial will be white).
                // For Flat extrusion, borderFeatureMaterial is null, so no feature added here.

                if (addFeatureToStraightSegment) {
                    const featureGeo = new THREE.BoxGeometry(seg.w, seg.h, actual_border_feature_thickness);
                    featureGeo.translate(seg.x, seg.y, actual_border_feature_z_offset);
                    borderGroup.add(new THREE.Mesh(featureGeo, borderFeatureMaterial));
                }
            }

            // --- Corner Pieces ---
            const cornerPositions = [
                {x: -halfDim - halfBorderWidth, y: halfDim + halfBorderWidth}, // Top-Left
                {x: halfDim + halfBorderWidth,  y: halfDim + halfBorderWidth}, // Top-Right
                {x: -halfDim - halfBorderWidth, y: -halfDim - halfBorderWidth},// Bottom-Left
                {x: halfDim + halfBorderWidth,  y: -halfDim - halfBorderWidth} // Bottom-Right
            ];
            
            for (const pos of cornerPositions) {
                if (borderCornerType === 'same') {
                    // Corner base part (same material as straight border base)
                    const cornerBaseGeo = new THREE.BoxGeometry(borderWidth, borderWidth, actual_border_base_thickness);
                    cornerBaseGeo.translate(pos.x, pos.y, actual_border_base_z_offset);
                    borderGroup.add(new THREE.Mesh(cornerBaseGeo, borderBaseMaterial));

                    // Corner feature part (if applicable)
                    let addFeatureToCorner = borderFeatureMaterial && actual_border_feature_thickness > 0;
                    if (extrusionType === 'positive') {
                        // For Positive extrusion with 'same' corners, they should be "white (empty)" (no black feature).
                        addFeatureToCorner = false;
                    }
                    // For Negative extrusion with 'same' corners, they get their feature (white feature on black base).
                    // For Flat extrusion, borderFeatureMaterial is null, so no feature added here.
                    
                    if (addFeatureToCorner) {
                        const cornerFeatureGeo = new THREE.BoxGeometry(borderWidth, borderWidth, actual_border_feature_thickness);
                        cornerFeatureGeo.translate(pos.x, pos.y, actual_border_feature_z_offset);
                        borderGroup.add(new THREE.Mesh(cornerFeatureGeo, borderFeatureMaterial));
                    }
                } else { // borderCornerType === 'opposite'
                    if (extrusionType === 'flat') {
                        // Flat opposite corner: single layer, material is opposite of the flat border's base (which is white)
                        const flatOppositeCornerMaterial = blackMaterial; // Flat border is white, so opposite is black
                        const cornerGeo = new THREE.BoxGeometry(borderWidth, borderWidth, actual_border_base_thickness);
                        cornerGeo.translate(pos.x, pos.y, actual_border_base_z_offset);
                        borderGroup.add(new THREE.Mesh(cornerGeo, flatOppositeCornerMaterial));
                    } else if (extrusionType === 'positive') {
                        // Positive extrusion, opposite corners: White base AND Black feature on top
                        const cornerBaseGeo = new THREE.BoxGeometry(borderWidth, borderWidth, actual_border_base_thickness);
                        cornerBaseGeo.translate(pos.x, pos.y, actual_border_base_z_offset);
                        borderGroup.add(new THREE.Mesh(cornerBaseGeo, borderBaseMaterial)); // whiteMaterial for positive

                        if (borderFeatureMaterial && actual_border_feature_thickness > 0) { // blackMaterial for positive
                            const cornerFeatureGeo = new THREE.BoxGeometry(borderWidth, borderWidth, actual_border_feature_thickness);
                            cornerFeatureGeo.translate(pos.x, pos.y, actual_border_feature_z_offset);
                            borderGroup.add(new THREE.Mesh(cornerFeatureGeo, borderFeatureMaterial));
                        }
                    } else { // 'negative' extrusion - "empty top showing the base"
                        // Only the base part of the corner is created, using the borderBaseMaterial.
                        // No feature part is added on top, showing the base material as the top surface.
                        const cornerBaseGeo = new THREE.BoxGeometry(borderWidth, borderWidth, actual_border_base_thickness);
                        cornerBaseGeo.translate(pos.x, pos.y, actual_border_base_z_offset);
                        borderGroup.add(new THREE.Mesh(cornerBaseGeo, borderBaseMaterial)); // blackMaterial for negative
                    }
                }
            }
            finalMarkerWithBorderGroup.add(borderGroup);
            localMarkerObjectGroup = finalMarkerWithBorderGroup;
        } else {
            localMarkerObjectGroup = coreMarkerGroup; // No border, just the marker itself
        }
        
        scene.add(localMarkerObjectGroup);
        document.querySelector('.marker-id').innerHTML = uiMessage;
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

    function getSingleMarkerBaseFilename() {
        const dim = Number(dimInput.value);
        const z1_base_val = Number(z1Input.value);
        const z2_feature_val = Number(z2Input.value);
        const extrusionType = document.querySelector('input[name="extrusion"]:checked').value;
        let markerIdNum = Number(markerIdInput.value);
        const dictName = dictSelect.options[dictSelect.selectedIndex].value;
        let PURE_MARKER_MIN_THICKNESS = 0.1;

        let idPart;
        let totalZ;

        if (markerIdNum === -1 || markerIdNum === -2) {
            idPart = markerIdNum === -1 ? 'PUREWHITE' : 'PUREBLACK';
            let c1 = Math.max(0, z1_base_val);
            let c2_initial = Math.max(0, z2_feature_val);
            let c2_final_geom = c2_initial;

            if (extrusionType === "flat") {
                if (c1 < 1e-5) totalZ = PURE_MARKER_MIN_THICKNESS;
                else totalZ = c1;
                if (totalZ < PURE_MARKER_MIN_THICKNESS) totalZ = PURE_MARKER_MIN_THICKNESS;
            } else { // positive or negative extrusion for special marker
                const baseIsWhite = (extrusionType === "positive");
                const featureIsWhite = (markerIdNum === -1); // -1 is pureWhite

                if ((baseIsWhite && featureIsWhite) || (!baseIsWhite && !featureIsWhite)) {
                    c2_final_geom = 0; // Suppress feature layer if colors match
                }

                if (c1 < 1e-5 && c2_final_geom < 1e-5) { 
                    totalZ = PURE_MARKER_MIN_THICKNESS; 
                } else {
                    totalZ = c1 + c2_final_geom; 
                }
            }
        } else {
            idPart = markerIdNum;
            const z2_actual_aruco = (extrusionType === "flat") ? 1e-5 : z2_feature_val;
            totalZ = (extrusionType === "flat") ? Math.max(z1_base_val, 0.1) : z1_base_val + z2_actual_aruco;
        }
        
        let baseName = `${dictName}-${idPart}_${dim}x${dim}x${totalZ.toFixed(2)}mm_${extrusionType}`;

        const enableBorder = document.getElementById('frm-enable-border').checked;
        if (enableBorder) {
            const borderWidth = Number(document.getElementById('frm-border-width').value);
            if (borderWidth > 0) {
                baseName += `_border${borderWidth.toFixed(1)}mm`;
            }
        }
        return baseName;
    }

    // exportGLB exports the full colored model
    function exportGLB() {
        if (!localMarkerObjectGroup || localMarkerObjectGroup.children.length === 0) {
            console.warn("No marker generated to export for GLB.");
            return;
        }
        localMarkerObjectGroup.updateMatrixWorld(true);
        const exporter = new THREE.GLTFExporter();
        exporter.parse(localMarkerObjectGroup, function (result) {
            const blob = new Blob([result], { type: 'model/gltf-binary' });
            const fileName = getSingleMarkerBaseFilename() + '.glb';
            triggerDownload(blob, fileName);
        }, { binary: true });
    }

    function getColoredElementsGroup(mainGroup, targetMaterial) {
        const coloredGroup = new THREE.Group();
        if (!mainGroup) return coloredGroup;

        mainGroup.children.forEach(childGroup => {
            // ChildGroup could be the coreMarkerGroup or the borderGroup,
            // or if no border, mainGroup itself is the coreMarkerGroup which contains meshes directly.
            if (childGroup.isGroup) {
                childGroup.children.forEach(mesh => {
                    if (mesh.isMesh && mesh.material === targetMaterial) {
                        const clonedMesh = new THREE.Mesh(mesh.geometry.clone(), mesh.material);
                        // Assuming these meshes within sub-groups are positioned correctly relative to mainGroup's origin
                        // For deeper nesting or more complex transforms, applyMatrix4(mesh.matrixWorld) might be needed
                        // after ensuring world matrices are updated for 'mesh'.
                        // For now, simple add is used as border parts and core marker parts are directly in their respective groups.
                        clonedMesh.position.copy(mesh.position);
                        clonedMesh.quaternion.copy(mesh.quaternion);
                        clonedMesh.scale.copy(mesh.scale);
                        coloredGroup.add(clonedMesh);
                    }
                });
            } else if (childGroup.isMesh) { // Case where mainGroup is coreMarkerGroup (no border)
                if (childGroup.material === targetMaterial) {
                    const clonedMesh = new THREE.Mesh(childGroup.geometry.clone(), childGroup.material);
                    clonedMesh.position.copy(childGroup.position);
                    clonedMesh.quaternion.copy(childGroup.quaternion);
                    clonedMesh.scale.copy(childGroup.scale);
                    coloredGroup.add(clonedMesh);
                }
            }
        });

        if (coloredGroup.children.length > 0) {
            coloredGroup.updateMatrixWorld(true); 
        }
        return coloredGroup;
    }

    // exportSTLColor for white/black STL export
    function exportSTLColor(colorName) {
        if (!localMarkerObjectGroup || localMarkerObjectGroup.children.length === 0) {
            console.warn("No marker to process for STL color export.");
            return;
        }
        localMarkerObjectGroup.updateMatrixWorld(true); 
        const targetMaterial = colorName === 'white' ? whiteMaterial : blackMaterial;
        const colorGroup = getColoredElementsGroup(localMarkerObjectGroup, targetMaterial);
        if (colorGroup.children.length > 0) {
            const exporter = new THREE.STLExporter();
            const stlString = exporter.parse(colorGroup, { binary: false });
            const baseFilename = getSingleMarkerBaseFilename(); // Uses updated base filename
            triggerDownload(new Blob([stlString], { type: 'model/stl' }), `${baseFilename}_${colorName}.stl`);
        } else {
            alert(`No ${colorName} elements found to export for STL.`);
            console.warn(`No ${colorName} elements to export for STL.`);
        }
    }

    // Event listeners for the simplified button set
    if (saveWhiteStlButton) saveWhiteStlButton.addEventListener('click', () => exportSTLColor('white'));
    if (saveBlackStlButton) saveBlackStlButton.addEventListener('click', () => exportSTLColor('black'));
    if (saveGlbButton) saveGlbButton.addEventListener('click', exportGLB);

    dictSelect.addEventListener('change', updateMarker);
    markerIdInput.addEventListener('input', updateMarker);
    dimInput.addEventListener('input', updateMarker);
    z1Input.addEventListener('input', updateMarker);
    z2Input.addEventListener('input', updateMarker);
    document.querySelectorAll('input[name="extrusion"]').forEach(radio => {
        radio.addEventListener('change', updateMarker);
    });

    // Border UI event listeners
    enableBorderCheckbox.addEventListener('change', () => {
        borderWidthField.style.display = enableBorderCheckbox.checked ? 'block' : 'none';
        borderCornerField.style.display = enableBorderCheckbox.checked ? 'block' : 'none';
        updateMarker();
    });
    borderWidthInput.addEventListener('input', updateMarker);
    document.querySelectorAll('input[name="borderCornerType"]').forEach(radio => {
        radio.addEventListener('change', updateMarker);
    });

    loadDictPromise.then(() => {
        updateMarker();
    }).catch(err => {
        console.error("Error in initial marker update based on dictionary load:", err);
        const allActiveButtons = [saveWhiteStlButton, saveBlackStlButton, saveGlbButton];
        allActiveButtons.forEach(btn => { if(btn) btn.disabled = true; });
        document.querySelector('.marker-id').innerHTML = 'Error during initial setup.';
    });
} 