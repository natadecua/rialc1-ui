// LiDAR Tree Species Identification UI

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

// Color mapping for different tree species
const speciesColors = {
    // Define a color palette for tree species
    'Acacia': '#e41a1c',
    'Dipterocarp': '#377eb8',
    'Mahogany': '#4daf4a',
    'Narra': '#984ea3',
    'Pine': '#ff7f00',
    'Unknown': '#a65628',
    // Default color for any other species
    'default': '#ffc107'
};

// Dynamic color palette for automatically assigning colors to species
const dynamicColorPalette = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', 
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
    '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
    '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5',
    '#3366cc', '#dc3912', '#ff9900', '#109618', '#990099',
    '#0099c6', '#dd4477', '#66aa00', '#b82e2e', '#316395'
];

// Cache for dynamically assigned colors
const dynamicSpeciesColors = {};
let colorIndex = 0;

// Function to get color based on species or prediction status
function getSpeciesColor(species, treeId) {
    // If we're in prediction mode and we have a treeId, check prediction status
    if (isPredictionMode && treeId) {
        // Convert treeId to string for comparison
        const treeIdStr = treeId.toString();
        
        // Find the tree data for this tree
        const treeData = predictionData.find(p => p.treeId === treeIdStr);
        
        if (treeData) {
            if (treeData.isTraining) {
                // Return color for training trees
                return '#FFC107'; // Amber color for training data
            } else {
                // Return color based on prediction correctness
                console.log(`Found prediction for tree ${treeIdStr}: ${treeData.correct ? 'correct' : 'incorrect'}`);
                return treeData.correct ? '#4CAF50' : '#F44336'; // Green for correct, Red for incorrect
            }
        } else {
            console.log(`No data found for tree ${treeIdStr}`);
        }
    }
    
    // Regular species coloring (when not in prediction mode or no tree data found)
    if (!species) return speciesColors.default;
    
    // Try to find direct match in predefined colors
    if (speciesColors[species]) return speciesColors[species];
    
    // Check for partial matches in predefined colors
    for (const key in speciesColors) {
        if (key !== 'default' && species.toLowerCase().includes(key.toLowerCase())) {
            return speciesColors[key];
        }
    }
    
    // Check if we've already assigned a dynamic color to this species
    if (dynamicSpeciesColors[species]) {
        return dynamicSpeciesColors[species];
    }
    
    // Assign a new color from the palette
    const newColor = dynamicColorPalette[colorIndex % dynamicColorPalette.length];
    colorIndex++;
    
    // Store the assigned color for future use
    dynamicSpeciesColors[species] = newColor;
    
    // Return the newly assigned color
    return newColor;
}

// Toggle between normal view and prediction view
function togglePredictionMode() {
    isPredictionMode = document.getElementById('predictionModeToggle').checked;
    
    console.log("Prediction mode:", isPredictionMode ? "ON" : "OFF");
    
    // Update filter UI elements based on mode
    const speciesFilters = document.getElementById('speciesFilters');
    const predictionFilters = document.getElementById('predictionFilters');
    
    if (speciesFilters) {
        speciesFilters.style.display = isPredictionMode ? 'none' : 'block';
    }
    
    if (predictionFilters) {
        predictionFilters.style.display = isPredictionMode ? 'block' : 'none';
        
        // Update filter checkboxes based on data availability
        if (isPredictionMode) {
            const hasCorrect = predictionData.some(p => !p.isTraining && p.correct);
            const hasIncorrect = predictionData.some(p => !p.isTraining && !p.correct);
            const hasTraining = predictionData.some(p => p.isTraining);
            
            const correctCheck = document.getElementById('filterCorrect');
            const incorrectCheck = document.getElementById('filterIncorrect');
            const trainingCheck = document.getElementById('filterTraining');
            
            if (correctCheck) correctCheck.disabled = !hasCorrect;
            if (incorrectCheck) incorrectCheck.disabled = !hasIncorrect;
            if (trainingCheck) trainingCheck.disabled = !hasTraining;
        }
    }
    
    // Check if we have any prediction data
    if (isPredictionMode && predictionData.length === 0) {
        console.warn("No prediction data available");
        alert("No prediction data available. Please check that the prediction_results.csv file is present.");
    }
    
    // Update the map with new coloring
    addTreesToMap();
    
    // Update the table with prediction info
    populateResultsTable();
    
    // Update the legend to show prediction colors instead of species colors
    updateLegendForPredictionMode();
}

// Function to load prediction data from CSV
async function loadPredictionData() {
    try {
        const response = await fetch('/raw_data/prediction_results.csv');
        const csv = await response.text();
        
        // Parse CSV
        const lines = csv.split('\n');
        const headers = lines[0].split(',');
        
        // Map group numbers to species names for better display
        const groupToSpecies = {
            '1.0': 'Pine', 
            '2.0': 'Mahogany',
            '3.0': 'Narra',
            '4.0': 'Acacia',
            '5.0': 'Dipterocarp'
        };
        
        const allTreeData = [];  // Combined array for both test and training trees
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',');
            
            // Make sure we convert any floating point numbers to integers for tree IDs
            // This converts "1.0" to "1" for proper matching with shapefile tree IDs
            let treeId = values[0].trim();
            if (treeId.endsWith(".0")) {
                treeId = treeId.substring(0, treeId.length - 2);
            }
            
            const actualGroup = values[1].trim();
            const splitType = values[2].trim();
            const actualSpecies = groupToSpecies[actualGroup] || `Group ${actualGroup}`;
            
            if (splitType === 'test' && values[3] && values[3].trim() !== '') {
                // For test data with predictions
                const predictedGroup = values[3].trim();
                const isCorrect = values[4] && values[4].trim() === '1.0';
                
                const predictionObj = {
                    treeId: treeId,
                    actual: actualSpecies,
                    predicted: groupToSpecies[predictedGroup] || `Group ${predictedGroup}`,
                    correct: isCorrect,
                    isTraining: false,
                    dataType: 'test'
                };
                allTreeData.push(predictionObj);
            } else if (splitType === 'train') {
                // For training data
                const trainingObj = {
                    treeId: treeId,
                    actual: actualSpecies,
                    isTraining: true,
                    dataType: 'train'
                };
                allTreeData.push(trainingObj);
            }
        }
        
        const testTrees = allTreeData.filter(tree => tree.dataType === 'test');
        const trainingTrees = allTreeData.filter(tree => tree.dataType === 'train');
        
        console.log(`Loaded ${testTrees.length} test trees and ${trainingTrees.length} training trees`);
        return allTreeData;
    } catch (error) {
        console.error('Error loading prediction data:', error);
        return [];
    }
}

