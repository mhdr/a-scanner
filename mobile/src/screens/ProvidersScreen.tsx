import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
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
  Icon,
  IconButton,
  Portal,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';
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
    <View style={[styles.rangeItem, !item.enabled && styles.rangeItemDisabled]}>
      <Checkbox
        status={item.enabled ? 'checked' : 'unchecked'}
        onPress={() => handleToggleRange(item)}
      />
      <View style={styles.rangeInfo}>
        <Text
          variant="bodyMedium"
          style={[styles.monospace, !item.enabled && styles.dimText]}
        >
          {item.cidr}
        </Text>
        <Text variant="bodySmall" style={styles.dimText}>
          {item.ip_count.toLocaleString()} IPs
          {item.is_custom && (
            <Text style={styles.customBadge}> · Custom</Text>
          )}
        </Text>
      </View>
      <IconButton
        icon="pencil-outline"
        size={16}
        onPress={() => {
          setActiveRange(item);
          setEditRangeOpen(true);
        }}
      />
      <IconButton
        icon="delete-outline"
        size={16}
        iconColor="#ef5350"
        onPress={() => {
          setActiveRange(item);
          setDeleteRangeOpen(true);
        }}
      />
    </View>
  );

  return (
    <View style={styles.flex1}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Provider info card */}
      <Card style={styles.detailInfoCard} mode="contained">
        <Card.Content>
          <View style={styles.titleRow}>
            <View style={styles.titleLeft}>
              <Icon source="dns" size={22} color="#90caf9" />
              <Text variant="titleMedium" style={styles.titleText}>
                {provider.name}
              </Text>
            </View>
            <View style={styles.titleRight}>
              {provider.is_builtin && (
                <Chip compact icon="lock" style={styles.builtinChip} textStyle={styles.builtinChipText}>
                  Built-in
                </Chip>
              )}
              <IconButton
                icon="pencil"
                size={18}
                onPress={() => setEditProviderOpen(true)}
              />
            </View>
          </View>
          {provider.description ? (
            <Text variant="bodySmall" style={styles.descText}>
              {provider.description}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Icon source="web" size={14} color="#9e9e9e" />
              <Text variant="bodySmall" style={styles.dimText}>
                {provider.sni}
              </Text>
            </View>
            {parsedUrls.length > 0 && (
              <View style={styles.metaItem}>
                <Icon source="link" size={14} color="#9e9e9e" />
                <Text variant="bodySmall" style={styles.dimText}>
                  {parsedUrls.length} source{parsedUrls.length > 1 ? 's' : ''}
                </Text>
              </View>
            )}
            <View style={styles.metaItem}>
              <Icon source="file-document-outline" size={14} color="#9e9e9e" />
              <Text variant="bodySmall" style={styles.dimText}>
                {provider.response_format === 'json' ? 'JSON' : 'Plain'}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Settings card */}
      <Card style={styles.detailSettingsCard} mode="outlined">
        <Card.Content>
          <View style={styles.settingHeader}>
            <Icon source="cog" size={16} color="#90caf9" />
            <Text variant="labelSmall" style={styles.sectionLabel}>
              SETTINGS
            </Text>
          </View>
          <View style={styles.settingRow}>
            <Text variant="bodyMedium">Auto-update ranges</Text>
            <Switch
              value={providerSettings?.auto_update ?? false}
              onValueChange={(v) => saveSettings(provider.id, { auto_update: v })}
            />
          </View>
          {providerSettings?.auto_update && (
            <View style={styles.settingRow}>
              <Text variant="bodyMedium">Interval (hours)</Text>
              <TextInput
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
                contentStyle={styles.intervalInputContent}
              />
            </View>
          )}
          <Text variant="bodySmall" style={styles.lastFetchedText}>
            Last fetched:{' '}
            {providerSettings?.last_fetched_at
              ? new Date(providerSettings.last_fetched_at).toLocaleString()
              : 'Never'}
          </Text>
        </Card.Content>
      </Card>

      {/* Ranges header with actions */}
      <View style={styles.rangesHeader}>
        <View style={styles.rangesHeaderLeft}>
          <Text variant="labelSmall" style={styles.sectionLabel}>
            IP RANGES
          </Text>
          {totalRanges > 0 && (
            <Text variant="bodySmall" style={styles.dimText}>
              {enabledRanges.length}/{totalRanges} enabled · {enabledIps.toLocaleString()} IPs
            </Text>
          )}
        </View>
        <View style={styles.rangesHeaderActions}>
          <IconButton
            icon="cloud-download"
            size={20}
            onPress={handleFetchFromSource}
            disabled={rangesLoading || parsedUrls.length === 0}
          />
          <IconButton
            icon="plus"
            size={20}
            onPress={() => setAddOpen(true)}
          />
          <IconButton
            icon="refresh"
            size={20}
            onPress={loadData}
            disabled={rangesLoading}
          />
        </View>
      </View>

      {/* Bulk toggle row */}
      {totalRanges > 0 && (
        <View style={styles.bulkRow}>
          <TouchableOpacity onPress={handleEnableAll} style={styles.bulkButton}>
            <Icon source="checkbox-multiple-marked" size={16} color="#66bb6a" />
            <Text variant="labelSmall" style={styles.bulkButtonText}>Enable All</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDisableAll} style={styles.bulkButton}>
            <Icon source="checkbox-multiple-blank-outline" size={16} color="#9e9e9e" />
            <Text variant="labelSmall" style={styles.bulkButtonTextDim}>Disable All</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Ranges list */}
      <FlatList
        data={providerRanges}
        keyExtractor={(item) => item.id}
        renderItem={renderRangeItem}
        ListEmptyComponent={
          !rangesLoading ? (
            <View style={styles.emptyContainer}>
              <Icon source="ip-network-outline" size={48} color="#555" />
              <Text style={styles.emptyText}>No ranges yet</Text>
              <Text variant="bodySmall" style={styles.dimText}>
                Fetch from source or add manually
              </Text>
            </View>
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
          const totalIps = pRanges.reduce((sum, r) => sum + r.ip_count, 0);
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => selectProvider(item.id)}
              style={styles.providerCard}
            >
              <View style={styles.providerCardInner}>
                <View style={styles.providerCardIcon}>
                  <Icon source="dns" size={24} color="#90caf9" />
                </View>
                <View style={styles.providerCardContent}>
                  <View style={styles.providerCardTitleRow}>
                    <Text variant="titleSmall">{item.name}</Text>
                    {item.is_builtin && (
                      <Chip compact icon="lock" style={styles.builtinChip} textStyle={styles.builtinChipText}>
                        Built-in
                      </Chip>
                    )}
                  </View>
                  <Text variant="bodySmall" style={styles.dimText}>
                    SNI: {item.sni}
                  </Text>
                  {pRanges.length > 0 && (
                    <View style={styles.providerCardStats}>
                      <View style={styles.statItem}>
                        <Icon source="ip-network-outline" size={12} color="#9e9e9e" />
                        <Text variant="bodySmall" style={styles.dimText}>
                          {enabledCount}/{pRanges.length} ranges
                        </Text>
                      </View>
                      <View style={styles.statItem}>
                        <Icon source="server-network" size={12} color="#9e9e9e" />
                        <Text variant="bodySmall" style={styles.dimText}>
                          {totalIps.toLocaleString()} IPs
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
                <View style={styles.providerCardRight}>
                  {!item.is_builtin && (
                    <IconButton
                      icon="delete-outline"
                      iconColor="#ef5350"
                      size={20}
                      onPress={() => setDeleteTarget(item)}
                    />
                  )}
                  <Icon source="chevron-right" size={20} color="#555" />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Icon source="dns" size={48} color="#555" />
              <Text style={styles.emptyText}>No providers yet</Text>
              <Text variant="bodySmall" style={styles.dimText}>
                Tap + to add one
              </Text>
            </View>
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
    padding: 12,
    paddingBottom: 80,
    gap: 8,
  },
  // ── Provider list card ──
  providerCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    overflow: 'hidden',
  },
  providerCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  providerCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a2740',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerCardContent: {
    flex: 1,
    gap: 2,
  },
  providerCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  providerCardStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  providerCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // ── Detail view ──
  detailInfoCard: {
    margin: 12,
    marginBottom: 8,
    backgroundColor: '#1e1e1e',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  titleRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleText: {
    flex: 1,
  },
  descText: {
    color: '#bbb',
    marginTop: 4,
    marginLeft: 30,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    marginLeft: 30,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  builtinChip: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#90caf9',
  },
  builtinChipText: {
    fontSize: 10,
    color: '#90caf9',
  },
  // ── Settings card ──
  detailSettingsCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderColor: '#333',
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionLabel: {
    color: '#90caf9',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  intervalInput: {
    width: 80,
    height: 36,
    textAlign: 'center',
  },
  intervalInputContent: {
    paddingHorizontal: 8,
  },
  lastFetchedText: {
    color: '#777',
    marginTop: 6,
  },
  // ── Ranges header ──
  rangesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  rangesHeaderLeft: {
    gap: 2,
  },
  rangesHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulkRow: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  bulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  bulkButtonText: {
    color: '#66bb6a',
  },
  bulkButtonTextDim: {
    color: '#9e9e9e',
  },
  // ── Range item ──
  rangeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingRight: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  rangeItemDisabled: {
    opacity: 0.5,
  },
  rangeInfo: {
    flex: 1,
    marginLeft: 2,
  },
  customBadge: {
    color: '#ce93d8',
  },
  monospace: {
    fontFamily: 'monospace',
  },
  rangesList: {
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  // ── Common ──
  dimText: {
    color: '#9e9e9e',
  },
  errorText: {
    color: '#ef5350',
    padding: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 48,
    gap: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9e9e9e',
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  fieldError: {
    color: '#ef5350',
    fontSize: 12,
    marginBottom: 4,
    marginLeft: 4,
  },
});
