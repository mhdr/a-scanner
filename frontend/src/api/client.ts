import type {
  AggregatedIpResult,
  AuthUser,
  ChangePasswordRequest,
  CreateProviderRequest,
  CreateRangeRequest,
  CreateScanRequest,
  BulkToggleRequest,
  LoginRequest,
  LoginResponse,
  PaginatedResponse,
  PaginationParams,
  Provider,
  ProviderRange,
  ProviderSettings,
  ResultFilterParams,
  Scan,
  ScanResult,
  UpdateProviderRequest,
  UpdateProviderSettingsRequest,
  UpdateRangeRequest,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

/** Key used for storing the JWT in localStorage. */
const TOKEN_KEY = 'auth_token';

/** Read the stored auth token. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Persist an auth token. */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Remove the stored auth token. */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    headers,
    ...options,
  });

  if (response.status === 401) {
    clearToken();
    // Redirect to login unless already on the login page
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('Session expired — please log in again');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  // 204 No Content — nothing to parse
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function toQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

// --- Scans ---

export async function listScans(params?: PaginationParams): Promise<PaginatedResponse<Scan>> {
  return request(`/api/v1/scans${toQuery((params ?? {}) as Record<string, unknown>)}`);
}

export async function createScan(body: CreateScanRequest): Promise<Scan> {
  return request('/api/v1/scans', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getScan(id: string): Promise<Scan> {
  return request(`/api/v1/scans/${id}`);
}

export async function getScanResults(
  id: string,
  params?: PaginationParams,
): Promise<PaginatedResponse<ScanResult>> {
  return request(`/api/v1/scans/${id}/results${toQuery((params ?? {}) as Record<string, unknown>)}`);
}

export async function stopScan(id: string): Promise<Scan> {
  return request(`/api/v1/scans/${id}/stop`, { method: 'POST' });
}

// --- Results ---

export async function listResults(params?: ResultFilterParams): Promise<PaginatedResponse<ScanResult>> {
  return request(`/api/v1/results${toQuery((params ?? {}) as Record<string, unknown>)}`);
}

export async function deleteAllResults(): Promise<void> {
  await request('/api/v1/results', { method: 'DELETE' });
}

export async function listAggregatedIps(
  params?: PaginationParams & { provider?: string },
): Promise<PaginatedResponse<AggregatedIpResult>> {
  return request(`/api/v1/results/ips${toQuery((params ?? {}) as Record<string, unknown>)}`);
}

export async function getIpResults(
  ip: string,
  params?: PaginationParams,
): Promise<PaginatedResponse<ScanResult>> {
  return request(`/api/v1/results/ips/${encodeURIComponent(ip)}${toQuery((params ?? {}) as Record<string, unknown>)}`);
}

// --- Providers ---

export async function listProviders(): Promise<Provider[]> {
  return request('/api/v1/providers');
}

export async function getProvider(id: string): Promise<Provider> {
  return request(`/api/v1/providers/${id}`);
}

export async function createProvider(body: CreateProviderRequest): Promise<Provider> {
  return request('/api/v1/providers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateProvider(
  id: string, body: UpdateProviderRequest,
): Promise<Provider> {
  return request(`/api/v1/providers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteProvider(id: string): Promise<void> {
  await request(`/api/v1/providers/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Provider ranges
// ---------------------------------------------------------------------------

export async function getProviderRanges(providerId: string): Promise<ProviderRange[]> {
  return request(`/api/v1/providers/${providerId}/ranges`);
}

export async function fetchProviderRanges(providerId: string): Promise<ProviderRange[]> {
  return request(`/api/v1/providers/${providerId}/ranges/fetch`, { method: 'POST' });
}

export async function createProviderRange(
  providerId: string, body: CreateRangeRequest,
): Promise<ProviderRange> {
  return request(`/api/v1/providers/${providerId}/ranges`, {
    method: 'POST', body: JSON.stringify(body),
  });
}

export async function updateProviderRange(
  providerId: string, rangeId: string, body: UpdateRangeRequest,
): Promise<ProviderRange> {
  return request(`/api/v1/providers/${providerId}/ranges/${rangeId}`, {
    method: 'PUT', body: JSON.stringify(body),
  });
}

export async function deleteProviderRange(
  providerId: string, rangeId: string,
): Promise<void> {
  await request(`/api/v1/providers/${providerId}/ranges/${rangeId}`, { method: 'DELETE' });
}

export async function bulkToggleRanges(
  providerId: string, body: BulkToggleRequest,
): Promise<void> {
  await request(`/api/v1/providers/${providerId}/ranges/bulk`, {
    method: 'PATCH', body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Provider settings
// ---------------------------------------------------------------------------

export async function getProviderSettings(providerId: string): Promise<ProviderSettings> {
  return request(`/api/v1/providers/${providerId}/settings`);
}

export async function updateProviderSettings(
  providerId: string, body: UpdateProviderSettingsRequest,
): Promise<ProviderSettings> {
  return request(`/api/v1/providers/${providerId}/settings`, {
    method: 'PUT', body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(body: LoginRequest): Promise<LoginResponse> {
  return request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getMe(): Promise<AuthUser> {
  return request('/api/v1/auth/me');
}

export async function changePassword(body: ChangePasswordRequest): Promise<void> {
  await request('/api/v1/auth/password', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
