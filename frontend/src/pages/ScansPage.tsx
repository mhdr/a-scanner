import { useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  Link as MuiLink,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import { useNavigate, Link } from 'react-router-dom';
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
  {
    field: 'mode',
    headerName: 'Mode',
    width: 100,
    renderCell: (params) => (
      <Chip
        label={params.value}
        variant="outlined"
        size="small"
        color={params.value === 'extended' ? 'secondary' : 'default'}
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
  const { providers, fetchProviders, ranges, fetchRanges } = useProviderStore();
  const [selectedProvider, setSelectedProvider] = useState('cloudflare');
  const [extended, setExtended] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [concurrency, setConcurrency] = useState(64);
  const [timeoutMs, setTimeoutMs] = useState(2000);
  const [port, setPort] = useState(443);
  const [samples, setSamples] = useState(3);
  const [extendedConcurrency, setExtendedConcurrency] = useState(200);
  const [extendedTimeoutMs, setExtendedTimeoutMs] = useState(10000);
  const [packetLossProbes, setPacketLossProbes] = useState(10);
  const [ipRanges, setIpRanges] = useState('');

  useEffect(() => {
    fetchScans();
    fetchProviders();
  }, [fetchScans, fetchProviders]);

  // Load ranges when provider changes
  useEffect(() => {
    if (selectedProvider) fetchRanges(selectedProvider);
  }, [selectedProvider, fetchRanges]);

  // Range summary for selected provider
  const providerRanges = ranges[selectedProvider] ?? [];
  const enabledRanges = providerRanges.filter((r) => r.enabled);
  const enabledIps = enabledRanges.reduce((sum, r) => sum + r.ip_count, 0);
  const totalIps = providerRanges.reduce((sum, r) => sum + r.ip_count, 0);

  const handleStartScan = async () => {
    const parsedRanges = ipRanges
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    await startScan({
      provider: selectedProvider,
      extended,
      concurrency,
      timeout_ms: timeoutMs,
      port,
      ...(extended && {
        samples,
        extended_concurrency: extendedConcurrency,
        extended_timeout_ms: extendedTimeoutMs,
        packet_loss_probes: packetLossProbes,
      }),
      ...(parsedRanges.length > 0 && { ip_ranges: parsedRanges }),
    });
    // Navigate to the newly created scan
    const { scans: updatedScans } = useScanStore.getState();
    if (updatedScans.length > 0) {
      navigate(`/scans/${updatedScans[0].id}`);
    }
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
          <FormControlLabel
            control={
              <Switch checked={extended} onChange={(e) => setExtended(e.target.checked)} />
            }
            label="Extended"
          />
          <Button
            size="small"
            startIcon={<SettingsIcon />}
            onClick={() => setShowAdvanced(!showAdvanced)}
            variant="text"
          >
            Advanced
          </Button>
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

      <Collapse in={showAdvanced}>
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                <TextField
                  label="Concurrency"
                  type="number"
                  size="small"
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  slotProps={{ htmlInput: { min: 1, max: 10000 } }}
                  sx={{ width: 140 }}
                />
                <TextField
                  label="Timeout (ms)"
                  type="number"
                  size="small"
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(Number(e.target.value))}
                  slotProps={{ htmlInput: { min: 100, max: 30000, step: 100 } }}
                  sx={{ width: 140 }}
                />
                <TextField
                  label="Port"
                  type="number"
                  size="small"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  slotProps={{ htmlInput: { min: 1, max: 65535 } }}
                  sx={{ width: 120 }}
                />
              </Stack>

              {extended && (
                <>
                  <Divider>
                    <Typography variant="caption" color="text.secondary">
                      Extended Settings
                    </Typography>
                  </Divider>
                  <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                    <TextField
                      label="TTFB Samples"
                      type="number"
                      size="small"
                      value={samples}
                      onChange={(e) => setSamples(Number(e.target.value))}
                      slotProps={{ htmlInput: { min: 1, max: 20 } }}
                      helperText="TTFB measurement iterations"
                      sx={{ width: 160 }}
                    />
                    <TextField
                      label="Ext. Concurrency"
                      type="number"
                      size="small"
                      value={extendedConcurrency}
                      onChange={(e) => setExtendedConcurrency(Number(e.target.value))}
                      slotProps={{ htmlInput: { min: 1, max: 1000 } }}
                      helperText="Concurrent extended tests"
                      sx={{ width: 170 }}
                    />
                    <TextField
                      label="Ext. Timeout (ms)"
                      type="number"
                      size="small"
                      value={extendedTimeoutMs}
                      onChange={(e) => setExtendedTimeoutMs(Number(e.target.value))}
                      slotProps={{ htmlInput: { min: 1000, max: 60000, step: 1000 } }}
                      helperText="Timeout for extended tests"
                      sx={{ width: 170 }}
                    />
                    <TextField
                      label="Loss Probes"
                      type="number"
                      size="small"
                      value={packetLossProbes}
                      onChange={(e) => setPacketLossProbes(Number(e.target.value))}
                      slotProps={{ htmlInput: { min: 1, max: 50 } }}
                      helperText="TCP probes for packet loss"
                      sx={{ width: 160 }}
                    />
                  </Stack>
                </>
              )}

              <TextField
                label="Custom IP Ranges (CIDR)"
                multiline
                minRows={2}
                maxRows={6}
                size="small"
                value={ipRanges}
                onChange={(e) => setIpRanges(e.target.value)}
                placeholder={"1.0.0.0/24\n1.1.1.0/24"}
                helperText="One CIDR range per line. Leave empty to use provider defaults."
              />
            </Stack>
          </CardContent>
        </Card>
      </Collapse>

      {/* Range summary for selected provider */}
      {providerRanges.length > 0 && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2">
                {enabledRanges.length}/{providerRanges.length} ranges enabled
                ({enabledIps.toLocaleString()} / {totalIps.toLocaleString()} IPs)
              </Typography>
              <MuiLink component={Link} to="/providers" variant="body2">
                Manage ranges
              </MuiLink>
            </Stack>
          </CardContent>
        </Card>
      )}

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
