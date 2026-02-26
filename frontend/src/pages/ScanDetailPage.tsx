import { useEffect, useCallback } from 'react';
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
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useScanStore } from '../stores/scanStore';
import { useScanProgress } from '../hooks/useScanProgress';
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
    field: 'packet_loss',
    headerName: 'Loss (%)',
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

const PHASE_LABELS: Record<string, string> = {
  pending: 'Waiting to start…',
  resolving: 'Resolving IP ranges…',
  phase1: 'Scanning IPs (Phase 1)…',
  phase1_done: 'Phase 1 complete',
  quick_verify: 'Quick-verifying reachable IPs…',
  quick_verify_done: 'Quick verify complete',
  phase2: 'Running extended tests (Phase 2)…',
  done: 'Done',
  failed: 'Failed',
};

export default function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentScan, currentPhase, extendedDone, extendedTotal,
    currentResults, resultsTotal, resultsPage, resultsPageSize,
    isResultsLoading, error, fetchScan, fetchScanResults, setResultsPagination,
  } = useScanStore();

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

  // Re-fetch when pagination changes
  useEffect(() => {
    if (id) fetchScanResults(id);
  }, [id, resultsPage, resultsPageSize, fetchScanResults]);

  // Real-time progress via WebSocket (falls back to polling on disconnect)
  const isActive = currentScan?.status === 'pending' || currentScan?.status === 'running';
  useScanProgress(id, isActive);

  // Phase 1 progress: scanned_ips / total_ips
  const phase1Progress =
    currentScan && currentScan.total_ips > 0
      ? (currentScan.scanned_ips / currentScan.total_ips) * 100
      : 0;

  // Phase 2 progress: extended_done / extended_total
  const phase2Progress =
    extendedTotal > 0
      ? (extendedDone / extendedTotal) * 100
      : 0;

  // Determine which progress to show
  const isPhase2 = currentPhase === 'phase2';
  const isQuickVerify = currentPhase === 'quick_verify';
  const isIndeterminate =
    (currentScan?.total_ips === 0 && currentScan?.status === 'running')
    || currentPhase === 'resolving'
    || isQuickVerify;

  const displayProgress = isPhase2 ? phase2Progress : phase1Progress;
  const phaseLabel = currentPhase ? (PHASE_LABELS[currentPhase] ?? currentPhase) : null;

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
                {currentScan.working_ips > 0 && ` | ${currentScan.working_ips} working`}
                {' | '}Concurrency: {currentScan.concurrency}
                {' | '}Timeout: {currentScan.timeout_ms}ms
              </Typography>
              {(currentScan.status === 'pending' || currentScan.status === 'running') && (
                <Box sx={{ mt: 1 }}>
                  <LinearProgress
                    variant={isIndeterminate ? 'indeterminate' : 'determinate'}
                    value={displayProgress}
                  />
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      {isIndeterminate
                        ? (phaseLabel ?? 'Working…')
                        : isPhase2
                          ? `${extendedDone} / ${extendedTotal} extended tests (${phase2Progress.toFixed(1)}%)`
                          : `${phase1Progress.toFixed(1)}%`
                      }
                    </Typography>
                    {phaseLabel && !isIndeterminate && (
                      <Typography variant="caption" color="text.secondary">
                        {phaseLabel}
                      </Typography>
                    )}
                  </Stack>
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
            Results {resultsTotal > 0 && `(${resultsTotal} reachable)`}
          </Typography>
          <DataGrid
            rows={currentResults}
            columns={columns}
            paginationMode="server"
            rowCount={resultsTotal}
            paginationModel={{ page: resultsPage, pageSize: resultsPageSize }}
            onPaginationModelChange={(model: GridPaginationModel) => {
              setResultsPagination(model.page, model.pageSize);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
            sortingMode="server"
            loading={isResultsLoading}
            autoHeight
            disableRowSelectionOnClick
          />
        </CardContent>
      </Card>
    </Box>
  );
}
