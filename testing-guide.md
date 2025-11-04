# Testing Guide: 3D Viewer Fixes

This guide will help you test the changes made to fix the Potree 3D viewer issues.

## Prerequisites
- Server is running (use `npm start`)
- Web browser (Chrome or Firefox recommended)

## Test 1: Standalone Viewer

1. Open your browser and navigate to: http://localhost:3000/view_lamesa.html
2. Verify that the 3D viewer loads successfully with the following components:
   - Point cloud (LiDAR data) is visible
   - Tree crown shapefiles appear as colored overlays
   - Sidebar panel is visible on the right side
   - Navigation buttons appear at the bottom

## Test 2: Shapefile Overlay Visibility

1. In the standalone viewer, observe the tree crown shapefiles:
   - They should be clearly visible on top of the point cloud
   - Each crown should have a distinct color
   - The crowns should not be covered by the point cloud data
   - They should maintain their Z position (height) correctly

2. Test the rendering order:
   - Rotate the view to look at the scene from different angles
   - Confirm that the tree crowns remain visible regardless of viewing angle
   - Check that they maintain their 3D shape (not appearing flat)

## Test 3: Sidebar Functionality

1. In the standalone viewer, check the sidebar panel:
   - Verify that the sidebar is fully visible and accessible
   - Expand the "Scene" section in the sidebar
   - Locate "Tree Crown Groups" under the "Other" section
   - Test toggling the visibility of tree crown groups on/off

2. Test additional sidebar features:
   - Adjust point size settings 
   - Change point budget
   - Try different rendering methods (if available)
   - Test measurement tools

## Test 4: Main Application Integration

1. Open the main application: http://localhost:3000/
2. Click the "View 3D Model" button in the header
   - Verify it opens the standalone viewer in a new tab
   - Confirm all components load correctly

3. In the main application:
   - Find and click on a tree in the map
   - Verify it opens the standalone viewer focused on that tree
   - Check that tree information is passed correctly to the viewer

## Test 5: Performance and Stability

1. Test performance:
   - Navigate around the 3D scene
   - Observe if frame rate remains smooth
   - Try zooming in/out rapidly

2. Test stability:
   - Open and close the viewer multiple times
   - Switch between map and 3D view repeatedly
   - Check that no errors appear in browser console

## Reporting Issues

If you encounter any problems during testing, please note:
1. The specific test step where the issue occurred
2. Your browser and OS information
3. Any error messages in the browser console
4. Screenshots of the issue if possible

## Expected Results

- Sidebar is fully visible and functional
- Tree crown shapefiles appear correctly on top of the point cloud
- No scrollbar issues or layout problems when using the viewer
- Smooth transitions between map and 3D views
- No browser console errors