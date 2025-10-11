import * as THREE from '/Potree_1.8.2/libs/three.js/build/three.module.js';
import { LineMaterial } from '/Potree_1.8.2/libs/three.js/lines/LineMaterial.js';

const POTREE_RESOURCES = {
  css: [
    '/Potree_1.8.2/build/potree/potree.css',
    '/Potree_1.8.2/libs/jquery-ui/jquery-ui.min.css',
    '/Potree_1.8.2/libs/openlayers3/ol.css',
    '/Potree_1.8.2/libs/spectrum/spectrum.css',
    '/Potree_1.8.2/libs/jstree/themes/mixed/style.css'
  ],
  js: [
    '/Potree_1.8.2/libs/jquery/jquery-3.1.1.min.js',
    '/Potree_1.8.2/libs/spectrum/spectrum.js',
    '/Potree_1.8.2/libs/jquery-ui/jquery-ui.min.js',
    '/Potree_1.8.2/libs/other/BinaryHeap.js',
    '/Potree_1.8.2/libs/tween/tween.min.js',
    '/Potree_1.8.2/libs/d3/d3.js',
    '/Potree_1.8.2/libs/proj4/proj4.js',
    '/Potree_1.8.2/libs/openlayers3/ol.js',
    '/Potree_1.8.2/libs/i18next/i18next.js',
    '/Potree_1.8.2/libs/jstree/jstree.js',
    '/Potree_1.8.2/build/potree/potree.js',
    '/Potree_1.8.2/libs/plasio/js/laslaz.js',
    '/Potree_1.8.2/libs/shapefile/shapefile.js'
  ]
};

const GROUP_DEFINITIONS = [
  { id: 1, name: 'Group 1 · Top Species', color: '#22c55e' },
  { id: 2, name: 'Group 2 · Top Species', color: '#f97316' },
  { id: 3, name: 'Group 3 · Top Species', color: '#0ea5e9' },
  { id: 4, name: 'Group 4 · Top Species', color: '#a855f7' },
  { id: 5, name: 'Group 5 · Top Species', color: '#facc15' }
];

const FALLBACK_GROUP = { id: 0, name: 'Group 0 · Unclassified', color: '#94a3b8' };

const SHAPEFILE_CANDIDATES = [
  '/raw_data/shapefiles/mcws_crowns_newclass.shp',
  '/raw_data/crown_shp/mcws_crowns.shp'
];

const POINTCLOUD_METADATA_URL = '/raw_data/modified_merged_converted/metadata.json';

const potreeState = {
  viewer: null,
  initPromise: null,
  shapefileGroups: [],
  shapefileUpdateHandler: null,
  lastError: null,
  metadataPromise: null,
  pointCloudMetadata: null,
  heightHints: null
};

const OVERLAY_FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea, input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const overlayFocusTrap = new WeakMap();
let lastFocusedElement = null;

function getOverlayFocusableElements(container) {
  return Array.from(container.querySelectorAll(OVERLAY_FOCUSABLE_SELECTOR))
    .filter((element) => {
      const disabled = element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
      if (disabled) return false;
      if (element.getAttribute('tabindex') === '-1') return false;
      if (element.offsetParent === null && element !== document.activeElement) return false;
      return true;
    });
}

function activateOverlayFocusTrap(container, onEscape) {
  const existing = overlayFocusTrap.get(container);
  if (existing) {
    overlayFocusTrap.set(container, { ...existing, onEscape });
    return;
  }

  const previousTabIndex = container.getAttribute('tabindex');
  if (previousTabIndex === null) {
    container.setAttribute('tabindex', '-1');
  }

  const handler = (event) => {
    if (event.key === 'Tab') {
      const focusable = getOverlayFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first || document.activeElement === container) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      const trap = overlayFocusTrap.get(container);
      trap?.onEscape?.();
    }
  };

  container.addEventListener('keydown', handler);
  overlayFocusTrap.set(container, { previousTabIndex, handler, onEscape });

  const focusable = getOverlayFocusableElements(container);
  (focusable[0] ?? container).focus();
}

function releaseFocusTrap(container) {
  const trap = overlayFocusTrap.get(container);
  if (!trap) {
    return;
  }

  container.removeEventListener('keydown', trap.handler);

  if (trap.previousTabIndex === null) {
    container.removeAttribute('tabindex');
  } else {
    container.setAttribute('tabindex', trap.previousTabIndex);
  }

  overlayFocusTrap.delete(container);
}

const resourcePromises = new Map();

