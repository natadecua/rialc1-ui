import React, { useState } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  Chip,
  Box,
  TablePagination
} from '@mui/material';
import { TreeFeature } from '../types';

interface ResultsTableProps {
  treesData: TreeFeature[];
  onTreeSelect: (tree: TreeFeature) => void;
  searchTerm: string;
}

type Order = 'asc' | 'desc';
type OrderBy = keyof TreeFeature;

const ResultsTable: React.FC<ResultsTableProps> = ({
  treesData,
  onTreeSelect,
  searchTerm
}) => {
  const [order, setOrder] = useState<Order>('asc');
  const [orderBy, setOrderBy] = useState<OrderBy>('tree_id');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handleRequestSort = (property: OrderBy) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
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

  const getStatusChip = (status: string) => {
    const color = getStatusColor(status);
    return (
      <Chip
        label={status}
        size="small"
        sx={{
          backgroundColor: color,
          color: status === 'Training' ? 'black' : 'white',
          fontWeight: 'bold'
        }}
      />
    );
  };

  // Sort function
  const sortedData = [...treesData].sort((a, b) => {
    if (orderBy === 'tree_id') {
      return order === 'asc' ? a.tree_id - b.tree_id : b.tree_id - a.tree_id;
    }
    
    const aValue = a[orderBy];
    const bValue = b[orderBy];
    
    if (aValue < bValue) {
      return order === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return order === 'asc' ? 1 : -1;
    }
    return 0;
  });

  // Paginated data
  const paginatedData = sortedData.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const createSortHandler = (property: OrderBy) => () => {
    handleRequestSort(property);
  };

  return (
    <Paper sx={{ width: '100%' }}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Results Table
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {treesData.length} trees found
        </Typography>
      </Box>
      
      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'tree_id'}
                  direction={orderBy === 'tree_id' ? order : 'asc'}
                  onClick={createSortHandler('tree_id')}
                >
                  Tree ID
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'predicted_species'}
                  direction={orderBy === 'predicted_species' ? order : 'asc'}
                  onClick={createSortHandler('predicted_species')}
                >
                  Predicted Species
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'ground_truth'}
                  direction={orderBy === 'ground_truth' ? order : 'asc'}
                  onClick={createSortHandler('ground_truth')}
                >
                  Ground Truth
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'status'}
                  direction={orderBy === 'status' ? order : 'asc'}
                  onClick={createSortHandler('status')}
                >
                  Status
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((tree) => (
              <TableRow
                key={tree.tree_id}
                hover
                onClick={() => onTreeSelect(tree)}
                sx={{ 
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: 'action.hover'
                  }
                }}
              >
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: getStatusColor(tree.status)
                      }}
                    />
                    {tree.tree_id}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {tree.predicted_species}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {tree.ground_truth}
                  </Typography>
                </TableCell>
                <TableCell>
                  {getStatusChip(tree.status)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      
      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={treesData.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Paper>
  );
};

export default ResultsTable;