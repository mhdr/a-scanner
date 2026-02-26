import { useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  FormControlLabel,
  Switch,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useResultStore } from '../stores/resultStore';

const columns: GridColDef[] = [
  { field: 'ip', headerName: 'IP Address', width: 200 },
  {
    field: 'is_reachable',
    headerName: 'Reachable',
    width: 130,
    renderCell: (params) =>
      params.value ? (
        <CheckCircleIcon color="success" />
      ) : (
        <CancelIcon color="error" />
      ),
  },
  {
    field: 'latency_ms',
    headerName: 'Latency (ms)',
    width: 140,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${params.value} ms` : '—'),
  },
  { field: 'scan_id', headerName: 'Scan ID', width: 280 },
  { field: 'created_at', headerName: 'Tested At', width: 200 },
];

export default function ResultsPage() {
  const { results, isLoading, error, reachableOnly, setReachableOnly, fetchResults } =
    useResultStore();

  useEffect(() => {
    fetchResults();
  }, [fetchResults, reachableOnly]);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Results
      </Typography>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Card>
        <CardContent>
          <FormControlLabel
            control={
              <Switch
                checked={reachableOnly}
                onChange={(e) => {
                  setReachableOnly(e.target.checked);
                }}
              />
            }
            label="Show reachable only"
            sx={{ mb: 2 }}
          />
          <DataGrid
            rows={results}
            columns={columns}
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            loading={isLoading}
            autoHeight
            disableRowSelectionOnClick
          />
        </CardContent>
      </Card>
    </Box>
  );
}
