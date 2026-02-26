import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useScanStore } from '../stores/scanStore';
import type { ScanStatus } from '../types';

const statusColor: Record<ScanStatus, 'default' | 'info' | 'success' | 'error'> = {
  pending: 'default',
  running: 'info',
  completed: 'success',
  failed: 'error',
};

const resultColumns: GridColDef[] = [
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
  { field: 'created_at', headerName: 'Tested At', width: 200 },
];

export default function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentScan, currentResults, isLoading, error, fetchScan, fetchScanResults } =
    useScanStore();

  useEffect(() => {
    if (id) {
      fetchScan(id);
      fetchScanResults(id);
    }
  }, [id, fetchScan, fetchScanResults]);

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/scans')} sx={{ mb: 2 }}>
        Back to Scans
      </Button>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      {currentScan && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack spacing={1}>
              <Typography variant="h5">Scan: {currentScan.id}</Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="body1">
                  Provider: <strong>{currentScan.provider}</strong>
                </Typography>
                <Chip
                  label={currentScan.status}
                  color={statusColor[currentScan.status as ScanStatus] ?? 'default'}
                  size="small"
                />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {currentScan.scanned_ips} / {currentScan.total_ips} IPs scanned
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Created: {currentScan.created_at}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Results
          </Typography>
          <DataGrid
            rows={currentResults}
            columns={resultColumns}
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
