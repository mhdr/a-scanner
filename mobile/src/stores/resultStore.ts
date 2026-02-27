import { create } from 'zustand';
import type { AggregatedIpResult, ScanResult } from '../types';
import * as bridge from '../native/ScannerBridge';

interface ResultState {
  // Aggregated IPs (main results tab)
  aggregatedIps: AggregatedIpResult[];
  aggregatedTotal: number;
  aggregatedPage: number;
  aggregatedPageSize: number;
  isLoading: boolean;
  error: string | null;
  setAggregatedPagination: (page: number, pageSize: number) => void;
  fetchAggregatedIps: () => Promise<void>;
  deleteAllResults: () => Promise<void>;

  // IP detail screen
  currentIp: string | null;
  ipResults: ScanResult[];
  ipResultsTotal: number;
  ipResultsPage: number;
  ipResultsPageSize: number;
  isIpResultsLoading: boolean;
  ipChartData: ScanResult[];
  isChartLoading: boolean;
  setIpResultsPagination: (page: number, pageSize: number) => void;
  fetchIpResults: (ip: string) => Promise<void>;
  fetchIpChartData: (ip: string) => Promise<void>;
}

export const useResultStore = create<ResultState>((set, get) => ({
  // Aggregated IPs
  aggregatedIps: [],
  aggregatedTotal: 0,
  aggregatedPage: 0,
  aggregatedPageSize: 25,
  isLoading: false,
  error: null,

  setAggregatedPagination: (page: number, pageSize: number) => {
    set({ aggregatedPage: page, aggregatedPageSize: pageSize });
  },

  fetchAggregatedIps: async () => {
    const { aggregatedPage, aggregatedPageSize, aggregatedIps } = get();
    if (aggregatedIps.length === 0) set({ isLoading: true });
    set({ error: null });
    try {
      const resp = await bridge.listAggregatedIps(
        aggregatedPage + 1, // backend is 1-indexed
        aggregatedPageSize,
      );
      set({
        aggregatedIps: resp.data,
        aggregatedTotal: resp.total,
        isLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  deleteAllResults: async () => {
    set({ error: null });
    try {
      await bridge.deleteCompletedScans();
      set({ aggregatedIps: [], aggregatedTotal: 0, aggregatedPage: 0 });
      await get().fetchAggregatedIps();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // IP detail
  currentIp: null,
  ipResults: [],
  ipResultsTotal: 0,
  ipResultsPage: 0,
  ipResultsPageSize: 25,
  isIpResultsLoading: false,
  ipChartData: [],
  isChartLoading: false,

  setIpResultsPagination: (page: number, pageSize: number) => {
    set({ ipResultsPage: page, ipResultsPageSize: pageSize });
  },

  fetchIpResults: async (ip: string) => {
    const { ipResultsPage, ipResultsPageSize, ipResults } = get();
    if (ipResults.length === 0) set({ isIpResultsLoading: true });
    set({ error: null, currentIp: ip });
    try {
      const resp = await bridge.getIpResults(ip, ipResultsPage + 1, ipResultsPageSize);
      set({
        ipResults: resp.data,
        ipResultsTotal: resp.total,
        isIpResultsLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isIpResultsLoading: false });
    }
  },

  fetchIpChartData: async (ip: string) => {
    set({ isChartLoading: true, error: null });
    try {
      const resp = await bridge.getIpResults(ip, 1, 1000);
      // Reverse so oldest first for chronological charts
      set({ ipChartData: resp.data.reverse(), isChartLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isChartLoading: false });
    }
  },
}));
