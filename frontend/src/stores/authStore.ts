import { create } from 'zustand';
import { login as apiLogin, getMe, changePassword as apiChangePassword, getToken, setToken, clearToken } from '../api';

interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

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

export const useAuthStore = create<AuthState>()((set) => ({
  token: getToken(),
  username: null,
  isAuthenticated: !!getToken(),
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const { token } = await apiLogin({ username, password });
      setToken(token);
      set({ token, username, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Login failed' });
      throw err;
    }
  },

  logout: () => {
    clearToken();
    set({ token: null, username: null, isAuthenticated: false, error: null });
  },

  changePassword: async (currentPassword, newPassword) => {
    set({ isLoading: true, error: null });
    try {
      await apiChangePassword({ current_password: currentPassword, new_password: newPassword });
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to change password' });
      throw err;
    }
  },

  checkAuth: async () => {
    const token = getToken();
    if (!token) {
      set({ isAuthenticated: false, token: null, username: null });
      return;
    }
    try {
      const user = await getMe();
      set({ isAuthenticated: true, token, username: user.username });
    } catch {
      clearToken();
      set({ isAuthenticated: false, token: null, username: null });
    }
  },

  clearError: () => set({ error: null }),
}));
