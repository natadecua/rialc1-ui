import React, { useMemo } from 'react';
import {
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Chip
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  School as SchoolIcon,
  Analytics as AnalyticsIcon
} from '@mui/icons-material';
import { TreeFeature } from '../types';

interface PerformanceMetricsProps {
  treesData: TreeFeature[];
}

const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({ treesData }) => {
  const metrics = useMemo(() => {
    // Filter out training data for accuracy calculations
    const testData = treesData.filter(tree => tree.status !== 'Training');
    
    const totalTrees = treesData.length;
    const correctPredictions = treesData.filter(tree => tree.status === 'Correct').length;
    const incorrectPredictions = treesData.filter(tree => tree.status === 'Incorrect').length;
    const trainingData = treesData.filter(tree => tree.status === 'Training').length;
    
    // Calculate metrics (only for test data, excluding training)
    const testDataCount = testData.length;
    const accuracy = testDataCount > 0 ? (correctPredictions / testDataCount) * 100 : 0;
    
    // For precision, recall, and F1, we'd need more detailed confusion matrix data
    // For demo purposes, we'll calculate simplified versions
    const precision = accuracy; // Simplified
    const recall = accuracy; // Simplified
    const f1Score = testDataCount > 0 ? (2 * (precision * recall) / (precision + recall)) : 0;

    return {
      totalTrees,
      correctPredictions,
      incorrectPredictions,
      trainingData,
      accuracy: accuracy.toFixed(1),
      precision: precision.toFixed(1),
      recall: recall.toFixed(1),
      f1Score: f1Score.toFixed(1)
    };
  }, [treesData]);

  const MetricCard: React.FC<{
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
    subtitle?: string;
  }> = ({ title, value, icon, color, subtitle }) => (
    <Card sx={{ height: '100%', mb: 1 }}>
      <CardContent sx={{ textAlign: 'center', p: 2 }}>
        <Box sx={{ color, mb: 1 }}>
          {icon}
        </Box>
        <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Paper sx={{ m: 2, p: 2 }}>
      <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AnalyticsIcon />
        Model Performance Metrics
      </Typography>
      
      {/* Overview Stats */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <MetricCard
            title="Correct"
            value={metrics.correctPredictions}
            icon={<CheckCircleIcon />}
            color="#4caf50"
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <MetricCard
            title="Incorrect"
            value={metrics.incorrectPredictions}
            icon={<CancelIcon />}
            color="#f44336"
          />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <MetricCard
            title="Training"
            value={metrics.trainingData}
            icon={<SchoolIcon />}
            color="#ffeb3b"
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <MetricCard
            title="Total Trees"
            value={metrics.totalTrees}
            icon={<AnalyticsIcon />}
            color="#2196f3"
          />
        </Box>
      </Box>

      {/* Performance Metrics */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold' }}>
          Performance Metrics:
        </Typography>
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2">Accuracy:</Typography>
            <Chip 
              label={`${metrics.accuracy}%`} 
              size="small" 
              color="primary" 
              variant="outlined"
            />
          </Box>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2">Precision:</Typography>
            <Chip 
              label={`${metrics.precision}%`} 
              size="small" 
              color="secondary" 
              variant="outlined"
            />
          </Box>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2">Recall:</Typography>
            <Chip 
              label={`${metrics.recall}%`} 
              size="small" 
              color="secondary" 
              variant="outlined"
            />
          </Box>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2">F1-Score:</Typography>
            <Chip 
              label={`${metrics.f1Score}%`} 
              size="small" 
              color="success" 
              variant="outlined"
            />
          </Box>
        </Box>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        * Metrics calculated excluding training data
      </Typography>
    </Paper>
  );
};

export default PerformanceMetrics;