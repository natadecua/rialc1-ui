// Global variables
let treeData = [];
let originalTreeData = [];
let filteredData = [];
let currentSortColumn = null;
let currentSortDirection = 'asc';
let map;
let potreeViewer = null;
let potreePointCloud = null;
let treePolygons = [];

// New: overlay references and controls
let layerControl = null;
let rasterLayer = null;

// Color mapping for tree status
const statusColors = {
    'Correct': '#28a745',
    'Incorrect': '#dc3545',
    'Training': '#ffc107'
};

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    console.log('LiDAR Tree Species Identification UI with Potree initialized successfully');
    
    initializeMap();
    await initializePotree();
    setupEventListeners();
    loadRawData();
});

/**
 * Initialize Potree library check
 */
async function initializePotree() {
    try {
        if (typeof Potree === 'undefined') {
            console.warn('Potree library not loaded. 3D viewer functionality will be limited.');
            updatePotreeStatus('⚠️', 'Potree library not available');
            return false;
        }

        console.log('Potree library available, ready for point cloud loading');
        updatePotreeStatus('✅', 'Potree ready');
        return true;
    } catch (error) {
        console.error('Error initializing Potree:', error);
        updatePotreeStatus('❌', 'Potree initialization failed');
        return false;
    }
}

/**
 * Initialize Leaflet map
 */
function initializeMap() {
    map = L.map('map').setView([14.6760, 121.0437], 16);
    
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    layerControl = L.control.layers({ 'OpenStreetMap': osm }, {}, { collapsed: true }).addTo(map);
}

/**
 * Clean implementation to load Potree point cloud with metadata version check.
 * Returns a Promise that resolves with the point cloud or rejects with an error.
 */
function loadPotreeData() {
    return new Promise(async (resolve, reject) => {
        try {
            if (typeof Potree === 'undefined') {
                return reject(new Error('Potree library not loaded'));
            }

            const potreeDataPath = 'raw_data/potree/metadata.json';
            // Pre-fetch metadata for version compatibility
            const metaResp = await fetch(potreeDataPath);
            if (!metaResp.ok) {
                return reject(new Error(`metadata.json fetch failed: ${metaResp.status}`));
            }
            const metadata = await metaResp.json();
            /*
            if (metadata.version && metadata.version.startsWith('2')) {
                updatePotreeStatus('⚠️', 'Incompatible Potree format (v2). Reconvert with PotreeConverter 1.8.x');
                console.warn('Potree metadata version 2.x detected. Potree 1.8 viewer cannot load it.');
                return reject(new Error('Potree metadata v2 incompatible with viewer'));
            }
            */
            Potree.loadPointCloud(potreeDataPath).then(event => {
                const pco = event.pointcloud;
                potreePointCloud = pco;
                console.log('Potree point cloud loaded:', pco);

                // Attempt to add bounding box coverage rectangle to Leaflet map
                try {
                    const bounds = pco.boundingBox;
                    if (pco.projection && pco.projection.length > 0) {
                        const min = proj4(pco.projection, 'WGS84', [bounds.min.x, bounds.min.y]);
                        const max = proj4(pco.projection, 'WGS84', [bounds.max.x, bounds.max.y]);
                        const leafletBounds = L.latLngBounds([[min[1], min[0]], [max[1], max[0]]]);
                        if (leafletBounds.isValid()) {
                            const rect = L.rectangle(leafletBounds, { color: '#ff7800', weight: 1, fillOpacity: 0.1 })
                                .bindPopup('Point Cloud Coverage');
                            layerControl?.addOverlay(rect, 'Point Cloud');
                            rect.addTo(map);
                        }
                    } else {
                        // Fallback guess for UTM Zone 51N -> WGS84
                        try {
                            const min = proj4('+proj=utm +zone=51 +datum=WGS84', 'WGS84', [bounds.min.x, bounds.min.y]);
                            const max = proj4('+proj=utm +zone=51 +datum=WGS84', 'WGS84', [bounds.max.x, bounds.max.y]);
                            const leafletBounds = L.latLngBounds([[min[1], min[0]], [max[1], max[0]]]);
                            if (leafletBounds.isValid()) {
                                const rect = L.rectangle(leafletBounds, { color: '#ff7800', weight: 1, fillOpacity: 0.15 })
                                    .bindPopup('Point Cloud Coverage (Assumed UTM51N)');
                                layerControl?.addOverlay(rect, 'Point Cloud');
                                rect.addTo(map);
                            }
                        } catch (utmErr) {
                            console.warn('Fallback UTM conversion failed:', utmErr);
                        }
                    }
                } catch (bbErr) {
                    console.warn('Failed to render coverage rectangle:', bbErr);
                }

                resolve(pco);
            }).catch(err => {
                reject(err);
            });
        } catch (e) {
            reject(e);
        }
    });
}

