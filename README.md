# La Mesa Ecopark LiDAR Tree Species Identification UI

A thesis UI design for LiDAR tree species identification using interactive 2D maps and **Potree** for high-performance point cloud visualization.

## Overview

This web application visualizes tree species identification results using both 2D interactive maps and 3D point cloud visualization. The 2D interface allows exploration of tree crown polygons with classification data, while the 3D interface (powered by Potree) provides detailed point cloud analysis with classification-based coloring, measurement tools, clipping volumes, and 3D tree markers.

## Potree Integration Workflow

### 1. Inspect and Prepare (using QGIS)
- Load your raw LAS file and shapefiles into QGIS
- Use QGIS 3D View to quickly inspect your data
- Ensure coordinate systems match between datasets
- Export shapefiles as GeoJSON files for web compatibility

### 2. Process and Convert (using PotreeConverter)
- Download PotreeConverter from: https://github.com/potree/PotreeConverter/releases
- Convert your LAS file to optimized Potree format:
  ```bash
  ./PotreeConverter.exe input.las -o output_directory
  ```
- This creates an optimized octree structure for high-performance visualization

### 3. Build Your Viewer (using this UI)
- Load the converted Potree data using the "🌲 Load Potree Point Cloud" button
- Load your GeoJSON plot boundaries from shapefiles
- View tree identification results with 3D markers directly on the point cloud
- Use Potree's built-in tools for analysis:
  - **Classification coloring**: Distinguish trees from ground and buildings
  - **Measurement tools**: Measure distances and heights
  - **Clipping volumes**: Focus on specific areas
  - **3D tree markers**: Show model predictions at exact locations

## Features

- **High-Performance Visualization**: Potree handles massive point clouds efficiently
- **Industry Standard**: Widely used in forestry, geology, and infrastructure projects
- **Tree Detection Overlay**: 3D markers show where your model identified trees
- **Analysis Tools**: Built-in measurement and clipping capabilities
- **Shapefile Integration**: Load plot boundaries as overlays
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
   - Click "View 3D Model" or "View Direct 3D Viewer" for 3D point cloud visualization
   - Analyze tree identification results in both 2D and 3D

## Project Structure

```
rialc1-ui/
├── public/                  # Frontend files served by Express
│   ├── index.html           # Main 2D map application HTML
│   ├── script.js            # Main JavaScript for the 2D application
│   ├── style.css            # CSS for the application
│   ├── lamesa_3d_viewer.html    # 3D LiDAR viewer (embedded version)
│   └── lamesa_potree_viewer.html # Direct 3D LiDAR viewer
├── lamesa_forest_final_fixed/ # Map tiles for the web application
├── raw_data/                # Source data including shapefiles, TIFFs, LAS files
│   ├── crown_shp/           # Tree crown shapefiles
│   ├── lamesa_processed.las # Sample LAS file
│   └── prediction_results.csv # Model prediction results
├── Potree_1.8.2/            # Potree library for 3D point cloud rendering
├── server.js                # Node.js/Express server
└── TILE_MANAGEMENT.md       # Documentation for tile generation and management

## Why Potree?

Potree is the best choice for thesis work on tree identification because:

1. **Focused on Point Clouds**: Built specifically for LiDAR data analysis
2. **Perfect for Tree Analysis**: Classification-based coloring highlights vegetation
3. **Industry Standard**: Well-documented with extensive academic usage
4. **Handles Everything**: Supports shapefiles, measurements, and custom markers
5. **Performance**: Efficiently renders massive datasets in real-time

This keeps your project focused within a single, specialized ecosystem designed for exactly this type of forestry analysis.
