import { create } from 'zustand';
import type { Scan, ScanResult, CreateScanRequest } from '../types';
import { listScans, createScan, getScan, getScanResults } from '../api';

interface ScanState {
  scans: Scan[];
  currentScan: Scan | null;
  currentResults: ScanResult[];
  isLoading: boolean;
  error: string | null;
  fetchScans: () => Promise<void>;
  fetchScan: (id: string) => Promise<void>;
  fetchScanResults: (id: string) => Promise<void>;
  startScan: (req: CreateScanRequest) => Promise<void>;
}

export const useScanStore = create<ScanState>((set) => ({
  scans: [],
  currentScan: null,
  currentResults: [],
  isLoading: false,
  error: null,

  fetchScans: async () => {
    set({ isLoading: true, error: null });
    try {
      const scans = await listScans();
      set({ scans, isLoading: false });
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
    set({ isLoading: true, error: null });
    try {
      const results = await getScanResults(id);
      set({ currentResults: results, isLoading: false });
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