// --- Application Initialization ---
document.addEventListener('DOMContentLoaded', async function() {
    console.log('LiDAR Tree Species Identification UI initialized successfully');
    
    // Define the custom projection for PRS92 / Philippines zone 3 (EPSG:3123)
    if (typeof proj4 !== 'undefined') {
        // Updated projection parameters based on working simple-shapefile.html
        proj4.defs("EPSG:3123", "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.99995 +x_0=500000 +y_0=0 +ellps=clrk66 +towgs84=-127.62,-67.24,-47.04,-3.068,4.903,1.578,-1.06 +units=m +no_defs");
        console.log("EPSG:3123 projection definition successfully loaded");
    } else {
        console.error("proj4 library not loaded. Shapefile reprojection will fail.");
        alert("CRITICAL ERROR: proj4 library not found. The application cannot start.");
        return;
    }

    initializeMap();
    setupEventListeners();
    await loadData();
    
    // Load prediction data
    predictionData = await loadPredictionData();
    console.log(`Loaded ${predictionData.length} prediction records`);
    
    // Log the first few prediction records for debugging
    if (predictionData.length > 0) {
        console.log("Sample prediction records:");
        for (let i = 0; i < Math.min(5, predictionData.length); i++) {
            console.log(`Tree ${predictionData[i].treeId}: ${predictionData[i].actual} → ${predictionData[i].predicted} (${predictionData[i].correct ? 'Correct' : 'Incorrect'})`);
        }
    }
});

/**
 * Sets up the main Leaflet map with a geographic projection and a tile layer.
 */
function initializeMap() {
    const center = [14.7137, 121.0707];
    
    map = L.map('map', {
        center: center,
        zoom: 17,
        minZoom: 15,
        maxZoom: 22,
    });

    const osmBase = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });

    const satelliteBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
    });

    osmBase.addTo(map);

    const customTilesOverlay = L.tileLayer('http://localhost:3000/tiles_forest/{z}/{x}/{y}.png', {
        attribution: 'Raster Data &copy; natadecua',
        minZoom: 15,
        maxZoom: 22,
        tms: true,
        opacity: 1.0 
    });

    customTilesOverlay.addTo(map);

    const baseLayers = {
        "OpenStreetMap": osmBase,
        "Esri Satellite": satelliteBase
    };

    const overlays = {
        "La Mesa Ecopark Tiles": customTilesOverlay,
        "Tree Crowns": treeLayers
    };

    L.control.layers(baseLayers, overlays).addTo(map);

    treeLayers.addTo(map);
    
    // This forces Leaflet to re-calculate its container size after all CSS has been applied.
    setTimeout(() => {
        map.invalidateSize();
        // After invalidating, fit the bounds to the general area.
        map.fitBounds([[14.7087, 121.0671], [14.7156, 121.0770]]);
    }, 100);
}

/**
 * Orchestrates the loading of all initial data.
 */