// Master loader orchestrating shapefile + potree loading
async function loadRawData() {
    updateDataStatus('Loading raw data...');
    updateShapefileStatus('⏳','Loading shapefile');
    updatePotreeStatus('⏳','Checking point cloud');
    try {
        const shapefilePromise = loadShapefiles().then(geojson => {
            processTreeData(geojson);
            updateShapefileStatus('✅', `Trees: ${geojson.features.length}`);
        }).catch(err => {
            updateShapefileStatus('❌','Failed');
            console.error('Shapefile load failed:', err);
        });

        const potreePromise = loadPotreeData().then(() => {
            updatePotreeStatus('✅','Point cloud ready');
        }).catch(err => {
            console.warn('Potree load skipped/failed:', err);
            if (/v2 incompatible/i.test(err.message)) {
                updatePotreeStatus('⚠️','Reconvert with PotreeConverter 1.8.x');
            } else {
                updatePotreeStatus('❌','Point cloud not loaded');
            }
        });

        await Promise.all([shapefilePromise, potreePromise]);
        updateDataStatus('Data load complete');
    } catch (e) {
        console.error('Raw data load error:', e);
        updateDataStatus('Failed to load some data');
    }
}

/**
 * Load shapefiles from raw_data/crown_shp folder
 */
async function loadShapefiles() {
    try {
        if (typeof shapefile === 'undefined') {
            throw new Error('Shapefile.js library not loaded.');
        }
        
        const shpPath = 'raw_data/crown_shp/mcws_crowns.shp';
        const dbfPath = 'raw_data/crown_shp/mcws_crowns.dbf';

        console.log(`Trying to load shapefiles: ${shpPath}`);
        const geojson = await shapefile.read(shpPath, dbfPath);
        
        console.log(`Shapefile loaded: ${geojson.features.length} features`);
        return geojson;

    } catch (error) {
        console.error('Error loading shapefiles:', error);
        throw error;
    }
}

/**
 * Process loaded tree data and add to map
 */
function processTreeData(geojsonData) {
    treeData = geojsonData.features.map((feature, index) => {
        const properties = feature.properties;
        const treeId = properties.tree_id || properties.id || properties.FID || `T${(index + 1).toString().padStart(3, '0')}`;
        const speciesField = properties.species || properties.SPECIES || properties.Species || 'Unknown';
        const predictedSpecies = generateMLPrediction(speciesField);
        const status = predictedSpecies === speciesField ? 
            (Math.random() > 0.3 ? 'Correct' : 'Training') : 'Incorrect';
        
        return {
            ...feature,
            properties: {
                ...properties,
                tree_id: treeId,
                predicted_species: predictedSpecies,
                ground_truth_species: speciesField,
                status: status
            }
        };
    });
    
    originalTreeData = [...treeData];
    filteredData = [...treeData];
    
    addTreesToMap();
    populateResultsTable();
    updateModelPerformance();
    renderConfusionMatrix();
    renderPerClassMetrics();
    hideLoadingIndicator();
    
    console.log(`Loaded ${treeData.length} trees from shapefile`);
}

/**
 * Simulate ML model prediction
 */
