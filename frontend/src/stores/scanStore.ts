import { create } from 'zustand';
import type { Scan, ScanResult, CreateScanRequest } from '../types';
import { listScans, createScan, getScan, getScanResults, stopScan } from '../api';

interface ScanState {
  scans: Scan[];
  scansTotal: number;
  scansPage: number;
  scansPageSize: number;
  currentScan: Scan | null;
  currentPhase: string | null;
  extendedDone: number;
  extendedTotal: number;
  currentResults: ScanResult[];
  resultsTotal: number;
  resultsPage: number;
  resultsPageSize: number;
  isScansLoading: boolean;
  isScanLoading: boolean;
  isResultsLoading: boolean;
  isStarting: boolean;
  isStopping: boolean;
  error: string | null;
  fetchScans: () => Promise<void>;
  setScansPagination: (page: number, pageSize: number) => void;
  fetchScan: (id: string, silent?: boolean) => Promise<void>;
  fetchScanResults: (id: string, silent?: boolean) => Promise<void>;
  setResultsPagination: (page: number, pageSize: number) => void;
  startScan: (req: CreateScanRequest) => Promise<void>;
  stopScan: (id: string) => Promise<void>;
}

export const useScanStore = create<ScanState>((set, get) => ({
  scans: [],
  scansTotal: 0,
  scansPage: 0,
  scansPageSize: 10,
  currentScan: null,
  currentPhase: null,
  extendedDone: 0,
  extendedTotal: 0,
  currentResults: [],
  resultsTotal: 0,
  resultsPage: 0,
  resultsPageSize: 25,
  isScansLoading: false,
  isScanLoading: false,
  isResultsLoading: false,
  isStarting: false,
  isStopping: false,
  error: null,

  setScansPagination: (page: number, pageSize: number) => {
    set({ scansPage: page, scansPageSize: pageSize });
  },

  setResultsPagination: (page: number, pageSize: number) => {
    set({ resultsPage: page, resultsPageSize: pageSize });
  },

  fetchScans: async () => {
    const { scansPage, scansPageSize } = get();
    set({ isScansLoading: true, error: null });
    try {
      const resp = await listScans({ page: scansPage + 1, per_page: scansPageSize });
      set({ scans: resp.data, scansTotal: resp.total, isScansLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isScansLoading: false });
    }
  },

  fetchScan: async (id: string, silent = false) => {
    if (!silent) set({ isScanLoading: true, error: null });
    try {
      const scan = await getScan(id);
      // Reset phase/extended progress when loading scan from API
      // (these are only tracked via WebSocket events)
      const phaseUpdate = silent ? {} : { currentPhase: null, extendedDone: 0, extendedTotal: 0 };
      set({ currentScan: scan, isScanLoading: false, ...phaseUpdate });
    } catch (err) {
      if (!silent) set({ error: (err as Error).message, isScanLoading: false });
    }
  },

  fetchScanResults: async (id: string, silent = false) => {
    const { resultsPage, resultsPageSize } = get();
    if (!silent) set({ isResultsLoading: true, error: null });
    try {
      const resp = await getScanResults(id, { page: resultsPage + 1, per_page: resultsPageSize });
      set({ currentResults: resp.data, resultsTotal: resp.total, isResultsLoading: false });
    } catch (err) {
      if (!silent) set({ error: (err as Error).message, isResultsLoading: false });
    }
  },

  startScan: async (req: CreateScanRequest) => {
    set({ isStarting: true, error: null });
    try {
      const scan = await createScan(req);
      set((state) => ({
        scans: [scan, ...state.scans],
        isStarting: false,
      }));
    } catch (err) {
      set({ error: (err as Error).message, isStarting: false });
    }
  },

  stopScan: async (id: string) => {
    set({ isStopping: true, error: null });
    try {
      const scan = await stopScan(id);
      set((state) => ({
        currentScan: state.currentScan?.id === id ? scan : state.currentScan,
        scans: state.scans.map((s) => (s.id === id ? scan : s)),
        isStopping: false,
      }));
    } catch (err) {
      set({ error: (err as Error).message, isStopping: false });
    }
  },
}));
