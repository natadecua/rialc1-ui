import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const POINT_LIMIT = 50000; // Mirrors server-side cap

const canvas = document.getElementById('viewerCanvas');
const loadBtn = document.getElementById('loadBtn');
const resetBtn = document.getElementById('resetBtn');
const treeIdInput = document.getElementById('treeIdInput');
const statusMessage = document.getElementById('statusMessage');

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let ambientLight = null;
let headLight = null;

let animationFrameId = null;
let activePoints = null;
let activeBoundingSphere = null;
let lastLoadedTreeId = null;

function setStatus(message, { isError = false } = {}) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? '#f87171' : '#cbd5f5';
}

function handleWebGLFailure(reason) {
  const friendlyReason = reason?.message || reason?.statusMessage || String(reason || 'Unknown');
  console.error('WebGL context creation failed:', friendlyReason);
  disableViewer(
    'Unable to create a WebGL context. Try a desktop browser with hardware acceleration enabled.'
  );
}

function disableViewer(message) {
  setStatus(message, { isError: true });
  loadBtn.disabled = true;
  resetBtn.disabled = true;
  treeIdInput.disabled = true;
}

function checkWebGLSupport() {
  try {
    const testCanvas = document.createElement('canvas');
    const context =
      testCanvas.getContext('webgl2') ||
      testCanvas.getContext('webgl') ||
      testCanvas.getContext('experimental-webgl');

    if (context && typeof context.getExtension === 'function') {
      const loseContext = context.getExtension('WEBGL_lose_context');
      if (loseContext && typeof loseContext.loseContext === 'function') {
        loseContext.loseContext();
      }
    }

    return Boolean(context);
  } catch (error) {
    console.error('WebGL capability probe failed:', error);
    return false;
  }
}

const webglAvailable = checkWebGLSupport();

if (webglAvailable) {
  const onContextError = (event) => {
    canvas.removeEventListener('webglcontextcreationerror', onContextError);
    handleWebGLFailure(event);
  };

  canvas.addEventListener('webglcontextcreationerror', onContextError, { once: true });

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(new THREE.Color('#0f172a'), 1);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#020617', 0.0008);

    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  camera.up.set(0, 0, 1);
    scene.add(camera);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.screenSpacePanning = false;
    controls.enablePan = false;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.rotateSpeed = 0.85;
    controls.zoomSpeed = 0.95;
    controls.enableKeys = false;
    controls.minPolarAngle = Math.PI * 0.02;
    controls.maxPolarAngle = Math.PI - Math.PI * 0.02;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controls.minDistance = 1;
    controls.maxDistance = 800;

    ambientLight = new THREE.AmbientLight('#38bdf8', 0.45);
    scene.add(ambientLight);
    headLight = new THREE.DirectionalLight('#60a5fa', 0.75);
    headLight.position.set(1, 1.2, 1.5);
    scene.add(headLight);

    canvas.removeEventListener('webglcontextcreationerror', onContextError);
  } catch (error) {
    handleWebGLFailure(error);
    renderer = null;
    scene = null;
    camera = null;
    controls = null;
  }
} else {
  console.error('WebGL context could not be created; viewer disabled.');
  disableViewer(
    'Unable to create a WebGL context. Enable hardware acceleration or try a different browser.'
  );
}

if (!renderer) {
  disableViewer(
    'Unable to create a WebGL context. Enable hardware acceleration or try a different browser.'
  );
}

function resizeRenderer() {
  if (!renderer || !camera) {
    return;
  }

  const bounds = canvas.getBoundingClientRect();
  let width = Math.floor(bounds.width);
  let height = Math.floor(bounds.height);

  if (width <= 0) {
    width = Math.max(canvas.clientWidth, window.innerWidth || 1);
  }

  if (height <= 0) {
    const fallback = window.innerHeight - canvas.getBoundingClientRect().top;
    height = Math.max(canvas.clientHeight, fallback, 600);
  }

  renderer.setSize(width, height, false);
  camera.aspect = width / height || 1;
  camera.updateProjectionMatrix();
}

