import React, { useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Dimensions,
  ScrollView,
  RefreshControl,
} from 'react-native';
import {
  Button,
  Card,
  Text,
} from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LineChart } from 'react-native-chart-kit';
import { useResultStore } from '../stores/resultStore';
import type { ScanResult } from '../types';
import type { ResultsStackParamList } from '../App';

type Props = NativeStackScreenProps<ResultsStackParamList, 'IpDetail'>;

const SCREEN_WIDTH = Dimensions.get('window').width - 32;

const chartConfig = {
  backgroundGradientFrom: '#1e1e2e',
  backgroundGradientTo: '#1e1e2e',
  color: (opacity = 1) => `rgba(144, 202, 249, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(158, 158, 158, ${opacity})`,
  decimalPlaces: 0,
  propsForDots: {
    r: '3',
    strokeWidth: '1',
    stroke: '#90caf9',
  },
  propsForBackgroundLines: {
    strokeDasharray: '',
    stroke: 'rgba(255,255,255,0.06)',
  },
};

const chartColors = {
  tcp: (opacity = 1) => `rgba(144, 202, 249, ${opacity})`,     // blue
  tls: (opacity = 1) => `rgba(129, 199, 132, ${opacity})`,     // green
  ttfb: (opacity = 1) => `rgba(255, 183, 77, ${opacity})`,     // orange
  speed: (opacity = 1) => `rgba(144, 202, 249, ${opacity})`,   // blue
  score: (opacity = 1) => `rgba(186, 104, 200, ${opacity})`,   // purple
  jitter: (opacity = 1) => `rgba(255, 183, 77, ${opacity})`,   // orange
  loss: (opacity = 1) => `rgba(239, 83, 80, ${opacity})`,      // red
};

