import { createSpeciesColorHelper } from './js/colors.js';
import { loadTreeCrownGeoJSON, summariseTreeDataset } from './js/data-loader.js';
import { loadPredictionData } from './js/predictions.js';
import { initPointCloudViewer, openPointCloudViewer } from './js/pointcloud-viewer.js';

console.log('=== SCRIPT LOADED ===');

// --- Global Variables ---
let originalTreeData = [];
let filteredData = [];
let currentSortColumn = null;
let currentSortDirection = 'asc';
let map;
let treeLayers = L.layerGroup(); // Use a layer group for tree polygons
let predictionData = []; // Store prediction data from CSV
let isPredictionMode = false; // Toggle between species view and prediction view
let lastFocusedElement = null;
let groupToSpeciesMapping = {}; // Store the mapping of group to species name
let predictionSummary = null; // Cache computed confusion matrix and metrics
let predictionMetrics = null; // Metrics loaded from the predictions CSV
let predictionIndex = new Map();
let treeLayerIndex = new Map();
let currentSearchTerm = '';
let selectedTreeId = null;
const legendCollapseMediaQuery = window.matchMedia('(max-width: 768px)');
let isLegendCollapsed = legendCollapseMediaQuery.matches;

const handleLegendCollapseChange = (event) => {
  isLegendCollapsed = event.matches;
  if (map) {
    requestAnimationFrame(() => {
      createSpeciesLegend();
    });
  }
};

if (typeof legendCollapseMediaQuery.addEventListener === 'function') {
  legendCollapseMediaQuery.addEventListener('change', handleLegendCollapseChange);
} else if (typeof legendCollapseMediaQuery.addListener === 'function') {
  legendCollapseMediaQuery.addListener(handleLegendCollapseChange);
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const focusTrapRegistry = new WeakMap();

const colorHelper = createSpeciesColorHelper();

const PROPERTY_LABEL_OVERRIDES = {
  tree_id: 'Tree ID',
  Cmmn_Nm: 'Common Name',
  cmmn_nm: 'Common Name',
  Scntf_N: 'Scientific Name',
  scntf_n: 'Scientific Name',
  Scntfc_N: 'Scientific Name (Alt)',
  Family: 'Family',
  Order: 'Order',
  Class: 'Class',
  specs_d: 'Crown Diameter (m)',
  specis_d: 'Crown Diameter (m)',
  crown_diameter_m: 'Crown Diameter (m)',
  group_d: 'Group',
  group_id: 'Group',
  species_id: 'Species ID',
  planar_canopy_area_m2: 'Canopy Area (2D)',
  area: 'Area',
  perimtr: 'Perimeter',
  perimeter: 'Perimeter',
  x: 'Projected X',
  y: 'Projected Y',
  Drctn_N: 'Direction',
  Adjst_N: 'Adjusted Bearing',
  predicted_species: 'Predicted Species',
  ground_truth_species: 'Ground Truth Species',
  status: 'Status',
};

const PROPERTY_DISPLAY_ORDER = [
  'tree_id',
  'Cmmn_Nm',
  'Scntf_N',
  'Scntfc_N',
  'Family',
  'Order',
  'Class',
  'species_id',
  'group_d',
  'group_id',
  'specs_d',
  'specis_d',
  'crown_diameter_m',
  'perimeter',
  'perimtr',
  'x',
  'y',
  'predicted_species',
  'ground_truth_species',
  'status',
];

const PROPERTY_VALUE_TRANSFORMS = {
  specs_d: (value) => formatMeasurement(value, 'm', { maximumFractionDigits: 2 }),
  specis_d: (value) => formatMeasurement(value, 'm', { maximumFractionDigits: 2 }),
  planar_canopy_area_m2: (value) => formatArea(value),
  area: (value) => formatArea(value),
  crown_diameter_m: (value) => formatMeasurement(value, 'm', { maximumFractionDigits: 2 }),
  perimeter: (value) => formatMeasurement(value, 'm', { maximumFractionDigits: 2 }),
  perimtr: (value) => formatMeasurement(value, 'm', { maximumFractionDigits: 2 }),
  group_d: (value) => formatGroupLabel(value),
  group_id: (value) => formatGroupLabel(value),
  x: (value) => formatNumber(value, 3),
  y: (value) => formatNumber(value, 3),
};

const IGNORED_PROPERTY_KEYS = new Set(['__proto__', 'area', 'planar_canopy_area_m2']);
const PLACEHOLDER_STRINGS = new Set([
  '',
  'null',
  'undefined',
  'nan',
  'n/a',
  'na',
  'none',
  'not available',
]);
const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function initializeMapControlsSheet() {
  const mapControls = document.getElementById('mapControls');
  const fab = document.getElementById('mapToolsFab');
  const scrim = document.getElementById('mapToolsScrim');

  if (!mapControls || !fab || !scrim) {
    return;
  }

  const closeButton = document.getElementById('mapControlsClose');
  const collapseButton = document.getElementById('mapControlsCollapse');
  const mediaQuery = window.matchMedia('(max-width: 1024px)');
  let isSheetOpen = false;
  let hasActiveFocusTrap = false;

  const isMobileSheet = () => mediaQuery.matches;

  const hideScrim = () => {
    scrim.classList.remove('visible');
    scrim.hidden = true;
  };

  const showScrim = () => {
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('visible'));
  };

  const releaseSheetFocusTrap = () => {
    if (!hasActiveFocusTrap) {
      return;
    }
    releaseFocusTrap(mapControls);
    hasActiveFocusTrap = false;
  };

  const setBodyScrollLock = (locked) => {
    document.body.classList.toggle('no-scroll', locked);
  };

  const syncState = () => {
    if (isMobileSheet()) {
      mapControls.setAttribute('aria-modal', 'true');
      mapControls.setAttribute('aria-hidden', String(!isSheetOpen));
      fab.setAttribute('aria-expanded', isSheetOpen ? 'true' : 'false');
      return;
    }

    mapControls.classList.remove('map-controls--open');
    hideScrim();
    releaseSheetFocusTrap();
    setBodyScrollLock(false);
    const collapsed = document.body.classList.contains('map-tools-collapsed');
    mapControls.setAttribute('aria-modal', 'false');
    mapControls.setAttribute('aria-hidden', String(collapsed));
    fab.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  };

  const closeSheet = () => {
    isSheetOpen = false;
    mapControls.classList.remove('map-controls--open');
    hideScrim();
    releaseSheetFocusTrap();
    setBodyScrollLock(false);
    syncState();
  };

  const openSheet = () => {
    if (!isMobileSheet()) {
      return;
    }

    isSheetOpen = true;
    mapControls.classList.add('map-controls--open');
    showScrim();
    activateFocusTrap(mapControls, closeSheet);
    hasActiveFocusTrap = true;
    setBodyScrollLock(true);
    syncState();
  };

  const collapseDesktopCard = () => {
    if (isMobileSheet()) {
      closeSheet();
      return;
    }
    document.body.classList.add('map-tools-collapsed');
    syncState();
  };

  const expandDesktopCard = () => {
    document.body.classList.remove('map-tools-collapsed');
    syncState();
    requestAnimationFrame(() => {
      mapControls.focus({ preventScroll: true });
    });
  };

  const handleFabClick = () => {
    if (isMobileSheet()) {
      if (isSheetOpen) {
        closeSheet();
      } else {
        openSheet();
      }
      return;
    }
    expandDesktopCard();
  };

  fab.addEventListener('click', handleFabClick);
  scrim.addEventListener('click', closeSheet);

  if (closeButton) {
    closeButton.addEventListener('click', closeSheet);
  }

  if (collapseButton) {
    collapseButton.addEventListener('click', collapseDesktopCard);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isSheetOpen && isMobileSheet()) {
      closeSheet();
    }
  });

  mediaQuery.addEventListener('change', () => {
    if (!isMobileSheet()) {
      isSheetOpen = false;
      closeSheet();
      expandDesktopCard();
      return;
    }
    document.body.classList.remove('map-tools-collapsed');
    syncState();
  });

  // Initialise states based on the current viewport
  document.body.classList.remove('map-tools-collapsed');
  syncState();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('Service worker registered:', registration.scope);
      })
      .catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
  });
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return value.toString().replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

function formatNumber(value, fractionDigits = 2) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

function formatMeasurement(rawValue, unit = '', options = {}) {
  const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const resolvedOptions = {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(numeric) < 10 ? 2 : 1,
    ...options,
  };

  const formattedNumber = numeric.toLocaleString(undefined, resolvedOptions);
  return unit ? `${formattedNumber} ${unit}`.trim() : formattedNumber;
}

function formatPercent(rawValue, fractionDigits = 2) {
  const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return '—';
  }

  return `${(numeric * 100).toFixed(fractionDigits)}%`;
}

function formatArea(value) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  if (numeric >= 10000) {
    const hectares = numeric / 10000;
    return `${hectares.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    })} ha`;
  }

  return `${numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} m²`;
}

function deriveCrownDiameterFromArea(areaSqMeters) {
  const numeric = typeof areaSqMeters === 'number' ? areaSqMeters : Number(areaSqMeters);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return 2 * Math.sqrt(numeric / Math.PI);
}

function computeGeodesicFeatureArea(latLngs) {
  if (
    typeof L === 'undefined' ||
    !L.GeometryUtil ||
    typeof L.GeometryUtil.geodesicArea !== 'function'
  ) {
    return null;
  }

  const compute = (coords) => {
    if (!Array.isArray(coords) || coords.length === 0) {
      return 0;
    }

    const first = coords[0];

    if (first && typeof first.lat === 'number') {
      return L.GeometryUtil.geodesicArea(coords);
    }

    if (Array.isArray(first)) {
      const firstElement = first.length > 0 ? first[0] : null;

      if (firstElement && typeof firstElement.lat === 'number') {
        const outerArea = Math.abs(L.GeometryUtil.geodesicArea(first));
        const holesArea = coords.slice(1).reduce((sum, hole) => {
          if (!Array.isArray(hole) || hole.length === 0) {
            return sum;
          }

          return sum + Math.abs(L.GeometryUtil.geodesicArea(hole));
        }, 0);

        return outerArea - holesArea;
      }

      return coords.reduce((sum, part) => sum + compute(part), 0);
    }

    return 0;
  };

  const area = compute(latLngs);
  if (!Number.isFinite(area)) {
    return null;
  }

  const normalisedArea = Math.abs(area);
  return normalisedArea > 0 ? normalisedArea : null;
}

