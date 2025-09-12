import React, { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Card,
  CardContent,
  Chip,
  Box,
  Divider,
  IconButton
} from '@mui/material';
import {
  Close as CloseIcon,
  Nature as NatureIcon,
  Visibility as VisibilityIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  School as SchoolIcon
} from '@mui/icons-material';
import { TreeFeature, PointCloudMetadata } from '../types';

interface TreeModalProps {
  tree: TreeFeature | null;
  open: boolean;
  onClose: () => void;
  pointCloudMetadata: PointCloudMetadata | null;
}

const TreeModal: React.FC<TreeModalProps> = ({
  tree,
  open,
  onClose,
  pointCloudMetadata
}) => {
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !tree || !viewerRef.current) return;

    // Initialize Potree viewer
    // Note: This is a simplified implementation
    // In a real application, you would need to properly initialize Potree
    try {
      // Clear previous content
      viewerRef.current.innerHTML = '';
      
      // Create a placeholder for the 3D viewer
      const placeholder = document.createElement('div');
      placeholder.style.width = '100%';
      placeholder.style.height = '400px';
      placeholder.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      placeholder.style.display = 'flex';
      placeholder.style.alignItems = 'center';
      placeholder.style.justifyContent = 'center';
      placeholder.style.color = 'white';
      placeholder.style.fontSize = '16px';
      placeholder.style.textAlign = 'center';
      placeholder.style.borderRadius = '8px';
      
      placeholder.innerHTML = `
        <div>
          <div style="font-size: 48px; margin-bottom: 16px;">🌲</div>
          <div style="font-weight: bold; margin-bottom: 8px;">3D Point Cloud Viewer</div>
          <div style="font-size: 14px; opacity: 0.8;">Tree ID: ${tree.tree_id}</div>
          <div style="font-size: 12px; opacity: 0.6; margin-top: 8px;">
            Potree viewer would be integrated here<br/>
            Showing isolated points for selected tree
          </div>
        </div>
      `;
      
      viewerRef.current.appendChild(placeholder);
      
      // In a real implementation, you would initialize Potree like this:
      /*
      const viewer = new Potree.Viewer(viewerRef.current);
      viewer.setEDLEnabled(true);
      viewer.setFOV(60);
      viewer.setPointBudget(1_000_000);
      
      // Load point cloud with filter for specific tree
      Potree.loadPointCloud("/pointcloud/metadata.json", "forest", (e) => {
        const pointcloud = e.pointcloud;
        const material = pointcloud.material;
        material.size = 1;
        material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
        
        // Filter points by tree_id
        material.setFilter(point => point.tree_id === tree.tree_id);
        
        viewer.scene.addPointCloud(pointcloud);
        viewer.fitToScreen();
      });
      */
      
    } catch (error) {
      console.error('Error initializing 3D viewer:', error);
      if (viewerRef.current) {
        viewerRef.current.innerHTML = `
          <div style="text-align: center; color: red; padding: 20px;">
            Error loading 3D viewer
          </div>
        `;
      }
    }

    return () => {
      // Cleanup viewer if needed
    };
  }, [open, tree, pointCloudMetadata]);

  if (!tree) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Correct':
        return <CheckCircleIcon sx={{ color: '#4caf50' }} />;
      case 'Incorrect':
        return <CancelIcon sx={{ color: '#f44336' }} />;
      case 'Training':
        return <SchoolIcon sx={{ color: '#ffeb3b' }} />;
      default:
        return <VisibilityIcon />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Correct':
        return '#4caf50';
      case 'Incorrect':
        return '#f44336';
      case 'Training':
        return '#ffeb3b';
      default:
        return '#9e9e9e';
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { minHeight: '70vh' }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <NatureIcon />
          <Typography variant="h6">
            Tree ID: {tree.tree_id}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          {/* Left Side - Metadata */}
          <Box sx={{ flex: { xs: 1, md: '0 0 300px' } }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <VisibilityIcon />
                  Tree Information
                </Typography>
                
                <Divider sx={{ mb: 2 }} />
                
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Predicted Species:
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                      {tree.predicted_species}
                    </Typography>
                  </Box>
                  
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Ground Truth:
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                      {tree.ground_truth}
                    </Typography>
                  </Box>
                  
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Classification Status:
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      {getStatusIcon(tree.status)}
                      <Chip
                        label={tree.status}
                        sx={{
                          backgroundColor: getStatusColor(tree.status),
                          color: tree.status === 'Training' ? 'black' : 'white',
                          fontWeight: 'bold'
                        }}
                      />
                    </Box>
                  </Box>

                  {tree.status === 'Incorrect' && (
                    <Box sx={{ mt: 2, p: 2, backgroundColor: 'error.main', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ color: 'white', fontWeight: 'bold' }}>
                        Misclassification Detected
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'white' }}>
                        Expected: {tree.ground_truth}<br/>
                        Predicted: {tree.predicted_species}
                      </Typography>
                    </Box>
                  )}

                  {tree.status === 'Correct' && (
                    <Box sx={{ mt: 2, p: 2, backgroundColor: 'success.main', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ color: 'white', fontWeight: 'bold' }}>
                        Correct Classification
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'white' }}>
                        Model successfully identified the species
                      </Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Right Side - 3D Viewer */}
          <Box sx={{ flex: 1 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  3D Point Cloud View
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                <Box ref={viewerRef} sx={{ width: '100%', height: '400px' }} />
                
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Interactive 3D visualization of tree points. Use mouse to rotate, zoom, and pan.
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TreeModal;