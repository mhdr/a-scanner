import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
} from 'react-native';
import {
  Button,
  Card,
  Dialog,
  Portal,
  Text,
} from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useResultStore } from '../stores/resultStore';
import type { AggregatedIpResult } from '../types';
import type { ResultsStackParamList } from '../App';

type Props = NativeStackScreenProps<ResultsStackParamList, 'ResultsList'>;

export default function ResultsScreen({ navigation }: Props) {
  const {
    aggregatedIps,
    aggregatedTotal,
    aggregatedPage,
    aggregatedPageSize,
    isLoading,
    error,
    setAggregatedPagination,
    fetchAggregatedIps,
    deleteAllResults,
  } = useResultStore();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchAggregatedIps();
  }, [fetchAggregatedIps, aggregatedPage, aggregatedPageSize]);

  const handleDeleteAll = async () => {
    setDeleting(true);
    await deleteAllResults();
    setDeleting(false);
    setConfirmOpen(false);
  };

  const handleLoadMore = () => {
    const totalPages = Math.ceil(aggregatedTotal / aggregatedPageSize);
    if (aggregatedPage + 1 < totalPages) {
      setAggregatedPagination(aggregatedPage + 1, aggregatedPageSize);
    }
  };

  const fmtNum = (v: number | null | undefined, decimals = 0) =>
    v != null ? v.toFixed(decimals) : '—';

  const renderItem = ({ item }: { item: AggregatedIpResult }) => (
    <Card
      style={styles.card}
      onPress={() => navigation.navigate('IpDetail', { ip: item.ip })}
    >
      <Card.Content>
        <View style={styles.cardHeader}>
          <Text variant="bodyMedium" style={styles.monospace}>
            {item.ip}
          </Text>
          <Text variant="bodySmall" style={styles.dimText}>
            {item.scan_count} scan{item.scan_count !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.statsRow}>
          <Text variant="bodySmall" style={styles.dimText}>
            TCP: {fmtNum(item.avg_latency_ms)}ms
          </Text>
          <Text variant="bodySmall" style={styles.dimText}>
            TTFB: {fmtNum(item.avg_ttfb_ms)}ms
          </Text>
          <Text variant="bodySmall" style={styles.dimText}>
            Speed: {fmtNum(item.avg_download_speed_kbps, 1)} KB/s
          </Text>
          <Text variant="bodySmall" style={styles.dimText}>
            Score: {fmtNum(item.avg_score)}
          </Text>
        </View>
        <View style={styles.statsRow}>
          <Text variant="bodySmall" style={styles.dimText}>
            TLS: {fmtNum(item.avg_tls_latency_ms)}ms
          </Text>
          <Text variant="bodySmall" style={styles.dimText}>
            Jitter: {fmtNum(item.avg_jitter_ms, 1)}ms
          </Text>
          <Text variant="bodySmall" style={styles.dimText}>
            Loss: {fmtNum(item.avg_packet_loss, 1)}%
          </Text>
        </View>
        {item.last_seen && (
          <Text variant="bodySmall" style={[styles.dimText, styles.lastSeen]}>
            Last seen: {item.last_seen}
          </Text>
        )}
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.toolbar}>
        <Text variant="bodySmall" style={styles.dimText}>
          {aggregatedTotal} IPs
        </Text>
        <Button
          icon="delete-sweep"
          mode="outlined"
          compact
          textColor="#ef5350"
          onPress={() => setConfirmOpen(true)}
          disabled={deleting || aggregatedTotal === 0}
        >
          Delete All
        </Button>
      </View>

      <FlatList
        data={aggregatedIps}
        keyExtractor={(item) => item.ip}
        renderItem={renderItem}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.emptyText}>
              No results yet. Run a scan to see aggregated IP data.
            </Text>
          ) : null
        }
        ListFooterComponent={
          aggregatedIps.length < aggregatedTotal ? (
            <Button onPress={handleLoadMore} style={styles.loadMore}>
              Load More
            </Button>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchAggregatedIps}
            tintColor="#90caf9"
            colors={['#90caf9']}
          />
        }
        contentContainerStyle={styles.listContent}
      />

      {/* Delete confirmation */}
      <Portal>
        <Dialog visible={confirmOpen} onDismiss={() => setConfirmOpen(false)}>
          <Dialog.Title>Delete all results?</Dialog.Title>
          <Dialog.Content>
            <Text>
              This will permanently delete all completed scans and their results.
              Running scans will not be affected.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              mode="contained"
              buttonColor="#ef5350"
              textColor="#fff"
              onPress={handleDeleteAll}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete All'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  card: {
    marginBottom: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 2,
  },
  monospace: {
    fontFamily: 'monospace',
  },
  dimText: {
    color: '#9e9e9e',
  },
  lastSeen: {
    marginTop: 4,
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
  loadMore: {
    marginTop: 8,
  },
});
