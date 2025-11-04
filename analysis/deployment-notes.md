# Deployment Notes

## Current Structure

- **Server**: `server.js` (Express + CORS), `package.json` (`start`, `lint`), ESLint/Prettier configs.
- **Frontend (`public/`)**: `index.html` (Leaflet UI + Potree overlay), `script.js`, `potree-viewer.js`, `style.css`, standalone Potree pages.
- **Potree stack**: `Potree_1.8.2/` with customized `libs/shapefile/shapefile.js` and `build/potree/potree.js` for PolygonZ support.
- **Data**: `raw_data/` (shapefiles, LAS/LAZ/COPC, TIFFs, metrics), `lamesa_forest_final_fixed/` (map tiles).
- **Utilities/Docs**: `README.md`, `FILE_ORGANIZATION.md`, conversion guides, inspection scripts.

## Ready for Deployment

- 2D map UI loads tiles, shapefiles, CSV metrics with filtering and toggles.
- Inline Potree overlay loads point cloud and crown overlays correctly.
- Direct Potree viewer pages functional with custom loader.
- Express server serves static assets, Potree libs, raw data, and tiles with tailored cache headers; `/api/status` health check.

## Gaps To Address

1. **Configuration & Middleware**
   - No `.env` or configurable port; CORS wide open.
   - Missing compression/logging/error handlers.
2. **Build/Test Pipeline**
   - No automated tests or build step; relies on raw source.
3. **Static Asset Strategy**
   - Need plan for hosting large `raw_data` and Potree assets (CDN vs same server).
   - Ensure paths work behind reverse proxy/sub-directory.
4. **Potree Customization Docs**
   - Core library modifications should be documented or separated to avoid overwrite.
5. **Data Pipeline**
   - Document regeneration steps for `crowns_shape2.*`, point cloud octree, tiles; trim unused raw assets.
6. **Monitoring & Errors**
   - Add 404/500 handling and richer health checks.
7. **Documentation**
   - Expand README with deployment steps, asset checklist, cache-clearing guidance.

## Recommended Next Steps

1. Add `.env`, tighten CORS, add `compression` and logging; document deployment configuration.
2. Record Potree/shapefile patch notes or refactor into custom loader.
3. Draft deployment runbook (install → lint → start, reverse proxy example, asset hosting plan).
4. Decide and implement hosting strategy for heavy datasets; test behind production-like paths.
5. Add smoke test or validation script for required assets before launch.
6. Dry-run deployment on staging to validate viewer end-to-end.
