import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const DEFAULT_POINT_LIMIT = 50000;
const DEFAULT_STATUS_MESSAGE = 'Select a tree to view its 3D point cloud.';
const SCALE_TRACK_WIDTH = 140;

let modalElement = null;
let closeButton = null;
let dismissButton = null;
let statusElement = null;
let viewerElement = null;
let canvasElement = null;
let titleElement = null;
let isModalOpen = false;
let lastFocusedElement = null;
let keydownHandler = null;

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let ambientLight = null;
let headLight = null;
let activePoints = null;
let activeBoundingSphere = null;
let animationFrameId = null;
let isRendering = false;
let resizeObserver = null;
let windowResizeHandler = null;
let webglFailure = null;
let currentLoadToken = 0;
let legendContainer = null;
let legendMinLabel = null;
let legendMaxLabel = null;
let legendCaption = null;
let scaleContainer = null;
let scaleTrack = null;
let scaleBarFill = null;
let scaleLabel = null;
let gridHelper = null;

function getFocusableElements(container) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
      return false;
    }

    if (element.getAttribute('tabindex') === '-1') {
      return false;
    }

    if (element.offsetParent === null && element !== document.activeElement) {
      return false;
    }

    return true;
  });
}

function focusTrapHandler(event) {
  if (!isModalOpen || !modalElement) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
    return;
  }

  if (event.key !== 'Tab') {
    return;
  }

  const focusable = getFocusableElements(modalElement);
  if (focusable.length === 0) {
    event.preventDefault();
    modalElement.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey) {
    if (document.activeElement === first || document.activeElement === modalElement) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function activateFocusTrap() {
  if (!modalElement) {
    return;
  }

  keydownHandler = focusTrapHandler;
  modalElement.addEventListener('keydown', keydownHandler);

  const focusable = getFocusableElements(modalElement);
  (focusable[0] ?? modalElement).focus();
}

function deactivateFocusTrap() {
  if (!modalElement || !keydownHandler) {
    return;
  }

  modalElement.removeEventListener('keydown', keydownHandler);
  keydownHandler = null;
}

function setStatus(message, { isError = false, isLoading = false } = {}) {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  statusElement.classList.toggle('is-error', isError);
  statusElement.classList.toggle('is-loading', isLoading);
  statusElement.setAttribute('aria-busy', isLoading ? 'true' : 'false');
}

function setupOverlayElements() {
  if (!viewerElement) {
    return;
  }

  if (!legendContainer) {
    legendContainer = document.createElement('div');
    legendContainer.className = 'pointcloud-overlay pointcloud-legend';
    legendContainer.hidden = true;

    const title = document.createElement('span');
    title.className = 'pointcloud-legend__title';
    title.textContent = "intensity";

    const scaleWrapper = document.createElement('div');
    scaleWrapper.className = 'pointcloud-legend__scale';

    legendMaxLabel = document.createElement('span');
    legendMaxLabel.className = 'pointcloud-legend__value pointcloud-legend__value--max';
    legendMaxLabel.textContent = '—';

    const bar = document.createElement('div');
    bar.className = 'pointcloud-legend__bar';

    legendMinLabel = document.createElement('span');
    legendMinLabel.className = 'pointcloud-legend__value pointcloud-legend__value--min';
    legendMinLabel.textContent = '—';

    scaleWrapper.append(legendMaxLabel, bar, legendMinLabel);

    legendCaption = document.createElement('span');
    legendCaption.className = 'pointcloud-legend__caption';
    legendCaption.textContent = 'Color ramp: low (bottom) → high (top) intensity';

    legendContainer.append(title, scaleWrapper);
  }

  if (!legendContainer.parentElement) {
    if (statusElement && statusElement.parentElement === viewerElement) {
      viewerElement.insertBefore(legendContainer, statusElement);
    } else {
      viewerElement.appendChild(legendContainer);
    }
  }

  if (!scaleContainer) {
    scaleContainer = document.createElement('div');
    scaleContainer.className = 'pointcloud-overlay pointcloud-scale';
    scaleContainer.hidden = true;

    scaleTrack = document.createElement('div');
    scaleTrack.className = 'pointcloud-scale__track';
  scaleTrack.style.width = `${SCALE_TRACK_WIDTH}px`;

    scaleBarFill = document.createElement('div');
    scaleBarFill.className = 'pointcloud-scale__fill';
    scaleBarFill.style.width = '0px';

    scaleTrack.appendChild(scaleBarFill);

    scaleLabel = document.createElement('div');
    scaleLabel.className = 'pointcloud-scale__label';
    scaleLabel.textContent = 'Scale';

    scaleContainer.append(scaleTrack, scaleLabel);
  }

  if (!scaleContainer.parentElement) {
    viewerElement.appendChild(scaleContainer);
  }
}

function formatLegendValue(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return Number(value.toFixed(decimals)).toLocaleString();
}

function formatScaleValue(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  const abs = Math.abs(value);
  let decimals;
  if (abs >= 1000) {
    decimals = 0;
  } else if (abs >= 100) {
    decimals = 0;
  } else if (abs >= 10) {
    decimals = 1;
  } else if (abs >= 1) {
    decimals = 2;
  } else {
    decimals = 3;
  }

  return Number(value.toFixed(decimals)).toLocaleString();
}

function computeScaleLength(range) {
  if (!Number.isFinite(range) || range <= 0) {
    return null;
  }

  const raw = range / 4;
  if (raw === 0) {
    return null;
  }

  const exponent = Math.floor(Math.log10(raw));
  const fraction = raw / 10 ** exponent;

  let niceFraction;
  if (fraction < 1.5) {
    niceFraction = 1;
  } else if (fraction < 3) {
    niceFraction = 2;
  } else if (fraction < 7) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }

  return niceFraction * 10 ** exponent;
}

