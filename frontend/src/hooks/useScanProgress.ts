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

/** How often to poll as a fallback (ms). */
const POLL_INTERVAL = 2000;
/** Delay before attempting WS reconnection after a close (ms). */
const RECONNECT_DELAY = 5000;

/**
 * Custom hook that connects to the scan's WebSocket endpoint for real-time
 * progress updates. Falls back to HTTP polling if the WebSocket closes
 * unexpectedly or fails to connect, and periodically retries the WebSocket.
 *
 * @param scanId - The scan ID to subscribe to.
 * @param active - Whether the hook should be active (e.g., scan is pending/running).
 */
export function useScanProgress(scanId: string | undefined, active: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    pollRef.current = setInterval(refreshData, POLL_INTERVAL);
  }, [refreshData]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Guard flag to prevent stale async callbacks (e.g., ws.onclose firing
    // after the effect cleanup has already run) from starting new timers.
    let cancelled = false;

    if (!scanId || !active) {
      // Clean up if no longer active
      wsRef.current?.close();
      wsRef.current = null;
      stopPolling();
      return () => { cancelled = true; };
    }

    /** Try to open a WebSocket connection. Falls back to polling on failure. */
    function connect() {
      if (cancelled) return;

      const url = buildWsUrl(scanId!);
      if (!url) {
        // No auth token — fall back to polling
        startPolling();
        return;
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
              currentPhase: event.phase,
              extendedDone: event.extended_done ?? state.extendedDone,
              extendedTotal: event.extended_total ?? state.extendedTotal,
            };
          });

          // When scan finishes, do a final full fetch of results
          if (event.status === 'completed' || event.status === 'failed' || event.status === 'stopped') {
            fetchScan(scanId!);
            fetchScanResults(scanId!);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        // On error, fall back to polling (onerror is always followed by onclose)
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (cancelled) return; // Effect already cleaned up — do nothing

        // Fall back to polling while we wait to reconnect
        startPolling();
        // Schedule a WS reconnection attempt
        reconnectRef.current = setTimeout(() => {
          if (!cancelled) {
            stopPolling();
            connect();
          }
        }, RECONNECT_DELAY);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      stopPolling();
    };
  }, [scanId, active, fetchScan, fetchScanResults, startPolling, stopPolling]);
}
