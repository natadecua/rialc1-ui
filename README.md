# La Mesa Ecopark LiDAR Tree Species Identification UI

Interactive thesis web application for exploring tree species classification outputs using:

- a **2D Leaflet map** for crown polygons, predictions, and map overlays
- a **3D point cloud workflow** (Potree + Three.js) for tree-level LiDAR inspection
- an **Express API** that streams per-tree sampled points with in-memory caching

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Repository Layout](#repository-layout)
5. [Data Assets and Requirements](#data-assets-and-requirements)
6. [GitHub + Large File Strategy](#github--large-file-strategy)
7. [Quick Start](#quick-start)
8. [Run and Validate](#run-and-validate)
9. [API Reference](#api-reference)
10. [Point Cache Build Workflow](#point-cache-build-workflow)
11. [Development Commands](#development-commands)
12. [Cloudflare Tunnel (Remote Testing)](#cloudflare-tunnel-remote-testing)
13. [Performance Notes](#performance-notes)
14. [Troubleshooting](#troubleshooting)
15. [Known Limitations](#known-limitations)

---

## System Overview

This project supports analysis of LiDAR-derived tree data in two complementary views:

- **2D analysis view**: interact with crowns, predictions, and map layers.
- **3D analysis view**: inspect sampled point clouds per tree or view full scene point cloud assets.

The backend is optimized to avoid sending huge CSV/LAS files directly to the client for tree-level interactions. Instead, it serves a sampled JSON response per tree via `GET /api/trees/:treeId/pointcloud`.

---

## Architecture

### Backend (`server.js`)

- Serves static frontend files from `public/`.
- Serves local vendor Three.js modules under `/vendor/three` and `/vendor/three/examples/jsm`.
- Serves project data folders:
   - `/raw_data` → `raw_data/`
   - `/tiles` → `lamesa_forest_final_fixed/`
   - `/Potree_1.8.2` → `Potree_1.8.2/`
- Exposes API endpoints:
   - `/api/status`
   - `/api/trees/:treeId/pointcloud`

### Point cloud API data flow

1. Try to load precomputed samples from `raw_data/tree_point_samples.json` (NDJSON format).
2. If present, materialize sampled tuples in memory and serve quickly.
3. If absent or missing tree entry, fall back to streaming scan of `raw_data/newgroups_adjusted_all_v3.csv` with reservoir sampling.
4. Cache results in process memory for subsequent requests.

### Frontend

- Main app: `public/index.html` + `public/script.js`
- Main Potree page: `public/view_lamesa.html`
- Additional viewer pages for alternate workflows in `public/`

---

## Tech Stack

- **Runtime**: Node.js + Express
- **Frontend map**: Leaflet
- **3D rendering**: Potree 1.8.2 + Three.js
- **Data parsing**: `csv-parser`, `shapefile`
- **Dev tooling**: ESLint, Prettier
- **Large assets**: Git LFS

---

## Repository Layout

```text
rialc1-ui/
├─ server.js                          # Express server, static mounts, API
├─ package.json                       # Scripts and dependencies
├─ public/                            # Frontend pages/scripts/styles/service worker
│  ├─ index.html                      # Main 2D map entry page
│  ├─ script.js                       # Main map logic
│  ├─ view_lamesa.html                # Main Potree scene viewer page
│  ├─ lamesa_potree_viewer.html       # Potree viewer variant
│  ├─ js/                             # Point cloud viewer modules
│  └─ service-worker.js               # Client caching behavior
├─ raw_data/                          # Shapefiles, predictions, point-cloud assets, cache
│  ├─ merged_recropped_brotli/        # Potree metadata + octree/hierarchy binaries
│  ├─ shapefiles/                     # Crown/line shapefile bundles
│  ├─ tree_point_samples.json         # Precomputed NDJSON per-tree cache (LFS)
│  └─ prediction_results*.csv         # Model outputs used by UI
├─ lamesa_forest_final_fixed/         # Pre-rendered map tiles (LFS)
├─ Potree_1.8.2/                      # Potree distribution
└─ scripts/
    └─ build-tree-point-samples.js     # Builds `tree_point_samples.json`
```

---

## Data Assets and Requirements

### Required for normal app usage

- `raw_data/tree_point_samples.json` (recommended for fast per-tree API responses)
- `raw_data/shapefiles/*` (polygon/line overlays)
- `raw_data/prediction_results_top5.csv` (classification outputs)
- `lamesa_forest_final_fixed/` tiles

### Required for rebuilding the cache

- `raw_data/newgroups_adjusted_all_v3.csv`

This source CSV is intentionally **not tracked on GitHub** (see large-file policy below), so place it manually in `raw_data/` before running cache rebuild.

---

## GitHub + Large File Strategy

This repository uses **Git LFS** for large assets (tiles, point cloud binaries, large cache artifacts).

### Why this is necessary

- GitHub blocks regular Git blobs over 100 MB.
- GitHub LFS also has hard size constraints per object.
- The original raw source CSV files can exceed practical GitHub limits.

### Current policy

- Kept in repo (via Git/LFS):
   - `lamesa_forest_final_fixed/**/*.png`
   - `raw_data/tree_point_samples.json`
   - `raw_data/**/*.bin`, `raw_data/**/*.las`, `raw_data/**/*.laz`, `raw_data/**/*.tif`, `raw_data/**/*.tiff`
- Excluded from repo (manual local placement):
   - `raw_data/newgroups_adjusted_all_v3.csv`
   - `raw_data/dalponte2016_newer.csv`

If you need those excluded CSVs, keep them locally or host them externally (shared drive, object storage, institutional storage).

---

## Quick Start

### Prerequisites

- Node.js 14+
- Git
- Git LFS
- Browser with WebGL support (Chrome/Edge/Firefox)

### 1) Clone

```bash
git clone https://github.com/natadecua/rialc1-ui.git
cd rialc1-ui
```

### 2) Install and pull LFS assets

```bash
git lfs install
git lfs pull
npm install
```

### 3) Start server

```bash
npm start
```

Server default URL: `http://localhost:3000`

---

## Run and Validate

1. Open `http://localhost:3000`.
2. Verify map tiles render.
3. Open tree point cloud view from UI.
4. Confirm API health:
    - `GET http://localhost:3000/api/status`
5. Confirm point data endpoint (example):
    - `GET http://localhost:3000/api/trees/1/pointcloud?limit=5000`

If the per-tree endpoint returns 404 for many trees, validate cache/source data availability under `raw_data/`.

---

## API Reference

### `GET /api/status`

Returns simple health status.

Example response:

```json
{
   "status": "Server is running"
}
```

### `GET /api/trees/:treeId/pointcloud?limit=N`

Returns sampled points for a tree.

#### Path params

- `treeId` (string/number): tree identifier

#### Query params

- `limit` (optional): max number of points returned
   - server enforces upper bound (`MAX_RESERVOIR_SIZE`, default 50,000)

#### Success response (200)

```json
{
   "treeId": "1",
   "requestedTreeId": "1",
   "totalPoints": 18420,
   "sampledPoints": 5000,
   "points": [
      { "x": 123.45, "y": 456.78, "z": 12.34, "intensity": 89.1 }
   ]
}
```

#### Not found response (404)

```json
{ "error": "No point cloud data found for tree <id>." }
```

#### Error response (500)

```json
{ "error": "Failed to load point cloud data." }
```

---

## Point Cache Build Workflow

Use this whenever the source point CSV changes.

### Command

```bash
node scripts/build-tree-point-samples.js
```

Optional custom max sample size:

```bash
node scripts/build-tree-point-samples.js 75000
```

### Input expectations

Source CSV should contain compatible columns such as:

- `tree_id` (or equivalent)
- `X`, `Y`, `Z`
- `Intensity` (optional but recommended)

### Output

- Writes NDJSON file: `raw_data/tree_point_samples.json`
- First record is metadata, subsequent records are per-tree sampled tuples

### Important

If source CSV is not available locally, cache rebuild cannot run.

---

## Development Commands

```bash
npm start
npm run lint
npm run build:pointcloud-cache
```

`npm test` is currently a placeholder and not configured with real tests.

---

## Cloudflare Tunnel (Remote Testing)

Use Cloudflare Tunnel for mobile/user testing without exposing your machine directly.

Install once (Windows):

```powershell
winget install Cloudflare.cloudflared
```

Run tunnel:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Cloudflare provides a public HTTPS URL that forwards to local port 3000.

---

## Performance Notes

- `raw_data` binaries (`.bin`, `.las`, `.laz`) are served with browser caching and revalidation.
- Tiles are served with aggressive immutable caching (`/tiles`, 30-day max-age).
- The point cloud API preloads cached sample data on server startup.
- First request after startup may still be slower while caches warm.

---

## Troubleshooting

### 1) `git lfs pull` fails or files look like text pointers

- Ensure Git LFS is installed: `git lfs version`
- Initialize: `git lfs install`
- Re-pull assets: `git lfs pull`

### 2) API returns `Failed to load point cloud data`

- Check if `raw_data/tree_point_samples.json` exists and is valid.
- If missing, ensure `raw_data/newgroups_adjusted_all_v3.csv` exists locally and rebuild cache.

### 3) Slow pointcloud endpoint

- Cache file may be missing; server falls back to streaming CSV scan.
- Rebuild cache and restart server.

### 4) Tiles not rendering

- Confirm `lamesa_forest_final_fixed/` exists locally.
- Confirm server route `/tiles` is reachable.

### 5) Push rejected by GitHub for large files

- Verify heavy assets are LFS-tracked.
- Do not attempt to commit giant source CSVs excluded in `.gitignore`.

---

## Known Limitations

- Very large raw source CSV files are not hosted in this GitHub repo.
- No automated test suite is currently configured.
- Memory usage can increase with large in-memory point cache materialization.

---

## Maintainer Notes

When changing source point CSV schema or file location:

1. Update server/source references.
2. Rebuild `tree_point_samples.json`.
3. Verify `/api/trees/:treeId/pointcloud` responses on multiple tree IDs.
4. Update this README if workflow or data requirements changed.
