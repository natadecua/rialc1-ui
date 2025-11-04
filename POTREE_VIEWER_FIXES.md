# Potree 3D Viewer Fixes

## Issues Addressed

### 1. **Side Panel Not Showing**
**Problem**: The Potree sidebar controls were not visible, making it impossible to interact with viewer settings, layers, or tools.

**Root Cause**: 
- CSS selector mismatch: `.potree-sidebar` vs actual element ID `#potree_sidebar_container`
- Sidebar was being hidden on smaller screens with `display: none`
- Potree's default sidebar toggle state wasn't being handled correctly

**Solution**:
- Updated CSS to target both `.potree-sidebar` AND `#potree_sidebar_container`
- Changed layout to use flexbox instead of fixed widths
- Set proper width/min-width/max-width values (350px/300px/350px)
- Added responsive behavior that slides sidebar off-screen on mobile instead of hiding it
- Modified viewer initialization to ensure sidebar is explicitly shown after GUI loads
- Added CSS overrides for Potree's internal elements to ensure proper visibility and color contrast

### 2. **Shapefiles Don't Overlay**
**Problem**: Tree crown shapefiles were not visible or not properly aligned with the point cloud.

**Root Causes**:
- Incorrect coordinate transformation: Using UTM Zone 51N for pointcloud but EPSG:3123 for shapefiles
- Shapefile height positioning was too aggressive (canopyTop + spacing * 2)
- Insufficient line material opacity and visibility settings

**Solutions**:
- **Fixed projection mismatch**: Both shapefile and pointcloud use EPSG:3123, so changed to identity transform (no conversion needed)
- **Adjusted height positioning**: Changed from `canopyTop + spacing * 2` to `canopyTop + spacing * 0.5` for better alignment
- **Improved line material visibility**:
  - Increased line width from 3.0 to 4.0
  - Increased opacity from 0.95 to 1.0 (full opacity)
  - Adjusted polygon offset factors for better layering (-4 instead of -2)
  - Disabled depth write to prevent z-fighting
- **Enhanced hover animation**: Reduced amplitude and speed for smoother, more subtle movement
- **Added detailed logging**: Console logs now show height settings and dataset bounds for debugging

### 3. **Controls Hard to Use**
**Problem**: Viewer controls and interface elements were difficult to see or interact with.

**Solutions**:
- **Enhanced sidebar visibility**: 
  - Dark background (rgba(6, 9, 13, 0.95)) with proper transparency
  - Border for clear definition
  - Proper overflow handling (overflow-y: auto)
  - High z-index to ensure it's on top
  
- **Improved text contrast**:
  - All text in sidebar uses light colors (#f3f6ff, #e2e8f0, #cbd5e1)
  - Accordion headers have colored background for emphasis
  - Scene tree uses light text with proper hover/selection states
  
- **Better responsive behavior**:
  - On tablets (< 1200px): Sidebar width reduces to 280px
  - On mobile (< 768px): Sidebar slides off-screen with transition, can be toggled
  
- **Canvas positioning**: Ensured Potree's canvas elements are absolutely positioned correctly

## Files Modified

### 1. `public/style.css`
- Updated `.potree_container`, `#potree_render_area`, `#potree_sidebar_container` selectors
- Added responsive media queries
- Added Potree-specific styling overrides for internal elements
- Improved color contrast and visibility throughout

### 2. `public/potree-viewer.js`
- Fixed `prepareProjections()` to use EPSG:3123 for both systems
- Modified `loadTreeCrownOverlays()`:
  - Changed to identity transform
  - Adjusted crown base height calculation
  - Improved line material settings
  - Added comprehensive logging
- Updated `createLineMaterial()` with better visibility settings
- Enhanced viewer initialization to explicitly show sidebar

## Testing Recommendations

1. **Open the 3D viewer** and verify:
   - Sidebar is visible on the right side
   - All control panels (Scene, Appearance, Tools, etc.) are accessible
   - Text is readable against the dark background

2. **Check shapefile overlays**:
   - Tree crown outlines should be visible and colored by group
   - Crowns should align with the point cloud canopy
   - Subtle hover animation should be visible
   - Check browser console for height settings log

3. **Test responsiveness**:
   - Resize browser window to test different screen sizes
   - Verify sidebar behavior on mobile/tablet viewports

4. **Verify controls**:
   - Toggle layer visibility using checkboxes in scene tree
   - Test point size, color, and other material settings
   - Verify camera controls (orbit, pan, zoom) work smoothly

## Additional Notes

- The coordinate system now consistently uses EPSG:3123 (PRS92 / Philippines zone 3) throughout
- Identity transform means no coordinate conversion occurs between shapefile and point cloud
- Crown positioning uses dynamic height calculation based on point cloud bounds and spacing
- All changes maintain backwards compatibility with existing functionality

## Debugging Tips

If issues persist:

1. **Check browser console** for:
   - Projection definition confirmations
   - Height settings log showing canopyTop, crownBaseHeight, etc.
   - Any shapefile loading errors

2. **Verify in devtools**:
   - `#potree_sidebar_container` has `display: block`
   - Canvas element is positioned at 0,0
   - Scene tree contains "Tree Taxonomic Groups" node

3. **Test with different data**:
   - Try toggling different species groups on/off
   - Adjust point size to see if shapefiles become more visible
   - Try different camera angles to verify 3D positioning
