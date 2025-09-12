import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import SidePanel from './components/SidePanel';
import MapView from './components/MapView';
import TreeModal from './components/TreeModal';
import { TreeGeoJSON, TreeFeature, FilterState, PointCloudMetadata } from './types';

const theme = createTheme({
  palette: {
    primary: {
      main: '#2e7d32',
    },
    secondary: {
      main: '#ff5722',
    },
  },
});

function App() {
  const [treesData, setTreesData] = useState<TreeGeoJSON | null>(null);
  const [pointCloudMetadata, setPointCloudMetadata] = useState<PointCloudMetadata | null>(null);
  const [filteredTrees, setFilteredTrees] = useState<TreeFeature[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    correct: true,
    incorrect: true,
    training: true,
  });
  const [selectedTree, setSelectedTree] = useState<TreeFeature | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // Load trees data
        const treesResponse = await fetch('/trees.geojson');
        const treesData: TreeGeoJSON = await treesResponse.json();
        setTreesData(treesData);
        
        // Load point cloud metadata
        const metadataResponse = await fetch('/pointcloud/metadata.json');
        const metadataData: PointCloudMetadata = await metadataResponse.json();
        setPointCloudMetadata(metadataData);
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Filter trees based on filters and search term
  useEffect(() => {
    if (!treesData) return;

    let filtered = treesData.features
      .map(feature => feature.properties)
      .filter(tree => {
        // Apply status filters
        const statusMatch = 
          (filters.correct && tree.status === 'Correct') ||
          (filters.incorrect && tree.status === 'Incorrect') ||
          (filters.training && tree.status === 'Training');

        // Apply search filter
        const searchMatch = searchTerm === '' || 
          tree.tree_id.toString().includes(searchTerm) ||
          tree.predicted_species.toLowerCase().includes(searchTerm.toLowerCase()) ||
          tree.ground_truth.toLowerCase().includes(searchTerm.toLowerCase());

        return statusMatch && searchMatch;
      });

    setFilteredTrees(filtered);
  }, [treesData, filters, searchTerm]);

  const handleTreeSelect = (tree: TreeFeature) => {
    setSelectedTree(tree);
  };

  const handleModalClose = () => {
    setSelectedTree(null);
  };

  const toggleSidePanel = () => {
    setSidePanelOpen(!sidePanelOpen);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {/* Side Panel */}
        <SidePanel
          open={sidePanelOpen}
          onToggle={toggleSidePanel}
          treesData={filteredTrees}
          filters={filters}
          onFiltersChange={setFilters}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onTreeSelect={handleTreeSelect}
          isLoading={isLoading}
        />
        
        {/* Main Map View */}
        <Box sx={{ flexGrow: 1, position: 'relative' }}>
          <MapView
            treesData={treesData}
            filteredTrees={filteredTrees}
            onTreeSelect={handleTreeSelect}
            sidePanelOpen={sidePanelOpen}
          />
        </Box>

        {/* Tree Modal */}
        <TreeModal
          tree={selectedTree}
          open={!!selectedTree}
          onClose={handleModalClose}
          pointCloudMetadata={pointCloudMetadata}
        />
      </Box>
    </ThemeProvider>
  );
}

export default App;
