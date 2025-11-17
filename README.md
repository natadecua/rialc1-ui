# La Mesa Ecopark LiDAR Tree Species Identification UI

A thesis UI design for LiDAR tree species identification using interactive 2D maps and **Potree** for high-performance point cloud visualization.

## Overview

This web application visualizes tree species identification results using 2D interactive maps with per-tree WebGL point cloud visualization. The 2D interface allows exploration of tree crown polygons with classification data, while the point cloud viewer provides detailed intensity-colored 3D visualization with legends and scale indicators.

## Data Preparation Workflow

### 1. Prepare Point Cloud Data
- Place your LiDAR CSV file (with tree_id, X, Y, Z, Intensity columns) in `raw_data/`
- Update `server.js` to reference your CSV filename
- Run the cache builder: `node scripts/build-tree-point-samples.js`
- This creates an optimized NDJSON sample cache for fast per-tree loading

### 2. Prepare Shapefile Data
- Export tree crown polygons as GeoJSON
- Place in `raw_data/shapefiles/`
- Ensure properties include `tree_id`, species, and prediction fields

## Features

- **WebGL Point Cloud Viewer**: Per-tree 3D visualization with intensity coloring
- **Interactive Overlays**: Color legend, scale bar, and grid helper for context
- **Map Integration**: Leaflet-based 2D map with tree crown polygons
- **Species Classification**: Toggle between species and prediction coloring
- **Efficient Streaming**: Reservoir-sampled point clouds via NDJSON cache
- **Model Evaluation**: Visual comparison of predictions vs ground truth

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- Web browser supporting WebGL (Chrome, Firefox, Edge recommended)

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/natadecua/rialc1-ui.git
   cd rialc1-ui
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open http://localhost:3000 in your browser

5. Main features:
   - Use the 2D map interface to explore tree crown polygons and classification results
   - Click "View YZ Point Cloud" to open the WebGL 3D viewer for individual trees
   - Toggle between species and prediction coloring on the map
   - Analyze tree identification results with interactive overlays

## Project Structure

```
rialc1-ui/
├── public/                  # Frontend files served by Express
│   ├── index.html           # Main 2D map application HTML
│   ├── script.js            # Main JavaScript for the 2D application
│   ├── style.css            # CSS for the application
│   ├── js/
│   │   ├── pointcloud-viewer.js  # WebGL point cloud modal viewer
│   │   └── tree-point-webgl.js   # Standalone point cloud page
│   ├── lamesa_3d_viewer.html    # 3D Potree viewer (embedded)
│   ├── lamesa_potree_viewer.html # Direct 3D Potree viewer
│   └── view_lamesa.html     # Full Potree viewer page
├── lamesa_forest_final_fixed/ # Map tiles for the web application
├── raw_data/                # Source data
│   ├── shapefiles/          # Tree crown GeoJSON files
│   ├── newgroups_adjusted_all_v3.csv # LiDAR point cloud source (gitignored)
│   ├── tree_point_samples.json # Cached point samples (gitignored)
│   └── prediction_results_top5.csv # Model predictions
├── scripts/
│   └── build-tree-point-samples.js # Cache builder for point clouds
├── Potree_1.8.2/            # Potree library for legacy 3D viewer
├── server.js                # Node.js/Express backend
└── README.md                # This file

## API Endpoints

- `GET /` - Main application
- `GET /api/trees/:id/pointcloud?limit=N` - Fetch point cloud samples for a tree
- Static routes for map tiles, shapefiles, and Potree assets

## Development

```bash
# Build point cloud cache after updating CSV
node scripts/build-tree-point-samples.js

# Run linter
npm run lint

# Start server
npm start
```

### Cloudflare Tunnel (unmetered sharing)

Use Cloudflare Tunnel when you need unlimited HTTPS requests for user tests without exposing your IP or exhausting ngrok quotas.

1. Install `cloudflared` (one-time):

```powershell
winget install Cloudflare.cloudflared
```

2. Start a tunnel that points to the local Express server:

```powershell
cloudflared tunnel --url http://localhost:3000
```

The CLI prints a persistent HTTPS URL (e.g. `https://warm-forest.trycloudflare.com`). Share that link with testers—Cloudflare absorbs the traffic while your local port 3000 remains private. Stop the tunnel with `Ctrl+C` when finished.