function computePlanarCanopyArea(input) {
  if (typeof proj4 === 'undefined' || typeof proj4 !== 'function') {
    return null;
  }

  const hasProjection =
    typeof proj4.defs === 'function' && proj4.defs('EPSG:3123') && proj4.defs('EPSG:4326');
  if (!hasProjection) {
    return null;
  }

  const toLatLng = (point) => {
    if (!point) {
      return null;
    }

    if (Array.isArray(point) && point.length >= 2) {
      const [lng, lat] = point;
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    }

    if (typeof point.lat === 'number' && typeof point.lng === 'number') {
      return { lat: point.lat, lng: point.lng };
    }

    if (typeof point.lat === 'number' && typeof point.lon === 'number') {
      return { lat: point.lat, lng: point.lon };
    }

    if (typeof point.latitude === 'number' && typeof point.longitude === 'number') {
      return { lat: point.latitude, lng: point.longitude };
    }

    return null;
  };

  const normaliseRing = (ring) => {
    if (!Array.isArray(ring)) {
      return null;
    }

    const latLngs = ring.map(toLatLng).filter(Boolean);
    return latLngs.length >= 3 ? latLngs : null;
  };

  const normalisePolygon = (polygon) => {
    if (!Array.isArray(polygon)) {
      return null;
    }

    const rings = polygon.map(normaliseRing).filter(Boolean);
    return rings.length > 0 ? rings : null;
  };

  const normaliseInput = (value) => {
    if (!value) {
      return null;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return null;
      }

      const first = value[0];

      if (first && typeof first.lat === 'number') {
        const ring = normaliseRing(value);
        return ring ? [[ring]] : null;
      }

      if (Array.isArray(first)) {
        const second = first[0];

        if (second && typeof second.lat === 'number') {
          const rings = value.map(normaliseRing).filter(Boolean);
          return rings.length > 0 ? [rings] : null;
        }

        if (Array.isArray(second)) {
          const polygons = value.map(normalisePolygon).filter(Boolean);
          return polygons.length > 0 ? polygons : null;
        }
      }

      return null;
    }

    if (value && typeof value === 'object' && value.type && value.coordinates) {
      if (value.type === 'Polygon') {
        const polygon = normalisePolygon(value.coordinates);
        return polygon ? [polygon] : null;
      }

      if (value.type === 'MultiPolygon') {
        const polygons = value.coordinates.map(normalisePolygon).filter(Boolean);
        return polygons.length > 0 ? polygons : null;
      }
    }

    return null;
  };

  const projectPoint = ({ lat, lng }) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    try {
      const projected = proj4('EPSG:4326', 'EPSG:3123', [lng, lat]);
      if (!Array.isArray(projected) || projected.length < 2) {
        return null;
      }
      return { x: projected[0], y: projected[1] };
    } catch (error) {
      console.warn('Projection error while computing planar area:', error);
      return null;
    }
  };

  const computeRingArea = (ring) => {
    const points = ring.map(projectPoint).filter(Boolean);
    if (points.length < 3) {
      return 0;
    }

    let sum = 0;
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      sum += current.x * next.y - next.x * current.y;
    }

    return Math.abs(sum) / 2;
  };

  const polygons = normaliseInput(input);
  if (!polygons) {
    return null;
  }

  let total = 0;
  polygons.forEach((polygon) => {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      return;
    }

    const outerArea = computeRingArea(polygon[0]);
    const holesArea = polygon.slice(1).reduce((sum, ring) => sum + computeRingArea(ring), 0);
    const polygonArea = outerArea - holesArea;

    if (Number.isFinite(polygonArea) && polygonArea > 0) {
      total += polygonArea;
    }
  });

  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }

  return total;
}

function normalisePropertyValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (PLACEHOLDER_STRINGS.has(trimmed.toLowerCase())) {
      return null;
    }

    return trimmed;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }

    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    const cleaned = value
      .map((item) => normalisePropertyValue(item))
      .filter((item) => item !== null);

    if (cleaned.length === 0) {
      return null;
    }

    return cleaned.map((item) => (typeof item === 'string' ? item : item.toString())).join(', ');
  }

  return null;
}

function formatPropertyLabel(key) {
  if (!key) {
    return '';
  }

  if (PROPERTY_LABEL_OVERRIDES[key]) {
    return PROPERTY_LABEL_OVERRIDES[key];
  }

  const withSpaces = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');

  return withSpaces
    .split(' ')
    .map((segment) =>
      segment ? segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase() : segment
    )
    .join(' ')
    .trim();
}

function formatGroupLabel(groupValue) {
  const normalized = normalisePropertyValue(groupValue);
  if (normalized === null) {
    return null;
  }

  const groupString = normalized.toString();
  const plainKey = groupString.replace(/^0+/, '') || '0';
  const speciesName = groupToSpeciesMapping[plainKey] || groupToSpeciesMapping[groupString];

  if (speciesName) {
    return `Group ${plainKey} · ${speciesName}`;
  }

  if (/^-?\d+(\.\d+)?$/.test(groupString)) {
    const numeric = Number(groupString);
    if (numeric === 0) {
      return 'Group 0 · Unassigned';
    }

    return Number.isInteger(numeric) ? `Group ${numeric}` : `Group ${numeric.toFixed(2)}`;
  }

  return groupString;
}

function formatPropertyValue(key, value) {
  const normalized = normalisePropertyValue(value);
  if (normalized === null) {
    return null;
  }

  if (PROPERTY_VALUE_TRANSFORMS[key]) {
    const transformed = PROPERTY_VALUE_TRANSFORMS[key](normalized);
    return transformed ?? null;
  }

  if (typeof normalized === 'number') {
    const formatted = formatNumber(normalized);
    return formatted ?? normalized.toString();
  }

  if (typeof normalized === 'boolean') {
    return normalized ? 'Yes' : 'No';
  }

  return normalized.toString();
}

function buildPropertyDetails(props = {}) {
  const entries = Object.entries(props)
    .filter(([key]) => !IGNORED_PROPERTY_KEYS.has(key))
    .map(([key, value]) => {
      const formattedValue = formatPropertyValue(key, value);
      if (formattedValue === null || formattedValue === '') {
        return null;
      }

      if (
        key === 'ground_truth_species' &&
        typeof formattedValue === 'string' &&
        formattedValue.trim().toLowerCase() === 'unknown'
      ) {
        return null;
      }

      return {
        key,
        label: formatPropertyLabel(key),
        value: formattedValue,
      };
    })
    .filter(Boolean);

  if (entries.length === 0) {
    return { html: '', count: 0 };
  }

  entries.sort((a, b) => {
    const orderA = PROPERTY_DISPLAY_ORDER.indexOf(a.key);
    const orderB = PROPERTY_DISPLAY_ORDER.indexOf(b.key);

    if (orderA === -1 && orderB === -1) {
      return a.label.localeCompare(b.label);
    }

    if (orderA === -1) {
      return 1;
    }

    if (orderB === -1) {
      return -1;
    }

    if (orderA === orderB) {
      return a.label.localeCompare(b.label);
    }

    return orderA - orderB;
  });

  const html = entries
    .map(
      ({ label, value }) =>
        `<div class="popup-field"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`
    )
    .join('');

  return { html, count: entries.length };
}

function coalesceProperty(props, keys = []) {
  if (!props) {
    return null;
  }

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) {
      continue;
    }

    const value = props[key];
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'string' && PLACEHOLDER_STRINGS.has(value.trim().toLowerCase())) {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

function getSpeciesColor(species, treeId) {
  return colorHelper.getColor(species, treeId, {
    isPredictionMode,
    predictionData,
    predictionIndex,
  });
}

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
    const isDisabled =
      element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
    if (isDisabled) return false;
    if (element.getAttribute('tabindex') === '-1') return false;
    if (element.offsetParent === null && element !== document.activeElement) return false;
    return true;
  });
}

function activateFocusTrap(container, onEscape) {
  const existing = focusTrapRegistry.get(container);
  if (existing) {
    focusTrapRegistry.set(container, { ...existing, onEscape });
    return;
  }

  const previousTabIndex = container.getAttribute('tabindex');
  if (previousTabIndex === null) {
    container.setAttribute('tabindex', '-1');
  }

  const handler = (event) => {
    if (event.key === 'Tab') {
      const focusable = getFocusableElements(container);
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
      const trap = focusTrapRegistry.get(container);
      trap?.onEscape?.();
    }
  };

  container.addEventListener('keydown', handler);
  focusTrapRegistry.set(container, { previousTabIndex, handler, onEscape });

  const focusable = getFocusableElements(container);
  (focusable[0] ?? container).focus();
}

function releaseFocusTrap(container) {
  const trap = focusTrapRegistry.get(container);
  if (!trap) {
    return;
  }

  container.removeEventListener('keydown', trap.handler);

  if (trap.previousTabIndex === null) {
    container.removeAttribute('tabindex');
  } else {
    container.setAttribute('tabindex', trap.previousTabIndex);
  }

  focusTrapRegistry.delete(container);
}

function getPredictionForTree(treeId) {
  if (!treeId) {
    return undefined;
  }
  return predictionIndex.get(treeId.toString());
}

function rebuildPredictionIndex() {
  predictionIndex = new Map();

  predictionData.forEach((record) => {
    const key = record.treeId?.toString();
    if (!key) {
      return;
    }

    if (!predictionIndex.has(key)) {
      predictionIndex.set(key, record);
      return;
    }

    const current = predictionIndex.get(key);
    if (current?.isTraining && !record.isTraining) {
      predictionIndex.set(key, record);
    }
  });
}

function getActiveFilters() {
  const hideUnknown = document.getElementById('filterUnknownSpecies')?.checked ?? false;
  const showCorrect = document.getElementById('filterCorrect')?.checked ?? true;
  const showIncorrect = document.getElementById('filterIncorrect')?.checked ?? true;
  const showTraining = document.getElementById('filterTraining')?.checked ?? true;

  return {
    hideUnknown,
    showCorrect,
    showIncorrect,
    showTraining,
  };
}

function resetFilterControlsToDefaults() {
  const defaultStates = {
    filterUnknownSpecies: true,
    filterCorrect: true,
    filterIncorrect: true,
    filterTraining: true,
  };

  Object.entries(defaultStates).forEach(([id, checked]) => {
    const control = document.getElementById(id);
    if (control) {
      control.checked = checked;
    }
  });
}

function recomputeFilteredData() {
  let data = [...originalTreeData];
  const filters = getActiveFilters();
  const searchTerm = currentSearchTerm.trim().toLowerCase();

  if (isPredictionMode) {
    data = data.filter((tree) => {
      const treeId = tree.properties?.tree_id;
      const prediction = getPredictionForTree(treeId);
      if (!prediction) {
        return false;
      }

      if (prediction.isTraining) {
        return filters.showTraining;
      }

      if (prediction.correct) {
        return filters.showCorrect;
      }

      return filters.showIncorrect;
    });
  } else if (filters.hideUnknown) {
    data = data.filter((tree) => {
      const props = tree.properties || {};
      const commonName = props.Cmmn_Nm || props.cmmn_nm || props.species || props.Species;
      return Boolean(commonName);
    });
  }

  if (searchTerm) {
    data = data.filter((tree) => {
      const props = tree.properties || {};
      const treeId = (props.tree_id || '').toString().toLowerCase();
      const commonName = (props.Cmmn_Nm || props.cmmn_nm || '').toString().toLowerCase();
      const scientificName = (props.Scntf_N || props.scntf_n || '').toString().toLowerCase();

      if (
        treeId.includes(searchTerm) ||
        commonName.includes(searchTerm) ||
        scientificName.includes(searchTerm)
      ) {
        return true;
      }

      if (isPredictionMode) {
        const prediction = getPredictionForTree(props.tree_id);
        if (prediction) {
          return (
            prediction.actual?.toLowerCase().includes(searchTerm) ||
            prediction.predicted?.toLowerCase().includes(searchTerm)
          );
        }
      }

      return false;
    });
  }

  return data;
}

