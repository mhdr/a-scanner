import React, { useEffect, useCallback } from 'react';
import { StyleSheet, View, FlatList, RefreshControl } from 'react-native';
import {
  Button,
  Card,
  Chip,
  ProgressBar,
  Text,
} from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useScanStore } from '../stores/scanStore';
import { useScanProgress } from '../hooks/useScanProgress';
import { statusColors } from '../theme';
import type { ScanResult, ScanStatus } from '../types';
import type { ScansStackParamList } from '../App';

type Props = NativeStackScreenProps<ScansStackParamList, 'ScanDetail'>;

const PHASE_LABELS: Record<string, string> = {
  pending: 'Waiting to start...',
  resolving: 'Resolving IP ranges...',
  phase1: 'Scanning IPs (Phase 1)...',
  phase1_done: 'Phase 1 complete',
  quick_verify: 'Quick-verifying reachable IPs...',
  quick_verify_done: 'Quick verify complete',
  phase2: 'Running extended tests (Phase 2)...',
  done: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
};

export default function ScanDetailScreen({ route, navigation }: Props) {
  const { scanId } = route.params;
  const {
    currentScan,
    currentPhase,
    extendedDone,
    extendedTotal,
    currentResults,
    resultsTotal,
    resultsPage,
    resultsPageSize,
    isResultsLoading,
    isStopping,
    error,
    fetchScan,
    fetchScanResults,
    setResultsPagination,
    stopScan,
  } = useScanStore();

  const refreshData = useCallback(() => {
    // Reset to first page on refresh so results start fresh
    setResultsPagination(0, resultsPageSize);
    fetchScan(scanId);
    fetchScanResults(scanId);
  }, [scanId, fetchScan, fetchScanResults, setResultsPagination, resultsPageSize]);

  // Initial fetch
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Fetch next page of results on "Load More" (skip page 0 — handled by refreshData)
  useEffect(() => {
    if (resultsPage > 0) {
      fetchScanResults(scanId);
    }
  }, [scanId, resultsPage, resultsPageSize, fetchScanResults]);

  // Real-time progress via polling
  const isActive =
    currentScan?.status === 'pending' || currentScan?.status === 'running';
  useScanProgress(scanId, isActive);

  // Progress calculations
  const phase1Progress =
    currentScan && currentScan.total_ips > 0
      ? currentScan.scanned_ips / currentScan.total_ips
      : 0;
  const phase2Progress =
    extendedTotal > 0 ? extendedDone / extendedTotal : 0;
  const isPhase2 = currentPhase === 'phase2';
  const isIndeterminate =
    (currentScan?.total_ips === 0 && currentScan?.status === 'running') ||
    currentPhase === 'resolving' ||
    currentPhase === 'quick_verify';
  const displayProgress = isPhase2 ? phase2Progress : phase1Progress;
  const phaseLabel = currentPhase
    ? (PHASE_LABELS[currentPhase] ?? currentPhase)
    : null;

  const handleLoadMore = () => {
    const totalPages = Math.ceil(resultsTotal / resultsPageSize);
    if (resultsPage + 1 < totalPages) {
      setResultsPagination(resultsPage + 1, resultsPageSize);
    }
  };

  const renderResultItem = ({ item }: { item: ScanResult }) => (
    <Card style={styles.resultCard}>
      <Card.Content>
        <View style={styles.resultRow}>
          <Text variant="bodyMedium" style={styles.ipText}>
            {item.ip}
          </Text>
          <Icon
            name={item.is_reachable ? 'check-circle' : 'close-circle'}
            size={20}
            color={item.is_reachable ? '#66bb6a' : '#ef5350'}
          />
        </View>
        <View style={styles.resultMeta}>
          {item.latency_ms != null && (
            <Text variant="bodySmall" style={styles.dimText}>
              TCP: {item.latency_ms}ms
            </Text>
          )}
          {item.tls_latency_ms != null && (
            <Text variant="bodySmall" style={styles.dimText}>
              TLS: {item.tls_latency_ms}ms
            </Text>
          )}
          {item.ttfb_ms != null && (
            <Text variant="bodySmall" style={styles.dimText}>
              TTFB: {item.ttfb_ms}ms
            </Text>
          )}
          {item.download_speed_kbps != null && (
            <Text variant="bodySmall" style={styles.dimText}>
              Speed: {item.download_speed_kbps.toFixed(1)} KB/s
            </Text>
          )}
          {item.score != null && (
            <Text variant="bodySmall" style={styles.dimText}>
              Score: {item.score.toFixed(0)}
            </Text>
          )}
        </View>
      </Card.Content>
    </Card>
  );

  const headerComponent = (
    <View>
      <Button
        icon="arrow-left"
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      >
        Back to Scans
      </Button>

      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      {currentScan && (
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text variant="titleMedium">
              Scan: {currentScan.id.slice(0, 8)}...
            </Text>
            <View style={styles.chipRow}>
              <Text variant="bodyMedium">
                Provider: <Text style={styles.bold}>{currentScan.provider}</Text>
              </Text>
              <Chip
                compact
                style={{
                  backgroundColor:
                    statusColors[currentScan.status as ScanStatus] + '33',
                }}
                textStyle={{
                  color: statusColors[currentScan.status as ScanStatus],
                  fontSize: 12,
                }}
              >
                {currentScan.status}
              </Chip>
              <Chip compact mode="outlined">
                <Text variant="labelSmall">{currentScan.mode}</Text>
              </Chip>
            </View>
            <Text variant="bodySmall" style={styles.dimText}>
              {currentScan.scanned_ips}/{currentScan.total_ips} IPs scanned
              {currentScan.working_ips > 0 &&
                ` | ${currentScan.working_ips} working`}
              {' | '}Concurrency: {currentScan.concurrency}
              {' | '}Timeout: {currentScan.timeout_ms}ms
            </Text>

            {/* Progress bar */}
            {(currentScan.status === 'pending' ||
              currentScan.status === 'running') && (
              <View style={styles.progressSection}>
                <ProgressBar
                  indeterminate={isIndeterminate}
                  progress={displayProgress}
                  style={styles.progressBar}
                />
                <View style={styles.progressLabels}>
                  <Text variant="bodySmall" style={styles.dimText}>
                    {isIndeterminate
                      ? (phaseLabel ?? 'Working...')
                      : isPhase2
                        ? `${extendedDone}/${extendedTotal} extended (${(phase2Progress * 100).toFixed(1)}%)`
                        : `${(phase1Progress * 100).toFixed(1)}%`}
                  </Text>
                  {phaseLabel && !isIndeterminate && (
                    <Text variant="bodySmall" style={styles.dimText}>
                      {phaseLabel}
                    </Text>
                  )}
                </View>
                <Button
                  mode="outlined"
                  icon="stop"
                  onPress={() => stopScan(scanId)}
                  loading={isStopping}
                  disabled={isStopping}
                  textColor="#ef5350"
                  style={styles.stopButton}
                  compact
                >
                  {isStopping ? 'Stopping...' : 'Stop Scan'}
                </Button>
              </View>
            )}

            <Text variant="bodySmall" style={styles.dimText}>
              Created: {currentScan.created_at}
            </Text>
          </Card.Content>
        </Card>
      )}

      <Text variant="titleMedium" style={styles.resultsTitle}>
        Results {resultsTotal > 0 && `(${resultsTotal} reachable)`}
      </Text>
    </View>
  );

  return (
    <FlatList
      data={currentResults}
      keyExtractor={(item) => item.id}
      renderItem={renderResultItem}
      ListHeaderComponent={headerComponent}
      ListEmptyComponent={
        !isResultsLoading ? (
          <Text style={styles.emptyText}>
            No results yet.
          </Text>
        ) : null
      }
      ListFooterComponent={
        currentResults.length < resultsTotal ? (
          <Button onPress={handleLoadMore} style={styles.loadMore}>
            Load More
          </Button>
        ) : null
      }
      refreshControl={
        <RefreshControl
          refreshing={isResultsLoading}
          onRefresh={refreshData}
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
    paddingBottom: 80,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  infoCard: {
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
    flexWrap: 'wrap',
  },
  bold: {
    fontWeight: 'bold',
  },
  progressSection: {
    marginTop: 8,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  stopButton: {
    marginTop: 8,
    borderColor: '#ef5350',
    alignSelf: 'flex-start',
  },
  resultsTitle: {
    marginTop: 8,
    marginBottom: 8,
  },
  resultCard: {
    marginBottom: 6,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  ipText: {
    fontFamily: 'monospace',
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
