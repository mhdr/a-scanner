import { useEffect, useState, useCallback } from 'react';
import {
  Accordion, AccordionSummary, AccordionDetails, Alert, Box, Button, Card,
  CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, IconButton, Stack, Switch, TextField,
  Tooltip, Typography,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import { useProviderStore } from '../stores/providerStore';
import type { Provider, ProviderRange } from '../types';

// ---------------------------------------------------------------------------
// Add / Edit dialog
// ---------------------------------------------------------------------------

interface RangeDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (cidr: string, enabled: boolean) => void;
  initial?: { cidr: string; enabled: boolean };
  title: string;
}

function RangeDialog({ open, onClose, onSave, initial, title }: RangeDialogProps) {
  const [cidr, setCidr] = useState(initial?.cidr ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setCidr(initial?.cidr ?? '');
      setEnabled(initial?.enabled ?? true);
      setError('');
    }
  }, [open, initial]);

  const handleSave = () => {
    const trimmed = cidr.trim();
    if (!trimmed) { setError('CIDR is required'); return; }
    // Basic CIDR format validation (e.g. 1.2.3.0/24)
    if (!/^[\d.:a-fA-F]+\/\d{1,3}$/.test(trimmed)) { setError('Invalid CIDR format'); return; }
    onSave(trimmed, enabled);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="CIDR" placeholder="e.g. 104.16.0.0/13" value={cidr}
            onChange={(e) => { setCidr(e.target.value); setError(''); }}
            error={!!error} helperText={error} fullWidth autoFocus />
          <FormControlLabel control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
            label="Enabled" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  open: boolean;
  cidr: string;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteDialog({ open, cidr, onClose, onConfirm }: DeleteDialogProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Delete Range</DialogTitle>
      <DialogContent>
        <Typography>Are you sure you want to delete <strong>{cidr}</strong>?</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={onConfirm}>Delete</Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Provider section (accordion)
// ---------------------------------------------------------------------------

interface ProviderSectionProps {
  provider: Provider;
}

function ProviderSection({ provider }: ProviderSectionProps) {
  const {
    ranges, rangesLoading, settings, settingsLoading, error,
    fetchRanges, triggerFetchFromSource, addRange, editRange, removeRange,
    bulkToggle, fetchSettings, saveSettings,
  } = useProviderStore();

  const providerRanges = ranges[provider.id] ?? [];
  const providerSettings = settings[provider.id];
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeRange, setActiveRange] = useState<ProviderRange | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadData = useCallback(() => {
    fetchRanges(provider.id);
    fetchSettings(provider.id);
  }, [provider.id, fetchRanges, fetchSettings]);

  useEffect(() => {
    if (expanded) loadData();
  }, [expanded, loadData]);

  // Derived stats
  const totalRanges = providerRanges.length;
  const enabledRanges = providerRanges.filter((r) => r.enabled);
  const totalIps = providerRanges.reduce((sum, r) => sum + r.ip_count, 0);
  const enabledIps = enabledRanges.reduce((sum, r) => sum + r.ip_count, 0);

  const handleFetchFromSource = async () => {
    await triggerFetchFromSource(provider.id);
  };

  const handleAddRange = async (cidr: string, enabled: boolean) => {
    await addRange(provider.id, { cidr, enabled });
    setAddOpen(false);
  };

  const handleEditRange = async (cidr: string, enabled: boolean) => {
    if (activeRange) {
      await editRange(provider.id, activeRange.id, { cidr, enabled });
    }
    setEditOpen(false);
    setActiveRange(null);
  };

  const handleDeleteRange = async () => {
    if (activeRange) {
      await removeRange(provider.id, activeRange.id);
    }
    setDeleteOpen(false);
    setActiveRange(null);
  };

  const handleBulkEnable = async () => {
    if (selection.length > 0) {
      await bulkToggle(provider.id, { range_ids: selection as string[], enabled: true });
      setSelection([]);
    }
  };

  const handleBulkDisable = async () => {
    if (selection.length > 0) {
      await bulkToggle(provider.id, { range_ids: selection as string[], enabled: false });
      setSelection([]);
    }
  };

  const handleSelectAll = async () => {
    const allIds = providerRanges.map((r) => r.id);
    await bulkToggle(provider.id, { range_ids: allIds, enabled: true });
  };

  const handleDeselectAll = async () => {
    const allIds = providerRanges.map((r) => r.id);
    await bulkToggle(provider.id, { range_ids: allIds, enabled: false });
  };

  const handleToggleEnabled = async (range: ProviderRange) => {
    await editRange(provider.id, range.id, { enabled: !range.enabled });
  };

  const columns: GridColDef[] = [
    {
      field: 'enabled', headerName: 'Enabled', width: 90,
      renderCell: (params) => (
        <Checkbox checked={params.value as boolean} size="small"
          onClick={(e) => e.stopPropagation()}
          onChange={() => handleToggleEnabled(params.row as ProviderRange)} />
      ),
    },
    { field: 'cidr', headerName: 'CIDR Range', flex: 1, minWidth: 180 },
    {
      field: 'ip_count', headerName: 'IPs', width: 110, type: 'number',
      renderCell: (params) => (params.value as number).toLocaleString(),
    },
    {
      field: 'is_custom', headerName: 'Source', width: 110,
      renderCell: (params) => (
        <Chip label={params.value ? 'Custom' : 'Auto'} size="small" variant="outlined"
          color={params.value ? 'secondary' : 'default'} />
      ),
    },
    {
      field: 'actions', headerName: 'Actions', width: 100, sortable: false, filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={(e) => {
              e.stopPropagation();
              setActiveRange(params.row as ProviderRange);
              setEditOpen(true);
            }}><EditIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={(e) => {
              e.stopPropagation();
              setActiveRange(params.row as ProviderRange);
              setDeleteOpen(true);
            }}><DeleteIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Accordion expanded={expanded} onChange={(_, isExpanded) => setExpanded(isExpanded)}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%', pr: 2 }}>
          <Typography variant="h6">{provider.name}</Typography>
          <Typography variant="body2" color="text.secondary">{provider.description}</Typography>
          {totalRanges > 0 && (
            <Chip label={`${enabledRanges.length}/${totalRanges} ranges enabled`}
              size="small" color="primary" variant="outlined" />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Settings bar */}
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
              <FormControlLabel
                control={
                  <Switch checked={providerSettings?.auto_update ?? false}
                    onChange={(e) => saveSettings(provider.id, { auto_update: e.target.checked })} />
                }
                label="Auto-update"
              />
              <TextField label="Interval (hours)" type="number" size="small" sx={{ width: 130 }}
                value={providerSettings?.auto_update_interval_hours ?? 24}
                onChange={(e) => saveSettings(provider.id, { auto_update_interval_hours: Number(e.target.value) })}
                slotProps={{ htmlInput: { min: 1, max: 720 } }}
                disabled={!providerSettings?.auto_update}
              />
              <Typography variant="body2" color="text.secondary">
                Last fetched:{' '}
                {providerSettings?.last_fetched_at
                  ? new Date(providerSettings.last_fetched_at).toLocaleString()
                  : 'Never'}
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        {/* Action bar */}
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
          <Button variant="contained" startIcon={<CloudDownloadIcon />}
            onClick={handleFetchFromSource} disabled={rangesLoading}>
            Fetch from Source
          </Button>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Add Custom Range
          </Button>
          <Button size="small" onClick={handleSelectAll} disabled={totalRanges === 0}>
            Enable All
          </Button>
          <Button size="small" onClick={handleDeselectAll} disabled={totalRanges === 0}>
            Disable All
          </Button>
          {selection.length > 0 && (
            <>
              <Button size="small" variant="outlined" color="success" onClick={handleBulkEnable}>
                Enable Selected ({selection.length})
              </Button>
              <Button size="small" variant="outlined" color="warning" onClick={handleBulkDisable}>
                Disable Selected ({selection.length})
              </Button>
            </>
          )}
          <IconButton onClick={loadData} disabled={rangesLoading}>
            <RefreshIcon />
          </IconButton>
        </Stack>

        {/* Summary */}
        {totalRanges > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {totalRanges} ranges total &middot; {enabledIps.toLocaleString()} / {totalIps.toLocaleString()} IPs enabled
          </Typography>
        )}

        {/* Ranges table */}
        <DataGrid
          rows={providerRanges}
          columns={columns}
          loading={rangesLoading || settingsLoading}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          checkboxSelection
          rowSelectionModel={selection}
          onRowSelectionModelChange={(model) => setSelection(model)}
          autoHeight
          disableRowSelectionOnClick
          getRowId={(row) => row.id}
        />

        {/* Dialogs */}
        <RangeDialog open={addOpen} onClose={() => setAddOpen(false)}
          onSave={handleAddRange} title="Add Custom Range" />
        <RangeDialog open={editOpen} onClose={() => { setEditOpen(false); setActiveRange(null); }}
          onSave={handleEditRange} title="Edit Range"
          initial={activeRange ? { cidr: activeRange.cidr, enabled: activeRange.enabled } : undefined} />
        <DeleteDialog open={deleteOpen} cidr={activeRange?.cidr ?? ''}
          onClose={() => { setDeleteOpen(false); setActiveRange(null); }}
          onConfirm={handleDeleteRange} />
      </AccordionDetails>
    </Accordion>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProvidersPage() {
  const { providers, isLoading, error, fetchProviders } = useProviderStore();

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">Providers</Typography>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {isLoading && <Typography>Loading providers...</Typography>}

      <Stack spacing={1}>
        {providers.map((provider) => (
          <ProviderSection key={provider.id} provider={provider} />
        ))}
      </Stack>
    </Box>
  );
}