function applyCurrentSort(data) {
  if (!currentSortColumn) {
    return [...data];
  }

  const normalise = (value) => {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric) && trimmed !== '') {
        return numeric;
      }
      return trimmed.toLowerCase();
    }

    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }

    return value.toString().toLowerCase();
  };

  const getSortValue = (tree) => {
    const props = tree.properties || {};

    if (currentSortColumn === 'tree_id') {
      const treeId = props.tree_id;
      const numeric = Number(treeId);
      return Number.isNaN(numeric) ? treeId : numeric;
    }

    if (currentSortColumn === 'area') {
      const raw = coalesceProperty(props, ['planar_canopy_area_m2', 'area']);
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? numeric : 0;
    }

    if (currentSortColumn === 'crown_diameter_m' || currentSortColumn === 'specs_d') {
      const raw = coalesceProperty(props, [
        'crown_diameter_m',
        'specs_d',
        'specis_d',
        'crown_width',
        'width',
        'WIDTH',
      ]);
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? numeric : 0;
    }

    if (isPredictionMode) {
      const prediction = getPredictionForTree(props.tree_id);
      switch (currentSortColumn) {
        case 'actual':
          return prediction?.actual ?? '';
        case 'predicted':
          return prediction?.predicted ?? '';
        case 'status':
          if (!prediction) {
            return 3;
          }
          if (prediction.isTraining) {
            return 0;
          }
          return prediction.correct ? 1 : 2;
        case 'area': {
          const raw = coalesceProperty(props, ['planar_canopy_area_m2', 'area']);
          const numeric = Number(raw);
          return Number.isFinite(numeric) ? numeric : 0;
        }
        case 'crown_diameter_m': {
          const raw = coalesceProperty(props, [
            'crown_diameter_m',
            'specs_d',
            'specis_d',
            'crown_width',
            'width',
            'WIDTH',
          ]);
          const numeric = Number(raw);
          return Number.isFinite(numeric) ? numeric : 0;
        }
        default:
          break;
      }
    }

    return props[currentSortColumn];
  };

  const sorted = [...data].sort((a, b) => {
    const aValue = normalise(getSortValue(a));
    const bValue = normalise(getSortValue(b));

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return aValue - bValue;
    }

    if (aValue < bValue) {
      return -1;
    }
    if (aValue > bValue) {
      return 1;
    }
    return 0;
  });

  if (currentSortDirection === 'desc') {
    sorted.reverse();
  }

  return sorted;
}

function highlightSelectedRow() {
  const rows = document.querySelectorAll('#tableBody tr');
  rows.forEach((row) => {
    const isSelected = row.dataset.treeId === selectedTreeId;
    row.classList.toggle('selected', isSelected);
    if (isSelected) {
      row.scrollIntoView({ block: 'nearest' });
    }
  });

  const cards = document.querySelectorAll('.tree-card');
  const cardViewActive = window.matchMedia('(max-width: 1024px)').matches;
  cards.forEach((card) => {
    const isSelected = card.dataset.treeId === selectedTreeId;
    card.classList.toggle('tree-card--selected', Boolean(isSelected));
    if (isSelected && cardViewActive) {
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

function bindSortHeaderEvents() {
  document.querySelectorAll('#resultsTable th[data-sort]').forEach((header) => {
    header.addEventListener('click', () => sortTable(header.dataset.sort));
  });
}

function focusTreeOnMap(treeId, { openPopup = true, fitBounds = true } = {}) {
  if (!treeId) {
    return;
  }

  const layer = treeLayerIndex.get(treeId.toString());
  if (!layer) {
    return;
  }

  if (fitBounds && typeof layer.getBounds === 'function') {
    map.fitBounds(layer.getBounds().pad(0.1));
  }

  if (openPopup && typeof layer.openPopup === 'function') {
    layer.openPopup();
  }
}

function refreshDataViews({ preserveSelection = false } = {}) {
  const nextData = recomputeFilteredData();

  if (
    !preserveSelection ||
    !nextData.some((tree) => tree.properties?.tree_id?.toString() === selectedTreeId)
  ) {
    selectedTreeId = null;
  }

  filteredData = applyCurrentSort(nextData);
  addTreesToMap(filteredData);
  populateResultsTable();
  updateDataStatus(`Showing ${filteredData.length} of ${originalTreeData.length} trees`);

  if (selectedTreeId) {
    highlightSelectedRow();
  }
}

// Toggle between normal view and prediction view
function togglePredictionMode(forceState) {
  const toggleButton = document.getElementById('predictionModeToggle');
  if (!toggleButton) {
    return;
  }

  if (typeof forceState === 'boolean') {
    isPredictionMode = forceState;
  } else {
    isPredictionMode = toggleButton.getAttribute('aria-checked') === 'true';
  }

  currentSortColumn = null;
  currentSortDirection = 'asc';

  toggleButton.setAttribute('aria-checked', String(isPredictionMode));
  toggleButton.setAttribute(
    'aria-label',
    isPredictionMode ? 'Switch to species display mode' : 'Switch to prediction display mode'
  );

  console.log('Prediction mode:', isPredictionMode ? 'ON' : 'OFF');

  const speciesFilters = document.getElementById('speciesFilters');
  const predictionFilters = document.getElementById('predictionFilters');

  if (speciesFilters) {
    speciesFilters.style.display = isPredictionMode ? 'none' : 'block';
  }

  if (predictionFilters) {
    predictionFilters.style.display = isPredictionMode ? 'block' : 'none';

    if (isPredictionMode) {
      const hasCorrect = predictionData.some((p) => !p.isTraining && p.correct);
      const hasIncorrect = predictionData.some((p) => !p.isTraining && !p.correct);
      const hasTraining = predictionData.some((p) => p.isTraining);

      const correctCheck = document.getElementById('filterCorrect');
      const incorrectCheck = document.getElementById('filterIncorrect');
      const trainingCheck = document.getElementById('filterTraining');

      if (correctCheck) correctCheck.disabled = !hasCorrect;
      if (incorrectCheck) incorrectCheck.disabled = !hasIncorrect;
      if (trainingCheck) trainingCheck.disabled = !hasTraining;
    }
  }

  if (isPredictionMode && predictionData.length === 0) {
    console.warn('No prediction data available');
    alert(
      'No prediction data available. Please check that the prediction_results.csv file is present.'
    );
  }

  refreshDataViews({ preserveSelection: true });
  updateLegendForPredictionMode();
}

// --- Application Initialization ---
document.addEventListener('DOMContentLoaded', async function () {
  console.log('LiDAR Tree Species Identification UI initialized successfully');

  registerServiceWorker();

  // Define the custom projection for PRS92 / Philippines zone 3 (EPSG:3123)
  if (typeof proj4 !== 'undefined') {
    // Updated projection parameters based on working simple-shapefile.html
    proj4.defs(
      'EPSG:3123',
      '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.99995 +x_0=500000 +y_0=0 +ellps=clrk66 +towgs84=-127.62,-67.24,-47.04,-3.068,4.903,1.578,-1.06 +units=m +no_defs'
    );
    console.log('EPSG:3123 projection definition successfully loaded');
  } else {
    console.error('proj4 library not loaded. Shapefile reprojection will fail.');
    alert('CRITICAL ERROR: proj4 library not found. The application cannot start.');
    return;
  }

  initializeMap();
  setupEventListeners();
  initPointCloudViewer();
  updateModelPerformance();
  
  // Collapse sidebar on mobile by default
  if (window.innerWidth <= 768) {
    const sidePanel = document.getElementById('sidePanel');
    if (sidePanel) {
      sidePanel.classList.add('collapsed');
      const panelToggle = document.getElementById('panelToggle');
      if (panelToggle) {
        panelToggle.setAttribute('aria-expanded', 'false');
        const icon = panelToggle.querySelector('[aria-hidden="true"]');
        if (icon) icon.textContent = '▶';
      }
    }
  }
  
  await loadData();

  // Load prediction data AFTER shapefile data is loaded, passing the tree data for species mapping
  const predictionLoad = await loadPredictionData(
    '/raw_data/prediction_results_top5_metrics.csv',
    originalTreeData
  );
  predictionData = predictionLoad.records || [];
  predictionMetrics = predictionLoad.metrics || {};
  rebuildPredictionIndex();
  updateModelPerformance();
  if (isPredictionMode) {
    refreshDataViews({ preserveSelection: true });
  }
  console.log(`Loaded ${predictionData.length} prediction records`);
  
  // Initialize Phase 1 features
  initializePhase1Features();
  if (predictionMetrics && Object.keys(predictionMetrics).length > 0) {
    console.log('Loaded prediction metrics:', predictionMetrics);
  }

  // Create a summary of which species each group represents and store it globally
  if (predictionData.length > 0) {
    predictionData.forEach((tree) => {
      const group = tree.actualGroup;
      if (group && !groupToSpeciesMapping[group]) {
        groupToSpeciesMapping[group] = tree.actual;
      }
    });
    console.log('Group to Species Summary:', groupToSpeciesMapping);

    // Update the modal with actual species information
    updateGroupInfoModal();
  }

  predictionSummary = computePredictionSummary(predictionData);
  renderConfusionMatrix();
  renderPerClassMetrics();

  // Log the first few prediction records for debugging
  if (predictionData.length > 0) {
    console.log('Sample prediction records:');
    for (let i = 0; i < Math.min(5, predictionData.length); i++) {
      const record = predictionData[i];
      if (record.isTraining) {
        console.log(`Tree ${record.treeId}: ${record.actual} (Training)`);
      } else {
        console.log(
          `Tree ${record.treeId}: ${record.actual} → ${record.predicted} (${record.correct ? 'Correct' : 'Incorrect'})`
        );
      }
    }
  }
});

/**
 * Sets up the main Leaflet map with a geographic projection and a tile layer.
 */
function initializeMap() {
  const center = [14.7137, 121.0707];
  
  // Define strict bounds for La Mesa to prevent unnecessary tile loading
  const lameSaBounds = L.latLngBounds(
    L.latLng(14.7050, 121.0650), // Southwest corner
    L.latLng(14.7180, 121.0800)  // Northeast corner
  );

  map = L.map('map', {
    maxBounds: lameSaBounds,
    maxBoundsViscosity: 1.0,
    center: center,
    zoom: 17,
    minZoom: 17,
    maxZoom: 20,
    noWrap: true,
    preferCanvas: true,
    zoomControl: false, // Disable default zoom control to move it
  });

  // Add zoom control to top-right to avoid overlap with map tools
  L.control.zoom({
    position: 'topright'
  }).addTo(map);

  // Base layers - NOT added by default to save requests
  const osmBase = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  });

  const satelliteBase = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19,
    }
  );

  // NO base layer by default - saves requests!
  // osmBase.addTo(map);

  // Create forest tile layer with aggressive caching
  const forestTiles = L.tileLayer('/tiles/{z}/{x}/{y}.png', {
    attribution: 'Forest Tiles &copy; natadecua',
    minZoom: 17,
    maxZoom: 20,
    tms: true,
    opacity: 1.0,
    crossOrigin: true,
    keepBuffer: 1,
    reuseTiles: true,
    updateWhenIdle: true,
    updateWhenZooming: false,
    bounds: lameSaBounds,
  });

  // Add forest tiles to the map
  forestTiles.addTo(map);

  const baseLayers = {
    OpenStreetMap: osmBase,
    'Esri Satellite': satelliteBase,
  };

  const overlays = {
    'La Mesa Forest Tiles': forestTiles,
    'Tree Crowns': treeLayers,
  };

  L.control.layers(baseLayers, overlays).addTo(map);

  treeLayers.addTo(map);

  // This forces Leaflet to re-calculate its container size after all CSS has been applied.
  setTimeout(() => {
    map.invalidateSize();
    // Start at a higher zoom level to load fewer tiles
    map.setView(center, 17);
  }, 100);
}

/**
 * Orchestrates the loading of all initial data.
 */
async function loadData() {
  updateDataStatus('Loading raw data...');
  updateShapefileStatus('⏳', 'Loading shapefile');
  try {
    await loadAndProcessShapefiles();
    updateDataStatus('Data load complete.');
    console.log('Data loading complete, shapefiles should be visible');
  } catch (e) {
    console.error('Data load error:', e);
    updateDataStatus('Error loading data. See console for details.');
  }
}