async function loadData() {
    updateDataStatus('Loading raw data...');
    updateShapefileStatus('⏳','Loading shapefile');
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
function collectSpeciesData() {
    // Get unique species from the data with all attributes
    const speciesInfo = {};
    
    originalTreeData.forEach(tree => {
        const props = tree.properties;
        const commonName = props.Cmmn_Nm || props.cmmn_nm || 'Unknown';
        
        if (commonName !== 'Unknown') {
            if (!speciesInfo[commonName]) {
                speciesInfo[commonName] = {
                    count: 0,
                    color: getSpeciesColor(commonName),
                    scientificName: props.Scntf_N || props.scntf_n || null,
                    family: props.Family || props.family || null,
                    order: props.Order || props.order || null,
                    className: props.Class || props.class || null
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
    
    legendControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'species-legend-control');
        div.style.backgroundColor = 'white';
        div.style.padding = '10px';
        div.style.borderRadius = '5px';
        div.style.boxShadow = '0 1px 5px rgba(0,0,0,0.4)';
        div.style.maxHeight = '300px';
        div.style.overflowY = 'auto';
        div.style.minWidth = '180px';
        
        if (isPredictionMode) {
            // Prediction mode legend
            div.innerHTML = '<div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">Prediction Results</div>';
            
            // Count correct, incorrect predictions and training trees
            let correctCount = 0;
            let incorrectCount = 0;
            let trainingCount = 0;
            
            predictionData.forEach(tree => {
                if (tree.isTraining) {
                    trainingCount++;
                } else if (tree.correct) {
                    correctCount++;
                } else {
                    incorrectCount++;
                }
            });
            
            // Calculate total test predictions
            const totalPredictions = correctCount + incorrectCount;
            const totalTrees = totalPredictions + trainingCount;
            
            // Create legend item for training data
            const trainingItem = document.createElement('div');
            trainingItem.style.display = 'flex';
            trainingItem.style.alignItems = 'center';
            trainingItem.style.marginBottom = '5px';
            
            const trainingColorBox = document.createElement('span');
            trainingColorBox.style.display = 'inline-block';
            trainingColorBox.style.width = '15px';
            trainingColorBox.style.height = '15px';
            trainingColorBox.style.backgroundColor = '#FFC107';
            trainingColorBox.style.marginRight = '5px';
            trainingColorBox.style.borderRadius = '3px';
            
            const trainingLabel = document.createElement('span');
            trainingLabel.textContent = `Training Data (${trainingCount})`;
            trainingLabel.style.fontSize = '12px';
            
            trainingItem.appendChild(trainingColorBox);
            trainingItem.appendChild(trainingLabel);
            div.appendChild(trainingItem);
            
            // Add a separator
            if (trainingCount > 0 && totalPredictions > 0) {
                const separatorTrain = document.createElement('hr');
                separatorTrain.style.margin = '10px 0';
                separatorTrain.style.border = 'none';
                separatorTrain.style.borderTop = '1px solid #eee';
                div.appendChild(separatorTrain);
            }
            
            // Only show test predictions if there are any
            if (totalPredictions > 0) {
                // Create legend items for correct predictions
                const correctItem = document.createElement('div');
                correctItem.style.display = 'flex';
                correctItem.style.alignItems = 'center';
                correctItem.style.marginBottom = '5px';
                
                const correctColorBox = document.createElement('span');
                correctColorBox.style.display = 'inline-block';
                correctColorBox.style.width = '15px';
                correctColorBox.style.height = '15px';
                correctColorBox.style.backgroundColor = '#4CAF50';
                correctColorBox.style.marginRight = '5px';
                correctColorBox.style.borderRadius = '3px';
                
                const correctLabel = document.createElement('span');
                correctLabel.textContent = `Correct (${correctCount})`;
                correctLabel.style.fontSize = '12px';
                
                correctItem.appendChild(correctColorBox);
                correctItem.appendChild(correctLabel);
                div.appendChild(correctItem);
                
                // Create legend items for incorrect predictions
                const incorrectItem = document.createElement('div');
                incorrectItem.style.display = 'flex';
                incorrectItem.style.alignItems = 'center';
                incorrectItem.style.marginBottom = '5px';
                
                const incorrectColorBox = document.createElement('span');
                incorrectColorBox.style.display = 'inline-block';
                incorrectColorBox.style.width = '15px';
                incorrectColorBox.style.height = '15px';
                incorrectColorBox.style.backgroundColor = '#F44336';
                incorrectColorBox.style.marginRight = '5px';
                incorrectColorBox.style.borderRadius = '3px';
                
                const incorrectLabel = document.createElement('span');
                incorrectLabel.textContent = `Incorrect (${incorrectCount})`;
                incorrectLabel.style.fontSize = '12px';
                
                incorrectItem.appendChild(incorrectColorBox);
                incorrectItem.appendChild(incorrectLabel);
                div.appendChild(incorrectItem);
                
                // Add accuracy information
                const accuracy = (correctCount / totalPredictions * 100).toFixed(1);
                
                const separator = document.createElement('hr');
                separator.style.margin = '10px 0';
                separator.style.border = 'none';
                separator.style.borderTop = '1px solid #eee';
                div.appendChild(separator);
                
                const accuracyItem = document.createElement('div');
                accuracyItem.style.fontSize = '13px';
                accuracyItem.style.fontWeight = 'bold';
                accuracyItem.textContent = `Test Accuracy: ${accuracy}%`;
                div.appendChild(accuracyItem);
                
                // Add ratio information
                const trainingRatio = (trainingCount / totalTrees * 100).toFixed(1);
                const testRatio = (totalPredictions / totalTrees * 100).toFixed(1);
                
                const ratioItem = document.createElement('div');
                ratioItem.style.fontSize = '12px';
                ratioItem.style.marginTop = '5px';
                ratioItem.textContent = `Train/Test: ${trainingRatio}% / ${testRatio}%`;
                div.appendChild(ratioItem);
            }
        } else {
            // Regular species mode legend
            // Collect species data
            const speciesData = collectSpeciesData();
            const speciesNames = Object.keys(speciesData).sort();
            
            // Add title
            div.innerHTML = '<div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">Tree Species</div>';
            
            // Add each species to the legend
            speciesNames.forEach(name => {
                const data = speciesData[name];
                const item = document.createElement('div');
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.marginBottom = '5px';
                
                const colorBox = document.createElement('span');
                colorBox.style.display = 'inline-block';
                colorBox.style.width = '15px';
                colorBox.style.height = '15px';
                colorBox.style.backgroundColor = data.color;
                colorBox.style.marginRight = '5px';
                colorBox.style.borderRadius = '3px';
                
                const nameSpan = document.createElement('span');
                nameSpan.textContent = `${name} (${data.count})`;
                nameSpan.style.fontSize = '12px';
                
                item.appendChild(colorBox);
                item.appendChild(nameSpan);
                div.appendChild(item);
            });
            
            // Also add dynamically assigned colors
            const dynamicSpeciesNames = Object.keys(dynamicSpeciesColors).filter(name => !speciesNames.includes(name)).sort();
            
            if (dynamicSpeciesNames.length > 0) {
                // Add separator if we have both predefined and dynamic colors
                if (speciesNames.length > 0) {
                    const separator = document.createElement('hr');
                    separator.style.margin = '10px 0';
                    separator.style.border = 'none';
                    separator.style.borderTop = '1px solid #eee';
                    div.appendChild(separator);
                }
                
                dynamicSpeciesNames.forEach(name => {
                    const item = document.createElement('div');
                    item.style.display = 'flex';
                    item.style.alignItems = 'center';
                    item.style.marginBottom = '5px';
                    
                    const colorBox = document.createElement('span');
                    colorBox.style.display = 'inline-block';
                    colorBox.style.width = '15px';
                    colorBox.style.height = '15px';
                    colorBox.style.backgroundColor = dynamicSpeciesColors[name];
                    colorBox.style.marginRight = '5px';
                    colorBox.style.borderRadius = '3px';
                    
                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = name;
                    nameSpan.style.fontSize = '12px';
                    
                    item.appendChild(colorBox);
                    item.appendChild(nameSpan);
                    div.appendChild(item);
                });
            }
        }
        
        // Prevent click events from propagating to the map
        L.DomEvent.disableClickPropagation(div);
        
        return div;
    };
    
    // Add the legend to the map
    legendControl.addTo(map);
}

// Helper function to update the legend when switching between modes
function updateLegendForPredictionMode() {
    // Clear any existing dynamic species colors when switching modes
    if (isPredictionMode) {
        // Reset dynamic colors when entering prediction mode
        dynamicSpeciesColors = {};
        colorIndex = 0;
    }
    
    // Recreate the legend with the appropriate mode
    createSpeciesLegend();
}

/**
 * Sets up all event listeners for UI elements.
 */
function setupEventListeners() {
    document.getElementById('panelToggle').addEventListener('click', () => {
        document.getElementById('sidePanel').classList.toggle('collapsed');
        // When the panel is toggled, tell Leaflet to re-check its size.
        setTimeout(() => {
            map.invalidateSize({ animate: true });
        }, 300); // Delay matches typical CSS transition time.
    });

    // Enable prediction filters
    ['filterCorrect', 'filterIncorrect', 'filterTraining'].forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.disabled = false;  // Enable the checkboxes
            checkbox.checked = true;    // Check them all by default
            
            // Add event listener for filter change
            checkbox.addEventListener('change', () => {
                if (isPredictionMode) {
                    addTreesToMap();
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
                populateResultsTable();
                addTreesToMap();
            });
        }
        
        // Add prediction toggle switch
        const predictionToggleElem = document.getElementById('predictionModeToggle');
        if (predictionToggleElem) {
            predictionToggleElem.addEventListener('change', togglePredictionMode);
        }
    }

    document.getElementById('searchInput').addEventListener('input', (e) => {
        filterTableData(e.target.value);
    });

    document.querySelectorAll('#resultsTable th[data-sort]').forEach(header => {
        header.addEventListener('click', () => sortTable(header.dataset.sort));
    });

    document.getElementById('loadLocalShapefileBtn').addEventListener('click', () => {
        alert("Local file loading is disabled in this example. Data is loaded from the server.");
    });
}

/**
 * Load shapefiles, process their properties, and add them to the map.
 */
/**
 * Calculate and update summary statistics about the tree data
 */
function updateTreeStatistics() {
    if (!originalTreeData || originalTreeData.length === 0) return;
    
    // Count trees by species
    const speciesCounts = {};
    let totalArea = 0;
    
    originalTreeData.forEach(tree => {
        const props = tree.properties;
        const species = props.Cmmn_Nm || props.cmmn_nm || props.species || props.SPECIES || props.Species || props.ground_truth_species || 'Unknown';
        
        // Count by species
        speciesCounts[species] = (speciesCounts[species] || 0) + 1;
        
        // Calculate area if we have geometry
        if (tree.geometry && tree.geometry.type.includes('Polygon')) {
            try {
                // This is a rough approximation using the geometry directly
                // In a real app, we'd use a proper area calculation library for more accuracy
                const layer = L.geoJSON(tree);
                const area = L.GeometryUtil.geodesicArea(layer.getLayers()[0].getLatLngs()[0]);
                totalArea += area;
            } catch (e) {
                console.warn('Error calculating area:', e);
            }
        }
    });
    
    // Format total area
    let areaText = '';
    if (totalArea < 10000) {
        areaText = `${totalArea.toFixed(2)} m²`;
    } else {
        areaText = `${(totalArea / 10000).toFixed(4)} ha`;
    }
    
    // Update the performance section with our statistics
    document.getElementById('accuracy').textContent = originalTreeData.length;
    document.getElementById('precision').textContent = Object.keys(speciesCounts).length;
    document.getElementById('recall').textContent = areaText;
    document.getElementById('f1score').textContent = '-';
    
    // Update the labels
    document.querySelectorAll('.metrics-grid .metric-label')[0].textContent = 'Total Trees';
    document.querySelectorAll('.metrics-grid .metric-label')[1].textContent = 'Species Types';
    document.querySelectorAll('.metrics-grid .metric-label')[2].textContent = 'Total Area';
    document.querySelectorAll('.metrics-grid .metric-label')[3].textContent = 'Avg. Height';
    
    // Update the header
    document.querySelector('.performance-section h3').textContent = 'Tree Data Statistics';
}

async function loadAndProcessShapefiles() {
    try {
        // Check both possible paths for the shapefile
        let shpPath = '/raw_data/shapefiles/mcws_crowns_newclass.shp';
        let dbfPath = '/raw_data/shapefiles/mcws_crowns_newclass.dbf';
        let prjPath = '/raw_data/shapefiles/mcws_crowns_newclass.prj';
        
        // Try to check if the primary shapefile exists
        try {
            const testResponse = await fetch(shpPath, { method: 'HEAD' });
            if (!testResponse.ok) {
                console.warn(`Main shapefile not found at ${shpPath}. Trying fallback location...`);
                // Fall back to crown_shp folder
                shpPath = '/raw_data/crown_shp/mcws_crowns.shp';
                dbfPath = '/raw_data/crown_shp/mcws_crowns.dbf';
                prjPath = '/raw_data/crown_shp/mcws_crowns.prj';
                
                // Test if this fallback exists
                const altResponse = await fetch(shpPath, { method: 'HEAD' });
                if (!altResponse.ok) {
                    throw new Error('Shapefile not found in either location');
                }
                console.log(`Using fallback shapefile from ${shpPath}`);
            } else {
                console.log(`Using primary shapefile from ${shpPath}`);
            }
        } catch (fetchError) {
            console.error('Error checking shapefile availability:', fetchError);
            throw new Error('Failed to access shapefile resources');
        }
        
        console.log(`Loading shapefiles from server: ${shpPath} and ${dbfPath}`);
        
        if (typeof shapefile === 'undefined') {
            console.error('Shapefile library not available. Check if shapefile.js is loaded.');
            throw new Error('Shapefile library not available');
        }
        
        // Try to load the PRJ file to understand the projection
        try {
            const prjResponse = await fetch(prjPath);
            if (prjResponse.ok) {
                const prjText = await prjResponse.text();
                console.log('PRJ file content:', prjText);
            }
        } catch (prjError) {
            console.warn('Could not load PRJ file:', prjError);
            // Continue anyway
        }
        
        // Set encoding options for shapefile reading (ISO-8859-1)
        const options = {
            encoding: 'ISO-8859-1'
        };
        
        // Load the shapefile with the specified encoding
        const geojson = await shapefile.read(shpPath, dbfPath, options);

        if (!geojson || !geojson.features || geojson.features.length === 0) {
            throw new Error("Shapefile loaded but contains no features.");
        }
        console.log(`Shapefile loaded with ${geojson.features.length} features.`);
        
        // Analyze the geometry types for debugging
        const geometryTypes = {};
        for (const feature of geojson.features) {
            if (feature.geometry && feature.geometry.type) {
                geometryTypes[feature.geometry.type] = (geometryTypes[feature.geometry.type] || 0) + 1;
            }
        }
        console.log('Geometry types in shapefile:', geometryTypes);
        
        // Log the first feature to inspect its structure
        console.log("First feature:", JSON.stringify(geojson.features[0]).substring(0, 500) + "...");
        
        // Function to transform coordinates from EPSG:3123 to WGS84 (EPSG:4326)
        function transformCoordinates(coordinates, type) {
            if (type === 'Point') {
                return proj4('EPSG:3123', 'EPSG:4326', coordinates);
            } else if (type === 'LineString' || type === 'MultiPoint') {
                return coordinates.map(point => proj4('EPSG:3123', 'EPSG:4326', point));
            } else if (type === 'Polygon' || type === 'MultiLineString') {
                return coordinates.map(ring => 
                    ring.map(point => proj4('EPSG:3123', 'EPSG:4326', point))
                );
            } else if (type === 'MultiPolygon') {
                return coordinates.map(polygon => 
                    polygon.map(ring => 
                        ring.map(point => proj4('EPSG:3123', 'EPSG:4326', point))
                    )
                );
            }
            return coordinates; // Return unchanged if type is unknown
        }

        // Transform all features
        console.log("Transforming coordinates from EPSG:3123 to WGS84...");
        for (const feature of geojson.features) {
            if (feature.geometry && feature.geometry.type) {
                feature.geometry.coordinates = transformCoordinates(
                    feature.geometry.coordinates, 
                    feature.geometry.type
                );
            }
        }
        console.log("Coordinate transformation complete");

        // SIMPLIFICATION: Process features but assign a simple, consistent status.
        originalTreeData = geojson.features.map((feature, index) => {
            const properties = feature.properties;
            const treeId = properties.tree_id || properties.id || properties.FID || `T${(index + 1).toString().padStart(3, '0')}`;
            const speciesField = properties.species || properties.SPECIES || properties.Species || 'Unknown';

            return {
                ...feature,
                properties: {
                    ...properties,
                    tree_id: treeId,
                    predicted_species: 'N/A', // Simplified for now
                    ground_truth_species: speciesField,
                    status: 'Visible' // A single status to ensure it's not filtered out
                }
            };
        });

        // Show all data by default.
        filteredData = [...originalTreeData];

        addTreesToMap();
        populateResultsTable();
        updateTreeStatistics(); // Added statistics update
        createSpeciesLegend(); // Create the species legend
        hideLoadingIndicator();
        updateShapefileStatus('✅', `Trees: ${originalTreeData.length}`);
        
        console.log(`Processed and initiated mapping for ${originalTreeData.length} trees.`);

    } catch (error) {
        console.error('Error loading or processing shapefiles:', error);
        updateShapefileStatus('❌','Failed to load shapefiles');
        throw error;
    }
}

/**
 * Add tree polygons to the Leaflet map using L.Proj.geoJson for automatic reprojection.
 */
function addTreesToMap() {
    treeLayers.clearLayers();

    if (filteredData.length === 0) {
        console.warn("addTreesToMap called with no data to display.");
        return;
    }
    
    // Apply filters for unknown species
    const hideUnknown = document.getElementById('filterUnknownSpecies')?.checked;
    let dataToMap = filteredData;
    
    if (hideUnknown) {
        dataToMap = filteredData.filter(tree => {
            const props = tree.properties;
            const commonName = props.Cmmn_Nm || props.cmmn_nm;
            return commonName; // Only keep trees that have a common name
        });
    }

    // Filter by prediction status if we're in prediction mode
    if (isPredictionMode) {
        // Get all data types to show based on filter checkboxes
        const showCorrect = document.getElementById('filterCorrect').checked;
        const showIncorrect = document.getElementById('filterIncorrect').checked;
        const showTraining = document.getElementById('filterTraining').checked;
        
        // Only show trees that have predictions and match our filter settings
        const beforeCount = dataToMap.length;
        dataToMap = dataToMap.filter(tree => {
            const treeId = tree.properties.tree_id.toString();
            const treeData = predictionData.find(p => p.treeId === treeId);
            
            if (!treeData) return false; // No data for this tree
            
            if (treeData.isTraining) {
                return showTraining; // Include if training filter is on
            } else if (treeData.correct) {
                return showCorrect; // Include if correct predictions filter is on
            } else {
                return showIncorrect; // Include if incorrect predictions filter is on
            }
        });
        
        console.log(`Filtered from ${beforeCount} to ${dataToMap.length} trees with predictions/training data`);
        
        if (dataToMap.length > 0) {
            // Log a sample of tree IDs that were kept
            console.log("Sample of kept tree IDs:", dataToMap.slice(0, 3).map(t => t.properties.tree_id));
        } else {
            console.warn("No trees match the current filters");
        }
    }

    console.log("Adding", dataToMap.length, "tree features to map");
    
    // Use standard GeoJSON handling with species-based styling
    const geoJsonLayer = L.geoJSON(dataToMap, {
        style: function(feature) {
            // Get species from properties - prioritize Cmmn_Nm (Common Name) field
            const species = feature.properties.Cmmn_Nm || 
                           feature.properties.cmmn_nm ||
                           feature.properties.species || 
                           feature.properties.SPECIES || 
                           feature.properties.Species || 
                           feature.properties.ground_truth_species ||
                           'Unknown';
                           
            // Get the appropriate color for this species, passing tree ID for prediction mode
            const speciesColor = getSpeciesColor(species, feature.properties.tree_id);
            
            // Apply different styles based on geometry type
            if (feature.geometry.type.includes('Polygon')) {
                return {
                    color: speciesColor,
                    weight: 2,
                    opacity: 0.8,
                    fillColor: speciesColor,
                    fillOpacity: 0.5
                };
            } else if (feature.geometry.type.includes('LineString')) {
                return {
                    color: '#0000ff', // Blue for lines
                    weight: 3,
                    opacity: 1.0,
                    dashArray: '5, 10' // Dashed line for better visibility
                };
            } else {
                return {
                    color: speciesColor,
                    weight: 4,
                    opacity: 1.0,
                    radius: 8,
                    fillColor: speciesColor,
                    fillOpacity: 0.7
                };
            }
        },
        onEachFeature: (feature, layer) => {
            const props = feature.properties;
            
            // Calculate area if it's a polygon
            let area = 0;
            if (feature.geometry && feature.geometry.type.includes('Polygon')) {
                try {
                    // Calculate approximate area (rough estimate)
                    area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
                    // Convert to square meters if very small
                    if (area < 100) {
                        area = (area).toFixed(2) + ' m²';
                    } else {
                        // Convert to hectares for larger areas
                        area = (area / 10000).toFixed(4) + ' ha';
                    }
                } catch (e) {
                    console.warn('Error calculating area:', e);
                    area = 'Not available';
                }
            }
            
            // Get species information - prioritize the Cmmn_Nm (Common Name) field
            const species = props.Cmmn_Nm || props.cmmn_nm || props.species || props.SPECIES || props.Species || props.ground_truth_species || 'Unknown';
            
            // Create a styled popup with key information at the top
            let popupContent = `
                <div style="min-width: 300px;">
                    <div style="background-color: ${getSpeciesColor(species, props.tree_id)}; color: white; padding: 10px; margin: -13px -19px 10px -19px; border-radius: 12px 12px 0 0;">
                        <h4 style="margin: 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">Tree ${props.tree_id || 'ID Unknown'}</h4>
                        <div style="font-size: 14px; margin-top: 5px;">${species}</div>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <strong>Area:</strong> ${area}<br>
                        <strong>Height:</strong> ${props.height || props.HEIGHT || 'Not available'} ${props.height_unit || 'm'}<br>
                        <strong>Crown Width:</strong> ${props.crown_width || props.width || props.WIDTH || 'Not available'} ${props.width_unit || 'm'}
                    </div>
                    
                    <details>
                        <summary style="cursor: pointer; margin-bottom: 8px; color: #007bff;">Show All Properties</summary>
                        <div style="max-height: 200px; overflow-y: auto; font-size: 12px; border: 1px solid #eee; padding: 8px; border-radius: 4px;">`;
                        
            // Add all properties in the detailed section
            for (let prop in props) {
                popupContent += `<strong>${prop}:</strong> ${props[prop]}<br>`;
            }
            
            popupContent += `
                        </div>
                    </details>
                </div>
            `;
            
            // Add prediction information to popup if we're in prediction mode
            if (isPredictionMode) {
                const treeData = predictionData.find(p => p.treeId === props.tree_id.toString());
                
                if (treeData) {
                    let predictionInfo = '';
                    
                    if (treeData.isTraining) {
                        // Show training data info
                        predictionInfo = `
                            <div style="margin-top: 15px; padding: 10px; background-color: #f5f5f5; border-radius: 4px; border-left: 4px solid #FFC107">
                                <h4 style="margin-top: 0; margin-bottom: 8px;">Training Data</h4>
                                <strong>Species:</strong> ${treeData.actual}<br>
                                <strong>Status:</strong> <span style="color:#FFC107; font-weight:bold;">Used for Training</span>
                            </div>
                        `;
                    } else {
                        // Show prediction result info
                        const predictionStatus = treeData.correct ? 
                            '<span style="color:#4CAF50; font-weight:bold;">✓ CORRECT</span>' : 
                            '<span style="color:#F44336; font-weight:bold;">✗ INCORRECT</span>';
                        
                        predictionInfo = `
                            <div style="margin-top: 15px; padding: 10px; background-color: #f5f5f5; border-radius: 4px; border-left: 4px solid ${treeData.correct ? '#4CAF50' : '#F44336'}">
                                <h4 style="margin-top: 0; margin-bottom: 8px;">Prediction Result</h4>
                                <strong>Actual:</strong> ${treeData.actual}<br>
                                <strong>Predicted:</strong> ${treeData.predicted}<br>
                                <strong>Status:</strong> ${predictionStatus}
                            </div>
                        `;
                    }
                    
                    // Insert the info before the details section
                    const detailsIndex = popupContent.indexOf('<details>');
                    if (detailsIndex !== -1) {
                        popupContent = popupContent.substring(0, detailsIndex) + 
                            predictionInfo + 
                            popupContent.substring(detailsIndex);
                    } else {
                        popupContent = popupContent.replace('</div>', predictionInfo + '</div>');
                    }
                }
            }
            
            layer.bindPopup(popupContent);

            // Add a tooltip with basic info that appears on hover
            let tooltipContent = `Tree ${props.tree_id || 'Unknown'}: ${species}`;
            
            // Add prediction info to tooltip in prediction mode
            if (isPredictionMode) {
                const prediction = predictionData.find(p => p.treeId === props.tree_id.toString());
                if (prediction) {
                    tooltipContent = `Tree ${props.tree_id}: ${prediction.actual} → ${prediction.predicted} (${prediction.correct ? 'Correct' : 'Incorrect'})`;
                }
            }
            
            layer.bindTooltip(tooltipContent, {
                direction: 'top',
                sticky: true,
                opacity: 0.9,
                className: 'custom-tooltip'
            });

            layer.on('click', () => {
                map.fitBounds(layer.getBounds().pad(0.1));
            });
        }
    });

    // Add the GeoJSON layer to the map through the layer group
    treeLayers.addLayer(geoJsonLayer);
    console.log("Added GeoJSON layer to treeLayers group");
    
    // Update the species legend to reflect any new colors
    createSpeciesLegend();

    // Zoom to the bounds of the features on the initial load.
    if (geoJsonLayer.getBounds && geoJsonLayer.getBounds().isValid()) {
        console.log("Fitting map to tree bounds");
        map.fitBounds(geoJsonLayer.getBounds().pad(0.1));
    } else {
        console.warn("Could not fit to bounds - bounds invalid or not available");
    }
}

/**
 * Populate the results table with data. (Simplified)
 */
function populateResultsTable() {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';

    if (filteredData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">No trees to display.</td></tr>';
        return;
    }
    
    // Update table headers based on mode
    const tableHeaders = document.querySelector('#resultsTable thead tr');
    
    if (isPredictionMode) {
        tableHeaders.innerHTML = `
            <th data-sort="tree_id">ID</th>
            <th data-sort="actual">Actual Species</th>
            <th data-sort="predicted">Predicted Species</th>
            <th data-sort="correct">Status</th>
            <th>Action</th>
        `;
        
        // Show the message in console for debugging
        console.log("Switched to prediction mode headers");
    } else {
        tableHeaders.innerHTML = `
            <th data-sort="tree_id">ID</th>
            <th data-sort="Cmmn_Nm">Common Name</th>
            <th data-sort="Scntf_N">Scientific Name</th>
            <th data-sort="Family">Family</th>
            <th data-sort="specs_d">Diameter (cm)</th>
        `;
        
        // Show the message in console for debugging
        console.log("Switched to regular mode headers");
    }

    // Filter trees based on mode
    let treesToShow = [];
    
    if (isPredictionMode) {
        // In prediction mode, only show trees that have prediction data
        const predictionTreeIds = new Set(predictionData.map(p => p.treeId));
        
        treesToShow = filteredData.filter(tree => 
            predictionTreeIds.has(tree.properties.tree_id.toString())
        );
    } else {
        // In regular mode, filter out trees with unknown common names if requested
        treesToShow = filteredData.filter(tree => {
            const props = tree.properties;
            const commonName = props.Cmmn_Nm || props.cmmn_nm;
            
            // Keep trees that have a common name or all trees if filter is off
            return commonName || !document.getElementById('filterUnknownSpecies')?.checked;
        });
        
        // Sort by common name by default for first load if not already sorted
        if (!currentSortColumn) {
            treesToShow.sort((a, b) => {
                const nameA = a.properties.Cmmn_Nm || a.properties.cmmn_nm || 'Unknown';
                const nameB = b.properties.Cmmn_Nm || b.properties.cmmn_nm || 'Unknown';
                return nameA.localeCompare(nameB);
            });
        }
    }

    // Populate the table based on mode
    treesToShow.forEach(tree => {
        const props = tree.properties;
        const treeId = props.tree_id;
        const row = document.createElement('tr');
        row.dataset.treeId = treeId;
        
        if (isPredictionMode) {
            // Find prediction for this tree
            const treeIdStr = treeId.toString();
            const treeData = predictionData.find(p => p.treeId === treeIdStr);
            
            if (treeData) {
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
                    <td>
                        <button class="view-tree-btn" data-tree-id="${treeId}">View</button>
                    </td>
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
                    <td>
                        <button class="view-tree-btn" data-tree-id="${treeId}">View</button>
                    </td>
                `;
                    
                    // Add highlighting based on correctness
                    row.style.backgroundColor = treeData.correct ? 'rgba(76, 175, 80, 0.05)' : 'rgba(244, 67, 54, 0.05)';
                }
            }
        } else {
            // Regular mode display
            const commonName = props.Cmmn_Nm || props.cmmn_nm || 'Unknown';
            const scientificName = props.Scntf_N || props.scntf_n || '-';
            const family = props.Family || props.family || '-';
            const diameter = props.specs_d || props.diameter || '-';
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
                <td>${diameter}</td>
            `;
        }
        
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
            // Find the corresponding layer and zoom to it.
            const geoJsonLayer = treeLayers.getLayers()[0];
            if (geoJsonLayer && geoJsonLayer.getLayers) {
                const treeLayer = geoJsonLayer.getLayers().find(
                    layer => layer.feature.properties.tree_id === props.tree_id
                );
                if (treeLayer) {
                    map.fitBounds(treeLayer.getBounds().pad(0.1));
                    treeLayer.openPopup();
                }
            }
        });
        
        tableBody.appendChild(row);
    });
    
    // Add event listeners to view buttons if in prediction mode
    if (isPredictionMode) {
        document.querySelectorAll('.view-tree-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent row click
                const treeId = btn.getAttribute('data-tree-id');
                
                // Find and zoom to the tree
                const geoJsonLayer = treeLayers.getLayers()[0];
                if (geoJsonLayer && geoJsonLayer.getLayers) {
                    const treeLayer = geoJsonLayer.getLayers().find(
                        layer => layer.feature.properties.tree_id === treeId
                    );
                    if (treeLayer) {
                        map.fitBounds(treeLayer.getBounds().pad(0.1));
                        treeLayer.openPopup();
                    }
                }
            });
        });
    }
    
    // Update the status to show how many trees are displayed
    updateDataStatus(`Showing ${treesToShow.length} of ${originalTreeData.length} trees`);
}
// --- Utility and Minor Functions ---

