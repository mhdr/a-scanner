import { create } from 'zustand';
import type { ScanResult } from '../types';
import { listResults, deleteAllResults as apiDeleteAllResults } from '../api';

interface ResultState {
  results: ScanResult[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  error: string | null;
  reachableOnly: boolean;
  setReachableOnly: (value: boolean) => void;
  setPagination: (page: number, pageSize: number) => void;
  fetchResults: () => Promise<void>;
  deleteAllResults: () => Promise<void>;
}

export const useResultStore = create<ResultState>((set, get) => ({
  results: [],
  total: 0,
  page: 0,
  pageSize: 25,
  isLoading: false,
  error: null,
  reachableOnly: true,

  setReachableOnly: (value: boolean) => {
    set({ reachableOnly: value, page: 0 });
  },

  setPagination: (page: number, pageSize: number) => {
    set({ page, pageSize });
  },

  fetchResults: async () => {
    const { page, pageSize, reachableOnly, results } = get();
    // Only show loading indicator when there's no existing data (initial load)
    if (results.length === 0) set({ isLoading: true });
    set({ error: null });
    try {
      const resp = await listResults({
        reachable_only: reachableOnly,
        page: page + 1, // backend is 1-indexed
        per_page: pageSize,
      });
      set({ results: resp.data, total: resp.total, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  deleteAllResults: async () => {
    set({ error: null });
    try {
      await apiDeleteAllResults();
      set({ results: [], total: 0, page: 0 });
      // Re-fetch to reflect any remaining results (from running scans)
      await get().fetchResults();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
