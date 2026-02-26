import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useResultStore } from '../stores/resultStore';

const columns: GridColDef[] = [
  { field: 'ip', headerName: 'IP Address', width: 180 },
  {
    field: 'avg_latency_ms',
    headerName: 'Avg TCP (ms)',
    width: 120,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${(params.value as number).toFixed(0)}` : '—'),
  },
  {
    field: 'avg_tls_latency_ms',
    headerName: 'Avg TLS (ms)',
    width: 120,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${(params.value as number).toFixed(0)}` : '—'),
  },
  {
    field: 'avg_ttfb_ms',
    headerName: 'Avg TTFB (ms)',
    width: 130,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${(params.value as number).toFixed(0)}` : '—'),
  },
  {
    field: 'avg_download_speed_kbps',
    headerName: 'Avg Speed (KB/s)',
    width: 140,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(1)}` : '—',
  },
  {
    field: 'avg_jitter_ms',
    headerName: 'Avg Jitter (ms)',
    width: 130,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(1)}` : '—',
  },
  {
    field: 'avg_packet_loss',
    headerName: 'Avg Loss (%)',
    width: 120,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(1)}` : '—',
  },
  {
    field: 'avg_score',
    headerName: 'Avg Score',
    width: 110,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(0)}` : '—',
  },
  {
    field: 'scan_count',
    headerName: 'Scans',
    width: 80,
    type: 'number',
  },
  {
    field: 'last_seen',
    headerName: 'Last Seen',
    width: 180,
  },
];

/** Columns hidden on mobile */
const mobileColumnVisibility: Record<string, boolean> = {
  avg_tls_latency_ms: false,
  avg_download_speed_kbps: false,
  avg_jitter_ms: false,
  avg_packet_loss: false,
  scan_count: false,
  last_seen: false,
};

export default function ResultsPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const {
    aggregatedIps, aggregatedTotal, aggregatedPage, aggregatedPageSize,
    isLoading, error, setAggregatedPagination, fetchAggregatedIps,
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
    fetchAggregatedIps();
  }, [fetchAggregatedIps, aggregatedPage, aggregatedPageSize]);

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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteSweepIcon />}
              onClick={() => setConfirmOpen(true)}
              disabled={deleting || aggregatedTotal === 0}
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
            rows={aggregatedIps}
            columns={columns}
            getRowId={(row) => row.ip}
            paginationMode="server"
            rowCount={aggregatedTotal}
            paginationModel={{ page: aggregatedPage, pageSize: aggregatedPageSize }}
            onPaginationModelChange={(model: GridPaginationModel) => {
              setAggregatedPagination(model.page, model.pageSize);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
            sortingMode="server"
            initialState={{
              sorting: { sortModel: [{ field: 'avg_score', sort: 'asc' }] },
            }}
            loading={isLoading}
            columnVisibilityModel={isMobile ? mobileColumnVisibility : undefined}
            autoHeight
            disableRowSelectionOnClick
            onRowClick={(params) => {
              navigate(`/results/${encodeURIComponent(params.row.ip)}`);
            }}
            sx={{
              '& .MuiDataGrid-row': { cursor: 'pointer' },
            }}
          />
        </CardContent>
      </Card>
    </Box>
  );
}
