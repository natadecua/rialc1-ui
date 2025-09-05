// Global variables
let treeData = [];
let originalTreeData = [];
let filteredData = [];
let currentSortColumn = null;
let currentSortDirection = 'asc';
let map;
let pointCloudData = null;
let treePolygons = [];

// Color mapping for tree status
const statusColors = {
    'Correct': '#28a745',
    'Incorrect': '#dc3545',
    'Training': '#ffc107'
};

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    loadRawData();
    setupEventListeners();
});

/**
 * Initialize Leaflet map
 */
function initializeMap() {
    // Initialize map centered on La Mesa Ecopark
    map = L.map('map').setView([14.6760, 121.0437], 16);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Add satellite imagery option
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri'
    });
    
    // Layer control
    const baseMaps = {
        "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }),
        "Satellite": satelliteLayer
    };
    
    L.control.layers(baseMaps).addTo(map);
    
    console.log('Leaflet map initialized successfully');
}

/**
 * Load raw data files automatically
 */
async function loadRawData() {
    updateDataStatus('Loading raw data files...');
    
    try {
        // Load LAS file and shapefiles in parallel
        const [lasResult, shapefileResult] = await Promise.allSettled([
            loadLASFile(),
            loadShapefiles()
        ]);
        
        // Process results
        if (lasResult.status === 'fulfilled') {
            updateLASStatus('✅', 'LAS file loaded successfully');
        } else {
            updateLASStatus('❌', 'Failed to load LAS file');
            console.error('LAS loading error:', lasResult.reason);
        }
        
        if (shapefileResult.status === 'fulfilled') {
            updateShapefileStatus('✅', 'Shapefiles loaded successfully');
            if (shapefileResult.value) {
                processTreeData(shapefileResult.value);
            }
        } else {
            updateShapefileStatus('❌', 'Failed to load shapefiles');
            console.error('Shapefile loading error:', shapefileResult.reason);
            // Fallback to sample data
            createSampleData();
        }
        
        // Show helpful error message if both failed
        if (lasResult.status === 'rejected' && shapefileResult.status === 'rejected') {
            updateDataStatus('❌ CORS Error: Please run a local server. See instructions below.');
            showSetupInstructions();
        } else {
            updateDataStatus('Raw data loading completed');
        }
        
    } catch (error) {
        console.error('Error loading raw data:', error);
        updateDataStatus('Error loading raw data, using sample data');
        createSampleData();
    }
}

/**
 * Load LAS file from raw_data folder
 */
