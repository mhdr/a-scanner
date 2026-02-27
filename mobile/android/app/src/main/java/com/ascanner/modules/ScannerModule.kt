package com.ascanner.modules

import com.ascanner.bridge.ScannerBridge
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * React Native Native Module that wraps [ScannerBridge] JNI calls.
 *
 * Every method runs the JNI call on a background thread to avoid blocking the
 * JS thread, and resolves/rejects the JS Promise with the JSON result.
 */
class ScannerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ScannerModule"

    private fun runOnBackground(promise: Promise, block: () -> String) {
        Thread {
            try {
                val result = block()
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("SCANNER_ERROR", e.message, e)
            }
        }.start()
    }

    // -----------------------------------------------------------------------
    // Init & Root
    // -----------------------------------------------------------------------

    @ReactMethod
    fun init(promise: Promise) {
        val filesDir = reactApplicationContext.filesDir.absolutePath
        val dbPath = "sqlite:$filesDir/scanner.db?mode=rwc"
        runOnBackground(promise) { ScannerBridge.init(dbPath) }
    }

    @ReactMethod
    fun checkRootAccess(promise: Promise) {
        Thread {
            try {
                val hasRoot = ScannerBridge.checkRootAccess()
                promise.resolve(hasRoot)
            } catch (e: Exception) {
                promise.reject("SCANNER_ERROR", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun raiseFdLimit(promise: Promise) {
        runOnBackground(promise) { ScannerBridge.raiseFdLimit() }
    }

    // -----------------------------------------------------------------------
    // Scans
    // -----------------------------------------------------------------------

    @ReactMethod
    fun listScans(page: Int, perPage: Int, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.listScans(page, perPage) }
    }

    @ReactMethod
    fun getScan(scanId: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.getScan(scanId) }
    }

    @ReactMethod
    fun startScan(configJson: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.startScan(configJson) }
    }

    @ReactMethod
    fun pollScanProgress(scanId: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.pollScanProgress(scanId) }
    }

    @ReactMethod
    fun stopScan(scanId: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.stopScan(scanId) }
    }

    @ReactMethod
    fun getScanResults(scanId: String, page: Int, perPage: Int, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.getScanResults(scanId, page, perPage) }
    }

    @ReactMethod
    fun deleteCompletedScans(promise: Promise) {
        runOnBackground(promise) { ScannerBridge.deleteCompletedScans() }
    }

    // -----------------------------------------------------------------------
    // Results
    // -----------------------------------------------------------------------

    @ReactMethod
    fun listResults(
        page: Int,
        perPage: Int,
        reachableOnly: String,
        provider: String,
        promise: Promise
    ) {
        runOnBackground(promise) {
            ScannerBridge.listResults(page, perPage, reachableOnly, provider)
        }
    }

    @ReactMethod
    fun listAggregatedIps(page: Int, perPage: Int, provider: String, promise: Promise) {
        runOnBackground(promise) {
            ScannerBridge.listAggregatedIps(page, perPage, provider)
        }
    }

    @ReactMethod
    fun getIpResults(ip: String, page: Int, perPage: Int, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.getIpResults(ip, page, perPage) }
    }

    // -----------------------------------------------------------------------
    // Providers
    // -----------------------------------------------------------------------

    @ReactMethod
    fun listProviders(promise: Promise) {
        runOnBackground(promise) { ScannerBridge.listProviders() }
    }

    @ReactMethod
    fun getProvider(providerId: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.getProvider(providerId) }
    }

    @ReactMethod
    fun createProvider(reqJson: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.createProvider(reqJson) }
    }

    @ReactMethod
    fun updateProvider(providerId: String, reqJson: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.updateProvider(providerId, reqJson) }
    }

    @ReactMethod
    fun deleteProvider(providerId: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.deleteProvider(providerId) }
    }

    // -----------------------------------------------------------------------
    // Provider Ranges
    // -----------------------------------------------------------------------

    @ReactMethod
    fun getProviderRanges(providerId: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.getProviderRanges(providerId) }
    }

    @ReactMethod
    fun fetchProviderRanges(providerId: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.fetchProviderRanges(providerId) }
    }

    @ReactMethod
    fun createCustomRange(providerId: String, reqJson: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.createCustomRange(providerId, reqJson) }
    }

    @ReactMethod
    fun updateRange(rangeId: String, reqJson: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.updateRange(rangeId, reqJson) }
    }

    @ReactMethod
    fun deleteRange(rangeId: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.deleteRange(rangeId) }
    }

    @ReactMethod
    fun bulkToggleRanges(reqJson: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.bulkToggleRanges(reqJson) }
    }

    // -----------------------------------------------------------------------
    // Provider Settings
    // -----------------------------------------------------------------------

    @ReactMethod
    fun getProviderSettings(providerId: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.getProviderSettings(providerId) }
    }

    @ReactMethod
    fun updateProviderSettings(providerId: String, reqJson: String, promise: Promise) {
        runOnBackground(promise) { ScannerBridge.updateProviderSettings(providerId, reqJson) }
    }
}