function filterTableData(searchTerm) { 
    const term = searchTerm.toLowerCase();
    
    // Update the table rows
    const rows = document.querySelectorAll('#tableBody tr');
    rows.forEach(row => {
        const rowText = row.textContent.toLowerCase();
        row.style.display = rowText.includes(term) ? '' : 'none';
    });
    
    // Also filter the map data
    if (searchTerm.trim() === '') {
        // If search is cleared, show all data
        filteredData = [...originalTreeData];
    } else {
        // Filter map data based on search term
        filteredData = originalTreeData.filter(tree => {
            const props = tree.properties;
            const treeId = props.tree_id || props.id || '';
            const species = props.Cmmn_Nm || props.cmmn_nm || props.species || props.SPECIES || props.Species || props.ground_truth_species || '';
            
            // Check if search term is in ID or species
            return treeId.toString().toLowerCase().includes(term) || 
                   species.toString().toLowerCase().includes(term);
        });
    }
    
    // Update the map with filtered data
    addTreesToMap();
    updateDataStatus(`Showing ${filteredData.length} of ${originalTreeData.length} trees`);
}

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
        if (typeof aVal === 'string') { aVal = aVal.toLowerCase(); bVal = bVal.toLowerCase(); }
        if (currentSortDirection === 'asc') { return aVal < bVal ? -1 : aVal > bVal ? 1 : 0; } 
        else { return aVal > bVal ? -1 : aVal < bVal ? 1 : 0; }
    });
    populateResultsTable();
    updateSortIndicators();
}

