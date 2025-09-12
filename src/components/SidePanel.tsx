import React from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  FormControlLabel,
  Checkbox,
  TextField,
  Paper,
  Divider,
  LinearProgress,
  Chip
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  Menu as MenuIcon
} from '@mui/icons-material';
import { TreeFeature, FilterState } from '../types';
import ResultsTable from './ResultsTable';
import PerformanceMetrics from './PerformanceMetrics';

interface SidePanelProps {
  open: boolean;
  onToggle: () => void;
  treesData: TreeFeature[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onTreeSelect: (tree: TreeFeature) => void;
  isLoading: boolean;
}

const DRAWER_WIDTH = 400;

const SidePanel: React.FC<SidePanelProps> = ({
  open,
  onToggle,
  treesData,
  filters,
  onFiltersChange,
  searchTerm,
  onSearchChange,
  onTreeSelect,
  isLoading
}) => {
  const handleFilterChange = (filterKey: keyof FilterState) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    onFiltersChange({
      ...filters,
      [filterKey]: event.target.checked
    });
  };

  return (
    <>
      {/* Toggle Button for Collapsed State */}
      {!open && (
        <IconButton
          onClick={onToggle}
          sx={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 1000,
            backgroundColor: 'white',
            boxShadow: 2,
            '&:hover': {
              backgroundColor: 'grey.100'
            }
          }}
        >
          <MenuIcon />
        </IconButton>
      )}

      {/* Side Drawer */}
      <Drawer
        variant="persistent"
        anchor="left"
        open={open}
        sx={{
          width: open ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            transition: 'width 0.3s ease'
          },
        }}
      >
        <Box sx={{ overflow: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" noWrap>
              Tree Analysis Dashboard
            </Typography>
            <IconButton onClick={onToggle}>
              <ChevronLeftIcon />
            </IconButton>
          </Box>

          <Divider />

          {/* Data Loading Status */}
          <Paper sx={{ m: 2, p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Data Loading Status
            </Typography>
            {isLoading ? (
              <>
                <LinearProgress sx={{ mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Loading trees and point cloud data...
                </Typography>
              </>
            ) : (
              <Chip 
                label="Data Loaded Successfully" 
                color="success" 
                variant="outlined"
                size="small"
              />
            )}
          </Paper>

          {/* Filters */}
          <Paper sx={{ m: 2, p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Filter by Status
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.correct}
                    onChange={handleFilterChange('correct')}
                    sx={{ color: '#4caf50' }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: '#4caf50'
                      }}
                    />
                    Correct Predictions
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.incorrect}
                    onChange={handleFilterChange('incorrect')}
                    sx={{ color: '#f44336' }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: '#f44336'
                      }}
                    />
                    Incorrect Predictions
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.training}
                    onChange={handleFilterChange('training')}
                    sx={{ color: '#ffeb3b' }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: '#ffeb3b'
                      }}
                    />
                    Training Data
                  </Box>
                }
              />
            </Box>
          </Paper>

          {/* Search */}
          <Paper sx={{ m: 2, p: 2 }}>
            <TextField
              fullWidth
              label="Search trees"
              placeholder="Tree ID or species name..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              variant="outlined"
              size="small"
            />
          </Paper>

          {/* Performance Metrics */}
          <PerformanceMetrics treesData={treesData} />

          {/* Results Table */}
          <Box sx={{ flexGrow: 1, m: 2 }}>
            <ResultsTable
              treesData={treesData}
              onTreeSelect={onTreeSelect}
              searchTerm={searchTerm}
            />
          </Box>
        </Box>
      </Drawer>
    </>
  );
};

export default SidePanel;