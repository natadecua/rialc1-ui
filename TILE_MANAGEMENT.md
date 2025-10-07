# Tile Generation and Management Guide

## Current Setup

This application now uses a simplified tile system with the following characteristics:

- **Primary Tile Directory**: `lamesa_forest_final_fixed` (can be renamed to `tiles` for simplicity)
- **Coordinate System**: TMS-compatible (Y-flipped) tiles generated with GDAL2Tiles
- **URL Path**: All tiles are served from `http://localhost:3000/tiles/{z}/{x}/{y}.png`
- **Zoom Levels**: 15-22

## Tile Generation Command

To generate additional compatible tiles in the future, use the following GDAL2Tiles command:

```bash
gdal2tiles --profile=mercator --tmscompatible --zoom=15-22 --webviewer=all --title="La Mesa Forest Tiles" "your_input_image.tif" output_directory
```

### Key Parameters:

- **--profile=mercator**: Generates Web Mercator (EPSG:3857) tiles
- **--tmscompatible**: Creates TMS-compatible tiles (Y-flipped coordinates)
- **--zoom=15-22**: Generates tiles for zoom levels 15 through 22

## File Structure

The server is configured to serve tiles from the `tiles` directory (previously `lamesa_forest_final_fixed`). 
The directory structure follows the standard TMS format:

```
tiles/
  ├── 15/
  │   ├── 16798/
  │   │   └── 17714.png
  │   └── ...
  ├── 16/
  └── ...
```

## Verifying Tile Compatibility

When generating new tiles, verify they're compatible with your existing system:

1. **Coordinate System**: Check that the Y-coordinates match your existing TMS structure
2. **Path Structure**: Should follow `/zoom/x/y.png` format
3. **TMS Setting**: Always use `tms: true` in Leaflet layer configuration

## Troubleshooting

If new tiles don't display correctly:

1. **Check TMS Setting**: Ensure `tms: true` is set in the Leaflet layer
2. **Verify Tile Numbers**: TMS coordinates will have higher Y values than standard XYZ tiles
3. **Tile Boundaries**: Use browser developer tools to see which tile URLs are being requested

## Cleanup

The project was cleaned up to remove unused tile directories:
- Removed: `tiles_forest`, `tiles_forest_final`, `tiles_forest_new`, `lamesa_forest_final`
- Kept only: `lamesa_forest_final_fixed` (serving at `/tiles` URL path)

This simplification improves performance and reduces confusion about which tile set is being used.