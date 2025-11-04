# Shapefile Comparison Test in Potree

This document describes the test configuration for comparing different shapefile geometry types in Potree.

## Test Configuration

The `view_lamesa.html` file has been modified to display two different shapefile types:

1. **Polygon Shapefiles** (Tree Crowns)
   - File: `/raw_data/shapefiles/mcws_crowns_newclass.shp`
   - Rendering: Green semi-transparent polygons
   - Purpose: Shows tree crown boundaries as filled polygons

2. **Line Shapefiles** (Tree Lines)
   - File: `/raw_data/shapefiles/lines_new.shp`
   - Rendering: Red lines with higher opacity
   - Purpose: Shows tree boundaries as outlines only

## Rendering Settings

Both layers use settings to ensure visibility above the point cloud:

### Polygon Settings:
- `depthTest = false` - Ensures polygons render regardless of depth
- `renderOrder = 999` - High render order for visibility
- `polygonOffsetFactor = -1` - Prevents z-fighting
- `opacity = 0.45` - Semi-transparent to see through

### Line Settings:
- `depthTest = false` - Same as polygons
- `renderOrder = 1000` - Even higher than polygons to ensure lines are on top
- `linewidth = 2` - Thicker lines for better visibility
- `opacity = 0.9` - More opaque than polygons
- `polygonOffsetFactor = -2` - More aggressive offset

## How to Test

1. Open `view_lamesa.html` in your browser
2. In the sidebar under "Other", you'll see two layers:
   - "Tree Crowns (Polygons)"
   - "Tree Lines"

3. Toggle each layer on/off to compare:
   - Which layer is more visible above the point cloud
   - Which type of geometry has better depth perception
   - Which layer provides clearer tree boundaries

## Expected Results

The test should help determine:

1. Whether line geometries are more reliable than polygon geometries in Potree
2. If line geometries have better visibility and depth handling
3. Which approach is more suitable for tree crown visualization

## Notes

- If the lines_new.shp file doesn't exist, only the polygon layer will be visible
- The line layer has intentionally different styling to make comparison easier
- Both layers should show the same tree boundaries but with different geometry types