function generateMLPrediction(groundTruth) {
    if (Math.random() < 0.85) {
        return groundTruth;
    } else {
        const species = ['Molave', 'Narra', 'Mahogany', 'Acacia', 'Eucalyptus', 'Ipil-ipil', 'Gmelina', 'Teak'];
        return species[Math.floor(Math.random() * species.length)];
    }
}

/**
 * Add tree polygons to the Leaflet map
 */
function addTreesToMap() {
    treePolygons.forEach(polygon => map.removeLayer(polygon));
    treePolygons = [];
    
    filteredData.forEach(tree => {
        if (tree.geometry && tree.geometry.type === 'Polygon') {
            const color = statusColors[tree.properties.status];
            const coordinates = tree.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
            
            const polygon = L.polygon(coordinates, {
                color: color,
                weight: 2,
                opacity: 0.8,
                fillColor: color,
                fillOpacity: 0.3
            }).addTo(map);
            
            polygon.bindPopup(`
                <div style="min-width: 200px;">
                    <h4>Tree ${tree.properties.tree_id}</h4>
                    <p><strong>Predicted:</strong> ${tree.properties.predicted_species}</p>
                    <p><strong>Ground Truth:</strong> ${tree.properties.ground_truth_species}</p>
                    <p><strong>Status:</strong> <span style="color: ${color};">${tree.properties.status}</span></p>
                    <button onclick="openTreeModal(${JSON.stringify(tree).replace(/"/g, '&quot;')})" 
                            style="margin-top: 10px; padding: 5px 10px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">
                        View 3D
                    </button>
                </div>
            `);
            
            polygon.on('click', () => openTreeModal(tree));
            treePolygons.push(polygon);
        }
    });
}

/**
 * Open the Potree 3D tree viewer modal - now uses standalone viewer in a new tab
 */
function openTreeModal(treeFeature) {
    // Use the global function from potree-launcher.js to open the standalone viewer
    if (window.openPotreeViewer) {
        // Pass tree feature data to standalone viewer
        window.openPotreeViewer(treeFeature.properties.tree_id, treeFeature);
    } else {
        // Fallback if launcher script is not loaded
        const treeId = treeFeature.properties.tree_id;
        const url = `/view_lamesa.html?treeId=${encodeURIComponent(treeId)}`;
        window.open(url, '_blank', 'noopener');
    }
}

/**
 * Initialize Potree viewer in the modal
 */
function initializePotreeViewer(container, treeFeature) {
    if (potreeViewer && typeof potreeViewer.dispose === 'function') {
        potreeViewer.dispose();
        potreeViewer = null;
    }
    container.innerHTML = '';

    if (!potreePointCloud) {
        container.innerHTML = '<p style="color: red; text-align: center;">Potree point cloud not loaded.</p>';
        return;
    }

    console.log("Initializing Potree viewer in container:", container);

    potreeViewer = new Potree.Viewer(container);
    potreeViewer.setEDLEnabled(true);
    potreeViewer.setFOV(60);
    potreeViewer.setPointBudget(2 * 1000 * 1000);
    potreeViewer.setBackground("gradient");
    
    potreeViewer.scene.addPointCloud(potreePointCloud);
    
    // Attempt to reproject the chosen tree center into point cloud coordinates.
    // If projection info is missing or conversion fails, fall back to the point cloud bounding box center.
    let target;
    try {
        const treeCenter = getPolygonCenter(treeFeature.geometry.coordinates[0]);
        if (potreePointCloud.projection && potreePointCloud.projection.length > 0) {
            const localCoords = proj4('WGS84', potreePointCloud.projection, treeCenter);
            target = new THREE.Vector3(localCoords[0], localCoords[1], potreePointCloud.boundingBox.min.z);
        } else {
            throw new Error('No projection in potree metadata');
        }
    } catch (e) {
        console.warn('Could not convert tree centroid to point cloud projection, falling back to point cloud center:', e);
        const bb = potreePointCloud.boundingBox;
        const cx = (bb.min.x + bb.max.x) / 2;
        const cy = (bb.min.y + bb.max.y) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        target = new THREE.Vector3(cx, cy, cz);
    }

    const cameraPosition = new THREE.Vector3(target.x, target.y - 50, target.z + 50);
    potreeViewer.scene.view.position.copy(cameraPosition);
    potreeViewer.scene.view.lookAt(target);
    
    console.log(`Focusing Potree camera on tree ${treeFeature.properties.tree_id}`);
}

