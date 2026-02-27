/**
 * Typed TypeScript wrapper around `NativeModules.ScannerModule`.
 *
 * All JNI calls return JSON strings which this layer parses and validates.
 * Errors are thrown as standard `Error` objects.
 */
import { NativeModules } from 'react-native';
import type {
  Scan,
  ScanResult,
  Provider,
  ProviderRange,
  ProviderSettings,
  AggregatedIpResult,
  PaginatedResponse,
  CreateScanRequest,
  CreateProviderRequest,
  UpdateProviderRequest,
  CreateRangeRequest,
  UpdateRangeRequest,
  BulkToggleRequest,
  UpdateProviderSettingsRequest,
  PollProgressResponse,
} from '../types';

const { ScannerModule } = NativeModules;

if (!ScannerModule) {
  throw new Error(
    'ScannerModule native module is not available. Did you build with the .so library?',
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a JSON response from the native module and throw on error payloads. */
function parseResponse<T>(json: string): T {
  const parsed = JSON.parse(json);
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    throw new Error(parsed.error);
  }
  return parsed as T;
}

// ---------------------------------------------------------------------------
// Init & Root
// ---------------------------------------------------------------------------

/** Initialise the Rust backend (SQLite, migrations, TLS, etc.). */
export async function init(): Promise<void> {
  const json: string = await ScannerModule.init();
  parseResponse<{ ok: boolean }>(json);
}

/** Check whether the device has root (su) access. */
export async function checkRootAccess(): Promise<boolean> {
  return ScannerModule.checkRootAccess();
}

/** Result from raising file descriptor limits. */
export interface RaiseFdLimitResult {
  ok: boolean;
  soft: number;
  hard: number;
  method: string;
}

/** Raise file-descriptor limits via root (best-effort). Returns limit details. */
export async function raiseFdLimit(): Promise<RaiseFdLimitResult> {
  const json: string = await ScannerModule.raiseFdLimit();
  return parseResponse<RaiseFdLimitResult>(json);
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

/** List scans with pagination (1-indexed pages). */
export async function listScans(
  page: number,
  perPage: number,
): Promise<PaginatedResponse<Scan>> {
  const json: string = await ScannerModule.listScans(page, perPage);
  return parseResponse<PaginatedResponse<Scan>>(json);
}

/** Get a single scan by ID. */
export async function getScan(scanId: string): Promise<Scan> {
  const json: string = await ScannerModule.getScan(scanId);
  return parseResponse<Scan>(json);
}

/** Start a new scan. */
export async function startScan(req: CreateScanRequest): Promise<Scan> {
  const json: string = await ScannerModule.startScan(JSON.stringify(req));
  return parseResponse<Scan>(json);
}

/** Stop a running scan. */
export async function stopScan(scanId: string): Promise<Scan> {
  const json: string = await ScannerModule.stopScan(scanId);
  return parseResponse<Scan>(json);
}

/** Poll buffered scan progress events. */
export async function pollScanProgress(
  scanId: string,
): Promise<PollProgressResponse> {
  const json: string = await ScannerModule.pollScanProgress(scanId);
  return parseResponse<PollProgressResponse>(json);
}

/** Get results for a specific scan. */
export async function getScanResults(
  scanId: string,
  page: number,
  perPage: number,
): Promise<PaginatedResponse<ScanResult>> {
  const json: string = await ScannerModule.getScanResults(scanId, page, perPage);
  return parseResponse<PaginatedResponse<ScanResult>>(json);
}

/** Delete all completed/failed scans and their results. */
export async function deleteCompletedScans(): Promise<number> {
  const json: string = await ScannerModule.deleteCompletedScans();
  const resp = parseResponse<{ deleted: number }>(json);
  return resp.deleted;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** List results with optional filtering. */
export async function listResults(
  page: number,
  perPage: number,
  reachableOnly?: boolean,
  provider?: string,
): Promise<PaginatedResponse<ScanResult>> {
  const reachableStr =
    reachableOnly === true ? 'true' : reachableOnly === false ? 'false' : '';
  const json: string = await ScannerModule.listResults(
    page,
    perPage,
    reachableStr,
    provider ?? '',
  );
  return parseResponse<PaginatedResponse<ScanResult>>(json);
}

/** List aggregated (deduplicated) reachable IPs with averages. */
export async function listAggregatedIps(
  page: number,
  perPage: number,
  provider?: string,
): Promise<PaginatedResponse<AggregatedIpResult>> {
  const json: string = await ScannerModule.listAggregatedIps(
    page,
    perPage,
    provider ?? '',
  );
  return parseResponse<PaginatedResponse<AggregatedIpResult>>(json);
}

/** Get individual results for a specific IP address. */
export async function getIpResults(
  ip: string,
  page: number,
  perPage: number,
): Promise<PaginatedResponse<ScanResult>> {
  const json: string = await ScannerModule.getIpResults(ip, page, perPage);
  return parseResponse<PaginatedResponse<ScanResult>>(json);
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/** List all providers. */
export async function listProviders(): Promise<Provider[]> {
  const json: string = await ScannerModule.listProviders();
  return parseResponse<Provider[]>(json);
}

/** Get a single provider by ID. */
export async function getProvider(providerId: string): Promise<Provider> {
  const json: string = await ScannerModule.getProvider(providerId);
  return parseResponse<Provider>(json);
}

/** Create a new provider. */
export async function createProvider(
  req: CreateProviderRequest,
): Promise<Provider> {
  const json: string = await ScannerModule.createProvider(JSON.stringify(req));
  return parseResponse<Provider>(json);
}

/** Update an existing provider. */
export async function updateProvider(
  providerId: string,
  req: UpdateProviderRequest,
): Promise<Provider> {
  const json: string = await ScannerModule.updateProvider(
    providerId,
    JSON.stringify(req),
  );
  return parseResponse<Provider>(json);
}

/** Delete a provider. */
export async function deleteProvider(providerId: string): Promise<void> {
  const json: string = await ScannerModule.deleteProvider(providerId);
  parseResponse<{ ok: boolean }>(json);
}

// ---------------------------------------------------------------------------
// Provider Ranges
// ---------------------------------------------------------------------------

/** Get all IP ranges for a provider. */
export async function getProviderRanges(
  providerId: string,
): Promise<ProviderRange[]> {
  const json: string = await ScannerModule.getProviderRanges(providerId);
  return parseResponse<ProviderRange[]>(json);
}

/** Fetch ranges from upstream URLs. */
export async function fetchProviderRanges(
  providerId: string,
): Promise<ProviderRange[]> {
  const json: string = await ScannerModule.fetchProviderRanges(providerId);
  return parseResponse<ProviderRange[]>(json);
}

/** Create a custom IP range. */
export async function createCustomRange(
  providerId: string,
  req: CreateRangeRequest,
): Promise<ProviderRange> {
  const json: string = await ScannerModule.createCustomRange(
    providerId,
    JSON.stringify(req),
  );
  return parseResponse<ProviderRange>(json);
}

/** Update an IP range. */
export async function updateRange(
  rangeId: string,
  req: UpdateRangeRequest,
): Promise<ProviderRange> {
  const json: string = await ScannerModule.updateRange(
    rangeId,
    JSON.stringify(req),
  );
  return parseResponse<ProviderRange>(json);
}

/** Delete an IP range. */
export async function deleteRange(rangeId: string): Promise<void> {
  const json: string = await ScannerModule.deleteRange(rangeId);
  parseResponse<{ ok: boolean }>(json);
}

/** Bulk toggle enabled/disabled for multiple ranges. */
export async function bulkToggleRanges(req: BulkToggleRequest): Promise<void> {
  const json: string = await ScannerModule.bulkToggleRanges(JSON.stringify(req));
  parseResponse<{ ok: boolean }>(json);
}

// ---------------------------------------------------------------------------
// Provider Settings
// ---------------------------------------------------------------------------

/** Get auto-update settings for a provider. */
export async function getProviderSettings(
  providerId: string,
): Promise<ProviderSettings> {
  const json: string = await ScannerModule.getProviderSettings(providerId);
  return parseResponse<ProviderSettings>(json);
}

/** Update auto-update settings for a provider. */
export async function updateProviderSettings(
  providerId: string,
  req: UpdateProviderSettingsRequest,
): Promise<ProviderSettings> {
  const json: string = await ScannerModule.updateProviderSettings(
    providerId,
    JSON.stringify(req),
  );
  return parseResponse<ProviderSettings>(json);
}