export default function IpDetailScreen({ route, navigation }: Props) {
  const { ip } = route.params;

  const {
    ipResults,
    ipResultsTotal,
    ipResultsPage,
    ipResultsPageSize,
    isIpResultsLoading,
    ipChartData,
    isChartLoading,
    error,
    fetchIpResults,
    fetchIpChartData,
    setIpResultsPagination,
  } = useResultStore();

  useEffect(() => {
    fetchIpResults(ip);
  }, [ip, fetchIpResults, ipResultsPage, ipResultsPageSize]);

  useEffect(() => {
    fetchIpChartData(ip);
  }, [ip, fetchIpChartData]);

  // Summary stats from chart data
  const summary = useMemo(() => {
    if (ipChartData.length === 0) return null;
    const avg = (arr: (number | null)[]) => {
      const valid = arr.filter((v): v is number => v != null);
      return valid.length > 0
        ? valid.reduce((a, b) => a + b, 0) / valid.length
        : null;
    };
    return {
      totalScans: ipChartData.length,
      reachable: ipChartData.filter((r) => r.is_reachable).length,
      avgLatency: avg(ipChartData.map((r) => r.latency_ms)),
      avgTls: avg(ipChartData.map((r) => r.tls_latency_ms)),
      avgTtfb: avg(ipChartData.map((r) => r.ttfb_ms)),
      avgSpeed: avg(ipChartData.map((r) => r.download_speed_kbps)),
      avgJitter: avg(ipChartData.map((r) => r.jitter_ms)),
      avgPacketLoss: avg(ipChartData.map((r) => r.packet_loss)),
      avgScore: avg(ipChartData.map((r) => r.score)),
    };
  }, [ipChartData]);

  const fmtNum = (v: number | null, decimals = 0) =>
    v != null ? v.toFixed(decimals) : '—';

  // Build chart labels (abbreviated timestamps)
  const chartLabels = useMemo(() => {
    if (ipChartData.length === 0) return [];
    // Show at most ~6 labels to avoid crowding
    const step = Math.max(1, Math.floor(ipChartData.length / 6));
    return ipChartData.map((r, i) => {
      if (i % step === 0 || i === ipChartData.length - 1) {
        const d = new Date(r.created_at);
        return `${d.getMonth() + 1}/${d.getDate()}`;
      }
      return '';
    });
  }, [ipChartData]);

  // Safe data extraction — replace null with 0 for chart rendering
  const safeData = (arr: (number | null)[]) =>
    arr.map((v) => (v != null ? v : 0));

  const hasChartData = !isChartLoading && ipChartData.length > 1;

  const handleLoadMore = () => {
    const totalPages = Math.ceil(ipResultsTotal / ipResultsPageSize);
    if (ipResultsPage + 1 < totalPages) {
      setIpResultsPagination(ipResultsPage + 1, ipResultsPageSize);
    }
  };

  const renderResultItem = ({ item }: { item: ScanResult }) => (
    <Card style={styles.resultCard}>
      <Card.Content>
        <View style={styles.resultHeader}>
          <Text variant="bodySmall" style={styles.dimText}>
            {item.created_at}
          </Text>
          <Icon
            name={item.is_reachable ? 'check-circle' : 'close-circle'}
            size={18}
            color={item.is_reachable ? '#66bb6a' : '#ef5350'}
          />
        </View>
        <View style={styles.statsRow}>
          <Text variant="bodySmall" style={styles.dimText}>
            TCP: {item.latency_ms ?? '—'}ms
          </Text>
          <Text variant="bodySmall" style={styles.dimText}>
            TLS: {item.tls_latency_ms ?? '—'}ms
          </Text>
          <Text variant="bodySmall" style={styles.dimText}>
            TTFB: {item.ttfb_ms ?? '—'}ms
          </Text>
          <Text variant="bodySmall" style={styles.dimText}>
            Speed: {item.download_speed_kbps?.toFixed(1) ?? '—'} KB/s
          </Text>
        </View>
        <View style={styles.statsRow}>
          <Text variant="bodySmall" style={styles.dimText}>
            Jitter: {item.jitter_ms?.toFixed(1) ?? '—'}ms
          </Text>
          <Text variant="bodySmall" style={styles.dimText}>
            Loss: {item.packet_loss?.toFixed(1) ?? '—'}%
          </Text>
          <Text variant="bodySmall" style={styles.dimText}>
            Score: {item.score?.toFixed(0) ?? '—'}
          </Text>
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
        Back to Results
      </Button>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Summary Card */}
      <Card style={styles.summaryCard}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.monospace}>
            {ip}
          </Text>
          {summary && (
            <>
              <Text variant="bodySmall" style={styles.dimText}>
                Total scans: {summary.totalScans} | Reachable:{' '}
                {summary.reachable}/{summary.totalScans}
              </Text>
              <View style={styles.summaryGrid}>
                <Text variant="bodySmall">
                  Avg TCP: <Text style={styles.bold}>{fmtNum(summary.avgLatency)} ms</Text>
                </Text>
                <Text variant="bodySmall">
                  Avg TLS: <Text style={styles.bold}>{fmtNum(summary.avgTls)} ms</Text>
                </Text>
                <Text variant="bodySmall">
                  Avg TTFB: <Text style={styles.bold}>{fmtNum(summary.avgTtfb)} ms</Text>
                </Text>
                <Text variant="bodySmall">
                  Avg Speed: <Text style={styles.bold}>{fmtNum(summary.avgSpeed, 1)} KB/s</Text>
                </Text>
                <Text variant="bodySmall">
                  Avg Jitter: <Text style={styles.bold}>{fmtNum(summary.avgJitter, 1)} ms</Text>
                </Text>
                <Text variant="bodySmall">
                  Avg Loss: <Text style={styles.bold}>{fmtNum(summary.avgPacketLoss, 1)}%</Text>
                </Text>
                <Text variant="bodySmall">
                  Avg Score: <Text style={styles.bold}>{fmtNum(summary.avgScore)}</Text>
                </Text>
              </View>
            </>
          )}
        </Card.Content>
      </Card>

      {/* Charts */}
      {hasChartData && (
        <View style={styles.chartsSection}>
          {/* Latency Chart */}
          <Card style={styles.chartCard}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.chartTitle}>
                Latency Trends
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <LineChart
                  data={{
                    labels: chartLabels,
                    datasets: [
                      {
                        data: safeData(ipChartData.map((r) => r.latency_ms)),
                        color: chartColors.tcp,
                        strokeWidth: 2,
                      },
                      {
                        data: safeData(ipChartData.map((r) => r.tls_latency_ms)),
                        color: chartColors.tls,
                        strokeWidth: 2,
                      },
                      {
                        data: safeData(ipChartData.map((r) => r.ttfb_ms)),
                        color: chartColors.ttfb,
                        strokeWidth: 2,
                      },
                    ],
                    legend: ['TCP', 'TLS', 'TTFB'],
                  }}
                  width={Math.max(SCREEN_WIDTH, ipChartData.length * 30)}
                  height={220}
                  chartConfig={chartConfig}
                  bezier
                  style={styles.chart}
                />
              </ScrollView>
            </Card.Content>
          </Card>

          {/* Speed & Score Chart */}
          <Card style={styles.chartCard}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.chartTitle}>
                Speed & Score
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <LineChart
                  data={{
                    labels: chartLabels,
                    datasets: [
                      {
                        data: safeData(
                          ipChartData.map((r) => r.download_speed_kbps),
                        ),
                        color: chartColors.speed,
                        strokeWidth: 2,
                      },
                      {
                        data: safeData(ipChartData.map((r) => r.score)),
                        color: chartColors.score,
                        strokeWidth: 2,
                      },
                    ],
                    legend: ['Speed (KB/s)', 'Score'],
                  }}
                  width={Math.max(SCREEN_WIDTH, ipChartData.length * 30)}
                  height={220}
                  chartConfig={chartConfig}
                  bezier
                  style={styles.chart}
                />
              </ScrollView>
            </Card.Content>
          </Card>

          {/* Jitter & Packet Loss Chart */}
          <Card style={styles.chartCard}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.chartTitle}>
                Jitter & Packet Loss
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <LineChart
                  data={{
                    labels: chartLabels,
                    datasets: [
                      {
                        data: safeData(ipChartData.map((r) => r.jitter_ms)),
                        color: chartColors.jitter,
                        strokeWidth: 2,
                      },
                      {
                        data: safeData(ipChartData.map((r) => r.packet_loss)),
                        color: chartColors.loss,
                        strokeWidth: 2,
                      },
                    ],
                    legend: ['Jitter (ms)', 'Loss (%)'],
                  }}
                  width={Math.max(SCREEN_WIDTH, ipChartData.length * 30)}
                  height={220}
                  chartConfig={chartConfig}
                  bezier
                  style={styles.chart}
                />
              </ScrollView>
            </Card.Content>
          </Card>
        </View>
      )}

      <Text variant="titleMedium" style={styles.historyTitle}>
        Scan History {ipResultsTotal > 0 && `(${ipResultsTotal} results)`}
      </Text>
    </View>
  );

  return (
    <FlatList
      data={ipResults}
      keyExtractor={(item) => item.id}
      renderItem={renderResultItem}
      ListHeaderComponent={headerComponent}
      ListEmptyComponent={
        !isIpResultsLoading ? (
          <Text style={styles.emptyText}>No results.</Text>
        ) : null
      }
      ListFooterComponent={
        ipResults.length < ipResultsTotal ? (
          <Button onPress={handleLoadMore} style={styles.loadMore}>
            Load More
          </Button>
        ) : null
      }
      refreshControl={
        <RefreshControl
          refreshing={isIpResultsLoading}
          onRefresh={() => {
            fetchIpResults(ip);
            fetchIpChartData(ip);
          }}
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
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  summaryCard: {
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  chartsSection: {
    gap: 12,
    marginBottom: 12,
  },
  chartCard: {
    overflow: 'hidden',
  },
  chartTitle: {
    marginBottom: 8,
    textAlign: 'center',
  },
  chart: {
    borderRadius: 8,
  },
  historyTitle: {
    marginTop: 4,
    marginBottom: 8,
  },
  resultCard: {
    marginBottom: 6,
  },
  resultHeader: {
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
  bold: {
    fontWeight: 'bold',
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