/**
 * Creates a species legend for the map
 */
function collectSpeciesData(sourceFeatures = null) {
  const effectiveSource =
    Array.isArray(sourceFeatures) && sourceFeatures.length > 0
      ? sourceFeatures
      : Array.isArray(filteredData) && filteredData.length > 0
        ? filteredData
        : originalTreeData;

  // Get unique species from the data with all attributes
  const speciesInfo = {};

  effectiveSource.forEach((tree) => {
    const props = tree.properties || {};
    const commonName = props.Cmmn_Nm || props.cmmn_nm || 'Unknown';

    if (commonName !== 'Unknown') {
      if (!speciesInfo[commonName]) {
        speciesInfo[commonName] = {
          count: 0,
          color: getSpeciesColor(commonName),
          scientificName: props.Scntf_N || props.scntf_n || null,
          family: props.Family || props.family || null,
          order: props.Order || props.order || null,
          className: props.Class || props.class || null,
        };
      }

      speciesInfo[commonName].count++;
    }
  });

  return speciesInfo;
}

/**
 * Create and display a legend showing all tree species and their colors
 */
function createSpeciesLegend() {
  // Remove existing legend if it exists
  const existingLegend = document.querySelector('.species-legend-control');
  if (existingLegend) {
    existingLegend.remove();
  }

  // Create a new control for the legend
  const legendControl = L.control({ position: 'bottomright' });

  legendControl.onAdd = function () {
    const container = L.DomUtil.create('section', 'species-legend-control');
    container.setAttribute('role', 'region');
    container.setAttribute(
      'aria-label',
      isPredictionMode ? 'Legend for prediction accuracy' : 'Legend for tree species'
    );
    container.classList.toggle('is-collapsed', isLegendCollapsed);

    const header = document.createElement('div');
    header.className = 'species-legend-control__header';

    const title = document.createElement('p');
    title.className = 'species-legend-control__title';
    title.textContent = 'Map Legend';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'species-legend-control__toggle';
    toggleButton.setAttribute('aria-label', 'Toggle legend visibility');
    toggleButton.setAttribute('aria-expanded', String(!isLegendCollapsed));
    toggleButton.textContent = isLegendCollapsed ? 'Show' : 'Hide';

    const bodyId = `speciesLegendBody-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const body = document.createElement('div');
    body.className = 'species-legend-control__body';
    body.id = bodyId;
    toggleButton.setAttribute('aria-controls', bodyId);

    toggleButton.addEventListener('click', () => {
      isLegendCollapsed = !isLegendCollapsed;
      container.classList.toggle('is-collapsed', isLegendCollapsed);
      toggleButton.setAttribute('aria-expanded', String(!isLegendCollapsed));
      toggleButton.textContent = isLegendCollapsed ? 'Show' : 'Hide';
    });

    header.appendChild(title);
    header.appendChild(toggleButton);
    container.appendChild(header);
    container.appendChild(body);

    const activeFeatures =
      Array.isArray(filteredData) && filteredData.length > 0 ? filteredData : originalTreeData;

    const modeSubtitle = document.createElement('div');
    modeSubtitle.className = 'species-legend-control__subtitle';
    modeSubtitle.textContent = isPredictionMode ? 'Prediction Results' : 'Tree Species';
    body.appendChild(modeSubtitle);

    if (isPredictionMode) {
      // Prediction mode legend

      const stats = {
        training: 0,
        correct: 0,
        incorrect: 0,
        groups: new Map(),
      };

      activeFeatures.forEach((feature) => {
        const treeId = feature?.properties?.tree_id;
        if (!treeId) {
          return;
        }

        const prediction = getPredictionForTree(treeId);
        if (!prediction) {
          return;
        }

        if (prediction.isTraining) {
          stats.training += 1;
        } else if (prediction.correct) {
          stats.correct += 1;
        } else {
          stats.incorrect += 1;
        }

        const groupKey = prediction.actualGroup || 'Unknown';
        if (!stats.groups.has(groupKey)) {
          stats.groups.set(groupKey, {
            count: 0,
            species: prediction.actual || null,
          });
        }

        const entry = stats.groups.get(groupKey);
        entry.count += 1;
        if (!entry.species && prediction.actual) {
          entry.species = prediction.actual;
        }
      });

      const totalPredictions = stats.correct + stats.incorrect;
      const totalTrees = totalPredictions + stats.training;

      if (totalTrees === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'species-legend-control__meta';
        emptyMessage.textContent = 'No prediction records match the current filters.';
        body.appendChild(emptyMessage);
        return container;
      }

      const appendLegendRow = (label, count, color) => {
        const item = document.createElement('div');
        item.className = 'species-legend-control__row';

        const colorBox = document.createElement('span');
        colorBox.className = 'species-legend-control__swatch';
        colorBox.style.backgroundColor = color;

        const labelSpan = document.createElement('span');
        labelSpan.textContent = `${label} (${count})`;

        item.appendChild(colorBox);
        item.appendChild(labelSpan);
        body.appendChild(item);
      };

      appendLegendRow('Training Data', stats.training, '#FFC107');
      appendLegendRow('Correct', stats.correct, '#4CAF50');
      appendLegendRow('Incorrect', stats.incorrect, '#F44336');

      const separator = document.createElement('hr');
      separator.className = 'species-legend-control__divider';
      body.appendChild(separator);

      if (totalPredictions > 0) {
        const accuracy = ((stats.correct / totalPredictions) * 100).toFixed(1);
        const accuracyItem = document.createElement('div');
        accuracyItem.className = 'species-legend-control__meta';
        accuracyItem.textContent = `Test Accuracy: ${accuracy}%`;
        body.appendChild(accuracyItem);
      } else {
        const accuracyItem = document.createElement('div');
        accuracyItem.className = 'species-legend-control__meta';
        accuracyItem.textContent = 'Test Accuracy: —';
        body.appendChild(accuracyItem);
      }

      const trainingRatio = totalTrees === 0 ? 0 : (stats.training / totalTrees) * 100;
      const testRatio = totalTrees === 0 ? 0 : (totalPredictions / totalTrees) * 100;

      const ratioItem = document.createElement('div');
      ratioItem.className = 'species-legend-control__meta';
      ratioItem.textContent = `Train/Test: ${trainingRatio.toFixed(1)}% / ${testRatio.toFixed(1)}%`;
      body.appendChild(ratioItem);

      const groupEntries = Array.from(stats.groups.entries())
        .filter(([, info]) => info && info.count > 0)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);

      if (groupEntries.length > 0) {
        const groupSeparator = document.createElement('hr');
        groupSeparator.className = 'species-legend-control__divider';
        body.appendChild(groupSeparator);

        const groupExplanation = document.createElement('div');
        groupExplanation.className = 'species-legend-control__meta';

        let groupText = '<strong>Species Groups (Filtered):</strong><br>';
        groupEntries.forEach(([groupKey, info]) => {
          const formatted =
            formatGroupLabel(groupKey) || (groupKey ? `Group ${groupKey}` : 'Group Unknown');
          const suffixNeeded =
            info.species && !formatted.toLowerCase().includes(info.species.toLowerCase());
          const displayLabel = suffixNeeded ? `${formatted} · ${info.species}` : formatted;
          groupText += `${displayLabel} (${info.count})<br>`;
        });

        groupExplanation.innerHTML = groupText;
        body.appendChild(groupExplanation);
      }
    } else {
      // Regular species mode legend
      // Collect species data
      const speciesData = collectSpeciesData(activeFeatures);
      const speciesNames = Object.keys(speciesData).sort();

      // Add each species to the legend
      speciesNames.forEach((name) => {
        const data = speciesData[name];
        const item = document.createElement('div');
        item.className = 'species-legend-control__row';

        const colorBox = document.createElement('span');
        colorBox.className = 'species-legend-control__swatch';
        colorBox.style.backgroundColor = data.color;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${name} (${data.count})`;

        item.appendChild(colorBox);
        item.appendChild(nameSpan);
        body.appendChild(item);
      });

      // Also add dynamically assigned colors
      const dynamicAssignments = colorHelper.getDynamicAssignments();
      const dynamicSpeciesNames = Object.keys(dynamicAssignments)
        .filter((name) => !speciesNames.includes(name))
        .sort();

      if (dynamicSpeciesNames.length > 0) {
        // Add separator if we have both predefined and dynamic colors
        if (speciesNames.length > 0) {
          const separator = document.createElement('hr');
          separator.className = 'species-legend-control__divider';
          body.appendChild(separator);
        }

        dynamicSpeciesNames.forEach((name) => {
          const item = document.createElement('div');
          item.className = 'species-legend-control__row';

          const colorBox = document.createElement('span');
          colorBox.className = 'species-legend-control__swatch';
          colorBox.style.backgroundColor = dynamicAssignments[name];

          const nameSpan = document.createElement('span');
          nameSpan.textContent = name;

          item.appendChild(colorBox);
          item.appendChild(nameSpan);
          body.appendChild(item);
        });
      }
    }

    // Prevent click events from propagating to the map
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    return container;
  };

  // Add the legend to the map
  legendControl.addTo(map);
}

// Helper function to update the legend when switching between modes
function updateLegendForPredictionMode() {
  // Clear any existing dynamic species colors when switching modes
  if (isPredictionMode) {
    // Reset dynamic colors when entering prediction mode
    colorHelper.reset();
  }

  // Recreate the legend with the appropriate mode
  createSpeciesLegend();
}

/**
 * Update the Group Info Modal with actual species names
 */
function updateGroupInfoModal() {
  const modalBody = document.getElementById('groupInfoModalDescription');
  if (!modalBody) return;

  // Count trees per group
  const groupCounts = {};
  predictionData.forEach((tree) => {
    const group = tree.actualGroup;
    if (group) {
      groupCounts[group] = (groupCounts[group] || 0) + 1;
    }
  });

  let modalContent =
    '<p>Trees in the La Mesa Eco Park were classified into five (5) groups representing the top 5 most common tree species in the park:</p>';

  for (let i = 1; i <= 5; i++) {
    const groupKey = i.toString();
    const speciesName = groupToSpeciesMapping[groupKey] || `Group ${i}`;
    const count = groupCounts[groupKey] || 0;

    if (count > 0) {
      modalContent += `
                <section>
                    <h3>Group ${i}: ${speciesName} (${count} trees)</h3>
                    <p>The ${i === 1 ? 'most' : i === 2 ? 'second most' : i === 3 ? 'third most' : i === 4 ? 'fourth most' : 'fifth most'} common tree species in the dataset.</p>
                </section>
            `;
    }
  }

  modalContent += `
        <p style="margin-top: 20px; font-style: italic; color: #666;">
            Note: These groups are based on the top 5 most frequently occurring species in the park.
        </p>
    `;

  modalBody.innerHTML = modalContent;
}

function handlePointCloudButtonClick(event) {
  const trigger = event.target.closest('.view-point-cloud-btn');
  if (!trigger) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const treeId = trigger.getAttribute('data-tree-id');
  if (!treeId) {
    console.warn('Point cloud button missing tree ID');
    return;
  }

  const speciesValue = trigger.getAttribute('data-species') || '';
  openPointCloudViewer({
    treeId,
    species: speciesValue,
  });
}

/**
 * Sets up all event listeners for UI elements.
 */