function animate() {
  if (!renderer || !scene || !camera || !controls) {
    return;
  }

  animationFrameId = requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function stopAnimation() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function mapIntensityToColor(intensity, min, max) {
  if (!Number.isFinite(intensity)) {
    return { r: 0.17, g: 0.64, b: 0.92 };
  }

  const clamped = Math.max(min, Math.min(max, intensity));
  const t = max - min === 0 ? 0.5 : (clamped - min) / (max - min);

  // Simple plasma-like gradient: purple -> blue -> teal -> lime -> yellow
  const segment = Math.floor(t * 4);
  const localT = t * 4 - segment;

  switch (segment) {
    case 0: // purple to blue
      return {
        r: 0.24 + (0.15 - 0.24) * localT,
        g: 0.08 + (0.18 - 0.08) * localT,
        b: 0.4 + (0.72 - 0.4) * localT,
      };
    case 1: // blue to teal
      return {
        r: 0.15 + (0.07 - 0.15) * localT,
        g: 0.18 + (0.65 - 0.18) * localT,
        b: 0.72 + (0.62 - 0.72) * localT,
      };
    case 2: // teal to lime
      return {
        r: 0.07 + (0.36 - 0.07) * localT,
        g: 0.65 + (0.82 - 0.65) * localT,
        b: 0.62 + (0.28 - 0.62) * localT,
      };
    default: // lime to yellow
      return {
        r: 0.36 + (0.93 - 0.36) * localT,
        g: 0.82 + (0.9 - 0.82) * localT,
        b: 0.28 + (0.19 - 0.28) * localT,
      };
  }
}

function disposeActivePoints() {
  if (!scene) {
    return;
  }

  if (activePoints) {
    scene.remove(activePoints);
    if (activePoints.geometry) {
      activePoints.geometry.dispose();
    }
    if (activePoints.material) {
      activePoints.material.dispose();
    }
    activePoints = null;
  }
}

function recenterCamera() {
  if (!controls || !camera) {
    return;
  }

  if (!activeBoundingSphere) {
    return;
  }

  const center = activeBoundingSphere.center;
  const radius = Math.max(activeBoundingSphere.radius, 1);
  controls.target.copy(center);

  const offset = radius * 2.6;
  camera.position.set(center.x + offset, center.y, center.z + radius * 0.1);
  camera.near = Math.max(0.01, radius / 120);
  camera.far = radius * 20;
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
  controls.update();
}

async function loadTree(treeId) {
  if (!renderer || !scene || !camera || !controls) {
    setStatus('WebGL context unavailable. Cannot load point clouds in this environment.', {
      isError: true,
    });
    return;
  }

  if (!treeId) {
    setStatus('Please enter a valid tree ID.', { isError: true });
    return;
  }

  if (treeId === lastLoadedTreeId) {
    setStatus(`Tree ${treeId} is already displayed.`);
    return;
  }

  try {
    setStatus(`Loading tree ${treeId}…`);
    const response = await fetch(
      `/api/trees/${encodeURIComponent(treeId)}/pointcloud?limit=${POINT_LIMIT}`
    );
    if (!response.ok) {
      let message = `Failed to load tree ${treeId}.`;
      try {
        const payload = await response.json();
        if (payload?.error) {
          message = payload.error;
        }
      } catch (parseError) {
        // ignore parsing issue
      }
      setStatus(message, { isError: true });
      return;
    }

    const payload = await response.json();
    const usablePoints = Array.isArray(payload.points)
      ? payload.points.filter(
          (point) => point && Number.isFinite(point.y) && Number.isFinite(point.z)
        )
      : [];

    if (usablePoints.length === 0) {
      setStatus(`No usable point records found for tree ${treeId}.`, { isError: true });
      return;
    }

    disposeActivePoints();

    const positions = new Float32Array(usablePoints.length * 3);
    const colors = new Float32Array(usablePoints.length * 3);

    let minIntensity = Number.POSITIVE_INFINITY;
    let maxIntensity = Number.NEGATIVE_INFINITY;
    usablePoints.forEach((point) => {
      if (Number.isFinite(point.intensity)) {
        minIntensity = Math.min(minIntensity, point.intensity);
        maxIntensity = Math.max(maxIntensity, point.intensity);
      }
    });

    if (!Number.isFinite(minIntensity) || !Number.isFinite(maxIntensity)) {
      minIntensity = 0;
      maxIntensity = 1;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    usablePoints.forEach((point, index) => {
      const baseIndex = index * 3;
      const x = Number.isFinite(point.x) ? point.x : 0;
      const y = point.y;
      const z = point.z;

      positions[baseIndex] = x;
      positions[baseIndex + 1] = y;
      positions[baseIndex + 2] = z;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);

      const { r, g, b } = mapIntensityToColor(point.intensity, minIntensity, maxIntensity);
      colors[baseIndex] = r;
      colors[baseIndex + 1] = g;
      colors[baseIndex + 2] = b;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const boundingBox = geometry.boundingBox;
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);

    const translation = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
    geometry.applyMatrix4(translation);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    activeBoundingSphere = geometry.boundingSphere.clone();

    const material = new THREE.PointsMaterial({
      size: Math.max(activeBoundingSphere.radius / 275, 0.12),
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });

    activePoints = new THREE.Points(geometry, material);
    scene.add(activePoints);

    recenterCamera();

    const deltaX = maxX - minX;
    const deltaY = maxY - minY;
    const deltaZ = maxZ - minZ;
    const extent = Math.max(deltaX, deltaY, deltaZ);

    const totalPoints = Number.isFinite(payload.totalPoints)
      ? payload.totalPoints
      : usablePoints.length;
    const showingPoints = payload.sampledPoints ?? usablePoints.length;

    setStatus(
      `Tree ${treeId}: showing ${showingPoints.toLocaleString()} of ${totalPoints.toLocaleString()} points. Range ≈ ${extent.toFixed(2)} units.`
    );

    lastLoadedTreeId = treeId;

    if (history.replaceState) {
      const params = new URLSearchParams(window.location.search);
      params.set('treeId', treeId);
      history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    }
  } catch (error) {
    console.error('Tree load failure:', error);
    setStatus(`Unexpected error loading tree ${treeId}. See console for details.`, {
      isError: true,
    });
  }
}

function resetView() {
  if (!renderer || !controls || !camera) {
    return;
  }

  recenterCamera();
}

loadBtn.addEventListener('click', () => {
  const treeId = treeIdInput.value ? treeIdInput.value.trim() : null;
  loadTree(treeId);
});

resetBtn.addEventListener('click', resetView);

treeIdInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadBtn.click();
  }
});

window.addEventListener('resize', () => {
  resizeRenderer();
  recenterCamera();
});

resizeRenderer();
stopAnimation();
animate();

const initialParams = new URLSearchParams(window.location.search);
const initialTreeId = initialParams.get('treeId');

if (initialTreeId) {
  treeIdInput.value = initialTreeId;
  loadTree(initialTreeId);
} else {
  treeIdInput.focus();
}
