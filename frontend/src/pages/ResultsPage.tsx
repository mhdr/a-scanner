import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Switch,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
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

/** Columns hidden on mobile */
const mobileColumnVisibility: Record<string, boolean> = {
  tls_latency_ms: false,
  download_speed_kbps: false,
  jitter_ms: false,
  packet_loss: false,
  scan_id: false,
};

export default function ResultsPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const {
    results, total, page, pageSize, isLoading, error,
    reachableOnly, setReachableOnly, setPagination, fetchResults,
    deleteAllResults,
  } = useResultStore();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAll = async () => {
    setDeleting(true);
    await deleteAllResults();
    setDeleting(false);
    setConfirmOpen(false);
  };

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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', mb: 2 }}>
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
            />
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteSweepIcon />}
              onClick={() => setConfirmOpen(true)}
              disabled={deleting || total === 0}
              size={isMobile ? 'small' : 'medium'}
            >
              Delete All
            </Button>
          </Box>

          <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
            <DialogTitle>Delete all results?</DialogTitle>
            <DialogContent>
              <DialogContentText>
                This will permanently delete all completed scans and their results.
                Running scans will not be affected.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button onClick={handleDeleteAll} color="error" variant="contained" disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete All'}
              </Button>
            </DialogActions>
          </Dialog>
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
            columnVisibilityModel={isMobile ? mobileColumnVisibility : undefined}
            autoHeight
            disableRowSelectionOnClick
          />
        </CardContent>
      </Card>
    </Box>
  );
}