function setLoadingText(text) {
  const el = document.getElementById('potreeLoadingText');
  if (el) {
    el.textContent = text;
  }
}

function showLoading() {
  const el = document.getElementById('potreeLoading');
  if (el) {
    el.classList.remove('hidden');
  }
}

function hideLoading() {
  const el = document.getElementById('potreeLoading');
  if (el) {
    el.classList.add('hidden');
  }
}

function showError(message) {
  const el = document.getElementById('potreeError');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError() {
  const el = document.getElementById('potreeError');
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}

async function fetchPointCloudMetadata(url = POINTCLOUD_METADATA_URL) {
  if (potreeState.pointCloudMetadata) {
    return potreeState.pointCloudMetadata;
  }

  if (!potreeState.metadataPromise) {
    potreeState.metadataPromise = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch point cloud metadata (${response.status})`);
        }
        return response.json();
      })
      .then((metadata) => {
        potreeState.pointCloudMetadata = metadata;
        return metadata;
      })
      .catch((error) => {
        potreeState.metadataPromise = null;
        throw error;
      });
  }

  return potreeState.metadataPromise;
}

function extractHeightHints(metadata) {
  if (!metadata) {
    return {};
  }

  const boundingBoxMin = Array.isArray(metadata?.boundingBox?.min)
    ? Number(metadata.boundingBox.min[2])
    : undefined;
  const boundingBoxMax = Array.isArray(metadata?.boundingBox?.max)
    ? Number(metadata.boundingBox.max[2])
    : undefined;

  let attributeMin;
  let attributeMax;

  if (Array.isArray(metadata?.attributes)) {
    const positionAttribute = metadata.attributes.find((attribute) => {
      if (!attribute?.name) {
        return false;
      }
      return attribute.name.toLowerCase() === 'position';
    });

    if (positionAttribute) {
      if (Array.isArray(positionAttribute.min)) {
        attributeMin = Number(positionAttribute.min[2]);
      }
      if (Array.isArray(positionAttribute.max)) {
        attributeMax = Number(positionAttribute.max[2]);
      }
    }
  }

  return {
    geometryMin: Number.isFinite(boundingBoxMin) ? boundingBoxMin : undefined,
    geometryMax: Number.isFinite(boundingBoxMax) ? boundingBoxMax : undefined,
    attributeMin: Number.isFinite(attributeMin) ? attributeMin : undefined,
    attributeMax: Number.isFinite(attributeMax) ? attributeMax : undefined,
  };
}

function ensureLink(href) {
  if (resourcePromises.has(href)) {
    return resourcePromises.get(href);
  }

  const existing = document.querySelector(`link[href="${href}"]`);
  if (existing) {
    resourcePromises.set(href, Promise.resolve());
    return resourcePromises.get(href);
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;

  const promise = new Promise((resolve, reject) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => reject(new Error(`Failed to load stylesheet: ${href}`)), { once: true });
  });

  resourcePromises.set(href, promise);
  document.head.appendChild(link);

  return promise;
}

function ensureScript(src) {
  if (resourcePromises.has(src)) {
    return resourcePromises.get(src);
  }

  const existing = document.querySelector(`script[data-potree-src="${src}"]`) || document.querySelector(`script[src="${src}"]`);
  if (existing) {
    if (existing.dataset && existing.dataset.loaded === 'true') {
      resourcePromises.set(src, Promise.resolve());
      return resourcePromises.get(src);
    }

    const state = existing.readyState;
    if (!state || state === 'loaded' || state === 'complete') {
      resourcePromises.set(src, Promise.resolve());
      return resourcePromises.get(src);
    }

    const promise = new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
    });
    resourcePromises.set(src, promise);
    return promise;
  }

  const script = document.createElement('script');
  script.src = src;
  script.async = false;
  script.dataset.potreeSrc = src;

  const promise = new Promise((resolve, reject) => {
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });

    script.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
  });

  resourcePromises.set(src, promise);
  document.head.appendChild(script);

  return promise;
}

async function ensurePotreeResources() {
  for (const href of POTREE_RESOURCES.css) {
    await ensureLink(href);
  }

  for (const src of POTREE_RESOURCES.js) {
    await ensureScript(src);
  }

  if (typeof window.Potree === 'undefined') {
    throw new Error('Potree library not available after loading resources.');
  }

  if (typeof window.proj4 === 'undefined') {
    throw new Error('proj4 library failed to load.');
  }
}

function prepareProjections() {
  if (!proj4.defs('WGS84')) {
    proj4.defs('WGS84', '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs');
  }

  if (!proj4.defs('EPSG:3123')) {
    proj4.defs('EPSG:3123', '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.99995 +x_0=500000 +y_0=0 +ellps=clrk66 +towgs84=-127.62,-67.24,-47.04,-3.068,4.903,1.578,-1.06 +units=m +no_defs');
  }

  // Define pointcloud projection - using UTM Zone 51N for Philippines (matches view_lamesa.html)
  if (!proj4.defs('pointcloud')) {
    proj4.defs('pointcloud', '+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs');
  }
}

function createLineMaterial(color, viewer) {
  const lineMaterial = new LineMaterial({
    color: new THREE.Color(color),
    linewidth: 3.0, // Increased from 2.4 for better visibility
    transparent: true,
    opacity: 0.95, // Increased from 0.85 for better visibility
  });

  const size = viewer.renderer.getSize(new THREE.Vector2());
  lineMaterial.resolution.set(size.width, size.height);
  lineMaterial.depthTest = true; // Changed from false - proper depth testing
  lineMaterial.polygonOffset = true;
  lineMaterial.polygonOffsetFactor = -2; // Changed from -1 for better layering
  lineMaterial.polygonOffsetUnits = -2; // Changed from 1

  return lineMaterial;
}

async function loadTreeCrownOverlays(viewer, pointcloud, heightHints = {}) {
  prepareProjections();

  const loader = new Potree.ShapefileLoader();
  // Transform from EPSG:3123 (shapefile) to UTM Zone 51N (pointcloud)
  const shapefileToPointcloud = proj4('EPSG:3123', 'pointcloud');
  loader.transform = shapefileToPointcloud;

  let features = null;
  let selectedPath = null;
  let lastError = null;

  for (const path of SHAPEFILE_CANDIDATES) {
    try {
      features = await loader.loadShapefileFeatures(path);
      selectedPath = path;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!features || !features.length) {
    const errorMessage = lastError ? lastError.message : 'No features returned from shapefile.';
    throw new Error(`Unable to load tree crowns shapefile. ${errorMessage}`);
  }

  console.info(`[Potree] Loaded ${features.length} tree crown features from ${selectedPath}`);

  const groupMap = new Map();
  const taxonomyNode = new THREE.Object3D();
  taxonomyNode.name = 'Tree Taxonomic Groups';

  const datasetBounds =
    pointcloud?.tightBoundingBox ??
    pointcloud?.pcoGeometry?.tightBoundingBox ??
    pointcloud?.boundingBox ??
    viewer.scene.sceneBoundingBox;

  const geometryTopHint = heightHints.geometryMax;
  const geometryBottomHint = heightHints.geometryMin;
  const attributeTopHint = heightHints.attributeMax;
  const attributeBottomHint = heightHints.attributeMin;

  const canopyTop = Number.isFinite(attributeTopHint)
    ? attributeTopHint
    : Number.isFinite(geometryTopHint)
      ? geometryTopHint
      : datasetBounds?.max?.z ?? 0;

  const canopyBottom = Number.isFinite(attributeBottomHint)
    ? attributeBottomHint
    : Number.isFinite(geometryBottomHint)
      ? geometryBottomHint
      : datasetBounds?.min?.z ?? 0;

  const canopyHeight = Math.max(canopyTop - canopyBottom, 0);
  const spacing = Math.max(pointcloud?.pcoGeometry?.spacing ?? 1, 0.5);

  const hoverAmplitude = Math.min(
    Math.max(spacing * 0.25, 0.35),
    canopyHeight * 0.1 || 1.5
  );
  const hoverSpeed = 0.6;

  // Place crown base height above the canopy top so they're visible
  // Add some spacing above the canopy to ensure shapefiles are visible
  let crownBaseHeight = canopyTop + spacing * 2; // Elevated above the point cloud
  
  console.log('[Potree] Height settings:', {
    canopyTop,
    canopyBottom,
    canopyHeight,
    crownBaseHeight,
    spacing,
    hoverAmplitude
  });

  const groups = [...GROUP_DEFINITIONS, FALLBACK_GROUP].map((group) => {
    const material = createLineMaterial(group.color, viewer);
    const node = new THREE.Object3D();
    node.name = group.name;

    const record = {
      id: group.id,
      name: group.name,
      color: group.color,
      material,
      node,
      featureCount: 0,
      baseHeight: crownBaseHeight,
      hoverPhase: 0
    };

    groupMap.set(group.id, record);
    return record;
  });

  const fallback = groupMap.get(FALLBACK_GROUP.id);

  for (const feature of features) {
    if (!feature?.geometry || !feature.geometry.coordinates?.length) {
      continue;
    }

    const rawGroupId = feature.properties?.group_d;
    const parsedGroupId = Number(rawGroupId);
    const groupId = Number.isFinite(parsedGroupId) ? parsedGroupId : FALLBACK_GROUP.id;
    const group = groupMap.get(groupId) || fallback;

    try {
      const sceneNode = loader.featureToSceneNode(feature, group.material);
      if (sceneNode) {
        group.node.add(sceneNode);
        group.featureCount += 1;
      }
    } catch (error) {
      console.warn('[Potree] Skipping crown feature due to geometry error:', error);
    }
  }

  const activeGroups = groups.filter((group) => group.featureCount > 0);

  activeGroups.forEach((group, index) => {
    const phaseStep = activeGroups.length ? (Math.PI * 2) / activeGroups.length : 0;
    group.hoverPhase = index * phaseStep;
    group.node.position.z = group.baseHeight;
    taxonomyNode.add(group.node);
  });

  viewer.scene.scene.add(taxonomyNode);

  if (potreeState.shapefileUpdateHandler) {
    viewer.removeEventListener('update', potreeState.shapefileUpdateHandler);
  }

  const updateHandler = () => {
    const size = viewer.renderer.getSize(new THREE.Vector2());
    const elapsed = viewer.clock?.getElapsedTime?.() ?? performance.now() * 0.001;

    activeGroups.forEach((group) => {
      group.material.resolution.set(size.width, size.height);
      const hoverOffset = Math.sin(elapsed * hoverSpeed + group.hoverPhase) * hoverAmplitude;
      group.node.position.z = group.baseHeight + hoverOffset;
    });
  };

  viewer.addEventListener('update', updateHandler);
  potreeState.shapefileUpdateHandler = updateHandler;

  viewer.onGUILoaded(() => {
    const tree = $('#jstree_scene');
    const parentNode = 'other';

    const taxonomyId = tree.jstree('create_node', parentNode, {
      text: taxonomyNode.name,
      icon: `${Potree.resourcePath}/icons/triangle.svg`,
      object: taxonomyNode,
      data: taxonomyNode,
    }, 'last', false, false);

    activeGroups.forEach((group) => {
      const nodeId = tree.jstree('create_node', taxonomyId, {
        text: `${group.name} (${group.featureCount})`,
        icon: `${Potree.resourcePath}/icons/triangle.svg`,
        object: group.node,
        data: group.node,
      }, 'last', false, false);

      if (group.node.visible) {
        tree.jstree('check_node', nodeId);
      } else {
        tree.jstree('uncheck_node', nodeId);
      }
    });
  });

  potreeState.shapefileGroups = activeGroups;
}

async function initializePotreeViewer() {
  if (potreeState.initPromise) {
    return potreeState.initPromise;
  }

  potreeState.initPromise = (async () => {
    setLoadingText('Loading viewer resources…');
    await ensurePotreeResources();
    const metadataPromise = fetchPointCloudMetadata().catch((error) => {
      console.warn('[Potree] Unable to fetch metadata for height hints:', error);
      return null;
    });

    const renderArea = document.getElementById('potree_render_area');
    if (!renderArea) {
      throw new Error('Potree render target missing from DOM.');
    }

    const viewer = new Potree.Viewer(renderArea);
    window.viewer = viewer;
    const potreeBaseUrl = `${window.location.origin}/Potree_1.8.2/build/potree`;
    Potree.scriptPath = potreeBaseUrl;
    Potree.resourcePath = `${potreeBaseUrl}/resources`;

    viewer.setFOV(60);
    viewer.setEDLEnabled(true);
    viewer.setPointBudget(3_000_000);
    viewer.loadSettingsFromURL();
    viewer.setDescription('La Mesa Ecopark · Tree classification results overlayed on LiDAR point cloud');

    viewer.loadGUI(() => {
      viewer.setLanguage('en');
      $('#menu_tools').next().show();
      $('#menu_scene').next().show();
      viewer.toggleSidebar(); // Toggle to show the sidebar
    });

    const pointCloudPromise = new Promise((resolve, reject) => {
      setLoadingText('Loading point cloud…');

      Potree.loadPointCloud(
        POINTCLOUD_METADATA_URL,
        'La Mesa Forest',
        async (event) => {
          try {
            const pointcloud = event.pointcloud;
            const scene = viewer.scene;
            scene.addPointCloud(pointcloud);

            const material = pointcloud.material;
            material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
            material.size = 1.0;
            material.activeAttributeName = "rgba"; // Set to rgba for RGB color display

            if (Potree.PointColorType?.RGB) {
              material.pointColorType = Potree.PointColorType.RGB;
            } else if (Potree.PointColorTypes?.RGB) {
              material.pointColorType = Potree.PointColorTypes.RGB;
            }

            material.needsUpdate = true;

            const boundingBox = pointcloud.boundingBox.clone();
            const center = boundingBox.getCenter(new THREE.Vector3());
            const size = boundingBox.getSize(new THREE.Vector3());
            const diagonal = size.length();

            scene.view.position.set(
              center.x - diagonal * 0.25,
              center.y - diagonal * 0.35,
              center.z + diagonal * 0.55
            );
            scene.view.lookAt(center);

            viewer.fitToScreen();

            const metadata = await metadataPromise;
            if (metadata && !potreeState.pointCloudMetadata) {
              potreeState.pointCloudMetadata = metadata;
            }

            if (!potreeState.heightHints) {
              potreeState.heightHints = extractHeightHints(potreeState.pointCloudMetadata);
            }

            setLoadingText('Overlaying tree crowns…');
            await loadTreeCrownOverlays(viewer, pointcloud, potreeState.heightHints);

            resolve();
          } catch (error) {
            reject(error);
          }
        },
        (xhr) => {
          if (xhr && xhr.total) {
            const percent = Math.min(100, Math.round((xhr.loaded / xhr.total) * 100));
            setLoadingText(`Loading point cloud… ${percent}%`);
          }
        },
        (error) => {
          reject(error);
        }
      );
    });

    await pointCloudPromise;

    hideLoading();
    potreeState.viewer = viewer;
    return viewer;
  })().catch((error) => {
    potreeState.lastError = error;
    showError(error.message || 'Failed to initialize Potree viewer.');
    hideLoading();
    throw error;
  });

  return potreeState.initPromise;
}

function refreshViewerLayout() {
  const viewer = potreeState.viewer;
  if (!viewer) {
    return;
  }

  const renderArea = document.getElementById('potree_render_area');
  if (!renderArea) {
    return;
  }

  const { clientWidth, clientHeight } = renderArea;
  viewer.renderer?.setSize(clientWidth, clientHeight, false);
  const activeRenderer = viewer.getPRenderer?.();
  if (activeRenderer && typeof activeRenderer.resize === 'function') {
    activeRenderer.resize(clientWidth, clientHeight);
  }
  viewer.mapView?.map?.updateSize?.();

  // Don't dispatch resize event here - it causes infinite loop
  // window.dispatchEvent(new Event('resize'));
}

function bindOverlayEvents() {
  const overlay = document.getElementById('potreeOverlay');
  const openBtn = document.getElementById('openPotreeBtn');
  const closeBtn = document.getElementById('closePotreeOverlay');
  const popOutBtn = document.getElementById('popOutPotree');

  if (!overlay || !openBtn || !closeBtn) {
    return;
  }

  overlay.setAttribute('aria-hidden', 'true');

  const closeOverlay = () => {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('potree-overlay-open');
    hideError();
    hideLoading();
    releaseFocusTrap(overlay);
    if (typeof lastFocusedElement?.focus === 'function') {
      lastFocusedElement.focus();
    }
  };

  openBtn.addEventListener('click', async (event) => {
    event.preventDefault();

    lastFocusedElement = event.currentTarget;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('potree-overlay-open');
    showLoading();
    hideError();
  activateOverlayFocusTrap(overlay, closeOverlay);

    try {
      await initializePotreeViewer();
      hideError();
      hideLoading();
      refreshViewerLayout();
      setTimeout(refreshViewerLayout, 150);
    } catch (error) {
      console.error('[Potree] Initialization error:', error);
      showError(error.message || 'Failed to load 3D viewer.');
    }
  });

  closeBtn.addEventListener('click', closeOverlay);

  if (popOutBtn) {
    popOutBtn.addEventListener('click', () => {
      window.open('/lamesa_potree_viewer.html', '_blank', 'noopener');
    });
  }

  window.addEventListener('resize', () => {
    refreshViewerLayout();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.classList.contains('hidden')) {
      closeOverlay();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindOverlayEvents();
});
