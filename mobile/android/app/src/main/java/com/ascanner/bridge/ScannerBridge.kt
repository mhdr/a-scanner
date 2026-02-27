package com.ascanner.bridge

/**
 * JNI bridge to the Rust `mobile-backend` crate (`libmobile_backend.so`).
 *
 * All functions declared here have corresponding `#[no_mangle] extern "system"`
 * entry points in `crates/mobile-backend/src/lib.rs`.
 *
 * Complex types are exchanged as JSON strings for simplicity.
 */
object ScannerBridge {
    init {
        System.loadLibrary("mobile_backend")
    }

    // -----------------------------------------------------------------------
    // Init & Root
    // -----------------------------------------------------------------------

    /** Initialise Tokio runtime, CoreState, run migrations. */
    external fun init(dbPath: String): String

    /** Check whether the device has root (su) access. */
    external fun checkRootAccess(): Boolean

    /** Raise file-descriptor limits via root. */
    external fun raiseFdLimit(): String

    // -----------------------------------------------------------------------
    // Auth
    // -----------------------------------------------------------------------

    /** Authenticate → JSON LoginResponse {"token":"…"} */
    external fun login(username: String, password: String): String

    /** Validate a JWT token → JSON Claims. */
    external fun validateToken(token: String): String

    /** Change password → JSON {"ok":true} or error. */
    external fun changePassword(username: String, reqJson: String): String

    // -----------------------------------------------------------------------
    // Scans
    // -----------------------------------------------------------------------

    /** List scans → JSON PaginatedResponse<Scan>. */
    external fun listScans(page: Int, perPage: Int): String

    /** Get a single scan → JSON Scan. */
    external fun getScan(scanId: String): String

    /** Start a scan → JSON Scan (also stores broadcast receiver internally). */
    external fun startScan(configJson: String): String

    /** Poll buffered scan progress events → JSON {events:[], closed:bool}. */
    external fun pollScanProgress(scanId: String): String

    /** Get results for a scan → JSON PaginatedResponse<ScanResult>. */
    external fun getScanResults(scanId: String, page: Int, perPage: Int): String

    /** Delete completed/failed scans → JSON {"deleted":n}. */
    external fun deleteCompletedScans(): String

    // -----------------------------------------------------------------------
    // Results
    // -----------------------------------------------------------------------

    /** List results with optional filters → JSON PaginatedResponse<ScanResult>. */
    external fun listResults(page: Int, perPage: Int, reachableOnly: String, provider: String): String

    /** List aggregated IPs → JSON PaginatedResponse<AggregatedIpResult>. */
    external fun listAggregatedIps(page: Int, perPage: Int, provider: String): String

    /** Get results for a specific IP → JSON PaginatedResponse<ScanResult>. */
    external fun getIpResults(ip: String, page: Int, perPage: Int): String

    // -----------------------------------------------------------------------
    // Providers
    // -----------------------------------------------------------------------

    /** List all providers → JSON Vec<Provider>. */
    external fun listProviders(): String

    /** Get a single provider → JSON Provider. */
    external fun getProvider(providerId: String): String

    /** Create a provider → JSON Provider. */
    external fun createProvider(reqJson: String): String

    /** Update a provider → JSON Provider. */
    external fun updateProvider(providerId: String, reqJson: String): String

    /** Delete a provider → JSON {"ok":true}. */
    external fun deleteProvider(providerId: String): String

    // -----------------------------------------------------------------------
    // Provider Ranges
    // -----------------------------------------------------------------------

    /** Get ranges for a provider → JSON Vec<ProviderRange>. */
    external fun getProviderRanges(providerId: String): String

    /** Fetch ranges from upstream URLs → JSON Vec<ProviderRange>. */
    external fun fetchProviderRanges(providerId: String): String

    /** Create a custom range → JSON ProviderRange. */
    external fun createCustomRange(providerId: String, reqJson: String): String

    /** Update a range → JSON ProviderRange. */
    external fun updateRange(rangeId: String, reqJson: String): String

    /** Delete a range → JSON {"ok":true}. */
    external fun deleteRange(rangeId: String): String

    /** Bulk toggle ranges → JSON {"ok":true}. */
    external fun bulkToggleRanges(reqJson: String): String

    // -----------------------------------------------------------------------
    // Provider Settings
    // -----------------------------------------------------------------------

    /** Get provider auto-update settings → JSON ProviderSettings. */
    external fun getProviderSettings(providerId: String): String

    /** Update provider settings → JSON ProviderSettings. */
    external fun updateProviderSettings(providerId: String, reqJson: String): String
}
