import type {
  CreateScanRequest,
  PaginationParams,
  Provider,
  ResultFilterParams,
  Scan,
  ScanResult,
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
