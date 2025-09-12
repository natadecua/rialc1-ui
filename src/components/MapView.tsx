import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TreeGeoJSON, TreeFeature } from '../types';

// Fix for default markers in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

interface MapViewProps {
  treesData: TreeGeoJSON | null;
  filteredTrees: TreeFeature[];
  onTreeSelect: (tree: TreeFeature) => void;
  sidePanelOpen: boolean;
}

const MapView: React.FC<MapViewProps> = ({
  treesData,
  filteredTrees,
  onTreeSelect,
  sidePanelOpen
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Create map instance
    const map = L.map(mapRef.current).setView([45.678, 100.248], 13);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Create layer group for markers
    const markersLayer = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    markersLayerRef.current = markersLayer;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Update markers when filtered trees change
  useEffect(() => {
    if (!treesData || !markersLayerRef.current || !mapInstanceRef.current) return;

    const markersLayer = markersLayerRef.current;
    
    // Clear existing markers
    markersLayer.clearLayers();

    // Get filtered tree IDs for quick lookup
    const filteredTreeIds = new Set(filteredTrees.map(tree => tree.tree_id));

    // Add markers for filtered trees
    treesData.features.forEach(feature => {
      const tree = feature.properties;
      
      // Only show markers for filtered trees
      if (!filteredTreeIds.has(tree.tree_id)) return;

      const [lng, lat] = feature.geometry.coordinates;

      // Determine marker color based on status
      let color: string;
      switch (tree.status) {
        case 'Correct':
          color = '#4caf50'; // Green
          break;
        case 'Incorrect':
          color = '#f44336'; // Red
          break;
        case 'Training':
          color = '#ffeb3b'; // Yellow
          break;
        default:
          color = '#9e9e9e'; // Gray
      }

      // Create custom circle marker
      const marker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: color,
        color: color,
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.6
      });

      // Add tooltip
      marker.bindTooltip(
        `Tree ID: ${tree.tree_id}<br/>Predicted: ${tree.predicted_species}`,
        {
          permanent: false,
          direction: 'top',
          offset: [0, -10]
        }
      );

      // Add click handler
      marker.on('click', () => {
        onTreeSelect(tree);
      });

      marker.addTo(markersLayer);
    });
  }, [treesData, filteredTrees, onTreeSelect]);

  // Handle map resize when side panel toggles
  useEffect(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 300); // Wait for transition to complete
    }
  }, [sidePanelOpen]);

  return (
    <div 
      ref={mapRef} 
      style={{ 
        width: '100%', 
        height: '100vh',
        transition: 'all 0.3s ease'
      }} 
    />
  );
};

export default MapView;