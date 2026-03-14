# GitHub Copilot Instructions for rialc1-ui

## Architecture Overview

This project is a **LiDAR Tree Species Identification UI** consisting of a Node.js/Express backend and a vanilla JavaScript frontend.

- **Backend (`server.js`)**: Serves static files and provides an API (`/api/trees/:treeId/pointcloud`) to stream point cloud data. It implements a custom **reservoir sampling** cache to efficiently serve large point cloud datasets.
- **Frontend (`public/`)**:
  - **2D Map**: Uses **Leaflet** to display tree crown polygons and classification results.
  - **3D Viewer**: Uses **Potree** (via `Potree_1.8.2/`) and **Three.js** for visualizing individual tree point clouds.
- **Data Storage**:
  - **Map Tiles**: Pre-rendered tiles stored in `lamesa_forest_final_fixed/`.
  - **Raw Data**: CSVs, LAS/LAZ, and Shapefiles in `raw_data/`.
  - **Cache**: `tree_point_samples.json` (generated) allows fast random access to tree points.

## Critical Workflows

### 1. Development Server
- Run `npm start` to launch the Express server on port 3000.
- The server logs which directories are being served on startup.

### 2. Data Preparation (Crucial)
If `raw_data/newgroups_adjusted_all_v3.csv` (or the configured source CSV) changes, you **MUST** regenerate the cache:
```bash
node scripts/build-tree-point-samples.js
```
*Failure to do this will result in stale or missing point cloud data in the 3D viewer.*

### 3. External Access / Mobile Testing
- **Do not use ngrok** if possible due to request limits.
- Use **Cloudflare Tunnel** for unmetered access:
  ```powershell
  cloudflared tunnel --url http://localhost:3000
  ```
- Refer to `MOBILE_OPTIMIZATION.md` for details on tile caching and request reduction strategies.

## Project Conventions & Patterns

- **Static Asset Serving**:
  - `public/` -> Root (`/`)
  - `lamesa_forest_final_fixed/` -> `/tiles` (Aggressively cached: 30 days, immutable)
  - `raw_data/` -> `/raw_data` (Shapefiles cached for 24h, binaries `no-store`)
  - `Potree_1.8.2/` -> `/Potree_1.8.2`
- **Point Cloud Streaming**:
  - The backend does not serve raw LAS files to the client for individual trees.
  - Instead, it reads from `tree_point_samples.json` (NDJSON format) to serve a sampled subset of points (max 50k by default) via JSON.
- **Frontend Dependencies**:
  - Three.js is served via `/vendor/three` to avoid CDN dependencies and ensure offline capability.
- **Mobile Optimization**:
  - Map tiles are restricted to specific zoom levels (16-21) and bounds to save bandwidth.
  - Base layers (OSM/Esri) are disabled by default.

## Key Files
- `server.js`: Core application logic, static file configuration, and API endpoints.
- `scripts/build-tree-point-samples.js`: Script to parse the huge CSV and generate the optimized JSON cache.
- `public/script.js`: Main logic for the 2D map interface.
- `public/potree-viewer.js`: Logic for the 3D point cloud viewer.
- `MOBILE_OPTIMIZATION.md`: Documentation on performance tuning for mobile/limited connections.