function updateLegend(minIntensity, maxIntensity) {
  setupOverlayElements();
  if (!legendContainer) {
    return;
  }

  const hasValidRange = Number.isFinite(minIntensity) && Number.isFinite(maxIntensity);
  if (!hasValidRange) {
    legendContainer.hidden = true;
    if (legendMinLabel) {
      legendMinLabel.textContent = '—';
    }
    if (legendMaxLabel) {
      legendMaxLabel.textContent = '—';
    }
    return;
  }

  legendContainer.hidden = false;
  if (legendMinLabel) {
    legendMinLabel.textContent = formatLegendValue(minIntensity);
  }
  if (legendMaxLabel) {
    legendMaxLabel.textContent = formatLegendValue(maxIntensity);
  }
}

function updateScaleIndicator(range) {
  setupOverlayElements();
  if (!scaleContainer || !scaleTrack || !scaleBarFill || !scaleLabel) {
    return;
  }

  const length = computeScaleLength(range);
  if (!Number.isFinite(length) || length <= 0) {
    scaleContainer.hidden = true;
    scaleBarFill.style.width = '0px';
    return;
  }

  const ratio = Math.min(1, Math.max(0, length / range));
  const width = Math.max(40, Math.round(ratio * SCALE_TRACK_WIDTH));
  scaleBarFill.style.width = `${width}px`;
  scaleContainer.hidden = false;
  scaleLabel.textContent = `≈ ${formatScaleValue(length)} units`;
}

function disposeGridHelper() {
  if (!gridHelper) {
    return;
  }

  if (scene) {
    scene.remove(gridHelper);
  }

  gridHelper.geometry.dispose();
  if (Array.isArray(gridHelper.material)) {
    gridHelper.material.forEach((material) => material.dispose());
  } else if (gridHelper.material) {
    gridHelper.material.dispose();
  }

  gridHelper = null;
}

function updateGridHelper(boundingBox) {
  if (!scene || !boundingBox) {
    return;
  }

  disposeGridHelper();

  const spanX = boundingBox.max.x - boundingBox.min.x;
  const spanY = boundingBox.max.y - boundingBox.min.y;
  const gridSize = Math.max(spanX, spanY);

  if (!Number.isFinite(gridSize) || gridSize <= 0) {
    return;
  }

  const divisions = Math.min(20, Math.max(8, Math.round(gridSize / 2)));
  gridHelper = new THREE.GridHelper(gridSize, divisions, 0x38bdf8, 0x1f2937);
  const materials = Array.isArray(gridHelper.material)
    ? gridHelper.material
    : [gridHelper.material];
  materials.forEach((material, index) => {
    if (!material) {
      return;
    }
    material.transparent = true;
    material.opacity = index === 0 ? 0.32 : 0.18;
    material.depthWrite = false;
  });
  gridHelper.rotation.x = Math.PI / 2;
  gridHelper.position.set(
    (boundingBox.max.x + boundingBox.min.x) / 2,
    (boundingBox.max.y + boundingBox.min.y) / 2,
    boundingBox.min.z
  );

  scene.add(gridHelper);
}

