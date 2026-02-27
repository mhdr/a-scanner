import { create } from 'zustand';
import * as bridge from '../native/ScannerBridge';

interface AppState {
  /** Whether the Rust backend has been initialised. */
  isInitialised: boolean;
  /** Whether the device has root access. */
  rootAvailable: boolean;
  /** Whether the app is performing initial setup. */
  isInitialising: boolean;
  /** Initialisation error, if any. */
  error: string | null;

  /** Initialise Rust backend, check root, raise FD limits. */
  initApp: () => Promise<void>;
  /** Clear the error state. */
  clearError: () => void;
}

export const useAppStore = create<AppState>()((set, get) => ({
  isInitialised: false,
  rootAvailable: false,
  isInitialising: false,
  error: null,

  initApp: async () => {
    if (get().isInitialised || get().isInitialising) return;
    set({ isInitialising: true });
    try {
      // Initialise the Rust backend (SQLite, migrations, TLS, etc.)
      await bridge.init();

      // Check root access
      let hasRoot = false;
      try {
        hasRoot = await bridge.checkRootAccess();
      } catch {
        // Root check failed — not rooted
      }

      // Raise FD limits if rooted (uses prlimit via su on the app's own PID)
      if (hasRoot) {
        try {
          const fdResult = await bridge.raiseFdLimit();
          console.log(
            `FD limits raised: soft=${fdResult.soft}, hard=${fdResult.hard} (method: ${fdResult.method})`,
          );
        } catch {
          // Best-effort
        }
      }

      set({ isInitialised: true, rootAvailable: hasRoot, isInitialising: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Initialisation failed',
        isInitialising: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
