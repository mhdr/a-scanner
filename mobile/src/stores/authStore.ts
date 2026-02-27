import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as bridge from '../native/ScannerBridge';

const TOKEN_KEY = 'auth_token';

interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  /** Whether the Rust backend has been initialised. */
  isInitialised: boolean;
  /** Whether the device has root access. */
  rootAvailable: boolean;
  /** Whether the app is performing initial setup. */
  isInitialising: boolean;

  /** Initialise Rust backend, check root, raise FD limits. */
  initApp: () => Promise<void>;
  /** Attempt login with username/password. */
  login: (username: string, password: string) => Promise<void>;
  /** Log out and clear stored token. */
  logout: () => void;
  /** Change the current user's password. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Check if a stored token is still valid. */
  checkAuth: () => Promise<void>;
  /** Clear the error state. */
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: null,
  username: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  isInitialised: false,
  rootAvailable: false,
  isInitialising: false,

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

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const { token } = await bridge.login(username, password);
      await AsyncStorage.setItem(TOKEN_KEY, token);
      set({ token, username, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      });
      throw err;
    }
  },

  logout: () => {
    AsyncStorage.removeItem(TOKEN_KEY);
    set({ token: null, username: null, isAuthenticated: false, error: null });
  },

  changePassword: async (currentPassword, newPassword) => {
    const { username } = get();
    if (!username) throw new Error('Not logged in');
    set({ isLoading: true, error: null });
    try {
      await bridge.changePassword(username, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      set({ isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to change password',
      });
      throw err;
    }
  },

  checkAuth: async () => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ isAuthenticated: false, token: null, username: null });
      return;
    }
    try {
      const claims = await bridge.validateToken(token);
      set({ isAuthenticated: true, token, username: claims.sub });
    } catch {
      await AsyncStorage.removeItem(TOKEN_KEY);
      set({ isAuthenticated: false, token: null, username: null });
    }
  },

  clearError: () => set({ error: null }),
}));