function getPolygonCenter(coords) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of coords) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }
    return [(minX + maxX) / 2, (minY + maxY) / 2];
}

/**
 * Close the modal
 */
function closeModal() {
    const modal = document.getElementById('treeModal');
    modal.style.display = 'none';
    if (potreeViewer && typeof potreeViewer.dispose === 'function') {
        try { potreeViewer.dispose(); } catch(e) { console.warn('dispose() threw:', e); }
        potreeViewer = null;
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    document.getElementById('panelToggle').addEventListener('click', () => {
        document.getElementById('sidePanel').classList.toggle('collapsed');
    });

    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('treeModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('treeModal')) {
            closeModal();
        }
    });

    ['filterCorrect', 'filterIncorrect', 'filterTraining'].forEach(id => {
        document.getElementById(id).addEventListener('change', applyFilters);
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
        filterTableData(e.target.value);
    });

    document.querySelectorAll('#resultsTable th[data-sort]').forEach(header => {
        header.addEventListener('click', () => sortTable(header.dataset.sort));
    });

    document.getElementById('loadLocalShapefileBtn').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.shp,.dbf,.prj,.shx';
        input.multiple = true;
        input.onchange = (e) => {
            const files = Array.from(e.target.files);
            if (files.length >= 2) {
                updateShapefileStatus('⏳', 'Loading shapefiles...');
                loadShapefilesFromInput(files);
            } else {
                alert('Please select at least .shp and .dbf files');
            }
        };
        input.click();
    });

    document.getElementById('loadLocalGeoTIFFBtn').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.tif,.tiff';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                updateRasterStatus('⏳', 'Loading GeoTIFF...');
                loadGeoTIFFFromFile(file);
            }
        };
        input.click();
    });

    // Potree viewer controls
    document.getElementById('pointSize').addEventListener('input', (e) => {
        if (potreeViewer && potreePointCloud) {
            potreePointCloud.material.size = parseFloat(e.target.value);
        }
    });

    document.getElementById('pointBudget').addEventListener('input', (e) => {
        if (potreeViewer) {
            potreeViewer.setPointBudget(parseInt(e.target.value) * 1000 * 1000);
        }
    });

    document.getElementById('measurementToolBtn').addEventListener('click', () => {
        if (potreeViewer) {
            potreeViewer.measuringTool.startInsertion({showDistances: true, showAngles: true, showArea: true, closed: true, showHeight: true});
        }
    });

    document.getElementById('clippingVolumeBtn').addEventListener('click', () => {
        if (potreeViewer) {
            potreeViewer.profileTool.startInsertion();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

/**
 * Apply status filters to map and table
 */
function applyFilters() {
    const filters = {
        Correct: document.getElementById('filterCorrect').checked,
        Incorrect: document.getElementById('filterIncorrect').checked,
        Training: document.getElementById('filterTraining').checked
    };

    filteredData = originalTreeData.filter(tree => filters[tree.properties.status]);

    addTreesToMap();
    populateResultsTable();
    renderConfusionMatrix();
    renderPerClassMetrics();
}

/**
 * Populate the results table
 */
function populateResultsTable() {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';

    filteredData.forEach(tree => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${tree.properties.tree_id}</td>
            <td>${tree.properties.predicted_species}</td>
            <td>${tree.properties.ground_truth_species}</td>
            <td><span class="status-badge ${tree.properties.status.toLowerCase()}">${tree.properties.status}</span></td>
        `;
        row.addEventListener('click', () => openTreeModal(tree));
        row.style.cursor = 'pointer';
        tableBody.appendChild(row);
    });
}

/**
 * Filter table data based on search input
 */
function filterTableData(searchTerm) {
    const term = searchTerm.toLowerCase();
    const rows = document.querySelectorAll('#tableBody tr');
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
}

/**
 * Sort table by column
 */
function sortTable(column) {
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }

    filteredData.sort((a, b) => {
        let aVal = a.properties[column];
        let bVal = b.properties[column];
        
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }

        if (currentSortDirection === 'asc') {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
    });

    populateResultsTable();
    updateSortIndicators();
}

/**
 * Update sort indicators in table headers
 */
function updateSortIndicators() {
    document.querySelectorAll('#resultsTable th[data-sort]').forEach(header => {
        header.classList.remove('sorted-asc', 'sorted-desc');
        if (header.dataset.sort === currentSortColumn) {
            header.classList.add(`sorted-${currentSortDirection}`);
        }
    });
}

/**
 * Update model performance metrics
 */
function updateModelPerformance() {
    if (originalTreeData.length === 0) return;

    const evalItems = originalTreeData.filter(t => t.properties.status !== 'Training');
    if (evalItems.length === 0) return;
    
    const correct = evalItems.filter(t => t.properties.predicted_species === t.properties.ground_truth_species).length;
    const accuracy = ((correct / evalItems.length) * 100).toFixed(1);
    const { precisionMacro, recallMacro, f1Macro } = computePerClassMetrics(evalItems);

    document.getElementById('accuracy').textContent = `${accuracy}%`;
    document.getElementById('precision').textContent = precisionMacro.toFixed(3);
    document.getElementById('recall').textContent = recallMacro.toFixed(3);
    document.getElementById('f1score').textContent = f1Macro.toFixed(3);
}

function computePerClassMetrics(items) {
    const labelSet = new Set();
    items.forEach(t => {
        labelSet.add(t.properties.predicted_species);
        labelSet.add(t.properties.ground_truth_species);
    });
    const labels = Array.from(labelSet).sort();
    const index = new Map(labels.map((l, i) => [l, i]));
    const matrix = Array.from({ length: labels.length }, () => Array(labels.length).fill(0));
    
    items.forEach(t => {
        const gt = t.properties.ground_truth_species;
        const pr = t.properties.predicted_species;
        if (index.has(gt) && index.has(pr)) {
            matrix[index.get(gt)][index.get(pr)] += 1;
        }
    });

    const perClass = labels.map((_, i) => {
        const tp = matrix[i][i];
        const fp = matrix.reduce((s, row, r) => r === i ? s : s + row[i], 0);
        const fn = matrix[i].reduce((s, v, c) => c === i ? s : s + v, 0);
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

function renderConfusionMatrix() {
    const container = document.getElementById('confusionMatrix');
    if (!container) return;
    container.innerHTML = '';
    const evalItems = originalTreeData.filter(t => t.properties.status !== 'Training');
    if (evalItems.length === 0) return;
    const { labels, conf } = computePerClassMetrics(evalItems);
    const table = document.createElement('table');
    table.className = 'cm-table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `<th>GT \\ Pred</th>` + labels.map(l => `<th>${l}</th>`).join('');
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    labels.forEach((label, i) => {
        const row = document.createElement('tr');
        row.innerHTML = `<th>${label}</th>` + conf[i].map((v, j) => `<td class="${i===j?'diag':''}">${v}</td>`).join('');
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
}

function renderPerClassMetrics() {
    const container = document.getElementById('perClassMetrics');
    if (!container) return;
    container.innerHTML = '';
    const evalItems = originalTreeData.filter(t => t.properties.status !== 'Training');
    if (evalItems.length === 0) return;
    const { labels, perClass } = computePerClassMetrics(evalItems);
    const table = document.createElement('table');
    table.className = 'pcm-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th></tr>';
    const tbody = document.createElement('tbody');
    labels.forEach((l, i) => {
        const m = perClass[i];
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${l}</td><td>${m.precision.toFixed(2)}</td><td>${m.recall.toFixed(2)}</td><td>${m.f1.toFixed(2)}</td>`;
        tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    container.appendChild(table);
}

/**
 * Hide loading indicator
 */
function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if(loadingIndicator) {
        loadingIndicator.classList.add('hidden');
    }
}

async function loadShapefilesFromInput(files) {
    updateShapefileStatus('⏳', 'Loading shapefiles...');
    const shpFile = files.find(f => f.name.toLowerCase().endsWith('.shp'));
    const dbfFile = files.find(f => f.name.toLowerCase().endsWith('.dbf'));

    if (!shpFile || !dbfFile) {
        alert('Please select at least .shp and .dbf files');
        updateShapefileStatus('❌', 'Missing .shp or .dbf');
        return;
    }

    try {
        const [shpBuffer, dbfBuffer] = await Promise.all([
            shpFile.arrayBuffer(),
            dbfFile.arrayBuffer()
        ]);

        const geojson = await shapefile.read(shpBuffer, dbfBuffer);
        processTreeData(geojson);
        updateShapefileStatus('✅', `Shapefiles loaded: ${geojson.features.length} features`);
        updateDataStatus('Shapefiles loaded successfully from input.');
    } catch (error) {
        console.error('Error loading shapefiles from input:', error);
        updateShapefileStatus('❌', `Failed: ${error.message}`);
        alert('Failed to load shapefiles. Please check the console for details.');
    }
}

async function loadGeoTIFFFromFile(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const georaster = await parseGeoraster(arrayBuffer);

        if (rasterLayer) { map.removeLayer(rasterLayer); }

        rasterLayer = new GeoRasterLayer({
            georaster,
            opacity: 0.8,
            pixelValuesToColorFn: values => {
                const v = values[0];
                if (v === null || Number.isNaN(v)) return 'rgba(0,0,0,0)';
                const min = georaster.mins[0];
                const max = georaster.maxs[0];
                const t = Math.min(1, Math.max(0, (v - min) / (max - min + 1e-6)));
                const r = Math.round(255 * t);
                const g = Math.round(255 * Math.max(0, 1 - Math.abs(t - 0.5) * 2));
                const b = Math.round(255 * (1 - t));
                return `rgba(${r},${g},${b},0.85)`;
            }
        });
        rasterLayer.addTo(map);
        layerControl?.addOverlay(rasterLayer, `GeoTIFF: ${file.name}`);

        const b = georaster.bounds;
        const latLngBounds = L.latLngBounds([b[1], b[0]], [b[3], b[2]]);
        if (latLngBounds.isValid()) map.fitBounds(latLngBounds.pad(0.05));

        updateRasterStatus('✅', `GeoTIFF loaded: ${file.name}`);
    } catch (err) {
        console.error('Failed to load GeoTIFF:', err);
        updateRasterStatus('❌', 'Failed to load GeoTI_FF');
        alert('Failed to load GeoTIFF. Make sure it has georeferencing.');
    }
}

function updateDataStatus(message) {
    const statusElement = document.getElementById('dataStatus');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = message.includes('Failed') || message.includes('Error') ? '#dc3545' : '#28a745';
    }
}

function updatePotreeStatus(icon, message) {
    const statusElement = document.getElementById('potreeStatus');
if (statusElement) {
        statusElement.innerHTML = `<span id="potreeIcon" style="margin-right: 8px;">${icon}</span><span>${message}</span>`;
    }
}

function updateShapefileStatus(icon, message) {
    const statusElement = document.getElementById('shapefileStatus');
    if (statusElement) {
        statusElement.innerHTML = `<span id="shapefileIcon" style="margin-right: 8px;">${icon}</span><span>${message}</span>`;
    }
}

function updateRasterStatus(icon, message) {
    const statusElement = document.getElementById('rasterStatus');
    if (statusElement) {
        statusElement.innerHTML = `<span id="rasterIcon" style="margin-right: 8px;">${icon}</span><span>${message}</span>`;
    }
}