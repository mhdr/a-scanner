import type {
  CreateProviderRequest,
  CreateRangeRequest,
  CreateScanRequest,
  BulkToggleRequest,
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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  return response.json();
}

function toQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

// --- Scans ---

export async function listScans(params?: PaginationParams): Promise<Scan[]> {
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
): Promise<ScanResult[]> {
  return request(`/api/v1/scans/${id}/results${toQuery((params ?? {}) as Record<string, unknown>)}`);
}

// --- Results ---

export async function listResults(params?: ResultFilterParams): Promise<ScanResult[]> {
  return request(`/api/v1/results${toQuery((params ?? {}) as Record<string, unknown>)}`);
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
