// Global variables
let treeData = [];
let originalTreeData = [];
let filteredData = [];
let currentSortColumn = null;
let currentSortDirection = 'asc';
let mapContainer;
let simulatedMap = {
    center: { lat: 14.6760, lng: 121.0437 },
    zoom: 16
};

// Color mapping for tree status
const statusColors = {
    'Correct': '#28a745',
    'Incorrect': '#dc3545',
    'Training': '#ffc107'
};

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeSimulatedMap();
    loadTreeData();
    setupEventListeners();
});

/**
 * Initialize a simulated map for demonstration
 */
function initializeSimulatedMap() {
    mapContainer = document.getElementById('map');
    
    // Create a simple map placeholder with interactive elements
    mapContainer.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%; background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%);">
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: white;">
                <div style="font-size: 2rem; margin-bottom: 10px;">🗺️</div>
                <div style="font-size: 1.2rem; margin-bottom: 10px;">La Mesa Ecopark Survey Area</div>
                <div style="font-size: 0.9rem; opacity: 0.8;">Interactive map will show here</div>
                <div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; backdrop-filter: blur(10px);">
                    <div style="font-size: 0.8rem; margin-bottom: 8px;">Coordinates: 14.6760°N, 121.0437°E</div>
                    <div style="font-size: 0.8rem;">Zoom Level: 16</div>
                </div>
            </div>
            <div id="treePolygons" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">
                <!-- Tree polygons will be added here -->
            </div>
        </div>
    `;

    console.log('Simulated map initialized successfully');
}

/**
 * Load tree data from GeoJSON file or create sample data
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
        "features": generateSampleTrees(25)
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
    
    for (let i = 1; i <= count; i++) {
        const predictedSpecies = species[Math.floor(Math.random() * species.length)];
        const groundTruthSpecies = Math.random() > 0.2 ? predictedSpecies : species[Math.floor(Math.random() * species.length)];
        const status = predictedSpecies === groundTruthSpecies ? 
            (Math.random() > 0.3 ? 'Correct' : 'Training') : 'Incorrect';

        features.push({
            "type": "Feature",
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

/**
 * Process loaded tree data and add to map
 */
function processTreeData(geojsonData) {
    treeData = geojsonData.features;
    originalTreeData = [...treeData];
    filteredData = [...treeData];
    
    addTreesToMap();
    populateResultsTable();
    updateModelPerformance();
    hideLoadingIndicator();
    
    console.log(`Loaded ${treeData.length} trees`);
}

/**
 * Add tree representations to the simulated map
 */
function addTreesToMap() {
    const polygonContainer = document.getElementById('treePolygons');
    if (!polygonContainer) return;
    
    polygonContainer.innerHTML = '';
    
    // Create visual representations of trees on the map
    filteredData.forEach((tree, index) => {
        const treeElement = document.createElement('div');
        const color = statusColors[tree.properties.status];
        
        // Position trees in a scattered pattern
        const angle = (index / filteredData.length) * 2 * Math.PI;
        const radius = 100 + Math.random() * 150;
        const centerX = 50; // center percentage
        const centerY = 50; // center percentage
        const x = centerX + (radius * Math.cos(angle)) / 5;
        const y = centerY + (radius * Math.sin(angle)) / 5;
        
        treeElement.style.cssText = `
            position: absolute;
            left: ${Math.max(5, Math.min(95, x))}%;
            top: ${Math.max(5, Math.min(95, y))}%;
            transform: translate(-50%, -50%);
            width: 20px;
            height: 20px;
            background: ${color};
            border: 2px solid rgba(255,255,255,0.8);
            border-radius: 50%;
            cursor: pointer;
            pointer-events: all;
            transition: all 0.3s ease;
            z-index: 10;
        `;
        
        // Add hover and click effects
        treeElement.addEventListener('mouseenter', function() {
            this.style.transform = 'translate(-50%, -50%) scale(1.3)';
            this.style.zIndex = '20';
            
            // Show tooltip
            showTooltip(this, tree.properties);
        });
        
        treeElement.addEventListener('mouseleave', function() {
            this.style.transform = 'translate(-50%, -50%) scale(1)';
            this.style.zIndex = '10';
            hideTooltip();
        });
        
        treeElement.addEventListener('click', function(e) {
            e.stopPropagation();
            openTreeModal(tree.properties);
        });
        
        polygonContainer.appendChild(treeElement);
    });
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
 * Initialize simulated Potree viewer for demonstration
 */
function initializeSimulatedPotreeViewer(container, treeProps) {
    // Create a simulated 3D viewer
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; background: linear-gradient(45deg, #1a1a1a 0%, #2d2d2d 100%);">
            <!-- 3D Viewer Header -->
            <div style="background: rgba(0,0,0,0.8); color: white; padding: 10px 15px; display: flex; justify-content: between; align-items: center; border-bottom: 1px solid #444;">
                <h4 style="margin: 0; color: #4CAF50;">🌳 3D Point Cloud Viewer</h4>
                <div style="font-size: 0.8rem; color: #ccc;">Tree ${treeProps.tree_id}</div>
            </div>
            
            <!-- 3D Viewer Content -->
            <div style="flex: 1; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
                <!-- Simulated 3D Tree -->
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
                <div id="potreeLoading" style="position: absolute; bottom: 15px; right: 15px; background: rgba(76, 175, 80, 0.2); color: #4CAF50; padding: 8px 12px; border-radius: 6px; font-size: 0.8rem;">
                    ✅ Point cloud loaded
                </div>
            </div>
        </div>
    `;

    console.log(`Simulated Potree viewer initialized for: ${treeProps.potree_path}`);
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

    const correct = originalTreeData.filter(tree => tree.properties.status === 'Correct').length;
    const total = originalTreeData.filter(tree => tree.properties.status !== 'Training').length;
    
    if (total > 0) {
        const accuracy = ((correct / total) * 100).toFixed(1);
        
        // Calculate other metrics (simplified for demonstration)
        const precision = Math.min(0.99, 0.85 + Math.random() * 0.1);
        const recall = Math.min(0.98, 0.82 + Math.random() * 0.1);
        const f1score = (2 * precision * recall / (precision + recall));

        document.getElementById('accuracy').textContent = `${accuracy}%`;
        document.getElementById('precision').textContent = precision.toFixed(3);
        document.getElementById('recall').textContent = recall.toFixed(3);
        document.getElementById('f1score').textContent = f1score.toFixed(3);
    }
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

