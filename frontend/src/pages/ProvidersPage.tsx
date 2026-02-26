import { useEffect, useState, useCallback } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, List,
  ListItemButton, ListItemIcon, ListItemText, Paper, Stack, Switch, TextField,
  Tooltip, Typography,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import DnsIcon from '@mui/icons-material/Dns';
import LockIcon from '@mui/icons-material/Lock';
import { useProviderStore } from '../stores/providerStore';
import type { Provider, ProviderRange } from '../types';

// ---------------------------------------------------------------------------
// Provider add / edit dialog
// ---------------------------------------------------------------------------

interface ProviderDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string; sni: string; ip_range_urls: string[] }) => void;
  initial?: { name: string; description: string; sni: string; ip_range_urls: string[] };
  title: string;
}

function ProviderDialog({ open, onClose, onSave, initial, title }: ProviderDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sni, setSni] = useState('');
  const [urlsText, setUrlsText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setSni(initial?.sni ?? '');
      setUrlsText(initial?.ip_range_urls?.join('\n') ?? '');
      setErrors({});
    }
  }, [open, initial]);

  const handleSave = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!sni.trim()) e.sni = 'SNI hostname is required';
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    const urls = urlsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    onSave({ name: name.trim(), description: description.trim(), sni: sni.trim(), ip_range_urls: urls });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })); }}
            error={!!errors.name} helperText={errors.name} fullWidth autoFocus />
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)}
            fullWidth />
          <TextField label="SNI Hostname" placeholder="e.g. cloudflare.com" value={sni}
            onChange={(e) => { setSni(e.target.value); setErrors((p) => ({ ...p, sni: '' })); }}
            error={!!errors.sni} helperText={errors.sni} fullWidth />
          <TextField label="IP Range URLs (one per line)" multiline minRows={2} maxRows={6}
            placeholder={"https://example.com/ips-v4\nhttps://example.com/ips-v6"}
            value={urlsText} onChange={(e) => setUrlsText(e.target.value)} fullWidth />
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
// Delete provider confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteProviderDialogProps {
  open: boolean;
  provider: Provider | null;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteProviderDialog({ open, provider, onClose, onConfirm }: DeleteProviderDialogProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Delete Provider</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete <strong>{provider?.name}</strong> and all its ranges?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={onConfirm}>Delete</Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Range add / edit dialog
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
// Delete range confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteRangeDialogProps {
  open: boolean;
  cidr: string;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteRangeDialog({ open, cidr, onClose, onConfirm }: DeleteRangeDialogProps) {
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
// Provider detail panel (right side)
// ---------------------------------------------------------------------------

interface ProviderDetailProps {
  provider: Provider;
}

function ProviderDetail({ provider }: ProviderDetailProps) {
  const {
    ranges, rangesLoading, settings, settingsLoading, error,
    fetchRanges, triggerFetchFromSource, addRange, editRange, removeRange,
    bulkToggle, fetchSettings, saveSettings, updateProvider,
  } = useProviderStore();

  const providerRanges = ranges[provider.id] ?? [];
  const providerSettings = settings[provider.id];
  const [selection, setSelection] = useState<GridRowSelectionModel>({ type: 'include', ids: new Set() });
  const [addOpen, setAddOpen] = useState(false);
  const [editRangeOpen, setEditRangeOpen] = useState(false);
  const [deleteRangeOpen, setDeleteRangeOpen] = useState(false);
  const [activeRange, setActiveRange] = useState<ProviderRange | null>(null);
  const [editProviderOpen, setEditProviderOpen] = useState(false);

  const loadData = useCallback(() => {
    fetchRanges(provider.id);
    fetchSettings(provider.id);
  }, [provider.id, fetchRanges, fetchSettings]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset selection when provider changes
  useEffect(() => {
    setSelection({ type: 'include', ids: new Set() });
  }, [provider.id]);

  // Derived stats
  const totalRanges = providerRanges.length;
  const enabledRanges = providerRanges.filter((r) => r.enabled);
  const totalIps = providerRanges.reduce((sum, r) => sum + r.ip_count, 0);
  const enabledIps = enabledRanges.reduce((sum, r) => sum + r.ip_count, 0);

  const parsedUrls: string[] = (() => {
    try { return JSON.parse(provider.ip_range_urls); } catch { return []; }
  })();

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
    setEditRangeOpen(false);
    setActiveRange(null);
  };

  const handleDeleteRange = async () => {
    if (activeRange) {
      await removeRange(provider.id, activeRange.id);
    }
    setDeleteRangeOpen(false);
    setActiveRange(null);
  };

  const handleBulkEnable = async () => {
    if (selection.ids.size > 0) {
      await bulkToggle(provider.id, { range_ids: Array.from(selection.ids) as string[], enabled: true });
      setSelection({ type: 'include', ids: new Set() });
    }
  };

  const handleBulkDisable = async () => {
    if (selection.ids.size > 0) {
      await bulkToggle(provider.id, { range_ids: Array.from(selection.ids) as string[], enabled: false });
      setSelection({ type: 'include', ids: new Set() });
    }
  };

  const handleEnableAll = async () => {
    const allIds = providerRanges.map((r) => r.id);
    await bulkToggle(provider.id, { range_ids: allIds, enabled: true });
  };

  const handleDisableAll = async () => {
    const allIds = providerRanges.map((r) => r.id);
    await bulkToggle(provider.id, { range_ids: allIds, enabled: false });
  };

  const handleToggleEnabled = async (range: ProviderRange) => {
    await editRange(provider.id, range.id, { enabled: !range.enabled });
  };

  const handleEditProviderSave = async (data: { name: string; description: string; sni: string; ip_range_urls: string[] }) => {
    await updateProvider(provider.id, {
      name: data.name,
      description: data.description,
      sni: data.sni,
      ip_range_urls: data.ip_range_urls,
    });
    setEditProviderOpen(false);
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
              setEditRangeOpen(true);
            }}><EditIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={(e) => {
              e.stopPropagation();
              setActiveRange(params.row as ProviderRange);
              setDeleteRangeOpen(true);
            }}><DeleteIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Provider header */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h5">{provider.name}</Typography>
            {provider.is_builtin && (
              <Chip label="Built-in" size="small" color="info" variant="outlined" icon={<LockIcon />} />
            )}
            <Tooltip title="Edit provider">
              <IconButton size="small" onClick={() => setEditProviderOpen(true)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          {provider.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{provider.description}</Typography>
          )}
          <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>SNI:</strong> {provider.sni}
            </Typography>
            {parsedUrls.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                <strong>Source URLs:</strong> {parsedUrls.length}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              <strong>Format:</strong> {provider.response_format === 'json' ? 'JSON' : 'Plain text'}
            </Typography>
          </Stack>
        </Box>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {/* Settings card */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
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
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Button variant="contained" size="small" startIcon={<CloudDownloadIcon />}
          onClick={handleFetchFromSource} disabled={rangesLoading || parsedUrls.length === 0}>
          Fetch from Source
        </Button>
        <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          Add Custom Range
        </Button>
        <Button size="small" onClick={handleEnableAll} disabled={totalRanges === 0}>
          Enable All
        </Button>
        <Button size="small" onClick={handleDisableAll} disabled={totalRanges === 0}>
          Disable All
        </Button>
        {selection.ids.size > 0 && (
          <>
            <Button size="small" variant="outlined" color="success" onClick={handleBulkEnable}>
              Enable Selected ({selection.ids.size})
            </Button>
            <Button size="small" variant="outlined" color="warning" onClick={handleBulkDisable}>
              Disable Selected ({selection.ids.size})
            </Button>
          </>
        )}
        <IconButton onClick={loadData} disabled={rangesLoading} size="small">
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
      <ProviderDialog open={editProviderOpen}
        onClose={() => setEditProviderOpen(false)}
        onSave={handleEditProviderSave}
        title="Edit Provider"
        initial={{
          name: provider.name,
          description: provider.description,
          sni: provider.sni,
          ip_range_urls: parsedUrls,
        }} />
      <RangeDialog open={addOpen} onClose={() => setAddOpen(false)}
        onSave={handleAddRange} title="Add Custom Range" />
      <RangeDialog open={editRangeOpen} onClose={() => { setEditRangeOpen(false); setActiveRange(null); }}
        onSave={handleEditRange} title="Edit Range"
        initial={activeRange ? { cidr: activeRange.cidr, enabled: activeRange.enabled } : undefined} />
      <DeleteRangeDialog open={deleteRangeOpen} cidr={activeRange?.cidr ?? ''}
        onClose={() => { setDeleteRangeOpen(false); setActiveRange(null); }}
        onConfirm={handleDeleteRange} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Provider list panel (left side)
// ---------------------------------------------------------------------------

interface ProviderListPanelProps {
  providers: Provider[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (provider: Provider) => void;
  ranges: Record<string, ProviderRange[]>;
}

function ProviderListPanel({ providers, selectedId, onSelect, onAdd, onDelete, ranges }: ProviderListPanelProps) {
  return (
    <Paper variant="outlined" sx={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={600}>Providers</Typography>
        <Tooltip title="Add provider">
          <IconButton size="small" onClick={onAdd}>
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Stack>
      <Divider />
      <List dense sx={{ flex: 1, overflow: 'auto', py: 0 }}>
        {providers.map((p) => {
          const pRanges = ranges[p.id] ?? [];
          const enabledCount = pRanges.filter((r) => r.enabled).length;
          return (
            <ListItemButton
              key={p.id}
              selected={p.id === selectedId}
              onClick={() => onSelect(p.id)}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <DnsIcon fontSize="small" color={p.id === selectedId ? 'primary' : 'action'} />
              </ListItemIcon>
              <ListItemText
                primary={p.name}
                secondary={pRanges.length > 0 ? `${enabledCount}/${pRanges.length} ranges` : undefined}
                primaryTypographyProps={{ noWrap: true }}
              />
              {!p.is_builtin && (
                <Tooltip title="Delete provider">
                  <IconButton size="small" edge="end" color="error"
                    onClick={(e) => { e.stopPropagation(); onDelete(p); }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </ListItemButton>
          );
        })}
        {providers.length === 0 && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No providers yet</Typography>
          </Box>
        )}
      </List>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProvidersPage() {
  const {
    providers, selectedProviderId, isLoading, error, ranges,
    fetchProviders, selectProvider, createProvider, deleteProvider,
  } = useProviderStore();

  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? null;

  const handleAddProvider = async (data: { name: string; description: string; sni: string; ip_range_urls: string[] }) => {
    await createProvider({
      name: data.name,
      description: data.description || undefined,
      sni: data.sni,
      ip_range_urls: data.ip_range_urls,
    });
    setAddProviderOpen(false);
  };

  const handleDeleteProvider = async () => {
    if (deleteTarget) {
      await deleteProvider(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>Providers</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {isLoading ? (
        <Typography>Loading providers...</Typography>
      ) : (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', minHeight: 400 }}>
          <ProviderListPanel
            providers={providers}
            selectedId={selectedProviderId}
            onSelect={selectProvider}
            onAdd={() => setAddProviderOpen(true)}
            onDelete={(p) => setDeleteTarget(p)}
            ranges={ranges}
          />

          {selectedProvider ? (
            <ProviderDetail provider={selectedProvider} />
          ) : (
            <Paper variant="outlined"
              sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
              <Typography color="text.secondary">
                {providers.length > 0 ? 'Select a provider' : 'Add a provider to get started'}
              </Typography>
            </Paper>
          )}
        </Stack>
      )}

      {/* Dialogs */}
      <ProviderDialog open={addProviderOpen} onClose={() => setAddProviderOpen(false)}
        onSave={handleAddProvider} title="Add Provider" />
      <DeleteProviderDialog open={!!deleteTarget} provider={deleteTarget}
        onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteProvider} />
    </Box>
  );
}