function setupEventListeners() {
  const panelToggle = document.getElementById('panelToggle');
  const sidePanel = document.getElementById('sidePanel');

  if (panelToggle && sidePanel) {
    const updatePanelState = (collapsed) => {
      panelToggle.setAttribute('aria-expanded', String(!collapsed));
      const icon = panelToggle.querySelector('[aria-hidden="true"]');
      if (icon) {
        icon.textContent = collapsed ? '▶' : '◀';
      }
    };

    panelToggle.addEventListener('click', () => {
      const collapsed = sidePanel.classList.toggle('collapsed');
      
      // Toggle class on container to adjust grid layout
      const container = document.querySelector('.container');
      if (container) {
        container.classList.toggle('sidebar-collapsed', collapsed);
      }

      updatePanelState(collapsed);
      setTimeout(() => {
        map.invalidateSize({ animate: true });
      }, 300);
    });

    panelToggle.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        panelToggle.click();
      }
    });

    updatePanelState(sidePanel.classList.contains('collapsed'));
  }

  initializeMapControlsSheet();

  const clearFiltersBtn = document.getElementById('clearFiltersBtn');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      resetFilterControlsToDefaults();
      refreshDataViews({ preserveSelection: true });
    });
  }

  const resultsCards = document.getElementById('resultsCards');
  if (resultsCards) {
    resultsCards.addEventListener('click', (event) => {
      const pointCloudButton = event.target.closest('.view-point-cloud-btn');
      if (pointCloudButton) {
        return;
      }

      const focusButton = event.target.closest('[data-tree-action="focus"]');
      const card = event.target.closest('.tree-card');
      const treeId = focusButton?.dataset.treeId || card?.dataset.treeId;

      if (!treeId) {
        return;
      }

      if (focusButton) {
        event.preventDefault();
        event.stopPropagation();
      }

      selectedTreeId = treeId.toString();
      highlightSelectedRow();
      focusTreeOnMap(treeId.toString(), { openPopup: true, fitBounds: true });
    });
  }

  // Enable prediction filters
  ['filterCorrect', 'filterIncorrect', 'filterTraining'].forEach((id) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.disabled = false; // Enable the checkboxes
      checkbox.checked = true; // Check them all by default

      // Add event listener for filter change
      checkbox.addEventListener('change', () => {
        if (isPredictionMode) {
          refreshDataViews({ preserveSelection: true });
        }
      });
    }
  });

  // Add filter for unknown species
  const filterControls = document.querySelector('.filter-controls');
  if (filterControls) {
    // First check if we already added this filter
    if (!document.getElementById('filterUnknownSpecies')) {
      const unknownFilter = document.createElement('label');
      unknownFilter.innerHTML = `
                <input type="checkbox" id="filterUnknownSpecies" checked>
                Hide Unknown Species
            `;
      filterControls.appendChild(unknownFilter);

      // Add event listener for the new filter
      document.getElementById('filterUnknownSpecies').addEventListener('change', () => {
        refreshDataViews({ preserveSelection: true });
      });
    }

    // Add prediction toggle switch
    const predictionToggleElem = document.getElementById('predictionModeToggle');
    if (predictionToggleElem) {
      const handlePredictionToggle = () => {
        const next = predictionToggleElem.getAttribute('aria-checked') !== 'true';
        togglePredictionMode(next);
      };

      predictionToggleElem.addEventListener('click', handlePredictionToggle);

      predictionToggleElem.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          handlePredictionToggle();
        }
      });
    }
  }

  document.getElementById('searchInput').addEventListener('input', (e) => {
    filterTableData(e.target.value);
  });

  document.getElementById('loadLocalShapefileBtn').addEventListener('click', () => {
    alert('Local file loading is disabled in this example. Data is loaded from the server.');
  });

  // Group information modal functionality
  const groupInfoModal = document.getElementById('groupInfoModal');
  const showGroupInfoBtn = document.getElementById('showGroupInfoBtn');
  const closeGroupModal = document.getElementById('closeGroupModal');
  const closeModalBtn = document.getElementById('closeModalBtn');

  if (groupInfoModal) {
    groupInfoModal.setAttribute('aria-hidden', 'true');
  }

  const closeGroupModalDialog = () => {
    if (!groupInfoModal) return;
    groupInfoModal.classList.remove('show');
    groupInfoModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    releaseFocusTrap(groupInfoModal);
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  };

  const openGroupModalDialog = () => {
    if (!groupInfoModal) return;
    lastFocusedElement = document.activeElement;
    groupInfoModal.classList.add('show');
    groupInfoModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    activateFocusTrap(groupInfoModal, closeGroupModalDialog);
  };

  if (showGroupInfoBtn) {
    showGroupInfoBtn.addEventListener('click', () => {
      openGroupModalDialog();
    });
  }

  if (closeGroupModal) {
    closeGroupModal.addEventListener('click', closeGroupModalDialog);
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeGroupModalDialog);
  }

  if (groupInfoModal) {
    groupInfoModal.addEventListener('click', (event) => {
      if (event.target === groupInfoModal) {
        closeGroupModalDialog();
      }
    });
  }

  // Initialize toggle aria-labels
  togglePredictionMode(false);

  document.addEventListener('click', handlePointCloudButtonClick);
}

/**
 * Load shapefiles, process their properties, and add them to the map.
 */
/**
 * Calculate and update summary statistics about the tree data
 */
function updateTreeStatistics() {
  const totalTreesEl = document.getElementById('datasetTotalTrees');
  const speciesEl = document.getElementById('datasetSpeciesTypes');
  const crownEl = document.getElementById('datasetAvgCrown');

  if (!totalTreesEl || !speciesEl || !crownEl) {
    return;
  }

  if (!originalTreeData || originalTreeData.length === 0) {
    totalTreesEl.textContent = '—';
    speciesEl.textContent = '—';
    crownEl.textContent = '—';
    return;
  }

  const { speciesCounts } = summariseTreeDataset(originalTreeData);
  const totalTrees = originalTreeData.length;
  const uniqueSpecies = Object.keys(speciesCounts).length;

  const crownValues = originalTreeData
    .map((feature) => {
      const props = feature?.properties || {};
      const raw = coalesceProperty(props, [
        'crown_diameter_m',
        'specs_d',
        'specis_d',
        'crown_width',
        'width',
        'WIDTH',
      ]);
      const numeric = Number(raw);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    })
    .filter((value) => value !== null);

  const averageCrown = crownValues.length
    ? crownValues.reduce((sum, value) => sum + value, 0) / crownValues.length
    : null;

  totalTreesEl.textContent = totalTrees.toLocaleString();
  speciesEl.textContent = uniqueSpecies.toLocaleString();
  crownEl.textContent = averageCrown
    ? formatMeasurement(averageCrown, 'm', { maximumFractionDigits: 2 })
    : '—';
}

async function loadAndProcessShapefiles() {
  try {
    const { geojson, metadata } = await loadTreeCrownGeoJSON();

    if (metadata.prjText) {
      console.log('PRJ file content:', metadata.prjText);
    }

    console.log(
      `Shapefile loaded (${metadata.sourceId}) with ${geojson.features.length} features from ${metadata.sourcePaths.shp}.`
    );
    console.log('Geometry types in shapefile:', metadata.geometryTypes);

    originalTreeData = geojson.features.map((feature, index) => {
      const properties = feature.properties || {};
      const treeId =
        properties.tree_id ||
        properties.id ||
        properties.FID ||
        `T${(index + 1).toString().padStart(3, '0')}`;
      const speciesField =
        properties.species || properties.SPECIES || properties.Species || 'Unknown';

      const normaliseNumeric = (value) => {
        const numeric = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      };

      const selectFirstNumeric = (keys, source) => {
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            const numeric = normaliseNumeric(source[key]);
            if (numeric !== null && numeric > 0) {
              return numeric;
            }
          }
        }
        return null;
      };

      const planarArea = computePlanarCanopyArea(feature.geometry);
      const areaValue = selectFirstNumeric(['area', 'Area', 'AREA'], properties);
      const resolvedArea = planarArea ?? areaValue ?? null;
      const perimeterValue = selectFirstNumeric(
        ['perimeter', 'perimtr', 'perim', 'Perimeter', 'PERIMTR'],
        properties
      );
      const existingDiameter = selectFirstNumeric(
        ['crown_diameter_m', 'specs_d', 'specis_d', 'crown_width', 'width', 'WIDTH'],
        properties
      );
      const derivedDiameter = existingDiameter ?? deriveCrownDiameterFromArea(resolvedArea);

      return {
        ...feature,
        properties: {
          ...properties,
          tree_id: treeId,
          predicted_species: 'N/A', // Simplified for now
          ground_truth_species: speciesField,
          status: 'Visible', // A single status to ensure it's not filtered out
          area: resolvedArea ?? null,
          planar_canopy_area_m2: planarArea ?? null,
          perimeter: perimeterValue ?? properties.perimeter ?? properties.perimtr ?? null,
          crown_diameter_m: derivedDiameter ?? null,
        },
      };
    });

    refreshDataViews();
    updateTreeStatistics(); // Added statistics update
    hideLoadingIndicator();
    updateShapefileStatus('✅', `Trees: ${originalTreeData.length}`);

    console.log(`Processed and initiated mapping for ${originalTreeData.length} trees.`);
  } catch (error) {
    console.error('Error loading or processing shapefiles:', error);
    updateShapefileStatus('❌', 'Failed to load shapefiles');
    throw error;
  }
}

/**
 * Add tree polygons to the Leaflet map using L.Proj.geoJson for automatic reprojection.
 */
