import React, { useEffect, useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
} from 'react-native';
import {
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  List,
  Menu,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useScanStore } from '../stores/scanStore';
import { useProviderStore } from '../stores/providerStore';
import { useScanPreferencesStore } from '../stores/scanPreferencesStore';
import { useAuthStore } from '../stores/authStore';
import { statusColors } from '../theme';
import type { Scan, ScanStatus } from '../types';
import type { ScansStackParamList } from '../App';

type Props = NativeStackScreenProps<ScansStackParamList, 'ScansList'>;

export default function ScansScreen({ navigation }: Props) {
  const { rootAvailable } = useAuthStore();
  const {
    scans,
    scansTotal,
    scansPage,
    scansPageSize,
    isScansLoading,
    isStarting,
    error,
    fetchScans,
    startScan,
    setScansPagination,
  } = useScanStore();
  const { providers, fetchProviders, ranges, fetchRanges } = useProviderStore();
  const prefs = useScanPreferencesStore();

  const [providerMenuVisible, setProviderMenuVisible] = useState(false);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    fetchScans();
  }, [scansPage, scansPageSize, fetchScans]);

  useEffect(() => {
    if (prefs.selectedProvider) fetchRanges(prefs.selectedProvider);
  }, [prefs.selectedProvider, fetchRanges]);

  // Range summary
  const providerRanges = ranges[prefs.selectedProvider] ?? [];
  const enabledRanges = providerRanges.filter((r) => r.enabled);
  const enabledIps = enabledRanges.reduce((sum, r) => sum + r.ip_count, 0);
  const totalIps = providerRanges.reduce((sum, r) => sum + r.ip_count, 0);

  const selectedProviderName =
    providers.find((p) => p.id === prefs.selectedProvider)?.name ??
    prefs.selectedProvider;

  const handleStartScan = async () => {
    const parsedRanges = prefs.ipRanges
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const scan = await startScan({
      provider: prefs.selectedProvider,
      extended: prefs.extended,
      concurrency: prefs.concurrency,
      timeout_ms: prefs.timeoutMs,
      port: prefs.port,
      ...(prefs.extended && {
        samples: prefs.samples,
        extended_concurrency: prefs.extendedConcurrency,
        extended_timeout_ms: prefs.extendedTimeoutMs,
        packet_loss_probes: prefs.packetLossProbes,
      }),
      ...(parsedRanges.length > 0 && { ip_ranges: parsedRanges }),
    });

    if (scan) {
      navigation.navigate('ScanDetail', { scanId: scan.id });
    }
  };

  const handleRefresh = useCallback(() => {
    fetchScans();
  }, [fetchScans]);

  const handleLoadMore = () => {
    const totalPages = Math.ceil(scansTotal / scansPageSize);
    if (scansPage + 1 < totalPages) {
      setScansPagination(scansPage + 1, scansPageSize);
    }
  };

  const renderScanItem = ({ item }: { item: Scan }) => (
    <Card
      style={styles.scanCard}
      onPress={() => navigation.navigate('ScanDetail', { scanId: item.id })}
    >
      <Card.Content>
        <View style={styles.scanHeader}>
          <Text variant="titleSmall">{item.provider}</Text>
          <Chip
            compact
            style={{
              backgroundColor: statusColors[item.status as ScanStatus] + '33',
            }}
            textStyle={{ color: statusColors[item.status as ScanStatus], fontSize: 12 }}
          >
            {item.status}
          </Chip>
        </View>
        <View style={styles.scanMeta}>
          <Text variant="bodySmall" style={styles.dimText}>
            {item.scanned_ips}/{item.total_ips} IPs
          </Text>
          {item.working_ips > 0 && (
            <Text variant="bodySmall" style={styles.dimText}>
              {item.working_ips} working
            </Text>
          )}
          <Chip compact mode="outlined" style={styles.modeChip}>
            <Text variant="labelSmall">{item.mode}</Text>
          </Chip>
        </View>
        <Text variant="bodySmall" style={styles.dimText}>
          {item.created_at}
        </Text>
      </Card.Content>
    </Card>
  );

  const headerComponent = (
    <View>
      {/* Root warning */}
      <Banner
        visible={!rootAvailable}
        icon="alert"
        actions={[]}
        style={styles.banner}
      >
        Root access unavailable. Scanning may be limited.
      </Banner>

      {/* Controls */}
      <Card style={styles.controlsCard}>
        <Card.Content>
          {/* Provider selector */}
          <View style={styles.row}>
            <Menu
              visible={providerMenuVisible}
              onDismiss={() => setProviderMenuVisible(false)}
              anchor={
                <Button
                  mode="outlined"
                  onPress={() => setProviderMenuVisible(true)}
                  icon="dns"
                  style={styles.providerButton}
                >
                  {selectedProviderName}
                </Button>
              }
            >
              {providers.map((p) => (
                <Menu.Item
                  key={p.id}
                  onPress={() => {
                    prefs.setSelectedProvider(p.id);
                    setProviderMenuVisible(false);
                  }}
                  title={p.name}
                />
              ))}
            </Menu>
          </View>

          {/* Extended toggle + Start button */}
          <View style={styles.row}>
            <View style={styles.switchRow}>
              <Text variant="bodyMedium">Extended</Text>
              <Switch
                value={prefs.extended}
                onValueChange={prefs.setExtended}
              />
            </View>
            <Button
              mode="contained"
              icon="play"
              onPress={handleStartScan}
              loading={isStarting}
              disabled={isStarting}
            >
              Start Scan
            </Button>
          </View>

          {/* Advanced settings */}
          <List.Accordion
            title="Advanced Settings"
            left={(aProps) => <List.Icon {...aProps} icon="cog" />}
            expanded={prefs.showAdvanced}
            onPress={() => prefs.setShowAdvanced(!prefs.showAdvanced)}
          >
            <View style={styles.advancedGrid}>
              <TextInput
                label="Concurrency"
                keyboardType="numeric"
                value={String(prefs.concurrency)}
                onChangeText={(v) => prefs.setConcurrency(Number(v) || 0)}
                style={styles.smallInput}
                dense
              />
              <TextInput
                label="Timeout (ms)"
                keyboardType="numeric"
                value={String(prefs.timeoutMs)}
                onChangeText={(v) => prefs.setTimeoutMs(Number(v) || 0)}
                style={styles.smallInput}
                dense
              />
              <TextInput
                label="Port"
                keyboardType="numeric"
                value={String(prefs.port)}
                onChangeText={(v) => prefs.setPort(Number(v) || 0)}
                style={styles.smallInput}
                dense
              />
            </View>

            {prefs.extended && (
              <>
                <Divider style={styles.divider} />
                <Text
                  variant="labelSmall"
                  style={[styles.dimText, { marginBottom: 8 }]}
                >
                  Extended Settings
                </Text>
                <View style={styles.advancedGrid}>
                  <TextInput
                    label="Samples"
                    keyboardType="numeric"
                    value={String(prefs.samples)}
                    onChangeText={(v) => prefs.setSamples(Number(v) || 0)}
                    style={styles.smallInput}
                    dense
                  />
                  <TextInput
                    label="Ext. Concurrency"
                    keyboardType="numeric"
                    value={String(prefs.extendedConcurrency)}
                    onChangeText={(v) =>
                      prefs.setExtendedConcurrency(Number(v) || 0)
                    }
                    style={styles.smallInput}
                    dense
                  />
                  <TextInput
                    label="Ext. Timeout (ms)"
                    keyboardType="numeric"
                    value={String(prefs.extendedTimeoutMs)}
                    onChangeText={(v) =>
                      prefs.setExtendedTimeoutMs(Number(v) || 0)
                    }
                    style={styles.smallInput}
                    dense
                  />
                  <TextInput
                    label="Loss Probes"
                    keyboardType="numeric"
                    value={String(prefs.packetLossProbes)}
                    onChangeText={(v) =>
                      prefs.setPacketLossProbes(Number(v) || 0)
                    }
                    style={styles.smallInput}
                    dense
                  />
                </View>
              </>
            )}

            <TextInput
              label="Custom IP Ranges (CIDR)"
              multiline
              numberOfLines={3}
              value={prefs.ipRanges}
              onChangeText={prefs.setIpRanges}
              placeholder={'1.0.0.0/24\n1.1.1.0/24'}
              style={styles.ipRangesInput}
              dense
            />
          </List.Accordion>
        </Card.Content>
      </Card>

      {/* Range summary */}
      {providerRanges.length > 0 && (
        <Card style={styles.summaryCard} mode="outlined">
          <Card.Content style={styles.summaryContent}>
            <Text variant="bodySmall">
              {enabledRanges.length}/{providerRanges.length} ranges enabled (
              {enabledIps.toLocaleString()} / {totalIps.toLocaleString()} IPs)
            </Text>
          </Card.Content>
        </Card>
      )}

      {error && (
        <Text variant="bodyMedium" style={styles.errorText}>
          {error}
        </Text>
      )}

      <Text variant="titleLarge" style={styles.sectionTitle}>
        Recent Scans
      </Text>
    </View>
  );

  return (
    <FlatList
      data={scans}
      keyExtractor={(item) => item.id}
      renderItem={renderScanItem}
      ListHeaderComponent={headerComponent}
      ListEmptyComponent={
        !isScansLoading ? (
          <Text style={styles.emptyText}>
            No scans yet. Start one above!
          </Text>
        ) : null
      }
      ListFooterComponent={
        scans.length < scansTotal ? (
          <Button onPress={handleLoadMore} style={styles.loadMore}>
            Load More
          </Button>
        ) : null
      }
      refreshControl={
        <RefreshControl
          refreshing={isScansLoading}
          onRefresh={handleRefresh}
          tintColor="#90caf9"
          colors={['#90caf9']}
        />
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 12,
    paddingBottom: 24,
  },
  banner: {
    marginBottom: 8,
  },
  controlsCard: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  providerButton: {
    minWidth: 140,
  },
  advancedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  smallInput: {
    flex: 1,
    minWidth: 100,
  },
  divider: {
    marginVertical: 8,
  },
  ipRangesInput: {
    marginTop: 8,
  },
  summaryCard: {
    marginBottom: 8,
  },
  summaryContent: {
    paddingVertical: 8,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 8,
  },
  scanCard: {
    marginBottom: 8,
  },
  scanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  scanMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  modeChip: {
    height: 24,
  },
  dimText: {
    color: '#9e9e9e',
  },
  errorText: {
    color: '#ef5350',
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9e9e9e',
    marginTop: 24,
  },
  loadMore: {
    marginTop: 8,
  },
});
