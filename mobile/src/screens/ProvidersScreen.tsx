import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  ScrollView,
  RefreshControl,
} from 'react-native';
import {
  Appbar,
  Button,
  Card,
  Checkbox,
  Chip,
  Dialog,
  Divider,
  FAB,
  IconButton,
  List,
  Portal,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useProviderStore } from '../stores/providerStore';
import type {
  Provider,
  ProviderRange,
} from '../types';

// ─────────────────────────────────────────
// Provider Add / Edit Dialog
// ─────────────────────────────────────────

interface ProviderDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onSave: (data: {
    name: string;
    description: string;
    sni: string;
    ip_range_urls: string[];
  }) => void;
  initial?: {
    name: string;
    description: string;
    sni: string;
    ip_range_urls: string[];
  };
  title: string;
}

function ProviderDialog({
  visible,
  onDismiss,
  onSave,
  initial,
  title,
}: ProviderDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sni, setSni] = useState('');
  const [urlsText, setUrlsText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setSni(initial?.sni ?? '');
      setUrlsText(initial?.ip_range_urls?.join('\n') ?? '');
      setErrors({});
    }
  }, [visible, initial]);

  const handleSave = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!sni.trim()) e.sni = 'SNI hostname is required';
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    const urls = urlsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    onSave({
      name: name.trim(),
      description: description.trim(),
      sni: sni.trim(),
      ip_range_urls: urls,
    });
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView style={styles.dialogScroll}>
            <TextInput
              label="Name"
              value={name}
              onChangeText={(v) => {
                setName(v);
                setErrors((p) => ({ ...p, name: '' }));
              }}
              error={!!errors.name}
              mode="outlined"
              style={styles.input}
            />
            {errors.name ? (
              <Text style={styles.fieldError}>{errors.name}</Text>
            ) : null}

            <TextInput
              label="Description"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              style={styles.input}
            />

            <TextInput
              label="SNI Hostname"
              placeholder="e.g. cloudflare.com"
              value={sni}
              onChangeText={(v) => {
                setSni(v);
                setErrors((p) => ({ ...p, sni: '' }));
              }}
              error={!!errors.sni}
              mode="outlined"
              style={styles.input}
            />
            {errors.sni ? (
              <Text style={styles.fieldError}>{errors.sni}</Text>
            ) : null}

            <TextInput
              label="IP Range URLs (one per line)"
              value={urlsText}
              onChangeText={setUrlsText}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.input}
            />
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button mode="contained" onPress={handleSave}>
            Save
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

// ─────────────────────────────────────────
// Range Add / Edit Dialog
// ─────────────────────────────────────────

interface RangeDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onSave: (cidr: string, enabled: boolean) => void;
  initial?: { cidr: string; enabled: boolean };
  title: string;
}