console.log('LiDAR Tree Species Identification UI initialized successfully');

/**
 * Load tree data from GeoJSON file or create sample data
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

/**
 * Generate circle coordinates for tree crown polygon
 */
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
    originalTreeData = [...treeData];
    filteredData = [...treeData];
    
    addTreesToMap();
    populateResultsTable();
    updateModelPerformance();
    hideLoadingIndicator();
    
    console.log(`Loaded ${treeData.length} trees`);
}

/**
 * Add tree representations to the simulated map
 */
function addTreesToMap() {
    const polygonContainer = document.getElementById('treePolygons');
    if (!polygonContainer) return;
    
    polygonContainer.innerHTML = '';
    
    // Create visual representations of trees on the map
    filteredData.forEach((tree, index) => {
        const treeElement = document.createElement('div');
        const color = statusColors[tree.properties.status];
        
        // Position trees in a scattered pattern
        const angle = (index / filteredData.length) * 2 * Math.PI;
        const radius = 100 + Math.random() * 150;
        const centerX = 50; // center percentage
        const centerY = 50; // center percentage
        const x = centerX + (radius * Math.cos(angle)) / 5;
        const y = centerY + (radius * Math.sin(angle)) / 5;
        
        treeElement.style.cssText = `
            position: absolute;
            left: ${Math.max(5, Math.min(95, x))}%;
            top: ${Math.max(5, Math.min(95, y))}%;
            transform: translate(-50%, -50%);
            width: 20px;
            height: 20px;
            background: ${color};
            border: 2px solid rgba(255,255,255,0.8);
            border-radius: 50%;
            cursor: pointer;
            pointer-events: all;
            transition: all 0.3s ease;
            z-index: 10;
        `;
        
        // Add hover and click effects
        treeElement.addEventListener('mouseenter', function() {
            this.style.transform = 'translate(-50%, -50%) scale(1.3)';
            this.style.zIndex = '20';
            
            // Show tooltip
            showTooltip(this, tree.properties);
        });
        
        treeElement.addEventListener('mouseleave', function() {
            this.style.transform = 'translate(-50%, -50%) scale(1)';
            this.style.zIndex = '10';
            hideTooltip();
        });
        
        treeElement.addEventListener('click', function(e) {
            e.stopPropagation();
            openTreeModal(tree.properties);
        });
        
        polygonContainer.appendChild(treeElement);
    });
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
 * Initialize simulated Potree viewer for demonstration
 */
function initializeSimulatedPotreeViewer(container, treeProps) {
    // Create a simulated 3D viewer
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; background: linear-gradient(45deg, #1a1a1a 0%, #2d2d2d 100%);">
            <!-- 3D Viewer Header -->
            <div style="background: rgba(0,0,0,0.8); color: white; padding: 10px 15px; display: flex; justify-content: between; align-items: center; border-bottom: 1px solid #444;">
                <h4 style="margin: 0; color: #4CAF50;">🌳 3D Point Cloud Viewer</h4>
                <div style="font-size: 0.8rem; color: #ccc;">Tree ${treeProps.tree_id}</div>
            </div>
            
            <!-- 3D Viewer Content -->
            <div style="flex: 1; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
                <!-- Simulated 3D Tree -->
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
                <div id="potreeLoading" style="position: absolute; bottom: 15px; right: 15px; background: rgba(76, 175, 80, 0.2); color: #4CAF50; padding: 8px 12px; border-radius: 6px; font-size: 0.8rem;">
                    ✅ Point cloud loaded
                </div>
            </div>
        </div>
    `;

    console.log(`Simulated Potree viewer initialized for: ${treeProps.potree_path}`);
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

    const correct = originalTreeData.filter(tree => tree.properties.status === 'Correct').length;
    const total = originalTreeData.filter(tree => tree.properties.status !== 'Training').length;
    
    if (total > 0) {
        const accuracy = ((correct / total) * 100).toFixed(1);
        
        // Calculate other metrics (simplified for demonstration)
        const precision = Math.min(0.99, 0.85 + Math.random() * 0.1).toFixed(3);
        const recall = Math.min(0.98, 0.82 + Math.random() * 0.1).toFixed(3);
        const f1score = (2 * precision * recall / (precision + recall)).toFixed(3);

        document.getElementById('accuracy').textContent = `${accuracy}%`;
        document.getElementById('precision').textContent = precision;
        document.getElementById('recall').textContent = recall;
        document.getElementById('f1score').textContent = f1score;
    }
}

/**
 * Hide loading indicator
 */
function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.classList.add('hidden');
}

/**
 * Show loading indicator
 */
function showLoadingIndicator() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.classList.remove('hidden');
}

// Utility functions for data export (bonus features)
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

// Performance monitoring
function logPerformanceMetrics() {
    console.log({
        totalTrees: originalTreeData.length,
        filteredTrees: filteredData.length,
        memoryUsage: performance.memory ? performance.memory.usedJSHeapSize : 'N/A',
        mapZoom: map.getZoom(),
        mapCenter: map.getCenter()
    });
}

// Error handling
window.addEventListener('error', function(e) {
    console.error('Application error:', e.error);
    // Could implement user-friendly error reporting here
});

console.log('LiDAR Tree Species Identification UI initialized successfully');