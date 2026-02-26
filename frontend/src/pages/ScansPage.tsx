import { useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useNavigate } from 'react-router-dom';
import { useScanStore } from '../stores/scanStore';
import { useProviderStore } from '../stores/providerStore';
import { useState } from 'react';
import type { ScanStatus } from '../types';

const statusColor: Record<ScanStatus, 'default' | 'info' | 'success' | 'error'> = {
  pending: 'default',
  running: 'info',
  completed: 'success',
  failed: 'error',
};

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 280 },
  { field: 'provider', headerName: 'Provider', width: 140 },
  {
    field: 'status',
    headerName: 'Status',
    width: 130,
    renderCell: (params) => (
      <Chip
        label={params.value}
        color={statusColor[params.value as ScanStatus] ?? 'default'}
        size="small"
      />
    ),
  },
  { field: 'total_ips', headerName: 'Total IPs', width: 110, type: 'number' },
  { field: 'scanned_ips', headerName: 'Scanned', width: 110, type: 'number' },
  { field: 'created_at', headerName: 'Created', width: 200 },
];

export default function ScansPage() {
  const navigate = useNavigate();
  const { scans, isLoading, error, fetchScans, startScan } = useScanStore();
  const { providers, fetchProviders } = useProviderStore();
  const [selectedProvider, setSelectedProvider] = useState('cloudflare');

  useEffect(() => {
    fetchScans();
    fetchProviders();
  }, [fetchScans, fetchProviders]);

  const handleStartScan = async () => {
    await startScan(selectedProvider);
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">Scans</Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Provider</InputLabel>
            <Select
              value={selectedProvider}
              label="Provider"
              onChange={(e) => setSelectedProvider(e.target.value)}
            >
              {providers.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={handleStartScan}
            disabled={isLoading}
          >
            Start Scan
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Card>
        <CardContent>
          <DataGrid
            rows={scans}
            columns={columns}
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            onRowClick={(params) => navigate(`/scans/${params.id}`)}
            loading={isLoading}
            autoHeight
            disableRowSelectionOnClick
            sx={{ cursor: 'pointer' }}
          />
        </CardContent>
      </Card>
    </Box>
  );
}