async function loadLASFile() {
    try {
        // Try multiple possible paths
        const possiblePaths = [
            'raw_data/lamesa_processed.las',
            './raw_data/lamesa_processed.las',
            '/raw_data/lamesa_processed.las'
        ];
        
        let response = null;
        let lastError = null;
        
        for (const path of possiblePaths) {
            try {
                console.log(`Trying to load LAS file from: ${path}`);
                response = await fetch(path);
                if (response.ok) {
                    console.log(`Successfully loaded LAS file from: ${path}`);
                    break;
                }
            } catch (error) {
                console.log(`Failed to load from ${path}:`, error.message);
                lastError = error;
            }
        }
        
        if (!response || !response.ok) {
            throw new Error(`Failed to load LAS file from any path. Last error: ${lastError?.message || 'Unknown error'}. Make sure you're running a local server (e.g., python -m http.server 8000)`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        
        // Check if LAS.js is available
        if (typeof LASFile === 'undefined') {
            throw new Error('LAS.js library not loaded. Please check the CDN link in index.html');
        }
        
        // Parse LAS file using LAS.js
        const lasFile = new LASFile(arrayBuffer);
        
        // Extract point cloud data
        const points = lasFile.points;
        const header = lasFile.header;
        
        pointCloudData = {
            points: points,
            header: header,
            bounds: {
                minX: header.minX,
                maxX: header.maxX,
                minY: header.minY,
                maxY: header.maxY,
                minZ: header.minZ,
                maxZ: header.maxZ
            }
        };
        
        // Add point cloud visualization to map
        visualizePointCloud();
        
        console.log(`LAS file loaded: ${points.length} points`);
        return pointCloudData;
        
    } catch (error) {
        console.error('Error loading LAS file:', error);
        throw error;
    }
}

/**
 * Load shapefiles from raw_data/crown_shp folder
 */
async function loadShapefiles() {
    try {
        // Check if shapefile library is available
        if (typeof shapefile === 'undefined') {
            throw new Error('Shapefile.js library not loaded. Please check the CDN link in index.html');
        }
        
        // Try multiple possible paths
        const basePaths = [
            'raw_data/crown_shp/',
            './raw_data/crown_shp/',
            '/raw_data/crown_shp/'
        ];
        
        let shpBuffer = null;
        let dbfBuffer = null;
        let prjText = null;
        let lastError = null;
        
        // Try to load shapefile components
        for (const basePath of basePaths) {
            try {
                console.log(`Trying to load shapefiles from: ${basePath}`);
                
                const [shpResponse, dbfResponse, prjResponse] = await Promise.allSettled([
                    fetch(`${basePath}mcws_crowns.shp`),
                    fetch(`${basePath}mcws_crowns.dbf`),
                    fetch(`${basePath}mcws_crowns.prj`)
                ]);
                
                if (shpResponse.status === 'fulfilled' && dbfResponse.status === 'fulfilled') {
                    shpBuffer = await shpResponse.value.arrayBuffer();
                    dbfBuffer = await dbfResponse.value.arrayBuffer();
                    prjText = prjResponse.status === 'fulfilled' ? await prjResponse.value.text() : null;
                    console.log(`Successfully loaded shapefiles from: ${basePath}`);
                    break;
                }
            } catch (error) {
                console.log(`Failed to load shapefiles from ${basePath}:`, error.message);
                lastError = error;
            }
        }
        
        if (!shpBuffer || !dbfBuffer) {
            throw new Error(`Failed to load shapefile components from any path. Last error: ${lastError?.message || 'Unknown error'}. Make sure you're running a local server (e.g., python -m http.server 8000)`);
        }
        
        // Convert shapefile to GeoJSON using shapefile library
        const source = shapefile.open(shpBuffer, dbfBuffer);
        
        const geojson = {
            type: "FeatureCollection",
            features: []
        };
        
        // Process all features
        let result = await source.read();
        while (!result.done) {
            geojson.features.push(result.value);
            result = await source.read();
        }
        
        console.log(`Shapefile loaded: ${geojson.features.length} features`);
        return geojson;
        
    } catch (error) {
        console.error('Error loading shapefiles:', error);
        throw error;
    }
}

/**
 * Load tree data from GeoJSON file or create sample data (fallback)
 */
async function loadTreeData() {
    try {
        // Try to load from trees.geojson file
        const response = await fetch('trees.geojson');
        if (response.ok) {
            const geojsonData = await response.json();
            processTreeData(geojsonData);
        } else {
            // If file doesn't exist, create sample data
            console.log('trees.geojson not found, using sample data');
            createSampleData();
        }
    } catch (error) {
        console.log('Error loading trees.geojson, using sample data:', error);
        createSampleData();
    }
}

/**
 * Create sample tree data for demonstration
 */
function createSampleData() {
    const sampleData = {
        "type": "FeatureCollection",
        "features": generateSampleTrees(50)
    };
    processTreeData(sampleData);
}

/**
 * Generate sample tree features
 */
function generateSampleTrees(count) {
    const species = ['Molave', 'Narra', 'Mahogany', 'Acacia', 'Eucalyptus', 'Ipil-ipil'];
    const statuses = ['Correct', 'Incorrect', 'Training'];
    const features = [];
    
    // La Mesa Ecopark bounds (approximate)
    const centerLat = 14.6760;
    const centerLng = 121.0437;
    const range = 0.005; // ~500m range

    for (let i = 1; i <= count; i++) {
        const lat = centerLat + (Math.random() - 0.5) * range;
        const lng = centerLng + (Math.random() - 0.5) * range;
        
        // Generate random tree crown polygon (simplified circle)
        const radius = 0.00005 + Math.random() * 0.00005; // 5-10m diameter
        const coordinates = generateCircleCoordinates(lng, lat, radius, 8);
        
        const predictedSpecies = species[Math.floor(Math.random() * species.length)];
        const groundTruthSpecies = Math.random() > 0.2 ? predictedSpecies : species[Math.floor(Math.random() * species.length)];
        const status = predictedSpecies === groundTruthSpecies ? 
            (Math.random() > 0.3 ? 'Correct' : 'Training') : 'Incorrect';

        features.push({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [coordinates]
            },
            "properties": {
                "tree_id": `T${i.toString().padStart(3, '0')}`,
                "predicted_species": predictedSpecies,
                "ground_truth_species": groundTruthSpecies,
                "status": status,
                "potree_path": `./data/trees/tree_${i}/`
            }
        });
    }
    
    return features;
}

function generateCircleCoordinates(lng, lat, radius, points = 8) {
    const coordinates = [];
    for (let i = 0; i <= points; i++) {
        const angle = (i / points) * 2 * Math.PI;
        const x = lng + radius * Math.cos(angle);
        const y = lat + radius * Math.sin(angle);
        coordinates.push([x, y]);
    }
    return coordinates;
}

/**
 * Process loaded tree data and add to map
 */
function processTreeData(geojsonData) {
    treeData = geojsonData.features;
    
    // Process tree data to add ML prediction properties
    treeData = treeData.map((feature, index) => {
        const properties = feature.properties;
        
        // Generate tree ID if not present
        const treeId = properties.tree_id || properties.id || properties.FID || `T${(index + 1).toString().padStart(3, '0')}`;
        
        // Extract species information from shapefile attributes
        // Common attribute names for species in forestry shapefiles
        const speciesField = properties.species || properties.SPECIES || properties.Species || 
                           properties.tree_type || properties.TREE_TYPE || properties.TreeType ||
                           properties.class || properties.CLASS || properties.Class;
        
        // Generate predicted species (in real implementation, this would come from your ML model)
        const species = speciesField || generateRandomSpecies();
        const predictedSpecies = generateMLPrediction(species);
        
        // Determine status based on prediction accuracy
        const status = predictedSpecies === species ? 
            (Math.random() > 0.3 ? 'Correct' : 'Training') : 'Incorrect';
        
        return {
            ...feature,
            properties: {
                tree_id: treeId,
                predicted_species: predictedSpecies,
                ground_truth_species: species,
                status: status,
                potree_path: `./data/trees/tree_${index + 1}/`,
                // Preserve original shapefile attributes
                ...properties
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
 * Generate random species for demonstration
 */
function generateRandomSpecies() {
    const species = ['Molave', 'Narra', 'Mahogany', 'Acacia', 'Eucalyptus', 'Ipil-ipil', 'Gmelina', 'Teak'];
    return species[Math.floor(Math.random() * species.length)];
}

/**
 * Simulate ML model prediction (replace with your actual model)
 */
function generateMLPrediction(groundTruth) {
    // Simulate ML model with 85% accuracy
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
    // Clear existing tree polygons
    treePolygons.forEach(polygon => map.removeLayer(polygon));
    treePolygons = [];
    
    // Add tree polygons to map
    filteredData.forEach(tree => {
        if (tree.geometry && tree.geometry.type === 'Polygon') {
            const color = statusColors[tree.properties.status];
            
            // Convert coordinates to Leaflet format (lat, lng)
            const coordinates = tree.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
            
            const polygon = L.polygon(coordinates, {
                color: color,
                weight: 2,
                opacity: 0.8,
                fillColor: color,
                fillOpacity: 0.3
            }).addTo(map);
            
            // Add popup with tree information
            polygon.bindPopup(`
                <div style="min-width: 200px;">
                    <h4>Tree ${tree.properties.tree_id}</h4>
                    <p><strong>Predicted:</strong> ${tree.properties.predicted_species}</p>
                    <p><strong>Ground Truth:</strong> ${tree.properties.ground_truth_species}</p>
                    <p><strong>Status:</strong> <span style="color: ${color};">${tree.properties.status}</span></p>
                    <button onclick="openTreeModal(${JSON.stringify(tree.properties).replace(/"/g, '&quot;')})" 
                            style="margin-top: 10px; padding: 5px 10px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">
                        View 3D
                    </button>
                </div>
            `);
            
            // Add click event to open modal
            polygon.on('click', function() {
                openTreeModal(tree.properties);
            });
            
            treePolygons.push(polygon);
        }
    });
    
    // Fit map to show all trees
    if (treePolygons.length > 0) {
        const group = new L.featureGroup(treePolygons);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

/**
 * Show tooltip for tree
 */
function showTooltip(element, treeProps) {
    let tooltip = document.getElementById('mapTooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'mapTooltip';
        tooltip.style.cssText = `
            position: absolute;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 0.85rem;
            pointer-events: none;
            z-index: 1000;
            white-space: nowrap;
        `;
        document.body.appendChild(tooltip);
    }
    
    tooltip.innerHTML = `
        <strong>Tree ID:</strong> ${treeProps.tree_id}<br>
        <strong>Prediction:</strong> ${treeProps.predicted_species}
    `;
    
    const rect = element.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 10}px`;
    tooltip.style.display = 'block';
}

/**
 * Hide tooltip
 */
function hideTooltip() {
    const tooltip = document.getElementById('mapTooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

/**
 * Open the 3D tree viewer modal
 */
function openTreeModal(treeProps) {
    const modal = document.getElementById('treeModal');
    const modalTitle = document.getElementById('modalTitle');
    const treeInfo = document.getElementById('treeInfo');
    const potreeContainer = document.getElementById('potreeContainer');

    // Update modal content
    modalTitle.textContent = `Tree Details: ID ${treeProps.tree_id}`;
    treeInfo.innerHTML = `
        <p><strong>Predicted Species:</strong> ${treeProps.predicted_species}</p>
        <p><strong>Ground Truth Species:</strong> ${treeProps.ground_truth_species}</p>
        <p><strong>Status:</strong> <span class="status-badge ${treeProps.status.toLowerCase()}">${treeProps.status}</span></p>
        <p><strong>Point Cloud Path:</strong> ${treeProps.potree_path}</p>
    `;

    // Initialize simulated Potree viewer
    initializeSimulatedPotreeViewer(potreeContainer, treeProps);

    // Show modal
    modal.style.display = 'block';
}

/**
 * Initialize 3D point cloud viewer
 */
function initializeSimulatedPotreeViewer(container, treeProps) {
    // Create 3D viewer with real LAS data if available
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; background: linear-gradient(45deg, #1a1a1a 0%, #2d2d2d 100%);">
            <!-- 3D Viewer Header -->
            <div style="background: rgba(0,0,0,0.8); color: white; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444;">
                <h4 style="margin: 0; color: #4CAF50;">🌳 3D Point Cloud Viewer</h4>
                <div style="font-size: 0.8rem; color: #ccc;">Tree ${treeProps.tree_id}</div>
            </div>
            
            <!-- 3D Viewer Content -->
            <div style="flex: 1; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
                ${pointCloudData ? createRealPointCloudViewer(treeProps) : createSimulatedViewer(treeProps)}
            </div>
        </div>
    `;

    console.log(`3D viewer initialized for: ${treeProps.potree_path}`);
}

function createRealPointCloudViewer(treeProps) {
    // Extract points within tree polygon bounds
    const treePolygon = filteredData.find(t => t.properties.tree_id === treeProps.tree_id);
    if (!treePolygon || !pointCloudData) {
        return createSimulatedViewer(treeProps);
    }
    
    // Get tree bounds
    const coords = treePolygon.geometry.coordinates[0];
    const bounds = {
        minX: Math.min(...coords.map(c => c[0])),
        maxX: Math.max(...coords.map(c => c[0])),
        minY: Math.min(...coords.map(c => c[1])),
        maxY: Math.max(...coords.map(c => c[1]))
    };
    
    // Filter points within tree bounds
    const treePoints = pointCloudData.points.filter(point => 
        point.x >= bounds.minX && point.x <= bounds.maxX &&
        point.y >= bounds.minY && point.y <= bounds.maxY
    );
    
    return `
        <div style="text-align: center; color: white;">
            <div style="font-size: 80px; margin-bottom: 20px; text-shadow: 0 0 20px rgba(76, 175, 80, 0.5);">🌲</div>
            <div style="font-size: 1.2rem; margin-bottom: 10px; color: #4CAF50;">${treeProps.predicted_species}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-bottom: 20px;">Real LiDAR Data</div>
            
            <!-- Point cloud visualization -->
            <div id="treePointCloud" style="width: 300px; height: 200px; background: rgba(0,0,0,0.5); border: 1px solid #444; margin: 0 auto 20px; position: relative; overflow: hidden;">
                ${generatePointCloudVisualization(treePoints)}
            </div>
            
            <!-- Controls -->
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button onclick="simulateRotate()" style="background: #333; color: white; border: 1px solid #555; padding: 8px 15px; border-radius: 4px; cursor: pointer;">🔄 Rotate</button>
                <button onclick="simulateZoom('in')" style="background: #333; color: white; border: 1px solid #555; padding: 8px 15px; border-radius: 4px; cursor: pointer;">🔍 Zoom In</button>
                <button onclick="simulateZoom('out')" style="background: #333; color: white; border: 1px solid #555; padding: 8px 15px; border-radius: 4px; cursor: pointer;">🔍 Zoom Out</button>
                <button onclick="simulatePan()" style="background: #333; color: white; border: 1px solid #555; padding: 8px 15px; border-radius: 4px; cursor: pointer;">↔️ Pan</button>
            </div>
        </div>
        
        <!-- Point cloud info overlay -->
        <div style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); color: white; padding: 10px; border-radius: 6px; font-size: 0.8rem;">
            <div><strong>Species:</strong> ${treeProps.predicted_species}</div>
            <div><strong>Status:</strong> ${treeProps.status}</div>
            <div><strong>Points:</strong> ${treePoints.length.toLocaleString()}</div>
            <div><strong>Height Range:</strong> ${Math.min(...treePoints.map(p => p.z)).toFixed(1)}m - ${Math.max(...treePoints.map(p => p.z)).toFixed(1)}m</div>
        </div>
        
        <!-- Loading indicator -->
        <div style="position: absolute; bottom: 15px; right: 15px; background: rgba(76, 175, 80, 0.2); color: #4CAF50; padding: 8px 12px; border-radius: 6px; font-size: 0.8rem;">
            ✅ Real point cloud loaded
        </div>
    `;
}

function createSimulatedViewer(treeProps) {
    return `
        <div style="text-align: center; color: white;">
            <div style="font-size: 120px; margin-bottom: 20px; text-shadow: 0 0 20px rgba(76, 175, 80, 0.5);">🌳</div>
            <div style="font-size: 1.2rem; margin-bottom: 10px; color: #4CAF50;">${treeProps.predicted_species}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-bottom: 20px;">Point Cloud: ${treeProps.potree_path}</div>
            
            <!-- Simulated Controls -->
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button onclick="simulateRotate()" style="background: #333; color: white; border: 1px solid #555; padding: 8px 15px; border-radius: 4px; cursor: pointer;">🔄 Rotate</button>
                <button onclick="simulateZoom('in')" style="background: #333; color: white; border: 1px solid #555; padding: 8px 15px; border-radius: 4px; cursor: pointer;">🔍 Zoom In</button>
                <button onclick="simulateZoom('out')" style="background: #333; color: white; border: 1px solid #555; padding: 8px 15px; border-radius: 4px; cursor: pointer;">🔍 Zoom Out</button>
                <button onclick="simulatePan()" style="background: #333; color: white; border: 1px solid #555; padding: 8px 15px; border-radius: 4px; cursor: pointer;">↔️ Pan</button>
            </div>
        </div>
        
        <!-- Point cloud info overlay -->
        <div style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); color: white; padding: 10px; border-radius: 6px; font-size: 0.8rem;">
            <div><strong>Species:</strong> ${treeProps.predicted_species}</div>
            <div><strong>Status:</strong> ${treeProps.status}</div>
            <div><strong>Points:</strong> ~${(Math.random() * 50000 + 10000).toFixed(0)}</div>
        </div>
        
        <!-- Simulated loading indicator -->
        <div style="position: absolute; bottom: 15px; right: 15px; background: rgba(76, 175, 80, 0.2); color: #4CAF50; padding: 8px 12px; border-radius: 6px; font-size: 0.8rem;">
            ✅ Point cloud loaded
        </div>
    `;
}

function generatePointCloudVisualization(points) {
    if (!points || points.length === 0) return '<div style="color: #666; padding: 20px;">No points found</div>';
    
    // Sample points for visualization
    const sampleSize = Math.min(1000, points.length);
    const step = Math.floor(points.length / sampleSize);
    
    let html = '';
    for (let i = 0; i < points.length; i += step) {
        const point = points[i];
        const x = ((point.x - Math.min(...points.map(p => p.x))) / (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)))) * 280 + 10;
        const y = ((point.y - Math.min(...points.map(p => p.y))) / (Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)))) * 180 + 10;
        const color = getHeightColor(point.z, Math.min(...points.map(p => p.z)), Math.max(...points.map(p => p.z)));
        
        html += `<div style="position: absolute; left: ${x}px; top: ${y}px; width: 2px; height: 2px; background: ${color}; border-radius: 50%;"></div>`;
    }
    
    return html;
}

/**
 * Close the modal
 */
function closeModal() {
    const modal = document.getElementById('treeModal');
    modal.style.display = 'none';
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Panel toggle
    const panelToggle = document.getElementById('panelToggle');
    const sidePanel = document.getElementById('sidePanel');
    
    panelToggle.addEventListener('click', function() {
        sidePanel.classList.toggle('collapsed');
    });

    // Modal close events
    const closeModalBtn = document.getElementById('closeModal');
    const modal = document.getElementById('treeModal');
    
    closeModalBtn.addEventListener('click', closeModal);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Filter controls
    const filterCheckboxes = [
        'filterCorrect',
        'filterIncorrect', 
        'filterTraining'
    ];

    filterCheckboxes.forEach(id => {
        document.getElementById(id).addEventListener('change', applyFilters);
    });

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', function(e) {
        filterTableData(e.target.value);
    });

    // Table sorting
    const tableHeaders = document.querySelectorAll('#resultsTable th[data-sort]');
    tableHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const column = this.dataset.sort;
            sortTable(column);
        });
    });

    // Import/Export
    const importGeoJSONInput = document.getElementById('importGeoJSONInput');
    const importGeoJSONBtn = document.getElementById('importGeoJSONBtn');
    const importLASInput = document.getElementById('importLASInput');
    const importLASBtn = document.getElementById('importLASBtn');
    const importShapefileInput = document.getElementById('importShapefileInput');
    const importShapefileBtn = document.getElementById('importShapefileBtn');
    const exportCSVBtn = document.getElementById('exportCSVBtn');
    const exportGeoJSONBtn = document.getElementById('exportGeoJSONBtn');
    
    if (importGeoJSONBtn && importGeoJSONInput) {
        importGeoJSONBtn.addEventListener('click', () => importGeoJSONInput.click());
        importGeoJSONInput.addEventListener('change', handleGeoJSONImport);
    }
    if (importLASBtn && importLASInput) {
        importLASBtn.addEventListener('click', () => importLASInput.click());
        importLASInput.addEventListener('change', handleLASImport);
    }
    if (importShapefileBtn && importShapefileInput) {
        importShapefileBtn.addEventListener('click', () => importShapefileInput.click());
        importShapefileInput.addEventListener('change', handleShapefileImport);
    }
    if (exportCSVBtn) {
        exportCSVBtn.addEventListener('click', exportTableToCSV);
    }
    if (exportGeoJSONBtn) {
        exportGeoJSONBtn.addEventListener('click', exportGeoJSON);
    }
    
    // Reload raw data button
    const reloadDataBtn = document.getElementById('reloadDataBtn');
    if (reloadDataBtn) {
        reloadDataBtn.addEventListener('click', () => {
            updateLASStatus('⏳', 'Loading LAS file...');
            updateShapefileStatus('⏳', 'Loading shapefiles...');
            hideSetupInstructions();
            loadRawData();
        });
    }
    
    // Local file loading buttons (no server required)
    const loadLocalLASBtn = document.getElementById('loadLocalLASBtn');
    const loadLocalShapefileBtn = document.getElementById('loadLocalShapefileBtn');
    
    if (loadLocalLASBtn) {
        loadLocalLASBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.las,.laz';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    updateLASStatus('⏳', 'Loading LAS file...');
                    loadLASFileFromInput(file);
                }
            };
            input.click();
        });
    }
    
    if (loadLocalShapefileBtn) {
        loadLocalShapefileBtn.addEventListener('click', () => {
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
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

/**
 * Apply status filters to map and table
 */
function applyFilters() {
    const filterCorrect = document.getElementById('filterCorrect').checked;
    const filterIncorrect = document.getElementById('filterIncorrect').checked;
    const filterTraining = document.getElementById('filterTraining').checked;

    filteredData = originalTreeData.filter(tree => {
        const status = tree.properties.status;
        return (status === 'Correct' && filterCorrect) ||
               (status === 'Incorrect' && filterIncorrect) ||
               (status === 'Training' && filterTraining);
    });

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
        
        // Add click event to table row
        row.addEventListener('click', function() {
            openTreeModal(tree.properties);
        });
        
        row.style.cursor = 'pointer';
        tableBody.appendChild(row);
    });
}

/**
 * Filter table data based on search input
 */
function filterTableData(searchTerm) {
    const rows = document.querySelectorAll('#tableBody tr');
    const term = searchTerm.toLowerCase();

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
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
    const headers = document.querySelectorAll('#resultsTable th[data-sort]');
    headers.forEach(header => {
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
    const correct = evalItems.filter(t => t.properties.predicted_species === t.properties.ground_truth_species).length;
    const total = evalItems.length;
    if (total === 0) return;

    const accuracy = ((correct / total) * 100).toFixed(1);

    const { precisionMacro, recallMacro, f1Macro } = computePerClassMetrics(evalItems);

    document.getElementById('accuracy').textContent = `${accuracy}%`;
    document.getElementById('precision').textContent = precisionMacro.toFixed(3);
    document.getElementById('recall').textContent = recallMacro.toFixed(3);
    document.getElementById('f1score').textContent = f1Macro.toFixed(3);
}

function computeLabels(items) {
    const labelSet = new Set();
    items.forEach(t => {
        if (t.properties.predicted_species) labelSet.add(t.properties.predicted_species);
        if (t.properties.ground_truth_species) labelSet.add(t.properties.ground_truth_species);
    });
    return Array.from(labelSet).sort();
}

function computeConfusion(items, labels) {
    const index = new Map(labels.map((l, i) => [l, i]));
    const matrix = Array.from({ length: labels.length }, () => Array(labels.length).fill(0));
    items.forEach(t => {
        const gt = t.properties.ground_truth_species;
        const pr = t.properties.predicted_species;
        if (index.has(gt) && index.has(pr)) {
            matrix[index.get(gt)][index.get(pr)] += 1;
        }
    });
    return matrix;
}

function computePerClassMetrics(items) {
    const labels = computeLabels(items);
    const conf = computeConfusion(items, labels);
    const perClass = labels.map((_, i) => {
        const tp = conf[i][i];
        const fp = conf.reduce((s, row, r) => r === i ? s : s + row[i], 0);
        const fn = conf[i].reduce((s, v, c) => c === i ? s : s + v, 0);
        const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
        const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
        const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
        return { precision, recall, f1 };
    });
    const precisionMacro = perClass.reduce((s, m) => s + m.precision, 0) / perClass.length || 0;
    const recallMacro = perClass.reduce((s, m) => s + m.recall, 0) / perClass.length || 0;
    const f1Macro = perClass.reduce((s, m) => s + m.f1, 0) / perClass.length || 0;
    return { labels, conf, perClass, precisionMacro, recallMacro, f1Macro };
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
    headerRow.innerHTML = `<th>GT \ Pred</th>` + labels.map(l => `<th>${l}</th>`).join('');
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
    loadingIndicator.classList.add('hidden');
}

// Simulated 3D viewer controls
function simulateRotate() {
    console.log('Simulating rotate interaction');
}

function simulateZoom(direction) {
    console.log(`Simulating zoom ${direction}`);
}

function simulatePan() {
    console.log('Simulating pan interaction');
}

// Utility functions for data export
function exportTableToCSV() {
    const headers = ['Tree ID', 'Predicted Species', 'Ground Truth Species', 'Status'];
    const csvContent = [
        headers.join(','),
        ...filteredData.map(tree => [
            tree.properties.tree_id,
            tree.properties.predicted_species,
            tree.properties.ground_truth_species,
            tree.properties.status
        ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tree_analysis_results.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}
function handleGeoJSONImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
                processTreeData(data);
                updateDataStatus('GeoJSON imported successfully');
            } else {
                alert('Invalid GeoJSON FeatureCollection');
            }
        } catch (e) {
            alert('Failed to parse GeoJSON');
        }
    };
    reader.readAsText(file);
}

function handleLASImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    
    updateDataStatus('Loading LAS file...');
    
    const reader = new FileReader();
    reader.onload = () => {
        try {
            // Parse LAS file using LAS.js
            const arrayBuffer = reader.result;
            const lasFile = new LASFile(arrayBuffer);
            
            // Extract point cloud data
            const points = lasFile.points;
            const header = lasFile.header;
            
            pointCloudData = {
                points: points,
                header: header,
                bounds: {
                    minX: header.minX,
                    maxX: header.maxX,
                    minY: header.minY,
                    maxY: header.maxY,
                    minZ: header.minZ,
                    maxZ: header.maxZ
                }
            };
            
            // Add point cloud visualization to map
            visualizePointCloud();
            updateDataStatus(`LAS file loaded: ${points.length} points`);
            
        } catch (e) {
            console.error('Error loading LAS file:', e);
            alert('Failed to load LAS file. Make sure it\'s a valid LAS/LAZ file.');
            updateDataStatus('Failed to load LAS file');
        }
    };
    reader.readAsArrayBuffer(file);
}

function handleShapefileImport(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    updateDataStatus('Loading shapefile...');
    
    // Convert FileList to array and sort by extension
    const fileArray = Array.from(files);
    const shpFile = fileArray.find(f => f.name.toLowerCase().endsWith('.shp'));
    const dbfFile = fileArray.find(f => f.name.toLowerCase().endsWith('.dbf'));
    const prjFile = fileArray.find(f => f.name.toLowerCase().endsWith('.prj'));
    
    if (!shpFile || !dbfFile) {
        alert('Please select both .shp and .dbf files');
        return;
    }
    
    // Read files
    Promise.all([
        readFileAsArrayBuffer(shpFile),
        readFileAsArrayBuffer(dbfFile),
        prjFile ? readFileAsText(prjFile) : Promise.resolve(null)
    ]).then(([shpBuffer, dbfBuffer, prjText]) => {
        try {
            // Convert shapefile to GeoJSON using shapefile library
            const source = shapefile.open(shpBuffer, dbfBuffer);
            
            source.read().then(function(result) {
                if (result.done) {
                    const geojson = {
                        type: "FeatureCollection",
                        features: []
                    };
                    
                    // Process all features
                    function processFeatures() {
                        return source.read().then(function(result) {
                            if (result.done) {
                                processTreeData(geojson);
                                updateDataStatus(`Shapefile imported: ${geojson.features.length} features`);
                                return;
                            }
                            
                            geojson.features.push(result.value);
                            return processFeatures();
                        });
                    }
                    
                    processFeatures();
                } else {
                    const geojson = {
                        type: "FeatureCollection",
                        features: [result.value]
                    };
                    processTreeData(geojson);
                    updateDataStatus('Shapefile imported: 1 feature');
                }
            });
            
        } catch (e) {
            console.error('Error loading shapefile:', e);
            alert('Failed to load shapefile');
            updateDataStatus('Failed to load shapefile');
        }
    });
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function visualizePointCloud() {
    if (!pointCloudData) return;
    
    // Create a simple point cloud visualization
    // For better performance, we'll sample points
    const sampleSize = Math.min(10000, pointCloudData.points.length);
    const step = Math.floor(pointCloudData.points.length / sampleSize);
    
    const pointMarkers = [];
    for (let i = 0; i < pointCloudData.points.length; i += step) {
        const point = pointCloudData.points[i];
        const marker = L.circleMarker([point.y, point.x], {
            radius: 1,
            color: getHeightColor(point.z, pointCloudData.bounds.minZ, pointCloudData.bounds.maxZ),
            fillOpacity: 0.6
        }).addTo(map);
        pointMarkers.push(marker);
    }
    
    // Store markers for later removal
    pointCloudData.markers = pointMarkers;
}

function getHeightColor(z, minZ, maxZ) {
    const normalized = (z - minZ) / (maxZ - minZ);
    if (normalized < 0.33) return '#0000ff'; // Blue for low
    if (normalized < 0.66) return '#00ff00'; // Green for medium
    return '#ff0000'; // Red for high
}

function exportGeoJSON() {
    const geojson = {
        type: "FeatureCollection",
        features: filteredData
    };
    
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tree_analysis_results.geojson';
    a.click();
    window.URL.revokeObjectURL(url);
}

function updateDataStatus(message) {
    const statusElement = document.getElementById('dataStatus');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = message.includes('Failed') || message.includes('Error') ? '#dc3545' : '#28a745';
    }
}

function updateLASStatus(icon, message) {
    const iconElement = document.getElementById('lasIcon');
    const statusElement = document.getElementById('lasStatus');
    if (iconElement) {
        iconElement.textContent = icon;
    }
    if (statusElement) {
        statusElement.innerHTML = `<span id="lasIcon" style="margin-right: 8px;">${icon}</span><span>${message}</span>`;
    }
}

function updateShapefileStatus(icon, message) {
    const iconElement = document.getElementById('shapefileIcon');
    const statusElement = document.getElementById('shapefileStatus');
    if (iconElement) {
        iconElement.textContent = icon;
    }
    if (statusElement) {
        statusElement.innerHTML = `<span id="shapefileIcon" style="margin-right: 8px;">${icon}</span><span>${message}</span>`;
    }
}

function showSetupInstructions() {
    const instructionsElement = document.getElementById('setupInstructions');
    if (instructionsElement) {
        instructionsElement.style.display = 'block';
    }
}

function hideSetupInstructions() {
    const instructionsElement = document.getElementById('setupInstructions');
    if (instructionsElement) {
        instructionsElement.style.display = 'none';
    }
}

/**
 * Load LAS file directly from user input (no server required)
 */
async function loadLASFileFromInput(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        
        // Check if LAS.js is available
        if (typeof LASFile === 'undefined') {
            throw new Error('LAS.js library not loaded. Please check the CDN link in index.html');
        }
        
        // Parse LAS file using LAS.js
        const lasFile = new LASFile(arrayBuffer);
        
        // Extract point cloud data
        const points = lasFile.points;
        const header = lasFile.header;
        
        pointCloudData = {
            points: points,
            header: header,
            bounds: {
                minX: header.minX,
                maxX: header.maxX,
                minY: header.minY,
                maxY: header.maxY,
                minZ: header.minZ,
                maxZ: header.maxZ
            }
        };
        
        // Add point cloud visualization to map
        visualizePointCloud();
        
        updateLASStatus('✅', `LAS file loaded: ${points.length.toLocaleString()} points`);
        updateDataStatus(`LAS file "${file.name}" loaded successfully`);
        
        console.log(`LAS file loaded: ${points.length} points`);
        
    } catch (error) {
        console.error('Error loading LAS file:', error);
        updateLASStatus('❌', `Failed to load LAS file: ${error.message}`);
        updateDataStatus(`Failed to load LAS file: ${error.message}`);
    }
}

