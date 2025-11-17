# rialc1-ui Copilot Instructions

## Architecture Snapshot
- Express server `server.js` (port 3000) serves `public/`, `/tiles` (pre-rendered La Mesa raster), `/raw_data` (point clouds, shapefiles, CSVs), and `/Potree_1.8.2`; keep new routes aligned with this static-serving pattern.
- `/api/trees/:treeId/pointcloud` streams LiDAR samples: prefers `raw_data/tree_point_samples.json` (NDJSON) and falls back to on-demand reservoir sampling from `raw_data/newgroups_adjusted_all_v3.csv`; honor `MAX_RESERVOIR_SIZE` (50k) and avoid blocking the single-threaded Node loop.
- Frontend entry `public/index.html` loads Leaflet + helper libs from CDN, then boots `public/script.js`, which orchestrates map layers, prediction toggles, and modal point-cloud viewer through modules in `public/js/`.

## Data & Assets
- Shapefiles live under `raw_data/shapefiles/` with a fallback in `raw_data/crown_shp/`; `public/js/data-loader.js` probes both, defines EPSG:3123→4326 projections, and converts coordinates—keep new loaders projection-aware.
- Prediction CSV (`raw_data/prediction_results_top5_metrics.csv`) is parsed by `public/js/predictions.js`, which also materializes group→species mappings used throughout the UI; preserve CSV layout when exporting new models.
- Map tiles reside in `lamesa_forest_final_fixed/` and are mounted at `/tiles`; any additional raster tiles should follow the same TMS directory pattern to benefit from the existing long-lived caching headers.

## Frontend Patterns
- `public/script.js` is large but modularized logically: colour logic in `public/js/colors.js`, data ingestion in `data-loader.js`, point cloud modal in `pointcloud-viewer.js`; prefer extending these helpers rather than inflating the main script.
- Species vs prediction modes share the same feature list—filters should mutate `filteredData` via `recomputeFilteredData()` and `applyCurrentSort()` to stay in sync with the table and map.
- UI interactions emphasise accessibility: toggle buttons manage `aria-*` attributes and focus traps are centralized; mirror those patterns when adding dialogs or overlays.

## Point Clouds & Potree
- Run `npm run build:pointcloud-cache` (alias for `node scripts/build-tree-point-samples.js`) whenever the LiDAR CSV changes; it writes NDJSON metadata + per-tree samples to `raw_data/tree_point_samples.json`, which the API consumes.
- `public/js/pointcloud-viewer.js` requests `/api/trees/:id/pointcloud?limit=50000`, normalizes intensities, and displays overlays (legend, scale, grid). If you adjust API payloads, update the viewer’s expectation for `{points:[{x,y,z,intensity}]}` and status strings.
- The Potree overlay (`public/potree-viewer.js`) lazy-loads `/Potree_1.8.2` assets, fetches `/raw_data/merged_recropped/metadata.json`, and replays shapefiles as animated crowns. Keep new Potree integrations asynchronous so they don’t block the main map session.

## Developer Workflows
- Install deps with `npm install`; start the app via `npm start` and visit `http://localhost:3000`. Lint with `npm run lint` before committing.
- Heavy data tasks: `node scripts/inspectShapefile.js` to inspect attribute coverage, `node scripts/check-octree-request.js` to validate byte-range responses for Potree resources.
- Large binary sources in `raw_data/` are gitignored—never add them to commits. Use relative fetch paths (`/raw_data/...`) so the Express static handler can inject caching headers.

## Performance & Hosting Notes
- Tile and data endpoints already emit aggressive cache headers (see `MOBILE_OPTIMIZATION.md`); when adding assets, match `Cache-Control`, `ETag`, and `immutable` settings so ngrok/request quotas remain manageable.
- `public/script.js` keeps `platform` features (mobile sidebar collapse, map `maxBounds`, `keepBuffer`, `updateWhenIdle`) tuned for minimal tile churn; reuse `initializeMap()` helpers when changing tile sources to avoid regressing ngrok optimizations.
- Point-cloud API avoids re-reading the 5 GB CSV by memoizing `pointCloudCache` and an in-flight promise map—respect those caches instead of re-streaming per request.

## Troubleshooting Tips
- If shapefiles fail to load, check browser console for `[data-loader]` logs and ensure PRJ + SHP paths exist; use the fallback `raw_data/crown_shp/` bundle when needed.
- For Potree glitches, verify `/raw_data/merged_recropped/metadata.json` and octree binaries are reachable (range requests allowed); the helper script noted above can reproduce issues outside the browser.
- When intensity legends look off, confirm `tree_point_samples.json` was rebuilt with the latest CSV so cached tuples include normalized intensities.
