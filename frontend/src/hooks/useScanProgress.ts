import { useEffect, useRef, useCallback } from 'react';
import type { ScanProgressEvent } from '../types';
import { useScanStore } from '../stores/scanStore';
import { getToken } from '../api';

/**
 * Derive the WebSocket URL for a scan from the current page location.
 * Appends the JWT token as a query parameter for authentication.
 * In dev mode the Vite proxy handles `/api` → backend, so we just
 * build a relative `ws://` or `wss://` URL.
 */
function buildWsUrl(scanId: string): string | null {
  const token = getToken();
  if (!token) return null;

  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const base = import.meta.env.VITE_API_URL
    ? new URL(import.meta.env.VITE_API_URL).host
    : window.location.host;
  return `${proto}://${base}/api/v1/scans/${scanId}/ws?token=${encodeURIComponent(token)}`;
}

/**
 * Custom hook that connects to the scan's WebSocket endpoint for real-time
 * progress updates. Falls back to HTTP polling if the WebSocket closes
 * unexpectedly or fails to connect.
 *
 * @param scanId - The scan ID to subscribe to.
 * @param active - Whether the hook should be active (e.g., scan is pending/running).
 */
export function useScanProgress(scanId: string | undefined, active: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { fetchScan, fetchScanResults } = useScanStore();

  const refreshData = useCallback(() => {
    if (scanId) {
      fetchScan(scanId, true);
      fetchScanResults(scanId, true);
    }
  }, [scanId, fetchScan, fetchScanResults]);

  /** Start polling as a fallback. */
  const startPolling = useCallback(() => {
    if (pollRef.current) return; // already polling
    pollRef.current = setInterval(refreshData, 2000);
  }, [refreshData]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!scanId || !active) {
      // Clean up if no longer active
      wsRef.current?.close();
      wsRef.current = null;
      stopPolling();
      return;
    }

    const url = buildWsUrl(scanId);
    if (!url) {
      // No auth token — fall back to polling
      startPolling();
      return () => { stopPolling(); };
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // WS connected — stop any fallback polling
      stopPolling();
    };

    ws.onmessage = (evt) => {
      try {
        const event: ScanProgressEvent = JSON.parse(evt.data);
        // Update the scan store with the latest progress
        useScanStore.setState((state) => {
          const scan = state.currentScan;
          if (!scan || scan.id !== event.scan_id) return state;
          return {
            currentScan: {
              ...scan,
              status: event.status,
              scanned_ips: event.scanned_ips,
              working_ips: event.working_ips,
              total_ips: event.total_ips,
            },
          };
        });

        // When scan finishes, do a final full fetch of results
        if (event.status === 'completed' || event.status === 'failed') {
          fetchScan(scanId);
          fetchScanResults(scanId);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      // On error, fall back to polling
      startPolling();
    };

    ws.onclose = () => {
      wsRef.current = null;
      // If still active, fall back to polling (scan might still be running)
      if (active) {
        startPolling();
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      stopPolling();
    };
  }, [scanId, active, fetchScan, fetchScanResults, startPolling, stopPolling]);
}
