/// Scan job status.
export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';

/// A scan job.
export interface Scan {
  id: string;
  provider: string;
  status: ScanStatus;
  total_ips: number;
  scanned_ips: number;
  created_at: string;
  updated_at: string;
  mode: string;
  concurrency: number;
  timeout_ms: number;
  port: number;
  extended: boolean;
}

/// A single scan result.
export interface ScanResult {
  id: string;
  scan_id: string;
  ip: string;
  latency_ms: number | null;
  is_reachable: boolean;
  created_at: string;
  tls_latency_ms: number | null;
  ttfb_ms: number | null;
  download_speed_kbps: number | null;
  jitter_ms: number | null;
  success_rate: number | null;
  score: number | null;
}

/// Supported CDN provider.
export interface Provider {
  id: string;
  name: string;
  description: string;
  sni: string;
  ip_range_urls: string;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

/// Request body for creating a new provider.
export interface CreateProviderRequest {
  name: string;
  description?: string;
  sni: string;
  ip_range_urls: string[];
}

/// Request body for updating a provider.
export interface UpdateProviderRequest {
  name?: string;
  description?: string;
  sni?: string;
  ip_range_urls?: string[];
}

/// Pagination query parameters.
export interface PaginationParams {
  page?: number;
  per_page?: number;
}

/// Parameters for creating a new scan.
export interface CreateScanRequest {
  provider: string;
  extended?: boolean;
  concurrency?: number;
  timeout_ms?: number;
  /** Optional explicit list of CIDR ranges to scan. If omitted, uses enabled ranges from DB. */
  ip_ranges?: string[];
}

/// Result filter parameters.
export interface ResultFilterParams extends PaginationParams {
  reachable_only?: boolean;
  provider?: string;
}

/// API error response.
export interface ApiError {
  error: string;
}

/// A provider IP range (CIDR block).
export interface ProviderRange {
  id: string;
  provider_id: string;
  cidr: string;
  ip_count: number;
  enabled: boolean;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

/// Per-provider auto-update settings.
export interface ProviderSettings {
  provider_id: string;
  auto_update: boolean;
  auto_update_interval_hours: number;
  last_fetched_at: string | null;
}

/// Request body for creating a custom IP range.
export interface CreateRangeRequest {
  cidr: string;
  enabled?: boolean;
}

/// Request body for updating an IP range.
export interface UpdateRangeRequest {
  cidr?: string;
  enabled?: boolean;
}

/// Request body for bulk-toggling ranges.
export interface BulkToggleRequest {
  range_ids: string[];
  enabled: boolean;
}

/// Request body for updating provider settings.
export interface UpdateProviderSettingsRequest {
  auto_update?: boolean;
  auto_update_interval_hours?: number;
}
