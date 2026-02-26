import { create } from 'zustand';
import type { Provider, ProviderRange, ProviderSettings } from '../types';
import {
  listProviders, getProviderRanges, fetchProviderRanges, createProviderRange,
  updateProviderRange, deleteProviderRange, bulkToggleRanges,
  getProviderSettings, updateProviderSettings,
  createProvider as apiCreateProvider,
  updateProvider as apiUpdateProvider,
  deleteProvider as apiDeleteProvider,
} from '../api';
import type {
  CreateProviderRequest, UpdateProviderRequest,
  CreateRangeRequest, UpdateRangeRequest, BulkToggleRequest, UpdateProviderSettingsRequest,
} from '../types';

interface ProviderState {
  providers: Provider[];
  selectedProviderId: string | null;
  isLoading: boolean;
  error: string | null;

  /** Cached ranges keyed by provider ID. */
  ranges: Record<string, ProviderRange[]>;
  rangesLoading: boolean;

  /** Cached settings keyed by provider ID. */
  settings: Record<string, ProviderSettings>;
  settingsLoading: boolean;

  // Provider actions
  fetchProviders: () => Promise<void>;
  selectProvider: (id: string | null) => void;
  createProvider: (req: CreateProviderRequest) => Promise<void>;
  updateProvider: (id: string, req: UpdateProviderRequest) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;

  // Range actions
  fetchRanges: (providerId: string) => Promise<void>;
  triggerFetchFromSource: (providerId: string) => Promise<void>;
  addRange: (providerId: string, req: CreateRangeRequest) => Promise<void>;
  editRange: (providerId: string, rangeId: string, req: UpdateRangeRequest) => Promise<void>;
  removeRange: (providerId: string, rangeId: string) => Promise<void>;
  bulkToggle: (providerId: string, req: BulkToggleRequest) => Promise<void>;

  // Settings actions
  fetchSettings: (providerId: string) => Promise<void>;
  saveSettings: (providerId: string, req: UpdateProviderSettingsRequest) => Promise<void>;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  selectedProviderId: null,
  isLoading: false,
  error: null,
  ranges: {},
  rangesLoading: false,
  settings: {},
  settingsLoading: false,

  fetchProviders: async () => {
    set({ isLoading: true, error: null });
    try {
      const providers = await listProviders();
      const current = get().selectedProviderId;
      const selected = providers.find((p) => p.id === current)
        ? current
        : providers.length > 0
          ? providers[0].id
          : null;
      set({ providers, selectedProviderId: selected, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  selectProvider: (id: string | null) => {
    set({ selectedProviderId: id });
  },

  createProvider: async (req: CreateProviderRequest) => {
    set({ error: null });
    try {
      const provider = await apiCreateProvider(req);
      await get().fetchProviders();
      set({ selectedProviderId: provider.id });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  updateProvider: async (id: string, req: UpdateProviderRequest) => {
    set({ error: null });
    try {
      await apiUpdateProvider(id, req);
      await get().fetchProviders();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  deleteProvider: async (id: string) => {
    set({ error: null });
    try {
      await apiDeleteProvider(id);
      const { selectedProviderId } = get();
      if (selectedProviderId === id) {
        set({ selectedProviderId: null });
      }
      await get().fetchProviders();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // -----------------------------------------------------------------------
  // Ranges
  // -----------------------------------------------------------------------

  fetchRanges: async (providerId: string) => {
    set({ rangesLoading: true, error: null });
    try {
      const ranges = await getProviderRanges(providerId);
      set({ ranges: { ...get().ranges, [providerId]: ranges }, rangesLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, rangesLoading: false });
    }
  },

  triggerFetchFromSource: async (providerId: string) => {
    set({ rangesLoading: true, error: null });
    try {
      const ranges = await fetchProviderRanges(providerId);
      set({ ranges: { ...get().ranges, [providerId]: ranges }, rangesLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, rangesLoading: false });
    }
  },

  addRange: async (providerId: string, req: CreateRangeRequest) => {
    set({ error: null });
    try {
      await createProviderRange(providerId, req);
      await get().fetchRanges(providerId);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  editRange: async (providerId: string, rangeId: string, req: UpdateRangeRequest) => {
    set({ error: null });
    try {
      await updateProviderRange(providerId, rangeId, req);
      await get().fetchRanges(providerId);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  removeRange: async (providerId: string, rangeId: string) => {
    set({ error: null });
    try {
      await deleteProviderRange(providerId, rangeId);
      await get().fetchRanges(providerId);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  bulkToggle: async (providerId: string, req: BulkToggleRequest) => {
    set({ error: null });
    try {
      await bulkToggleRanges(providerId, req);
      await get().fetchRanges(providerId);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // -----------------------------------------------------------------------
  // Settings
  // -----------------------------------------------------------------------

  fetchSettings: async (providerId: string) => {
    set({ settingsLoading: true, error: null });
    try {
      const s = await getProviderSettings(providerId);
      set({ settings: { ...get().settings, [providerId]: s }, settingsLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, settingsLoading: false });
    }
  },

  saveSettings: async (providerId: string, req: UpdateProviderSettingsRequest) => {
    set({ error: null });
    try {
      const s = await updateProviderSettings(providerId, req);
      set({ settings: { ...get().settings, [providerId]: s } });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
