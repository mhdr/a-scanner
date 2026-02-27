import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { pollScanProgress } from '../native/ScannerBridge';
import { useScanStore } from '../stores/scanStore';

/** How often to poll for scan progress events (ms). */
const POLL_INTERVAL = 500;

/**
 * Custom hook that polls the Rust backend for scan progress events.
 *
 * Mobile equivalent of the web `useScanProgress` hook — uses
 * `ScannerBridge.pollScanProgress()` instead of WebSocket.
 *
 * Pauses polling when the app goes to background via `AppState`.
 *
 * @param scanId - The scan ID to poll progress for.
 * @param active - Whether polling should be active (scan pending/running).
 */
export function useScanProgress(
  scanId: string | undefined,
  active: boolean,
) {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const { fetchScan, fetchScanResults } = useScanStore();

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const doPoll = useCallback(async () => {
    if (!scanId) return;

    try {
      const { events, closed } = await pollScanProgress(scanId);

      // Process events — update store same as web WS handler
      for (const event of events) {
        useScanStore.setState((state) => {
          const scan = state.currentScan;
          if (!scan || scan.id !== event.scan_id) return state;
          return {
            ...state,
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

        // Final fetch on terminal status
        if (event.status === 'completed' || event.status === 'failed') {
          fetchScan(scanId);
          fetchScanResults(scanId);
        }
      }

      // Stop polling when channel is closed
      if (closed) {
        stopPolling();
      }
    } catch {
      // Ignore poll errors — will retry on next interval
    }
  }, [scanId, fetchScan, fetchScanResults, stopPolling]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return; // already polling
    pollRef.current = setInterval(doPoll, POLL_INTERVAL);
    // Do an immediate poll
    doPoll();
  }, [doPoll]);

  useEffect(() => {
    if (!scanId || !active) {
      stopPolling();
      return;
    }

    startPolling();

    // Pause/resume polling when app goes to background/foreground
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextState === 'active'
        ) {
          // App came to foreground — resume polling
          startPolling();
        } else if (nextState.match(/inactive|background/)) {
          // App went to background — pause polling
          stopPolling();
        }
        appStateRef.current = nextState;
      },
    );

    return () => {
      subscription.remove();
      stopPolling();
    };
  }, [scanId, active, startPolling, stopPolling]);
}
