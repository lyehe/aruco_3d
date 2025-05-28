export let scene, camera, renderer, controls;

export function initThree() {
    const previewDiv = document.getElementById('stl-preview');
    const width = previewDiv.clientWidth;
    const height = previewDiv.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x707070);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(60, 60, 120);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    previewDiv.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.7);
    directionalLight.position.set(70, 120, 100);
    scene.add(directionalLight);

    const bottomLight = new THREE.DirectionalLight(0xffffff, 0.2);
    bottomLight.position.set(0, -30, -50);
    scene.add(bottomLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 1.1);
    rimLight.position.set(-60, 40, -70);
    scene.add(rimLight);

    // Add a 3D coordinate axes helper
    const axesHelper = new THREE.AxesHelper(60); // Increased size
    scene.add(axesHelper);

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