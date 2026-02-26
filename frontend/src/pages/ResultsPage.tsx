import { useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  FormControlLabel,
  Switch,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useResultStore } from '../stores/resultStore';

const columns: GridColDef[] = [
  { field: 'ip', headerName: 'IP Address', width: 180 },
  {
    field: 'is_reachable',
    headerName: 'Reachable',
    width: 100,
    renderCell: (params) =>
      params.value ? (
        <CheckCircleIcon color="success" />
      ) : (
        <CancelIcon color="error" />
      ),
  },
  {
    field: 'latency_ms',
    headerName: 'TCP (ms)',
    width: 100,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${params.value}` : '—'),
  },
  {
    field: 'tls_latency_ms',
    headerName: 'TLS (ms)',
    width: 100,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${params.value}` : '—'),
  },
  {
    field: 'ttfb_ms',
    headerName: 'TTFB (ms)',
    width: 100,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${params.value}` : '—'),
  },
  {
    field: 'download_speed_kbps',
    headerName: 'Speed (KB/s)',
    width: 120,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(1)}` : '—',
  },
  {
    field: 'jitter_ms',
    headerName: 'Jitter (ms)',
    width: 100,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(1)}` : '—',
  },
  {
    field: 'packet_loss',
    headerName: 'Loss (%)',
    width: 100,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(1)}` : '—',
  },
  {
    field: 'score',
    headerName: 'Score',
    width: 100,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(0)}` : '—',
  },
  { field: 'scan_id', headerName: 'Scan ID', width: 280 },
];

export default function ResultsPage() {
  const {
    results, total, page, pageSize, isLoading, error,
    reachableOnly, setReachableOnly, setPagination, fetchResults,
  } = useResultStore();

  useEffect(() => {
    fetchResults();
  }, [fetchResults, reachableOnly, page, pageSize]);

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
            paginationMode="server"
            rowCount={total}
            paginationModel={{ page, pageSize }}
            onPaginationModelChange={(model: GridPaginationModel) => {
              setPagination(model.page, model.pageSize);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
            sortingMode="server"
            loading={isLoading}
            autoHeight
            disableRowSelectionOnClick
          />
        </CardContent>
      </Card>
    </Box>
  );
}