function resetOverlayIndicators() {
  updateLegend(null, null);
  updateScaleIndicator(null);
  disposeGridHelper();
}

function disposeActivePoints() {
  if (scene && activePoints) {
    scene.remove(activePoints);
    if (activePoints.geometry) {
      activePoints.geometry.dispose();
    }
    if (activePoints.material) {
      activePoints.material.dispose();
    }
  }

  activePoints = null;
  activeBoundingSphere = null;
  resetOverlayIndicators();
}

function stopRendering() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  isRendering = false;
}

function animate() {
  if (!renderer || !scene || !camera || !controls) {
    return;
  }

  animationFrameId = requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function startRendering() {
  if (isRendering || !renderer) {
    return;
  }

  isRendering = true;
  animationFrameId = requestAnimationFrame(animate);
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

function ensureRenderer() {
  if (renderer) {
    return true;
  }

  if (webglFailure) {
    setStatus(webglFailure, { isError: true });
    return false;
  }

  if (!viewerElement || !canvasElement) {
    console.warn('WebGL viewer elements missing.');
    return false;
  }

  if (!checkWebGLSupport()) {
    webglFailure = 'WebGL is not available. Enable hardware acceleration or try a different browser.';
    setStatus(webglFailure, { isError: true });
    return false;
  }

  const handleContextLoss = () => {
    webglFailure = 'The WebGL context was lost. Reload the page to try again.';
    stopRendering();
    disposeActivePoints();
    renderer = null;
    scene = null;
    camera = null;
    controls = null;
    ambientLight = null;
    headLight = null;
    setStatus(webglFailure, { isError: true });
  };

  canvasElement.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      handleContextLoss();
    },
    { once: true }
  );

  canvasElement.addEventListener(
    'webglcontextcreationerror',
    (event) => {
      const reason = event?.statusMessage || event?.message || 'Unknown reason';
      webglFailure = `Unable to create a WebGL context: ${reason}`;
      setStatus(webglFailure, { isError: true });
    },
    { once: true }
  );

  try {
    const creationAttempts = [
      { antialias: true, alpha: true, powerPreference: 'high-performance' },
      { antialias: false, alpha: true, powerPreference: 'high-performance' },
      {
        antialias: false,
        alpha: false,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: false,
        precision: 'mediump',
      },
    ];

    let lastCreationError = null;

    for (const options of creationAttempts) {
      try {
        renderer = new THREE.WebGLRenderer({ canvas: canvasElement, ...options });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(new THREE.Color('#020617'), 1);
        break;
      } catch (error) {
        console.warn('WebGL renderer init attempt failed with options:', options, error);
        lastCreationError = error;
        renderer = null;
      }
    }

    if (!renderer) {
      console.error('Failed to initialise WebGL renderer:', lastCreationError);
      let message = webglFailure || '';
      if (!message && lastCreationError && lastCreationError.message) {
        message = `Unable to initialise the WebGL viewer in this environment. ${lastCreationError.message}`;
      }
      if (!message) {
        message = 'Unable to initialise the WebGL viewer in this environment.';
      }
      message = `${message} Ensure hardware acceleration is enabled in your browser, update your graphics drivers, and avoid remote desktop sessions when launching the 3D viewer.`;
      webglFailure = message;
      setStatus(message, { isError: true });
      return false;
    }

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
  } catch (error) {
    console.error('Failed to initialise WebGL renderer:', error);
    webglFailure = 'Unable to initialise the WebGL viewer in this environment.';
    renderer = null;
    scene = null;
    camera = null;
    controls = null;
    ambientLight = null;
    headLight = null;
    setStatus(webglFailure, { isError: true });
    return false;
  }

  return true;
}

