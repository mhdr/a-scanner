import { create } from 'zustand';
import type { Scan, ScanResult, CreateScanRequest } from '../types';
import { listScans, createScan, getScan, getScanResults } from '../api';

interface ScanState {
  scans: Scan[];
  scansTotal: number;
  scansPage: number;
  scansPageSize: number;
  currentScan: Scan | null;
  currentResults: ScanResult[];
  resultsTotal: number;
  resultsPage: number;
  resultsPageSize: number;
  isLoading: boolean;
  error: string | null;
  fetchScans: () => Promise<void>;
  setScansPagination: (page: number, pageSize: number) => void;
  fetchScan: (id: string) => Promise<void>;
  fetchScanResults: (id: string) => Promise<void>;
  setResultsPagination: (page: number, pageSize: number) => void;
  startScan: (req: CreateScanRequest) => Promise<void>;
}

export const useScanStore = create<ScanState>((set, get) => ({
  scans: [],
  scansTotal: 0,
  scansPage: 0,
  scansPageSize: 10,
  currentScan: null,
  currentResults: [],
  resultsTotal: 0,
  resultsPage: 0,
  resultsPageSize: 25,
  isLoading: false,
  error: null,

  setScansPagination: (page: number, pageSize: number) => {
    set({ scansPage: page, scansPageSize: pageSize });
  },

  setResultsPagination: (page: number, pageSize: number) => {
    set({ resultsPage: page, resultsPageSize: pageSize });
  },

  fetchScans: async () => {
    const { scansPage, scansPageSize } = get();
    set({ isLoading: true, error: null });
    try {
      const resp = await listScans({ page: scansPage + 1, per_page: scansPageSize });
      set({ scans: resp.data, scansTotal: resp.total, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  fetchScan: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const scan = await getScan(id);
      set({ currentScan: scan, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  fetchScanResults: async (id: string) => {
    const { resultsPage, resultsPageSize } = get();
    set({ isLoading: true, error: null });
    try {
      const resp = await getScanResults(id, { page: resultsPage + 1, per_page: resultsPageSize });
      set({ currentResults: resp.data, resultsTotal: resp.total, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  startScan: async (req: CreateScanRequest) => {
    set({ isLoading: true, error: null });
    try {
      const scan = await createScan(req);
      set((state) => ({
        scans: [scan, ...state.scans],
        isLoading: false,
      }));
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));