/**
 * Load shapefiles directly from user input (no server required)
 */
async function loadShapefilesFromInput(files) {
    try {
        // Check if shapefile library is available
        if (typeof shapefile === 'undefined') {
            throw new Error('Shapefile.js library not loaded. Please check the CDN link in index.html');
        }
        
        // Find required files
        const shpFile = files.find(f => f.name.toLowerCase().endsWith('.shp'));
        const dbfFile = files.find(f => f.name.toLowerCase().endsWith('.dbf'));
        const prjFile = files.find(f => f.name.toLowerCase().endsWith('.prj'));
        
        if (!shpFile || !dbfFile) {
            throw new Error('Required .shp and .dbf files not found');
        }
        
        // Read files
        const [shpBuffer, dbfBuffer, prjText] = await Promise.all([
            shpFile.arrayBuffer(),
            dbfFile.arrayBuffer(),
            prjFile ? prjFile.text() : Promise.resolve(null)
        ]);
        
        // Convert shapefile to GeoJSON using shapefile library
        const source = shapefile.open(shpBuffer, dbfBuffer);
        
        const geojson = {
            type: "FeatureCollection",
            features: []
        };
        
        // Process all features
        let result = await source.read();
        while (!result.done) {
            geojson.features.push(result.value);
            result = await source.read();
        }
        
        // Process the tree data
        processTreeData(geojson);
        
        updateShapefileStatus('✅', `Shapefiles loaded: ${geojson.features.length} features`);
        updateDataStatus(`Shapefiles loaded successfully: ${geojson.features.length} tree crowns`);
        
        console.log(`Shapefile loaded: ${geojson.features.length} features`);
        
    } catch (error) {
        console.error('Error loading shapefiles:', error);
        updateShapefileStatus('❌', `Failed to load shapefiles: ${error.message}`);
        updateDataStatus(`Failed to load shapefiles: ${error.message}`);
    }
}

// Error handling
window.addEventListener('error', function(e) {
    console.error('Application error:', e.error);
});

console.log('LiDAR Tree Species Identification UI initialized successfully');