function resizeRenderer() {
  if (!renderer || !camera || !viewerElement) {
    return;
  }

  const bounds = viewerElement.getBoundingClientRect();
  let width = Math.max(Math.floor(bounds.width), 1);
  let height = Math.max(Math.floor(bounds.height), 1);

  if (width === 1 && canvasElement) {
    width = Math.max(canvasElement.clientWidth, width);
  }
  if (height === 1 && canvasElement) {
    height = Math.max(canvasElement.clientHeight, height);
  }

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function recenterCamera() {
  if (!controls || !camera || !activeBoundingSphere) {
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
  controls.update();
}

function mapIntensityToColor(intensity, min, max) {
  if (!Number.isFinite(intensity)) {
    return { r: 0.17, g: 0.64, b: 0.92 };
  }

  const clamped = Math.max(min, Math.min(max, intensity));
  const t = max - min === 0 ? 0.5 : (clamped - min) / (max - min);
  const segment = Math.floor(t * 4);
  const localT = t * 4 - segment;

  switch (segment) {
    case 0:
      return {
        r: 0.24 + (0.15 - 0.24) * localT,
        g: 0.08 + (0.18 - 0.08) * localT,
        b: 0.4 + (0.72 - 0.4) * localT,
      };
    case 1:
      return {
        r: 0.15 + (0.07 - 0.15) * localT,
        g: 0.18 + (0.65 - 0.18) * localT,
        b: 0.72 + (0.62 - 0.72) * localT,
      };
    case 2:
      return {
        r: 0.07 + (0.36 - 0.07) * localT,
        g: 0.65 + (0.82 - 0.65) * localT,
        b: 0.62 + (0.28 - 0.62) * localT,
      };
    default:
      return {
        r: 0.36 + (0.93 - 0.36) * localT,
        g: 0.82 + (0.9 - 0.82) * localT,
        b: 0.28 + (0.19 - 0.28) * localT,
      };
  }
}

async function loadTreePointCloud(treeId, speciesLabel, requestToken) {
  if (!renderer || !scene || !camera || !controls) {
    return;
  }

  try {
    const response = await fetch(
      `/api/trees/${encodeURIComponent(treeId)}/pointcloud?limit=${DEFAULT_POINT_LIMIT}`
    );

    if (requestToken !== currentLoadToken) {
      return;
    }

    if (!response.ok) {
      let message = `Failed to load tree ${treeId}.`;
      try {
        const payload = await response.json();
        if (payload?.error) {
          message = payload.error;
        }
      } catch (parseError) {
        console.warn('Unable to parse error response for point cloud request:', parseError);
      }

      setStatus(message, { isError: true });
      return;
    }

    const payload = await response.json();
    if (requestToken !== currentLoadToken) {
      return;
    }

    const points = Array.isArray(payload.points)
      ? payload.points.filter(
          (point) =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
        )
      : [];

    if (points.length === 0) {
      setStatus(`No point cloud data available for tree ${treeId}.`, { isError: true });
      disposeActivePoints();
      return;
    }

    disposeActivePoints();

    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);

    let minIntensity = Number.POSITIVE_INFINITY;
    let maxIntensity = Number.NEGATIVE_INFINITY;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    points.forEach((point) => {
      if (Number.isFinite(point.intensity)) {
        minIntensity = Math.min(minIntensity, point.intensity);
        maxIntensity = Math.max(maxIntensity, point.intensity);
      }
    });

    if (!Number.isFinite(minIntensity) || !Number.isFinite(maxIntensity)) {
      minIntensity = 0;
      maxIntensity = 1;
    }

    updateLegend(minIntensity, maxIntensity);

    points.forEach((point, index) => {
      const baseIndex = index * 3;
      positions[baseIndex] = point.x;
      positions[baseIndex + 1] = point.y;
      positions[baseIndex + 2] = point.z;

      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      minZ = Math.min(minZ, point.z);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      maxZ = Math.max(maxZ, point.z);

      const { r, g, b } = mapIntensityToColor(point.intensity, minIntensity, maxIntensity);
      colors[baseIndex] = r;
      colors[baseIndex + 1] = g;
      colors[baseIndex + 2] = b;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

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

    updateGridHelper(geometry.boundingBox);

    recenterCamera();

    const deltaX = maxX - minX;
    const deltaY = maxY - minY;
    const deltaZ = maxZ - minZ;
    const extent = Math.max(deltaX, deltaY, deltaZ);

    updateScaleIndicator(extent);

    const totalPoints = Number.isFinite(payload.totalPoints)
      ? payload.totalPoints
      : points.length;
    const sampledPoints = payload.sampledPoints ?? points.length;
    const speciesSuffix = speciesLabel ? ` · ${speciesLabel}` : '';

    setStatus(
      `Tree ${treeId}${speciesSuffix}: showing ${sampledPoints.toLocaleString()} of ${totalPoints.toLocaleString()} points. Range ≈ ${extent.toFixed(
        2
      )} units.`
    );
  } catch (error) {
    if (requestToken !== currentLoadToken) {
      return;
    }

    console.error('Point cloud load failure:', error);
    resetOverlayIndicators();
    setStatus('An unexpected error occurred while loading the point cloud.', { isError: true });
  }
}

function resetViewer() {
  currentLoadToken += 1;
  disposeActivePoints();
  stopRendering();
  setStatus(DEFAULT_STATUS_MESSAGE);
}

function openModal() {
  if (!modalElement) {
    return;
  }

  lastFocusedElement = document.activeElement;
  modalElement.classList.add('show');
  modalElement.setAttribute('aria-hidden', 'false');
  isModalOpen = true;
  activateFocusTrap();
}

function closeModal() {
  if (!modalElement) {
    return;
  }

  deactivateFocusTrap();
  modalElement.classList.remove('show');
  modalElement.setAttribute('aria-hidden', 'true');
  isModalOpen = false;
  resetViewer();

  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
}

export function initPointCloudViewer() {
  modalElement = document.getElementById('pointCloudModal');
  if (!modalElement) {
    return;
  }

  closeButton = document.getElementById('pointCloudCloseBtn');
  dismissButton = document.getElementById('pointCloudDismissBtn');
  statusElement = document.getElementById('pointCloudStatus');
  viewerElement = document.getElementById('pointCloudViewer');
  canvasElement = document.getElementById('pointCloudCanvas');
  titleElement = document.getElementById('pointCloudModalTitle');

  setupOverlayElements();
  setStatus(DEFAULT_STATUS_MESSAGE);

  if (closeButton) {
    closeButton.addEventListener('click', closeModal);
  }

  if (dismissButton) {
    dismissButton.addEventListener('click', closeModal);
  }

  modalElement.addEventListener('click', (event) => {
    if (event.target === modalElement) {
      closeModal();
    }
  });

  if (viewerElement && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => {
      if (!isModalOpen) {
        return;
      }
      resizeRenderer();
      recenterCamera();
    });
    resizeObserver.observe(viewerElement);
  }

  windowResizeHandler = () => {
    if (!isModalOpen) {
      return;
    }
    resizeRenderer();
    recenterCamera();
  };
  window.addEventListener('resize', windowResizeHandler);
}

export async function openPointCloudViewer({ treeId, species }) {
  if (!treeId || !modalElement) {
    return;
  }

  openModal();

  const speciesLabel = species && species.trim() ? species.trim() : '';
  if (titleElement) {
    titleElement.textContent = speciesLabel ? `Tree ${treeId} · ${speciesLabel}` : `Tree ${treeId}`;
  }

  setStatus(`Loading tree ${treeId}…`, { isLoading: true });

  if (!ensureRenderer()) {
    return;
  }

  resizeRenderer();
  startRendering();
  disposeActivePoints();

  const requestToken = ++currentLoadToken;
  await loadTreePointCloud(treeId, speciesLabel, requestToken);
}

export function disposePointCloudViewer() {
  stopRendering();
  disposeActivePoints();
  currentLoadToken += 1;

  if (resizeObserver && viewerElement) {
    resizeObserver.unobserve(viewerElement);
  }

  if (windowResizeHandler) {
    window.removeEventListener('resize', windowResizeHandler);
  }

  deactivateFocusTrap();

  if (legendContainer && legendContainer.parentElement) {
    legendContainer.parentElement.removeChild(legendContainer);
  }

  if (scaleContainer && scaleContainer.parentElement) {
    scaleContainer.parentElement.removeChild(scaleContainer);
  }

  modalElement = null;
  closeButton = null;
  dismissButton = null;
  statusElement = null;
  viewerElement = null;
  canvasElement = null;
  titleElement = null;
  resizeObserver = null;
  windowResizeHandler = null;
  renderer = null;
  scene = null;
  camera = null;
  controls = null;
  ambientLight = null;
  headLight = null;
  activeBoundingSphere = null;
  webglFailure = null;
  isModalOpen = false;
  lastFocusedElement = null;
  legendContainer = null;
  legendMinLabel = null;
  legendMaxLabel = null;
  legendCaption = null;
  scaleContainer = null;
  scaleTrack = null;
  scaleBarFill = null;
  scaleLabel = null;
}

export { closeModal as closePointCloudViewer };
