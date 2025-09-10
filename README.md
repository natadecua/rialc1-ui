# rialc1-ui

A thesis UI design for LiDAR tree species identification using **Potree** for high-performance point cloud visualization.

## Overview

This web application visualizes tree species identification results on LiDAR point cloud data using Potree, the industry-standard tool for forestry and point cloud analysis. It provides classification-based coloring, measurement tools, clipping volumes, and 3D tree markers for detailed examination of model predictions.

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

## Quick Start

1. Clone this repository
2. Start a local server: `python -m http.server 8000`
3. Open http://localhost:8000 in your browser
4. Load your Potree-converted data and shapefiles
5. Analyze your tree identification results in 3D

## File Structure

- `index.html` - Main application interface
- `script.js` - Potree integration and application logic
- `style.css` - UI styling including Potree viewer styles
- `raw_data/` - Sample data directory
  - `lamesa_processed.las` - Sample LAS file
  - `crown_shp/` - Sample shapefiles
- `trees.geojson` - Sample tree identification results

## Why Potree?

Potree is the best choice for thesis work on tree identification because:

1. **Focused on Point Clouds**: Built specifically for LiDAR data analysis
2. **Perfect for Tree Analysis**: Classification-based coloring highlights vegetation
3. **Industry Standard**: Well-documented with extensive academic usage
4. **Handles Everything**: Supports shapefiles, measurements, and custom markers
5. **Performance**: Efficiently renders massive datasets in real-time

This keeps your project focused within a single, specialized ecosystem designed for exactly this type of forestry analysis.