function addTreesToMap(data = filteredData) {
  treeLayers.clearLayers();
  treeLayerIndex.clear();

  if (!data || data.length === 0) {
    createSpeciesLegend();
    return;
  }

  const geoJsonLayer = L.geoJSON(data, {
    style: function (feature) {
      // Get species from properties - prioritize Cmmn_Nm (Common Name) field
      const species =
        feature.properties.Cmmn_Nm ||
        feature.properties.cmmn_nm ||
        feature.properties.species ||
        feature.properties.SPECIES ||
        feature.properties.Species ||
        feature.properties.ground_truth_species ||
        'Unknown';

      // Get the appropriate color for this species, passing tree ID for prediction mode
      const speciesColor = getSpeciesColor(species, feature.properties.tree_id);
      
      // Check if this tree is selected
      const treeId = (feature.properties.tree_id ?? feature.properties.id ?? feature.properties.FID)?.toString();
      const isSelected = selectedTreeId && treeId === selectedTreeId;

      // Apply different styles based on geometry type
      if (feature.geometry.type.includes('Polygon')) {
        return {
          color: isSelected ? '#2563eb' : speciesColor,
          weight: isSelected ? 5 : 2,
          opacity: isSelected ? 1 : 0.8,
          fillColor: speciesColor,
          fillOpacity: isSelected ? 0.7 : 0.5,
          className: isSelected ? 'selected-polygon' : '',
        };
      } else if (feature.geometry.type.includes('LineString')) {
        return {
          color: isSelected ? '#2563eb' : '#0000ff', // Blue for lines
          weight: isSelected ? 5 : 3,
          opacity: 1.0,
          dashArray: '5, 10', // Dashed line for better visibility
        };
      } else {
        return {
          color: isSelected ? '#2563eb' : speciesColor,
          weight: isSelected ? 6 : 4,
          opacity: 1.0,
          radius: isSelected ? 10 : 8,
          fillColor: speciesColor,
          fillOpacity: isSelected ? 0.9 : 0.7,
        };
      }
    },
    onEachFeature: (feature, layer) => {
      const props = feature.properties;
      const rawTreeId = props.tree_id ?? props.id ?? props.FID ?? null;
      const treeId = rawTreeId != null ? rawTreeId.toString() : null;
      if (treeId) {
        treeLayerIndex.set(treeId, layer);
      }

      const toNumeric = (value) => {
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value : null;
        }

        if (typeof value === 'string') {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        }

        return null;
      };

      let areaSqMeters = toNumeric(coalesceProperty(props, ['planar_canopy_area_m2', 'area']));

      let planarArea = null;
      if (
        feature.geometry &&
        typeof feature.geometry.type === 'string' &&
        feature.geometry.type.includes('Polygon')
      ) {
        try {
          planarArea = computePlanarCanopyArea(layer.getLatLngs());
        } catch (error) {
          console.warn('Error calculating planar canopy area:', error);
        }
      }

      if (planarArea !== null && planarArea > 0) {
        areaSqMeters = planarArea;
        props.planar_canopy_area_m2 = planarArea;
      } else {
        delete props.planar_canopy_area_m2;
      }

      if (
        (areaSqMeters === null || areaSqMeters <= 0) &&
        feature.geometry &&
        typeof feature.geometry.type === 'string' &&
        feature.geometry.type.includes('Polygon')
      ) {
        try {
          const computedArea = computeGeodesicFeatureArea(layer.getLatLngs());
          if (computedArea !== null && computedArea > 0) {
            areaSqMeters = computedArea;
          }
        } catch (error) {
          console.warn('Error calculating geodesic area:', error);
        }
      }

      if (areaSqMeters !== null && areaSqMeters > 0) {
        props.area = areaSqMeters;
      } else {
        areaSqMeters = null;
        delete props.area;
        delete props.planar_canopy_area_m2;
      }

      const existingDiameter = toNumeric(
        coalesceProperty(props, [
          'crown_diameter_m',
          'specs_d',
          'specis_d',
          'crown_width',
          'width',
          'WIDTH',
        ])
      );

      if ((existingDiameter === null || existingDiameter <= 0) && areaSqMeters !== null) {
        const derived = deriveCrownDiameterFromArea(areaSqMeters);
        if (derived !== null) {
          props.crown_diameter_m = derived;
        }
      }

      const species =
        props.Cmmn_Nm ||
        props.cmmn_nm ||
        props.species ||
        props.SPECIES ||
        props.Species ||
        props.ground_truth_species ||
        'Unknown';

      const speciesDisplay = escapeHtml(species);
      const treeIdDisplay = escapeHtml(treeId ?? 'ID Unknown');

      const crownDiameterRaw = coalesceProperty(props, [
        'crown_diameter_m',
        'specs_d',
        'specis_d',
        'crown_width',
        'width',
        'WIDTH',
      ]);
      const crownDiameterDisplay = formatMeasurement(
        crownDiameterRaw,
        props.width_unit || props.crown_width_unit || props.diameter_unit || 'm',
        { maximumFractionDigits: 2 }
      );
      const perimeterDisplay = formatMeasurement(
        coalesceProperty(props, ['perimtr', 'perimeter', 'perim']),
        'm',
        { maximumFractionDigits: 2 }
      );
      const groupDisplay = formatGroupLabel(coalesceProperty(props, ['group_d', 'group_id']));

      const quickFacts = [
        { label: 'Group', value: groupDisplay },
        { label: 'Perimeter', value: perimeterDisplay },
        { label: 'Crown Diameter', value: crownDiameterDisplay },
      ].filter((fact) => fact.value);

      const quickFactsBlock = quickFacts.length
        ? `<div style="margin-bottom: 15px;">${quickFacts
            .map(
              (fact) =>
                `<div><strong>${escapeHtml(fact.label)}:</strong> ${escapeHtml(fact.value)}</div>`
            )
            .join('')}</div>`
        : '';

      const propertyDetails = buildPropertyDetails(props);
      const propertiesBlock =
        propertyDetails.count > 0
          ? `<details>
                            <summary style="cursor: pointer; margin-bottom: 8px; color: #007bff;">Show Tree Attributes</summary>
                            <div style="max-height: 220px; overflow-y: auto; font-size: 12px; border: 1px solid #eee; padding: 8px; border-radius: 4px;">
                                ${propertyDetails.html}
                            </div>
                        </details>`
          : `<p style="font-size: 12px; color: #6b7280; margin: 0;">No additional attributes available.</p>`;

      const predictionRecord = getPredictionForTree(treeId);
      let predictionBlock = '';
      if (isPredictionMode && predictionRecord) {
        if (predictionRecord.isTraining) {
          predictionBlock = `
                        <div style="margin-bottom: 15px; padding: 10px; background-color: #fefce8; border-radius: 4px; border-left: 4px solid #FACC15;">
                            <h4 style="margin: 0 0 8px 0;">Training Data</h4>
                            <div><strong>Species:</strong> ${escapeHtml(predictionRecord.actual)}</div>
                            <div><strong>Status:</strong> <span style="color:#D97706; font-weight:bold;">Used for Training</span></div>
                        </div>
                    `;
        } else {
          const statusColor = predictionRecord.correct ? '#22c55e' : '#ef4444';
          const statusText = predictionRecord.correct ? '✓ Correct' : '✗ Incorrect';
          predictionBlock = `
                        <div style="margin-bottom: 15px; padding: 10px; background-color: #f5f5f5; border-radius: 4px; border-left: 4px solid ${statusColor};">
                            <h4 style="margin: 0 0 8px 0;">Prediction Result</h4>
                            <div><strong>Actual:</strong> ${escapeHtml(predictionRecord.actual)}</div>
                            <div><strong>Predicted:</strong> ${escapeHtml(predictionRecord.predicted)}</div>
                            <div><strong>Status:</strong> <span style="color:${statusColor}; font-weight:bold;">${statusText}</span></div>
                        </div>
                    `;
        }
      }

      const pointCloudButtonBlock = treeId
  ? `<div class="tree-popup__actions"><button type="button" class="view-point-cloud-btn" data-tree-id="${escapeHtml(treeId)}" data-species="${escapeHtml(species)}">View 3D Point Cloud</button></div>`
        : '';

      const popupBody = [pointCloudButtonBlock, predictionBlock, quickFactsBlock, propertiesBlock]
        .filter(Boolean)
        .join('');

      const popupContent = `
                <div class="tree-popup" role="presentation">
                    <div class="tree-popup__header" style="background-color: ${getSpeciesColor(species, props.tree_id)};">
                        <h4>Tree ${treeIdDisplay}</h4>
                        <div>${speciesDisplay}</div>
                    </div>
                    <div class="tree-popup__body">${popupBody || ''}</div>
                </div>
            `;

      layer.bindPopup(popupContent);

      const treeIdLabel = treeId ?? 'Unknown';
      let tooltipContent = `Tree ${treeIdLabel}: ${species}`;

      if (isPredictionMode && predictionRecord) {
        if (predictionRecord.isTraining) {
          tooltipContent = `Tree ${treeIdLabel}: ${predictionRecord.actual || 'Unknown'} (Training)`;
        } else {
          const statusText = predictionRecord.correct ? 'Correct' : 'Incorrect';
          const actual = predictionRecord.actual || 'Unknown';
          const predicted = predictionRecord.predicted || 'Unknown';
          tooltipContent = `Tree ${treeIdLabel}: ${actual} → ${predicted} (${statusText})`;
        }
      }

      layer.bindTooltip(tooltipContent, {
        direction: 'top',
        sticky: true,
        opacity: 0.9,
        className: 'custom-tooltip',
      });

      layer.on('click', () => {
        if (!treeId) {
          return;
        }

        const previousSelectedId = selectedTreeId;
        selectedTreeId = treeId;
        
        // Update styles for previous and new selection
        if (previousSelectedId && treeLayerIndex.has(previousSelectedId)) {
          const prevLayer = treeLayerIndex.get(previousSelectedId);
          prevLayer.setStyle({
            color: getSpeciesColor(prevLayer.feature.properties.Cmmn_Nm || 'Unknown', previousSelectedId),
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.5,
          });
        }
        
        // Highlight the newly selected tree
        layer.setStyle({
          color: '#2563eb',
          weight: 5,
          opacity: 1,
          fillOpacity: 0.7,
        });
        layer.bringToFront();
        
        highlightSelectedRow();
        focusTreeOnMap(treeId, { openPopup: true, fitBounds: false });
      });
    },
  });

  // Add the GeoJSON layer to the map through the layer group
  treeLayers.addLayer(geoJsonLayer);
  console.log('Added GeoJSON layer to treeLayers group');

  // Update the species legend to reflect any new colors
  createSpeciesLegend();

  // Zoom to the bounds of the features on the initial load.
  if (geoJsonLayer.getBounds && geoJsonLayer.getBounds().isValid()) {
    if (!selectedTreeId) {
      console.log('Fitting map to tree bounds');
      map.fitBounds(geoJsonLayer.getBounds().pad(0.1));
    }
  } else {
    console.warn('Could not fit to bounds - bounds invalid or not available');
  }
}

/**
 * Populate the results table with data. (Simplified)
 */
function populateResultsTable() {
  const tableBody = document.getElementById('tableBody');
  tableBody.innerHTML = '';

  // Update table headers based on mode
  const tableHeaders = document.querySelector('#resultsTable thead tr');

  if (isPredictionMode) {
    tableHeaders.innerHTML = `
            <th data-sort="tree_id">ID</th>
            <th data-sort="actual">Actual Species</th>
            <th data-sort="predicted">Predicted Species</th>
            <th data-sort="status">Status</th>
            <th data-sort="crown_diameter_m">Crown Diameter (m)</th>
        `;

    // Show the message in console for debugging
    console.log('Switched to prediction mode headers');
  } else {
    tableHeaders.innerHTML = `
            <th data-sort="tree_id">ID</th>
            <th data-sort="Cmmn_Nm">Common Name</th>
            <th data-sort="Scntf_N">Scientific Name</th>
            <th data-sort="Family">Family</th>
            <th data-sort="crown_diameter_m">Crown Diameter (m)</th>
        `;

    // Show the message in console for debugging
    console.log('Switched to regular mode headers');
  }

  bindSortHeaderEvents();
  updateSortIndicators();

  const columnCount = tableHeaders.querySelectorAll('th').length;

  // Update results counter
  updateResultsCounter();
  
  // Update export button state
  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) {
    exportBtn.disabled = filteredData.length === 0;
  }

  if (filteredData.length === 0) {
    showEmptyState();
    return;
  }

  // Populate the table based on mode
  filteredData.forEach((tree) => {
    const props = tree.properties;
    const treeId = props.tree_id;
    const row = document.createElement('tr');
    row.dataset.treeId = treeId;

    if (isPredictionMode) {
      // Find prediction for this tree
      const treeIdStr = treeId.toString();
      const treeData = getPredictionForTree(treeIdStr);

      if (treeData) {
        const props = tree.properties || {};
        const crownDiameterRaw = coalesceProperty(props, [
          'crown_diameter_m',
          'specs_d',
          'specis_d',
          'crown_width',
          'width',
          'WIDTH',
        ]);
        const crownDiameterNumeric = Number(crownDiameterRaw);
        const crownDiameterDisplay =
          formatMeasurement(crownDiameterNumeric, 'm', { maximumFractionDigits: 2 }) ?? '—';

        if (treeData.isTraining) {
          // Display training data differently
          row.innerHTML = `
                        <td>${treeId}</td>
                        <td>${treeData.actual}</td>
                        <td>N/A</td>
                        <td>
                            <span style="color:#FFC107; font-weight:bold;">
                                TRAINING
                            </span>
                        </td>
                        <td>${crownDiameterDisplay}</td>
                    `;

          // Add training data highlighting
          row.style.backgroundColor = 'rgba(255, 193, 7, 0.05)';
        } else {
          // Regular prediction data
          const statusColor = treeData.correct ? '#4CAF50' : '#F44336';
          const statusText = treeData.correct ? 'CORRECT' : 'INCORRECT';
          console.log(`Table row: Tree ${treeIdStr} found in predictions, status: ${statusText}`);

          row.innerHTML = `
                        <td>${treeId}</td>
                        <td>${treeData.actual}</td>
                        <td>${treeData.predicted}</td>
                        <td>
                            <span style="color:${statusColor}; font-weight:bold;">
                                ${treeData.correct ? '✓' : '✗'} ${statusText}
                            </span>
                        </td>
                        <td>${crownDiameterDisplay}</td>
                    `;

          // Add highlighting based on correctness
          row.style.backgroundColor = treeData.correct
            ? 'rgba(76, 175, 80, 0.05)'
            : 'rgba(244, 67, 54, 0.05)';
        }
      }
    } else {
      // Regular mode display
      const commonName = props.Cmmn_Nm || props.cmmn_nm || 'Unknown';
      const scientificName = props.Scntf_N || props.scntf_n || '-';
      const family = props.Family || props.family || '-';
      const crownDiameterRaw = coalesceProperty(props, [
        'crown_diameter_m',
        'specs_d',
        'specis_d',
        'crown_width',
        'width',
        'WIDTH',
      ]);
      const crownDiameterNumeric = Number(crownDiameterRaw);
      const crownDiameterDisplay =
        formatMeasurement(crownDiameterNumeric, 'm', { maximumFractionDigits: 2 }) ?? '—';
      const color = getSpeciesColor(commonName);

      row.innerHTML = `
                <td>${treeId}</td>
                <td>
                    <div style="display:flex; align-items:center;">
                        <span style="display:inline-block; width:12px; height:12px; background-color:${color}; 
                               border-radius:3px; margin-right:6px;"></span>
                        ${commonName}
                    </div>
                </td>
                <td><em>${scientificName}</em></td>
                <td>${family}</td>
                <td>${crownDiameterDisplay}</td>
            `;
    }

    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      selectedTreeId = treeId.toString();
      highlightSelectedRow();
      focusTreeOnMap(selectedTreeId);
    });

    tableBody.appendChild(row);
  });

  renderResultsCards(filteredData);
  highlightSelectedRow();
}

