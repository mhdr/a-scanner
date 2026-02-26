import { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ReactECharts from 'echarts-for-react';
import { useResultStore } from '../stores/resultStore';

const resultColumns: GridColDef[] = [
  {
    field: 'created_at',
    headerName: 'Date',
    width: 180,
  },
  {
    field: 'is_reachable',
    headerName: 'Status',
    width: 90,
    renderCell: (params) =>
      params.value ? (
        <CheckCircleIcon color="success" />
      ) : (
        <CancelIcon color="error" />
      ),
  },
  {
    field: 'latency_ms',
    headerName: 'TCP (ms)',
    width: 100,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${params.value}` : '—'),
  },
  {
    field: 'tls_latency_ms',
    headerName: 'TLS (ms)',
    width: 100,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${params.value}` : '—'),
  },
  {
    field: 'ttfb_ms',
    headerName: 'TTFB (ms)',
    width: 100,
    type: 'number',
    renderCell: (params) => (params.value != null ? `${params.value}` : '—'),
  },
  {
    field: 'download_speed_kbps',
    headerName: 'Speed (KB/s)',
    width: 120,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(1)}` : '—',
  },
  {
    field: 'jitter_ms',
    headerName: 'Jitter (ms)',
    width: 100,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(1)}` : '—',
  },
  {
    field: 'packet_loss',
    headerName: 'Loss (%)',
    width: 100,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(1)}` : '—',
  },
  {
    field: 'score',
    headerName: 'Score',
    width: 100,
    type: 'number',
    renderCell: (params) =>
      params.value != null ? `${(params.value as number).toFixed(0)}` : '—',
  },
];

const mobileColumnVisibility: Record<string, boolean> = {
  tls_latency_ms: false,
  download_speed_kbps: false,
  jitter_ms: false,
  packet_loss: false,
};

export default function IpDetailPage() {
  const { ip } = useParams<{ ip: string }>();
  const decodedIp = ip ? decodeURIComponent(ip) : '';
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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

  // Fetch grid data on mount and when pagination changes
  useEffect(() => {
    if (decodedIp) {
      fetchIpResults(decodedIp);
    }
  }, [decodedIp, fetchIpResults, ipResultsPage, ipResultsPageSize]);

  // Fetch all data for charts on mount
  useEffect(() => {
    if (decodedIp) {
      fetchIpChartData(decodedIp);
    }
  }, [decodedIp, fetchIpChartData]);

  // Compute summary stats from chart data (all results)
  const summary = useMemo(() => {
    if (ipChartData.length === 0) return null;
    const avg = (arr: (number | null)[]) => {
      const valid = arr.filter((v): v is number => v != null);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
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

  // Prepare chart x-axis labels (timestamps)
  const chartDates = useMemo(
    () => ipChartData.map((r) => r.created_at),
    [ipChartData],
  );

  const baseChartOptions = {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 60, right: 30, top: 40, bottom: 50 },
    xAxis: {
      type: 'category' as const,
      data: chartDates,
      axisLabel: {
        rotate: 30,
        fontSize: 10,
        formatter: (val: string) => {
          const d = new Date(val);
          return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        },
      },
    },
  };

  // Chart 1: Latency trends
  const latencyChartOption = {
    ...baseChartOptions,
    title: { text: 'Latency Trends', left: 'center', textStyle: { fontSize: 14 } },
    legend: { data: ['TCP (ms)', 'TLS (ms)', 'TTFB (ms)'], bottom: 0 },
    yAxis: { type: 'value' as const, name: 'ms' },
    series: [
      {
        name: 'TCP (ms)',
        type: 'line',
        data: ipChartData.map((r) => r.latency_ms),
        smooth: true,
        connectNulls: true,
        symbol: 'circle',
        symbolSize: 4,
      },
      {
        name: 'TLS (ms)',
        type: 'line',
        data: ipChartData.map((r) => r.tls_latency_ms),
        smooth: true,
        connectNulls: true,
        symbol: 'circle',
        symbolSize: 4,
      },
      {
        name: 'TTFB (ms)',
        type: 'line',
        data: ipChartData.map((r) => r.ttfb_ms),
        smooth: true,
        connectNulls: true,
        symbol: 'circle',
        symbolSize: 4,
      },
    ],
  };

  // Chart 2: Speed & Score
  const speedScoreChartOption = {
    ...baseChartOptions,
    title: { text: 'Speed & Score', left: 'center', textStyle: { fontSize: 14 } },
    legend: { data: ['Speed (KB/s)', 'Score'], bottom: 0 },
    yAxis: [
      { type: 'value' as const, name: 'KB/s', position: 'left' as const },
      { type: 'value' as const, name: 'Score', position: 'right' as const },
    ],
    series: [
      {
        name: 'Speed (KB/s)',
        type: 'line',
        yAxisIndex: 0,
        data: ipChartData.map((r) => r.download_speed_kbps),
        smooth: true,
        connectNulls: true,
        symbol: 'circle',
        symbolSize: 4,
      },
      {
        name: 'Score',
        type: 'line',
        yAxisIndex: 1,
        data: ipChartData.map((r) => r.score),
        smooth: true,
        connectNulls: true,
        symbol: 'circle',
        symbolSize: 4,
      },
    ],
  };

  // Chart 3: Jitter & Packet Loss
  const jitterLossChartOption = {
    ...baseChartOptions,
    title: { text: 'Jitter & Packet Loss', left: 'center', textStyle: { fontSize: 14 } },
    legend: { data: ['Jitter (ms)', 'Packet Loss (%)'], bottom: 0 },
    yAxis: [
      { type: 'value' as const, name: 'ms', position: 'left' as const },
      { type: 'value' as const, name: '%', position: 'right' as const },
    ],
    series: [
      {
        name: 'Jitter (ms)',
        type: 'line',
        yAxisIndex: 0,
        data: ipChartData.map((r) => r.jitter_ms),
        smooth: true,
        connectNulls: true,
        symbol: 'circle',
        symbolSize: 4,
      },
      {
        name: 'Packet Loss (%)',
        type: 'line',
        yAxisIndex: 1,
        data: ipChartData.map((r) => r.packet_loss),
        smooth: true,
        connectNulls: true,
        symbol: 'circle',
        symbolSize: 4,
      },
    ],
  };

  const fmtNum = (v: number | null, decimals = 0) =>
    v != null ? v.toFixed(decimals) : '—';

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/results')} sx={{ mb: 2 }}>
        Back to Results
      </Button>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      {/* Summary card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h5">IP: {decodedIp}</Typography>
            {summary && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Total scans: <strong>{summary.totalScans}</strong> | Reachable:{' '}
                  <strong>{summary.reachable}</strong> /{' '}
                  {summary.totalScans}
                </Typography>
                <Stack
                  direction="row"
                  spacing={isMobile ? 1 : 3}
                  flexWrap="wrap"
                  useFlexGap
                >
                  <Typography variant="body2">
                    Avg TCP: <strong>{fmtNum(summary.avgLatency)} ms</strong>
                  </Typography>
                  <Typography variant="body2">
                    Avg TLS: <strong>{fmtNum(summary.avgTls)} ms</strong>
                  </Typography>
                  <Typography variant="body2">
                    Avg TTFB: <strong>{fmtNum(summary.avgTtfb)} ms</strong>
                  </Typography>
                  <Typography variant="body2">
                    Avg Speed: <strong>{fmtNum(summary.avgSpeed, 1)} KB/s</strong>
                  </Typography>
                  <Typography variant="body2">
                    Avg Jitter: <strong>{fmtNum(summary.avgJitter, 1)} ms</strong>
                  </Typography>
                  <Typography variant="body2">
                    Avg Loss: <strong>{fmtNum(summary.avgPacketLoss, 1)}%</strong>
                  </Typography>
                  <Typography variant="body2">
                    Avg Score: <strong>{fmtNum(summary.avgScore)}</strong>
                  </Typography>
                </Stack>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Trend charts */}
      {!isChartLoading && ipChartData.length > 1 && (
        <Stack spacing={3} sx={{ mb: 3 }}>
          <Card>
            <CardContent>
              <ReactECharts
                option={latencyChartOption}
                style={{ height: isMobile ? 250 : 350 }}
                notMerge
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <ReactECharts
                option={speedScoreChartOption}
                style={{ height: isMobile ? 250 : 350 }}
                notMerge
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <ReactECharts
                option={jitterLossChartOption}
                style={{ height: isMobile ? 250 : 350 }}
                notMerge
              />
            </CardContent>
          </Card>
        </Stack>
      )}

      {/* Results grid */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Scan History {ipResultsTotal > 0 && `(${ipResultsTotal} results)`}
          </Typography>
          <DataGrid
            rows={ipResults}
            columns={resultColumns}
            paginationMode="server"
            rowCount={ipResultsTotal}
            paginationModel={{ page: ipResultsPage, pageSize: ipResultsPageSize }}
            onPaginationModelChange={(model: GridPaginationModel) => {
              setIpResultsPagination(model.page, model.pageSize);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
            sortingMode="server"
            loading={isIpResultsLoading}
            columnVisibilityModel={isMobile ? mobileColumnVisibility : undefined}
            autoHeight
            disableRowSelectionOnClick
          />
        </CardContent>
      </Card>
    </Box>
  );
}
