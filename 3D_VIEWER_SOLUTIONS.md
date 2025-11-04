# 3D Viewer Solutions for La Mesa Ecopark UI

This document outlines issues with the 3D Potree viewer and their solutions.

## Problems Identified

1. **Side Panel Not Loading**: 
   - The Potree sidebar was not loading correctly in the embedded viewer
   - The sidebar is critical for controlling tree overlay visibility and point cloud rendering options

2. **Scrollbar Issues**: 
   - Opening the popup 3D viewer caused scrollbar styles and functionality to break
   - This affected the usability of both the viewer and the main application

3. **Shapefile Overlay Problems**:
   - Tree crown shapefiles were not properly visible on top of the point cloud
   - Z-values were correct but rendering depth issues caused crowns to be covered

## Solutions Implemented

### 1. Standalone Viewer Approach

We've moved to a standalone viewer page (`view_lamesa.html`) that:
- Opens in a new tab for better isolation
- Includes proper sidebar rendering and visibility fixes
- Avoids scrollbar conflicts with the main application

### 2. Z-Index and Rendering Order Fixes

For the shapefile overlay visibility:
- Set `depthTest = false` for shapefile materials
- Set `renderOrder = 1000` to force rendering on top
- Added z-offset to tree crown positions for better visibility
- Set `polygonOffsetFactor` and `polygonOffsetUnits` to prevent z-fighting

### 3. Launcher Integration

Added a new integration layer:
- `potree-launcher.js` provides utility functions to open the standalone viewer
- Updated `openTreeModal()` to use the standalone approach
- Preserved tree context when opening the viewer for specific trees

## Usage Instructions

### Opening the Full 3D Viewer

Click the "View 3D Model" button in the header to open the full point cloud view with tree crown overlays.

### Viewing Individual Trees

When clicking on a tree in the map or results table, the system now:
1. Opens the standalone viewer in a new tab
2. Passes the tree context to highlight the selected tree
3. Positions the camera to focus on that tree

### Controlling Visibility

Use the sidebar in the standalone viewer to:
- Toggle visibility of tree crown groups
- Adjust point cloud rendering options
- Use measurement tools

## Technical Notes

- The standalone viewer approach eliminates conflicts between Potree's DOM manipulation and the main application
- Setting `depthTest = false` for materials ensures tree crowns stay visible regardless of their position
- Z-offset and renderOrder ensure proper layering of elements