function resolveTreeCardStatus(treeId, groupLabel) {
  if (isPredictionMode && treeId) {
    const prediction = getPredictionForTree(treeId);
    if (!prediction) {
      return null;
    }

    if (prediction.isTraining) {
      return { label: 'Training Sample', modifier: 'training' };
    }

    return prediction.correct
      ? { label: 'Correct Prediction', modifier: 'correct' }
      : { label: 'Incorrect Prediction', modifier: 'incorrect' };
  }

  if (!isPredictionMode && groupLabel) {
    return { label: groupLabel, modifier: 'group' };
  }

  return null;
}

function buildTreeCard(tree) {
  if (!tree || !tree.properties) {
    return null;
  }

  const props = tree.properties;
  const rawTreeId = props.tree_id ?? props.TreeId ?? props.id;
  const treeIdValue = rawTreeId === null || rawTreeId === undefined ? '' : rawTreeId.toString();
  const treeLabel = treeIdValue || 'Unknown';
  const commonName = props.Cmmn_Nm || props.cmmn_nm || props.species || 'Unknown species';
  const scientificName = props.Scntf_N || props.scntf_n || '';
  const family = props.Family || props.family || '—';
  const groupLabel = formatGroupLabel(props.group_d ?? props.group_id);
  const crownRaw = coalesceProperty(props, [
    'crown_diameter_m',
    'specs_d',
    'specis_d',
    'crown_width',
    'width',
    'WIDTH',
  ]);
  const crownNumeric = Number(crownRaw);
  const crownDisplay =
    Number.isFinite(crownNumeric) && crownNumeric > 0
      ? formatMeasurement(crownNumeric, 'm', { maximumFractionDigits: 2 })
      : '—';

  const areaRaw = coalesceProperty(props, ['planar_canopy_area_m2', 'planar_canopy_area', 'area']);
  const areaNumeric = Number(areaRaw);
  const areaDisplay =
    Number.isFinite(areaNumeric) && areaNumeric > 0 ? formatArea(areaNumeric) : '—';

  const speciesColor = getSpeciesColor(commonName, treeIdValue) || '#94a3b8';
  const status = resolveTreeCardStatus(treeIdValue, groupLabel);
  const statusMarkup = status
    ? `<span class="tree-card__status tree-card__status--${status.modifier}">${escapeHtml(
        status.label
      )}</span>`
    : '';
  const scientificMarkup = scientificName
    ? `<span class="tree-card__subtitle-em">(${escapeHtml(scientificName)})</span>`
    : '';

  const card = document.createElement('article');
  card.className = 'tree-card';
  if (status?.modifier) {
    card.classList.add(`tree-card--status-${status.modifier}`);
  }
  if (treeIdValue) {
    card.dataset.treeId = treeIdValue;
  }

  const details = [
    { label: 'Crown Diameter', value: crownDisplay },
    { label: 'Canopy Area', value: areaDisplay },
    { label: 'Family', value: family ?? '—' },
  ];

  const detailMarkup = details
    .map(
      (detail) => `
        <div class="tree-card__detail">
          <dt>${escapeHtml(detail.label)}</dt>
          <dd>${escapeHtml(detail.value ?? '—')}</dd>
        </div>
      `
    )
    .join('');

  card.innerHTML = `
    <header class="tree-card__header">
      <div>
        <p class="tree-card__title">Tree ${escapeHtml(treeLabel)}</p>
        <p class="tree-card__subtitle">
          <span class="tree-card__species-swatch" style="background:${escapeHtml(speciesColor)};"></span>
          ${escapeHtml(commonName)}
          ${scientificMarkup}
        </p>
      </div>
      ${statusMarkup}
    </header>
    <dl class="tree-card__details" role="presentation">
      ${detailMarkup}
    </dl>
    <div class="tree-card__actions">
      <button type="button" class="tree-card__action tree-card__action--secondary" data-tree-action="focus" data-tree-id="${escapeHtml(
        treeIdValue
      )}">Focus on Map</button>
      <button type="button" class="tree-card__action tree-card__action--primary view-point-cloud-btn" data-tree-id="${escapeHtml(
        treeIdValue
      )}" data-species="${escapeHtml(commonName)}">Point Cloud</button>
    </div>
  `;

  return card;
}

function renderResultsCards(data = filteredData) {
  const container = document.getElementById('resultsCards');
  if (!container) {
    return;
  }

  container.setAttribute('aria-busy', 'true');
  container.innerHTML = '';

  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = '<p class="tree-card__empty">No trees to display.</p>';
    container.setAttribute('aria-busy', 'false');
    return;
  }

  const fragment = document.createDocumentFragment();
  data.forEach((tree) => {
    const card = buildTreeCard(tree);
    if (card) {
      fragment.appendChild(card);
    }
  });

  container.appendChild(fragment);
  container.setAttribute('aria-busy', 'false');
}
// --- Utility and Minor Functions ---

function filterTableData(searchTerm = '') {
  currentSearchTerm = searchTerm ?? '';
  refreshDataViews({ preserveSelection: true });
}

function sortTable(column) {
  if (currentSortColumn === column) {
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = column;
    currentSortDirection = 'asc';
  }
  refreshDataViews({ preserveSelection: true });
}

function updateSortIndicators() {
  document.querySelectorAll('#resultsTable th[data-sort]').forEach((header) => {
    header.classList.remove('sorted-asc', 'sorted-desc');
    if (header.dataset.sort === currentSortColumn) {
      header.classList.add(`sorted-${currentSortDirection}`);
    }
  });
}

function updateModelPerformance() {
  const setValue = (elementId, value) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = value ?? '—';
    }
  };

  const getMetricValue = (key) => {
    if (!predictionMetrics || typeof predictionMetrics !== 'object') {
      return null;
    }
    if (!Object.prototype.hasOwnProperty.call(predictionMetrics, key)) {
      return null;
    }
    const rawValue = predictionMetrics[key];
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return null;
    }
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const overall = getMetricValue('OA');
  const macroAccuracy = getMetricValue('MCA');
  const f1Score = getMetricValue('F1');
  const kappa = getMetricValue('KA');

  setValue('modelOverallAccuracy', formatPercent(overall));
  setValue('modelMacroAccuracy', formatPercent(macroAccuracy));
  setValue('modelF1Score', formatPercent(f1Score));
  setValue('modelKappa', kappa === null ? '—' : (formatNumber(kappa, 3) ?? kappa.toString()));
}

function computePerClassMetrics(items) {
  const labelSet = new Set();
  items.forEach((t) => {
    labelSet.add(t.properties.predicted_species);
    labelSet.add(t.properties.ground_truth_species);
  });
  const labels = Array.from(labelSet).sort();
  const index = new Map(labels.map((l, i) => [l, i]));
  const matrix = Array.from({ length: labels.length }, () => Array(labels.length).fill(0));
  items.forEach((t) => {
    const gt = t.properties.ground_truth_species;
    const pr = t.properties.predicted_species;
    if (index.has(gt) && index.has(pr)) {
      matrix[index.get(gt)][index.get(pr)] += 1;
    }
  });
  const perClass = labels.map((_, i) => {
    const tp = matrix[i][i];
    const fp = matrix.reduce((s, row, r) => (r === i ? s : s + row[i]), 0);
    const fn = matrix[i].reduce((s, v, c) => (c === i ? s : s + v), 0);
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { precision, recall, f1 };
  });
  const precisionMacro = perClass.reduce((s, m) => s + m.precision, 0) / perClass.length || 0;
  const recallMacro = perClass.reduce((s, m) => s + m.recall, 0) / perClass.length || 0;
  const f1Macro = perClass.reduce((s, m) => s + m.f1, 0) / perClass.length || 0;
  return { labels, conf: matrix, perClass, precisionMacro, recallMacro, f1Macro };
}

function computePredictionSummary(data) {
  const testItems = data.filter((item) => !item.isTraining);
  if (testItems.length === 0) {
    return null;
  }

  const labelSet = new Set();
  testItems.forEach((item) => {
    if (item.actual) labelSet.add(item.actual);
    if (item.predicted) labelSet.add(item.predicted);
  });

  const labels = Array.from(labelSet).sort((a, b) => a.localeCompare(b));
  if (labels.length === 0) {
    return null;
  }

  const index = new Map(labels.map((label, position) => [label, position]));
  const matrix = Array.from({ length: labels.length }, () => Array(labels.length).fill(0));

  testItems.forEach(({ actual, predicted }) => {
    if (!index.has(actual) || !index.has(predicted)) {
      return;
    }
    matrix[index.get(actual)][index.get(predicted)] += 1;
  });

  const perClass = labels.map((label, i) => {
    const row = matrix[i];
    const tp = matrix[i][i];
    const fp = matrix.reduce(
      (sum, currentRow, rowIndex) => (rowIndex === i ? sum : sum + currentRow[i]),
      0
    );
    const fn = row.reduce((sum, value, columnIndex) => (columnIndex === i ? sum : sum + value), 0);
    const support = row.reduce((sum, value) => sum + value, 0);
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { label, tp, fp, fn, support, precision, recall, f1 };
  });

  const totalSupport = testItems.length;
  const totalCorrect = labels.reduce((sum, _, idx) => sum + matrix[idx][idx], 0);
  const accuracy = totalSupport === 0 ? 0 : totalCorrect / totalSupport;

  const precisionMacro =
    perClass.reduce((sum, metric) => sum + metric.precision, 0) / perClass.length || 0;
  const recallMacro =
    perClass.reduce((sum, metric) => sum + metric.recall, 0) / perClass.length || 0;
  const f1Macro = perClass.reduce((sum, metric) => sum + metric.f1, 0) / perClass.length || 0;

  const precisionWeighted =
    perClass.reduce((sum, metric) => sum + metric.precision * metric.support, 0) /
    (totalSupport || 1);
  const recallWeighted =
    perClass.reduce((sum, metric) => sum + metric.recall * metric.support, 0) / (totalSupport || 1);
  const f1Weighted =
    perClass.reduce((sum, metric) => sum + metric.f1 * metric.support, 0) / (totalSupport || 1);

  return {
    labels,
    matrix,
    perClass,
    totals: {
      support: totalSupport,
      correct: totalCorrect,
      accuracy,
      precisionMacro,
      recallMacro,
      f1Macro,
      precisionWeighted,
      recallWeighted,
      f1Weighted,
    },
  };
}

