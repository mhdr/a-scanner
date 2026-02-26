import { create } from 'zustand';
import type { ScanResult } from '../types';
import { listResults } from '../api';

interface ResultState {
  results: ScanResult[];
  isLoading: boolean;
  error: string | null;
  reachableOnly: boolean;
  setReachableOnly: (value: boolean) => void;
  fetchResults: () => Promise<void>;
}

export const useResultStore = create<ResultState>((set, get) => ({
  results: [],
  isLoading: false,
  error: null,
  reachableOnly: true,

  setReachableOnly: (value: boolean) => {
    set({ reachableOnly: value });
  },

  fetchResults: async () => {
    set({ isLoading: true, error: null });
    try {
      const results = await listResults({ reachable_only: get().reachableOnly });
      set({ results, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));
