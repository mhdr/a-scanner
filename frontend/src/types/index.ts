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
}

/// A single scan result.
export interface ScanResult {
  id: string;
  scan_id: string;
  ip: string;
  latency_ms: number | null;
  is_reachable: boolean;
  created_at: string;
}

/// Supported CDN provider.
export interface Provider {
  id: string;
  name: string;
  description: string;
}

/// Pagination query parameters.
export interface PaginationParams {
  page?: number;
  per_page?: number;
}

/// Parameters for creating a new scan.
export interface CreateScanRequest {
  provider: string;
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
