import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ScanPreferencesState {
  // Provider & mode
  selectedProvider: string;
  extended: boolean;
  showAdvanced: boolean;

  // Basic parameters
  concurrency: number;
  timeoutMs: number;
  port: number;

  // Extended parameters
  samples: number;
  extendedConcurrency: number;
  extendedTimeoutMs: number;
  packetLossProbes: number;

  // Custom IP ranges (newline-separated CIDRs)
  ipRanges: string;

  // Actions
  setSelectedProvider: (provider: string) => void;
  setExtended: (extended: boolean) => void;
  setShowAdvanced: (show: boolean) => void;
  setConcurrency: (concurrency: number) => void;
  setTimeoutMs: (timeoutMs: number) => void;
  setPort: (port: number) => void;
  setSamples: (samples: number) => void;
  setExtendedConcurrency: (concurrency: number) => void;
  setExtendedTimeoutMs: (timeoutMs: number) => void;
  setPacketLossProbes: (probes: number) => void;
  setIpRanges: (ranges: string) => void;
}

export const useScanPreferencesStore = create<ScanPreferencesState>()(
  persist(
    (set) => ({
      selectedProvider: 'cloudflare',
      extended: false,
      showAdvanced: false,
      concurrency: 3000,
      timeoutMs: 2000,
      port: 443,
      samples: 10,
      extendedConcurrency: 200,
      extendedTimeoutMs: 10000,
      packetLossProbes: 10,
      ipRanges: '',

      setSelectedProvider: (provider) => set({ selectedProvider: provider }),
      setExtended: (extended) => set({ extended }),
      setShowAdvanced: (show) => set({ showAdvanced: show }),
      setConcurrency: (concurrency) => set({ concurrency }),
      setTimeoutMs: (timeoutMs) => set({ timeoutMs }),
      setPort: (port) => set({ port }),
      setSamples: (samples) => set({ samples }),
      setExtendedConcurrency: (concurrency) => set({ extendedConcurrency: concurrency }),
      setExtendedTimeoutMs: (timeoutMs) => set({ extendedTimeoutMs: timeoutMs }),
      setPacketLossProbes: (probes) => set({ packetLossProbes: probes }),
      setIpRanges: (ranges) => set({ ipRanges: ranges }),
    }),
    {
      name: 'scan-preferences',
    },
  ),
);