function renderConfusionMatrix(summary = predictionSummary) {
  const container = document.getElementById('confusionMatrix');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (!summary) {
    container.innerHTML = '<p>No prediction results available.</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'cm-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const corner = document.createElement('th');
  corner.textContent = 'Actual \\ Predicted';
  headerRow.appendChild(corner);

  summary.labels.forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });

  const totalHeader = document.createElement('th');
  totalHeader.textContent = 'Total';
  headerRow.appendChild(totalHeader);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  summary.labels.forEach((label, rowIndex) => {
    const row = document.createElement('tr');

    const labelCell = document.createElement('th');
    labelCell.textContent = label;
    row.appendChild(labelCell);

    let rowTotal = 0;
    summary.labels.forEach((_, columnIndex) => {
      const value = summary.matrix[rowIndex][columnIndex];
      rowTotal += value;

      const cell = document.createElement('td');
      cell.textContent = value;
      if (rowIndex === columnIndex) {
        cell.classList.add('diag');
      }
      row.appendChild(cell);
    });

    const totalCell = document.createElement('td');
    totalCell.textContent = rowTotal;
    row.appendChild(totalCell);

    tbody.appendChild(row);
  });

  const footerRow = document.createElement('tr');
  const footerLabel = document.createElement('th');
  footerLabel.textContent = 'Total';
  footerRow.appendChild(footerLabel);

  summary.labels.forEach((_, columnIndex) => {
    const columnTotal = summary.matrix.reduce((sum, row) => sum + row[columnIndex], 0);
    const cell = document.createElement('td');
    cell.textContent = columnTotal;
    footerRow.appendChild(cell);
  });

  const overallCell = document.createElement('td');
  overallCell.textContent = summary.totals.support;
  footerRow.appendChild(overallCell);

  const tfoot = document.createElement('tfoot');
  tfoot.appendChild(footerRow);
  table.appendChild(tbody);
  table.appendChild(tfoot);

  const caption = document.createElement('p');
  caption.style.marginTop = '10px';
  caption.textContent = `Overall accuracy: ${(summary.totals.accuracy * 100).toFixed(2)}%`;

  container.appendChild(table);
  container.appendChild(caption);
}

function renderPerClassMetrics(summary = predictionSummary) {
  const container = document.getElementById('perClassMetrics');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (!summary) {
    container.innerHTML = '<p>No prediction results available.</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'cm-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Class', 'Precision', 'Recall', 'F1-Score', 'Support'].forEach((heading) => {
    const th = document.createElement('th');
    th.textContent = heading;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  summary.perClass.forEach((metric) => {
    const row = document.createElement('tr');

    const cells = [
      metric.label,
      (metric.precision * 100).toFixed(2) + '%',
      (metric.recall * 100).toFixed(2) + '%',
      (metric.f1 * 100).toFixed(2) + '%',
      metric.support,
    ];

    cells.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });

  const footer = document.createElement('tfoot');
  const summaryRow = document.createElement('tr');
  const labelCell = document.createElement('th');
  labelCell.textContent = 'Macro Avg.';
  summaryRow.appendChild(labelCell);

  const precisionCell = document.createElement('td');
  precisionCell.textContent = (summary.totals.precisionMacro * 100).toFixed(2) + '%';
  summaryRow.appendChild(precisionCell);

  const recallCell = document.createElement('td');
  recallCell.textContent = (summary.totals.recallMacro * 100).toFixed(2) + '%';
  summaryRow.appendChild(recallCell);

  const f1Cell = document.createElement('td');
  f1Cell.textContent = (summary.totals.f1Macro * 100).toFixed(2) + '%';
  summaryRow.appendChild(f1Cell);

  const supportCell = document.createElement('td');
  supportCell.textContent = summary.totals.support;
  summaryRow.appendChild(supportCell);

  footer.appendChild(summaryRow);

  const weightedRow = document.createElement('tr');
  const weightedLabel = document.createElement('th');
  weightedLabel.textContent = 'Weighted Avg.';
  weightedRow.appendChild(weightedLabel);

  const weightedPrecision = document.createElement('td');
  weightedPrecision.textContent = (summary.totals.precisionWeighted * 100).toFixed(2) + '%';
  weightedRow.appendChild(weightedPrecision);

  const weightedRecall = document.createElement('td');
  weightedRecall.textContent = (summary.totals.recallWeighted * 100).toFixed(2) + '%';
  weightedRow.appendChild(weightedRecall);

  const weightedF1 = document.createElement('td');
  weightedF1.textContent = (summary.totals.f1Weighted * 100).toFixed(2) + '%';
  weightedRow.appendChild(weightedF1);

  const weightedSupport = document.createElement('td');
  weightedSupport.textContent = summary.totals.support;
  weightedRow.appendChild(weightedSupport);

  footer.appendChild(weightedRow);

  table.appendChild(tbody);
  table.appendChild(footer);

  container.appendChild(table);
}

function hideLoadingIndicator() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (loadingIndicator) loadingIndicator.classList.add('hidden');
}

function updateDataStatus(message) {
  document.getElementById('dataStatus').textContent = message;
}
function updateShapefileStatus(icon, message) {
  document.getElementById('shapefileStatus').innerHTML =
    `<span style="margin-right: 8px;">${icon}</span><span>${message}</span>`;
}
function updateRasterStatus(icon, message) {
  document.getElementById('rasterStatus').innerHTML =
    `<span style="margin-right: 8px;">${icon}</span><span>${message}</span>`;
}

// ============================================================================
// PHASE 1 IMPROVEMENTS: Loading States, Results Counter, Export, Empty States
// ============================================================================

/**
 * Initialize Phase 1 features
 */
function initializePhase1Features() {
  setupResultsCounter();
  setupExportButton();
  updateResultsCounter();
}

/**
 * Display skeleton loaders while data is loading
 */
function showSkeletonLoader() {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody) return;
  
  const skeletonHTML = Array.from({ length: 5 }, () => `
    <tr class="skeleton-row">
      <td><div class="skeleton-loader skeleton-cell" style="width: 60px;"></div></td>
      <td><div class="skeleton-loader skeleton-cell" style="width: 120px;"></div></td>
      <td><div class="skeleton-loader skeleton-cell" style="width: 150px;"></div></td>
      <td><div class="skeleton-loader skeleton-cell" style="width: 100px;"></div></td>
      <td><div class="skeleton-loader skeleton-cell" style="width: 80px;"></div></td>
    </tr>
  `).join('');
  
  tableBody.innerHTML = skeletonHTML;
}

/**
 * Setup results counter to show filtered results
 */
function setupResultsCounter() {
  const counter = document.getElementById('resultsCounter');
  const countDisplay = document.getElementById('resultsCount');
  
  if (!counter || !countDisplay) return;
  
  // Show counter when there are results
  if (filteredData && filteredData.length > 0) {
    countDisplay.textContent = filteredData.length;
    counter.style.display = 'inline-flex';
  }
}

/**
 * Update the results counter dynamically
 */
function updateResultsCounter() {
  const counter = document.getElementById('resultsCounter');
  const countDisplay = document.getElementById('resultsCount');
  
  if (!counter || !countDisplay) return;
  
  if (filteredData && filteredData.length > 0) {
    countDisplay.textContent = filteredData.length;
    counter.style.display = 'inline-flex';
  } else {
    counter.style.display = 'none';
  }
}

/**
 * Setup CSV export functionality
 */
function setupExportButton() {
  const exportBtn = document.getElementById('exportCsvBtn');
  if (!exportBtn) return;
  
  exportBtn.addEventListener('click', exportToCSV);
  
  // Disable if no data
  if (!filteredData || filteredData.length === 0) {
    exportBtn.disabled = true;
  }
}

/**
 * Export current filtered data to CSV
 */
function exportToCSV() {
  if (!filteredData || filteredData.length === 0) {
    alert('No data to export');
    return;
  }
  
  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.textContent = 'Exporting...';
  }
  
  try {
    let csvContent = '';
    
    if (isPredictionMode) {
      // Prediction mode CSV
      csvContent = 'Tree ID,Actual Species,Predicted Species,Status,Crown Diameter (m)\n';
      
      filteredData.forEach(tree => {
        const props = tree.properties;
        const treeId = props.tree_id || '';
        const treeData = getPredictionForTree(treeId.toString());
        
        if (treeData) {
          const crownDiameter = coalesceProperty(props, ['crown_diameter_m', 'specs_d', 'specis_d']) || '';
          const actual = escapeCsvValue(treeData.actual || '');
          const predicted = treeData.isTraining ? 'N/A' : escapeCsvValue(treeData.predicted || '');
          const status = treeData.isTraining ? 'TRAINING' : (treeData.correct ? 'CORRECT' : 'INCORRECT');
          
          csvContent += `${treeId},${actual},${predicted},${status},${crownDiameter}\n`;
        }
      });
    } else {
      // Species mode CSV
      csvContent = 'Tree ID,Common Name,Scientific Name,Family,Crown Diameter (m)\n';
      
      filteredData.forEach(tree => {
        const props = tree.properties;
        const treeId = props.tree_id || '';
        const commonName = escapeCsvValue(props.Cmmn_Nm || props.cmmn_nm || 'Unknown');
        const scientificName = escapeCsvValue(props.Scntf_N || props.scntf_n || '');
        const family = escapeCsvValue(props.Family || props.family || '');
        const crownDiameter = coalesceProperty(props, ['crown_diameter_m', 'specs_d', 'specis_d']) || '';
        
        csvContent += `${treeId},${commonName},${scientificName},${family},${crownDiameter}\n`;
      });
    }
    
    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    link.setAttribute('href', url);
    link.setAttribute('download', `lamesa-trees-${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log(`Exported ${filteredData.length} trees to CSV`);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    alert('Failed to export CSV. Please try again.');
  } finally {
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Export CSV
      `;
    }
  }
}

/**
 * Escape CSV values to handle commas and quotes
 */
function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Show empty state when no results found
 */
function showEmptyState(message = 'No trees found', description = 'Try adjusting your filters or search terms') {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody) return;
  
  const columnCount = document.querySelectorAll('#resultsTable thead th').length;
  
  tableBody.innerHTML = `
    <tr>
      <td colspan="${columnCount}" style="padding: 0; border: none;">
        <div class="empty-state">
          <div class="empty-state-icon">🌳</div>
          <div class="empty-state-title">${escapeHtml(message)}</div>
          <div class="empty-state-description">${escapeHtml(description)}</div>
          <button class="empty-state-action" onclick="document.getElementById('clearFiltersBtn').click();">
            Clear All Filters
          </button>
        </div>
      </td>
    </tr>
  `;
}