function RangeDialog({
  visible,
  onDismiss,
  onSave,
  initial,
  title,
}: RangeDialogProps) {
  const [cidr, setCidr] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setCidr(initial?.cidr ?? '');
      setEnabled(initial?.enabled ?? true);
      setError('');
    }
  }, [visible, initial]);

  const handleSave = () => {
    const trimmed = cidr.trim();
    if (!trimmed) {
      setError('CIDR is required');
      return;
    }
    if (!/^[\d.:a-fA-F]+\/\d{1,3}$/.test(trimmed)) {
      setError('Invalid CIDR format');
      return;
    }
    onSave(trimmed, enabled);
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            label="CIDR"
            placeholder="e.g. 104.16.0.0/13"
            value={cidr}
            onChangeText={(v) => {
              setCidr(v);
              setError('');
            }}
            error={!!error}
            mode="outlined"
            style={styles.input}
          />
          {error ? <Text style={styles.fieldError}>{error}</Text> : null}

          <View style={styles.switchRow}>
            <Text>Enabled</Text>
            <Switch value={enabled} onValueChange={setEnabled} />
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button mode="contained" onPress={handleSave}>
            Save
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

// ─────────────────────────────────────────
// Confirm Delete Dialog
// ─────────────────────────────────────────

function ConfirmDialog({
  visible,
  title,
  message,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <Text>{message}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button
            mode="contained"
            buttonColor="#ef5350"
            textColor="#fff"
            onPress={onConfirm}
          >
            Delete
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

// ─────────────────────────────────────────
// Provider Detail (shown when a provider is selected)
// ─────────────────────────────────────────

function ProviderDetail({ provider }: { provider: Provider }) {
  const {
    ranges,
    rangesLoading,
    settings,
    settingsLoading,
    error,
    fetchRanges,
    triggerFetchFromSource,
    addRange,
    editRange,
    removeRange,
    bulkToggle,
    fetchSettings,
    saveSettings,
    updateProvider,
  } = useProviderStore();

  const providerRanges = ranges[provider.id] ?? [];
  const providerSettings = settings[provider.id];

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

  // Derived stats
  const totalRanges = providerRanges.length;
  const enabledRanges = providerRanges.filter((r) => r.enabled);
  const totalIps = providerRanges.reduce((sum, r) => sum + r.ip_count, 0);
  const enabledIps = enabledRanges.reduce((sum, r) => sum + r.ip_count, 0);

  const parsedUrls: string[] = (() => {
    try {
      return JSON.parse(provider.ip_range_urls);
    } catch {
      return [];
    }
  })();

  const handleFetchFromSource = () => triggerFetchFromSource(provider.id);
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
  const handleEnableAll = () => {
    const allIds = providerRanges.map((r) => r.id);
    bulkToggle(provider.id, { range_ids: allIds, enabled: true });
  };
  const handleDisableAll = () => {
    const allIds = providerRanges.map((r) => r.id);
    bulkToggle(provider.id, { range_ids: allIds, enabled: false });
  };
  const handleToggleRange = (range: ProviderRange) => {
    editRange(provider.id, range.id, { enabled: !range.enabled });
  };

  const handleEditProviderSave = async (data: {
    name: string;
    description: string;
    sni: string;
    ip_range_urls: string[];
  }) => {
    await updateProvider(provider.id, {
      name: data.name,
      description: data.description,
      sni: data.sni,
      ip_range_urls: data.ip_range_urls,
    });
    setEditProviderOpen(false);
  };

  const renderRangeItem = ({ item }: { item: ProviderRange }) => (
    <Card style={styles.rangeCard}>
      <Card.Content style={styles.rangeContent}>
        <View style={styles.rangeLeft}>
          <Checkbox
            status={item.enabled ? 'checked' : 'unchecked'}
            onPress={() => handleToggleRange(item)}
          />
          <View style={styles.rangeInfo}>
            <Text variant="bodyMedium" style={styles.monospace}>
              {item.cidr}
            </Text>
            <Text variant="bodySmall" style={styles.dimText}>
              {item.ip_count.toLocaleString()} IPs
              {item.is_custom ? ' · Custom' : ' · Auto'}
            </Text>
          </View>
        </View>
        <View style={styles.rangeActions}>
          <IconButton
            icon="pencil"
            size={18}
            onPress={() => {
              setActiveRange(item);
              setEditRangeOpen(true);
            }}
          />
          <IconButton
            icon="delete"
            size={18}
            iconColor="#ef5350"
            onPress={() => {
              setActiveRange(item);
              setDeleteRangeOpen(true);
            }}
          />
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.flex1}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Provider header */}
      <View style={styles.providerHeader}>
        <View style={styles.titleRow}>
          <Text variant="titleLarge">{provider.name}</Text>
          {provider.is_builtin && (
            <Chip compact icon="lock" style={styles.builtinChip}>
              Built-in
            </Chip>
          )}
          <IconButton
            icon="pencil"
            size={18}
            onPress={() => setEditProviderOpen(true)}
          />
        </View>
        {provider.description ? (
          <Text variant="bodySmall" style={styles.dimText}>
            {provider.description}
          </Text>
        ) : null}
        <Text variant="bodySmall" style={styles.dimText}>
          SNI: {provider.sni}
          {parsedUrls.length > 0 && ` | ${parsedUrls.length} source URLs`}
          {` | Format: ${provider.response_format === 'json' ? 'JSON' : 'Plain'}`}
        </Text>
      </View>

      <Divider />

      {/* Settings section */}
      <View style={styles.settingsRow}>
        <View style={styles.switchRow}>
          <Text variant="bodyMedium">Auto-update</Text>
          <Switch
            value={providerSettings?.auto_update ?? false}
            onValueChange={(v) => saveSettings(provider.id, { auto_update: v })}
          />
        </View>
        {providerSettings?.auto_update && (
          <TextInput
            label="Interval (hours)"
            keyboardType="numeric"
            value={String(providerSettings?.auto_update_interval_hours ?? 24)}
            onChangeText={(v) =>
              saveSettings(provider.id, {
                auto_update_interval_hours: Number(v) || 24,
              })
            }
            mode="outlined"
            dense
            style={styles.intervalInput}
          />
        )}
        <Text variant="bodySmall" style={styles.dimText}>
          Last fetched:{' '}
          {providerSettings?.last_fetched_at
            ? new Date(providerSettings.last_fetched_at).toLocaleString()
            : 'Never'}
        </Text>
      </View>

      <Divider />

      {/* Action buttons */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionBar}>
        <Button
          icon="cloud-download"
          mode="contained"
          compact
          onPress={handleFetchFromSource}
          disabled={rangesLoading || parsedUrls.length === 0}
          style={styles.actionButton}
        >
          Fetch
        </Button>
        <Button
          icon="plus"
          mode="outlined"
          compact
          onPress={() => setAddOpen(true)}
          style={styles.actionButton}
        >
          Add
        </Button>
        <Button
          compact
          onPress={handleEnableAll}
          disabled={totalRanges === 0}
          style={styles.actionButton}
        >
          Enable All
        </Button>
        <Button
          compact
          onPress={handleDisableAll}
          disabled={totalRanges === 0}
          style={styles.actionButton}
        >
          Disable All
        </Button>
        <IconButton icon="refresh" onPress={loadData} disabled={rangesLoading} />
      </ScrollView>

      {/* Summary */}
      {totalRanges > 0 && (
        <Text variant="bodySmall" style={[styles.dimText, styles.rangeSummary]}>
          {totalRanges} ranges · {enabledIps.toLocaleString()} /{' '}
          {totalIps.toLocaleString()} IPs enabled
        </Text>
      )}

      {/* Ranges list */}
      <FlatList
        data={providerRanges}
        keyExtractor={(item) => item.id}
        renderItem={renderRangeItem}
        ListEmptyComponent={
          !rangesLoading ? (
            <Text style={styles.emptyText}>No ranges. Fetch from source or add manually.</Text>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={rangesLoading || settingsLoading}
            onRefresh={loadData}
            tintColor="#90caf9"
            colors={['#90caf9']}
          />
        }
        contentContainerStyle={styles.rangesList}
      />

      {/* Dialogs */}
      <ProviderDialog
        visible={editProviderOpen}
        onDismiss={() => setEditProviderOpen(false)}
        onSave={handleEditProviderSave}
        title="Edit Provider"
        initial={{
          name: provider.name,
          description: provider.description,
          sni: provider.sni,
          ip_range_urls: parsedUrls,
        }}
      />
      <RangeDialog
        visible={addOpen}
        onDismiss={() => setAddOpen(false)}
        onSave={handleAddRange}
        title="Add Custom Range"
      />
      <RangeDialog
        visible={editRangeOpen}
        onDismiss={() => {
          setEditRangeOpen(false);
          setActiveRange(null);
        }}
        onSave={handleEditRange}
        title="Edit Range"
        initial={
          activeRange
            ? { cidr: activeRange.cidr, enabled: activeRange.enabled }
            : undefined
        }
      />
      <ConfirmDialog
        visible={deleteRangeOpen}
        title="Delete Range"
        message={`Are you sure you want to delete ${activeRange?.cidr ?? ''}?`}
        onDismiss={() => {
          setDeleteRangeOpen(false);
          setActiveRange(null);
        }}
        onConfirm={handleDeleteRange}
      />
    </View>
  );
}

// ─────────────────────────────────────────
// Main Providers Screen
// ─────────────────────────────────────────

export default function ProvidersScreen() {
  const {
    providers,
    selectedProviderId,
    isLoading,
    error,
    ranges,
    fetchProviders,
    selectProvider,
    createProvider,
    deleteProvider,
    fetchRanges,
  } = useProviderStore();

  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // Fetch ranges for each provider so list shows range counts
  useEffect(() => {
    providers.forEach((p) => {
      if (!ranges[p.id]) fetchRanges(p.id);
    });
  }, [providers, ranges, fetchRanges]);

  const selectedProvider =
    providers.find((p) => p.id === selectedProviderId) ?? null;

  const handleAddProvider = async (data: {
    name: string;
    description: string;
    sni: string;
    ip_range_urls: string[];
  }) => {
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

  // Mobile uses a master-detail pattern: list ↔ detail
  if (selectedProvider) {
    return (
      <View style={styles.container}>
        <Appbar.Header elevated>
          <Appbar.BackAction onPress={() => selectProvider(null)} />
          <Appbar.Content title={selectedProvider.name} />
        </Appbar.Header>
        <ProviderDetail provider={selectedProvider} />
      </View>
    );
  }

  // Provider list
  return (
    <View style={styles.container}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={providers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const pRanges = ranges[item.id] ?? [];
          const enabledCount = pRanges.filter((r) => r.enabled).length;
          return (
            <List.Item
              title={item.name}
              description={
                pRanges.length > 0
                  ? `${enabledCount}/${pRanges.length} ranges · SNI: ${item.sni}`
                  : `SNI: ${item.sni}`
              }
              left={(props) => <List.Icon {...props} icon="dns" />}
              right={() =>
                !item.is_builtin ? (
                  <IconButton
                    icon="delete"
                    iconColor="#ef5350"
                    size={20}
                    onPress={() => setDeleteTarget(item)}
                  />
                ) : (
                  <Chip compact icon="lock" style={styles.builtinChip}>
                    Built-in
                  </Chip>
                )
              }
              onPress={() => selectProvider(item.id)}
              style={styles.providerListItem}
            />
          );
        }}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.emptyText}>
              No providers yet. Tap + to add one.
            </Text>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchProviders}
            tintColor="#90caf9"
            colors={['#90caf9']}
          />
        }
        contentContainerStyle={styles.listContent}
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => setAddProviderOpen(true)}
      />

      {/* Dialogs */}
      <ProviderDialog
        visible={addProviderOpen}
        onDismiss={() => setAddProviderOpen(false)}
        onSave={handleAddProvider}
        title="Add Provider"
      />
      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete Provider"
        message={`Are you sure you want to delete ${deleteTarget?.name ?? ''} and all its ranges?`}
        onDismiss={() => setDeleteTarget(null)}
        onConfirm={handleDeleteProvider}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 80,
  },
  providerListItem: {
    paddingVertical: 4,
  },
  providerHeader: {
    padding: 12,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  builtinChip: {
    height: 28,
  },
  settingsRow: {
    padding: 12,
    gap: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  intervalInput: {
    width: 140,
  },
  actionBar: {
    flexGrow: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  actionButton: {
    marginHorizontal: 4,
  },
  rangeSummary: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  rangesList: {
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  rangeCard: {
    marginVertical: 3,
  },
  rangeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rangeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rangeInfo: {
    flex: 1,
    marginLeft: 4,
  },
  rangeActions: {
    flexDirection: 'row',
  },
  monospace: {
    fontFamily: 'monospace',
  },
  dimText: {
    color: '#9e9e9e',
  },
  errorText: {
    color: '#ef5350',
    padding: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9e9e9e',
    marginTop: 32,
    paddingHorizontal: 24,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  dialogScroll: {
    paddingHorizontal: 4,
  },
  input: {
    marginBottom: 8,
  },
  fieldError: {
    color: '#ef5350',
    fontSize: 12,
    marginBottom: 4,
    marginLeft: 4,
  },
});