function updateSortIndicators() { 
    document.querySelectorAll('#resultsTable th[data-sort]').forEach(header => {
        header.classList.remove('sorted-asc', 'sorted-desc');
        if (header.dataset.sort === currentSortColumn) {
            header.classList.add(`sorted-${currentSortDirection}`);
        }
    });
}

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
    items.forEach(t => { labelSet.add(t.properties.predicted_species); labelSet.add(t.properties.ground_truth_species); });
    const labels = Array.from(labelSet).sort();
    const index = new Map(labels.map((l, i) => [l, i]));
    const matrix = Array.from({ length: labels.length }, () => Array(labels.length).fill(0));
    items.forEach(t => {
        const gt = t.properties.ground_truth_species;
        const pr = t.properties.predicted_species;
        if (index.has(gt) && index.has(pr)) { matrix[index.get(gt)][index.get(pr)] += 1; }
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

function renderConfusionMatrix() { /* Stub */ }
function renderPerClassMetrics() { /* Stub */ }

function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if(loadingIndicator) loadingIndicator.classList.add('hidden');
}

function updateDataStatus(message) { document.getElementById('dataStatus').textContent = message; }
function updateShapefileStatus(icon, message) { document.getElementById('shapefileStatus').innerHTML = `<span style="margin-right: 8px;">${icon}</span><span>${message}</span>`; }
function updateRasterStatus(icon, message) { document.getElementById('rasterStatus').innerHTML = `<span style="margin-right: 8px;">${icon}</span><span>${message}</span>`; }