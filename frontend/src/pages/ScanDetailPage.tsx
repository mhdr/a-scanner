import { useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
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

const basicColumns: GridColDef[] = [
  { field: 'ip', headerName: 'IP Address', width: 200 },
  {
    field: 'is_reachable',
    headerName: 'Reachable',
    width: 110,
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
    width: 110,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${params.value}` : '—'),
  },
];

const extendedColumns: GridColDef[] = [
  ...basicColumns,
  {
    field: 'tls_latency_ms',
    headerName: 'TLS (ms)',
    width: 110,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${params.value}` : '—'),
  },
  {
    field: 'ttfb_ms',
    headerName: 'TTFB (ms)',
    width: 110,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${params.value}` : '—'),
  },
  {
    field: 'download_speed_kbps',
    headerName: 'Speed (KB/s)',
    width: 130,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(1)}` : '—',
  },
  {
    field: 'jitter_ms',
    headerName: 'Jitter (ms)',
    width: 110,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(1)}` : '—',
  },
  {
    field: 'score',
    headerName: 'Score',
    width: 110,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(0)}` : '—',
  },
];

export default function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentScan, currentResults, isLoading, error, fetchScan, fetchScanResults } =
    useScanStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshData = useCallback(() => {
    if (id) {
      fetchScan(id);
      fetchScanResults(id);
    }
  }, [id, fetchScan, fetchScanResults]);

  // Initial fetch
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Polling: refresh every 2s while scan is pending or running
  useEffect(() => {
    const status = currentScan?.status;
    if (status === 'pending' || status === 'running') {
      intervalRef.current = setInterval(refreshData, 2000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [currentScan?.status, refreshData]);

  const progress =
    currentScan && currentScan.total_ips > 0
      ? (currentScan.scanned_ips / currentScan.total_ips) * 100
      : 0;

  const isExtended = currentScan?.extended ?? false;
  const columns = isExtended ? extendedColumns : basicColumns;

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
                <Chip
                  label={currentScan.mode}
                  variant="outlined"
                  size="small"
                  color={currentScan.extended ? 'secondary' : 'default'}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {currentScan.scanned_ips} / {currentScan.total_ips} IPs scanned
                {' | '}Concurrency: {currentScan.concurrency}
                {' | '}Timeout: {currentScan.timeout_ms}ms
              </Typography>
              {(currentScan.status === 'pending' || currentScan.status === 'running') && (
                <Box sx={{ mt: 1 }}>
                  <LinearProgress
                    variant={currentScan.total_ips > 0 ? 'determinate' : 'indeterminate'}
                    value={progress}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {progress.toFixed(1)}%
                  </Typography>
                </Box>
              )}
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
            Results {currentResults.length > 0 && `(${currentResults.length} reachable)`}
          </Typography>
          <DataGrid
            rows={currentResults}
            columns={columns}
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              sorting: { sortModel: [{ field: isExtended ? 'score' : 'latency_ms', sort: 'asc' }] },
            }}
            loading={isLoading}
            autoHeight
            disableRowSelectionOnClick
          />
        </CardContent>
      </Card>
    </Box>
  );
}
