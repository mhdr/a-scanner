import { create } from 'zustand';
import type { Provider } from '../types';
import { listProviders } from '../api';

interface ProviderState {
  providers: Provider[];
  isLoading: boolean;
  error: string | null;
  fetchProviders: () => Promise<void>;
}

export const useProviderStore = create<ProviderState>((set) => ({
  providers: [],
  isLoading: false,
  error: null,

  fetchProviders: async () => {
    set({ isLoading: true, error: null });
    try {
      const providers = await listProviders();
      set({ providers, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));
