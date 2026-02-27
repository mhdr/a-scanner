//! JNI bridge exposing the `a-scanner-core` facade to Android (Kotlin).
//!
//! Architecture:
//! - A persistent `tokio::Runtime` and `CoreState` are stored in `OnceCell`s
//!   for the lifetime of the Android process.
//! - Each JNI function blocks on the runtime (`runtime.block_on(…)`) to call
//!   async facade functions.
//! - Complex types are exchanged as **JSON strings** (`JString`) for simplicity.
//! - Errors are returned as `{"error": "message"}` — we **never** panic across
//!   the JNI boundary.
//! - Scan progress uses a **poll model**: `startScan` stores a
//!   `broadcast::Receiver` and `pollScanProgress` drains buffered events.

use std::collections::HashMap;
use std::panic::{self, AssertUnwindSafe};
use std::process::Command;

use jni::objects::{JClass, JString};
use jni::sys::{jboolean, jint, jstring, JNI_FALSE, JNI_TRUE};
use jni::JNIEnv;
use once_cell::sync::OnceCell;
use serde::Serialize;
use tokio::sync::{broadcast, Mutex};
use tracing;

use a_scanner_core::error::CoreError;
use a_scanner_core::facade::{self, CoreState};
use a_scanner_core::models::ScanProgressEvent;

// ---------------------------------------------------------------------------
// Static globals
// ---------------------------------------------------------------------------

/// Persistent Tokio runtime (lives for the entire app process).
static RUNTIME: OnceCell<tokio::runtime::Runtime> = OnceCell::new();

/// Core application state initialised once via `init()`.
static CORE_STATE: OnceCell<CoreState> = OnceCell::new();

/// Per-scan broadcast receivers for polling progress events.
///
/// Key: scan ID, Value: the broadcast receiver obtained from `start_scan`.
static PROGRESS_RECEIVERS: OnceCell<
    Mutex<HashMap<String, tokio::sync::Mutex<broadcast::Receiver<ScanProgressEvent>>>>,
> = OnceCell::new();

fn progress_map(
) -> &'static Mutex<HashMap<String, tokio::sync::Mutex<broadcast::Receiver<ScanProgressEvent>>>>
{
    PROGRESS_RECEIVERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn runtime() -> &'static tokio::runtime::Runtime {
    RUNTIME.get().expect("Runtime not initialised — call init() first")
}

fn state() -> &'static CoreState {
    CORE_STATE.get().expect("CoreState not initialised — call init() first")
}

// ---------------------------------------------------------------------------
// JNI helpers
// ---------------------------------------------------------------------------

/// Convert a `JString` into a Rust `String`.
fn jstring_to_string(env: &mut JNIEnv, input: &JString) -> Result<String, String> {
    env.get_string(input)
        .map(|s| s.into())
        .map_err(|e| format!("Failed to read JString: {e}"))
}

/// Create a JNI string from a Rust `&str`, returning a raw `jstring`.
fn to_jstring(env: &mut JNIEnv, value: &str) -> jstring {
    env.new_string(value)
        .map(|s| s.into_raw())
        .unwrap_or_else(|_| {
            // Last resort — if we can't even allocate a string, return null.
            std::ptr::null_mut()
        })
}

/// Serialise a `Serialize`-able value to a JSON `jstring`.
fn ok_json<T: Serialize>(env: &mut JNIEnv, value: &T) -> jstring {
    let json = serde_json::to_string(value).unwrap_or_else(|e| {
        format!(r#"{{"error":"serialization failed: {e}"}}"#)
    });
    to_jstring(env, &json)
}

/// Serialise a `CoreError` into a JSON `jstring`: `{"error": "…"}`.
fn err_json(env: &mut JNIEnv, error: &CoreError) -> jstring {
    let msg = error.to_string().replace('"', "'");
    to_jstring(env, &format!(r#"{{"error":"{msg}"}}"#))
}

/// Wrapper for `{"ok": true}` success responses on void operations.
fn ok_void(env: &mut JNIEnv) -> jstring {
    to_jstring(env, r#"{"ok":true}"#)
}

/// Wrapper for `{"deleted": n}` responses.
fn ok_deleted(env: &mut JNIEnv, n: u64) -> jstring {
    to_jstring(env, &format!(r#"{{"deleted":{n}}}"#))
}

/// Top-level safety net for every JNI entry point.
///
/// Catches both `Result::Err` (from facade calls) and panics (via
/// `catch_unwind`) to guarantee we never unwind across the FFI boundary.
fn safe_jni_call<F>(env: &mut JNIEnv, f: F) -> jstring
where
    F: FnOnce(&mut JNIEnv) -> Result<jstring, String> + panic::UnwindSafe,
{
    // We need a raw pointer dance because `JNIEnv` isn't UnwindSafe and we
    // need to be able to create error strings even after a panic.
    match panic::catch_unwind(AssertUnwindSafe(|| f(env))) {
        Ok(Ok(js)) => js,
        Ok(Err(msg)) => {
            let escaped = msg.replace('"', "'");
            to_jstring(env, &format!(r#"{{"error":"{escaped}"}}"#))
        }
        Err(panic_info) => {
            let msg = if let Some(s) = panic_info.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = panic_info.downcast_ref::<String>() {
                s.clone()
            } else {
                "unknown panic".to_string()
            };
            let escaped = msg.replace('"', "'");
            to_jstring(env, &format!(r#"{{"error":"internal panic: {escaped}"}}"#))
        }
    }
}

/// Helper: convert an optional JString param (empty string → None).
fn optional_string(env: &mut JNIEnv, input: &JString) -> Result<Option<String>, String> {
    let s = jstring_to_string(env, input)?;
    if s.is_empty() {
        Ok(None)
    } else {
        Ok(Some(s))
    }
}

// ---------------------------------------------------------------------------
// JNI entry points
// ---------------------------------------------------------------------------

/// Initialise the Tokio runtime, CoreState, and tracing.
///
/// Must be called exactly once before any other JNI function.
/// `db_path` is a SQLite connection string, e.g. `"sqlite:/data/data/com.ascanner/scanner.db?mode=rwc"`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_init(
    mut env: JNIEnv,
    _class: JClass,
    db_path: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let db_url = jstring_to_string(env, &db_path)?;

        // Build the Tokio runtime.
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("Failed to build tokio runtime: {e}"))?;

        // Initialise the core (runs migrations, seeds admin, etc.).
        let core_state = rt
            .block_on(facade::init(&db_url))
            .map_err(|e| e.to_string())?;

        RUNTIME
            .set(rt)
            .map_err(|_| "Runtime already initialised".to_string())?;
        CORE_STATE
            .set(core_state)
            .map_err(|_| "CoreState already initialised".to_string())?;

        // Init tracing (best-effort — ignore errors if already set).
        let _ = tracing_subscriber::fmt()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
            )
            .with_target(true)
            .try_init();

        // Log current FD limits for diagnostics.
        match rlimit::getrlimit(rlimit::Resource::NOFILE) {
            Ok((soft, hard)) => {
                tracing::info!(
                    "mobile-backend initialised (FD limits: soft={soft}, hard={hard})"
                );
            }
            Err(e) => {
                tracing::info!(
                    "mobile-backend initialised (could not read FD limits: {e})"
                );
            }
        }

        Ok(ok_void(env))
    })
}

// ---------------------------------------------------------------------------
// Root access
// ---------------------------------------------------------------------------

/// Check whether the device has root (`su`) access.
///
/// Runs `su -c id` and returns `JNI_TRUE` (1) if the command succeeds.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_checkRootAccess(
    _env: JNIEnv,
    _class: JClass,
) -> jboolean {
    let result = panic::catch_unwind(|| {
        Command::new("su")
            .args(["-c", "id"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    });
    match result {
        Ok(true) => JNI_TRUE,
        _ => JNI_FALSE,
    }
}

/// Raise file-descriptor limits via root (best-effort).
///
/// Uses `prlimit` via `su` to set the NOFILE (open files) soft and hard limits
/// on the **current process** (identified by PID). This is necessary because
/// running `ulimit -n` in a child `su` shell only affects that shell — it does
/// NOT change the calling process's limits.
///
/// Falls back to a direct `rlimit::setrlimit` attempt if `prlimit` is
/// unavailable or fails.
///
/// Returns a JSON result:
/// ```json
/// {"ok": true, "soft": 65536, "hard": 65536, "method": "prlimit"}
/// ```
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_raiseFdLimit(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let desired: u64 = 65536;
        let pid = std::process::id();

        // Attempt 1: use `prlimit` via root to set limits on our own process.
        let prlimit_cmd = format!("prlimit --pid {pid} --nofile={desired}:{desired}");
        let prlimit_result = Command::new("su")
            .args(["-c", &prlimit_cmd])
            .output();

        let method;
        match prlimit_result {
            Ok(output) if output.status.success() => {
                tracing::info!(
                    "Raised FD limit to {desired} via prlimit (pid {pid})"
                );
                method = "prlimit";
            }
            _ => {
                // Attempt 2: fall back to rlimit crate (calls setrlimit directly
                // — may be capped by the current hard limit without root prlimit).
                tracing::warn!(
                    "prlimit via su failed for pid {pid}, falling back to rlimit crate"
                );
                match rlimit::setrlimit(rlimit::Resource::NOFILE, desired, desired) {
                    Ok(()) => {
                        tracing::info!(
                            "Raised FD limit to {desired} via rlimit::setrlimit"
                        );
                        method = "rlimit";
                    }
                    Err(e) => {
                        tracing::warn!("rlimit::setrlimit also failed: {e}");
                        // Last resort: increase within current hard limit.
                        let _ = rlimit::increase_nofile_limit(desired);
                        method = "increase_nofile_limit";
                    }
                }
            }
        }

        // Read back actual limits for the response.
        let (soft, hard) =
            rlimit::getrlimit(rlimit::Resource::NOFILE).unwrap_or((0, 0));

        tracing::info!("FD limits after raise: soft={soft}, hard={hard}");

        Ok(to_jstring(
            env,
            &format!(
                r#"{{"ok":true,"soft":{soft},"hard":{hard},"method":"{method}"}}"#
            ),
        ))
    })
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/// Authenticate and return a JWT token as JSON: `{"token":"…"}`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_login(
    mut env: JNIEnv,
    _class: JClass,
    username: JString,
    password: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let u = jstring_to_string(env, &username)?;
        let p = jstring_to_string(env, &password)?;
        let result = runtime().block_on(facade::login(state(), &u, &p));
        match result {
            Ok(resp) => Ok(ok_json(env, &resp)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Validate a JWT token and return the claims as JSON.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_validateToken(
    mut env: JNIEnv,
    _class: JClass,
    token: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let t = jstring_to_string(env, &token)?;
        match facade::validate_token(state(), &t) {
            Ok(claims) => Ok(ok_json(env, &claims)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Change the password for the given user.
///
/// `req_json` is a JSON `ChangePasswordRequest`:
/// `{"current_password":"…","new_password":"…"}`
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_changePassword(
    mut env: JNIEnv,
    _class: JClass,
    username: JString,
    req_json: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let u = jstring_to_string(env, &username)?;
        let json = jstring_to_string(env, &req_json)?;
        let req: a_scanner_core::models::ChangePasswordRequest =
            serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {e}"))?;
        let result = runtime().block_on(facade::change_password(state(), &u, &req));
        match result {
            Ok(()) => Ok(ok_void(env)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

/// List scans with pagination. Returns `PaginatedResponse<Scan>` JSON.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_listScans(
    mut env: JNIEnv,
    _class: JClass,
    page: jint,
    per_page: jint,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let result =
            runtime().block_on(facade::list_scans(state(), page as u32, per_page as u32));
        match result {
            Ok(resp) => Ok(ok_json(env, &resp)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Get a single scan by ID. Returns `Scan` JSON.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_getScan(
    mut env: JNIEnv,
    _class: JClass,
    scan_id: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &scan_id)?;
        let result = runtime().block_on(facade::get_scan(state(), &id));
        match result {
            Ok(scan) => Ok(ok_json(env, &scan)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Start a new scan. Returns the `Scan` JSON.
///
/// `config_json` is a JSON `CreateScanRequest`.
/// The broadcast receiver is stored internally for `pollScanProgress`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_startScan(
    mut env: JNIEnv,
    _class: JClass,
    config_json: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let json = jstring_to_string(env, &config_json)?;
        let req: a_scanner_core::models::CreateScanRequest =
            serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {e}"))?;

        let result = runtime().block_on(facade::start_scan(state(), &req));
        match result {
            Ok((scan, rx)) => {
                // Store the receiver for polling.
                let scan_id = scan.id.clone();
                runtime().block_on(async {
                    progress_map()
                        .lock()
                        .await
                        .insert(scan_id, tokio::sync::Mutex::new(rx));
                });
                Ok(ok_json(env, &scan))
            }
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Poll buffered scan progress events.
///
/// Returns a JSON object:
/// ```json
/// { "events": [ … ], "closed": false }
/// ```
///
/// When the scan finishes and the channel closes, `"closed": true` is returned
/// and the receiver is removed from the internal map.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_pollScanProgress(
    mut env: JNIEnv,
    _class: JClass,
    scan_id: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &scan_id)?;

        let (events, closed) = runtime().block_on(async {
            let map = progress_map().lock().await;
            if let Some(rx_mutex) = map.get(&id) {
                let mut rx = rx_mutex.lock().await;
                let mut events = Vec::new();
                let mut closed = false;

                loop {
                    match rx.try_recv() {
                        Ok(event) => events.push(event),
                        Err(broadcast::error::TryRecvError::Empty) => break,
                        Err(broadcast::error::TryRecvError::Lagged(n)) => {
                            tracing::warn!("Scan {id}: lagged {n} events");
                            // Continue draining — some events were lost.
                            continue;
                        }
                        Err(broadcast::error::TryRecvError::Closed) => {
                            closed = true;
                            break;
                        }
                    }
                }
                (events, closed)
            } else {
                // No receiver — scan was never started or already cleaned up.
                (Vec::new(), true)
            }
        });

        // Remove receiver if closed.
        if closed {
            runtime().block_on(async {
                progress_map().lock().await.remove(&id);
            });
        }

        #[derive(Serialize)]
        struct PollResponse {
            events: Vec<ScanProgressEvent>,
            closed: bool,
        }

        Ok(ok_json(env, &PollResponse { events, closed }))
    })
}

/// Get results for a specific scan. Returns `PaginatedResponse<ScanResult>` JSON.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_getScanResults(
    mut env: JNIEnv,
    _class: JClass,
    scan_id: JString,
    page: jint,
    per_page: jint,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &scan_id)?;
        let result = runtime().block_on(facade::get_scan_results(
            state(),
            &id,
            page as u32,
            per_page as u32,
        ));
        match result {
            Ok(resp) => Ok(ok_json(env, &resp)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Delete all completed / failed scans. Returns `{"deleted": n}`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_deleteCompletedScans(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let result = runtime().block_on(facade::delete_completed_scans(state()));
        match result {
            Ok(n) => Ok(ok_deleted(env, n)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/// List all scan results with optional filtering.
///
/// Pass empty strings for `reachable_only` and `provider` to omit the filter.
/// `reachable_only`: `"true"`, `"false"`, or `""` for none.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_listResults(
    mut env: JNIEnv,
    _class: JClass,
    page: jint,
    per_page: jint,
    reachable_only: JString,
    provider: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let reachable_str = jstring_to_string(env, &reachable_only)?;
        let provider_opt = optional_string(env, &provider)?;
        let reachable_opt = match reachable_str.as_str() {
            "true" => Some(true),
            "false" => Some(false),
            _ => None,
        };

        let result = runtime().block_on(facade::list_results(
            state(),
            page as u32,
            per_page as u32,
            reachable_opt,
            provider_opt.as_deref(),
        ));
        match result {
            Ok(resp) => Ok(ok_json(env, &resp)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// List aggregated (deduplicated) reachable IPs with averages.
///
/// Pass empty string for `provider` to omit the filter.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_listAggregatedIps(
    mut env: JNIEnv,
    _class: JClass,
    page: jint,
    per_page: jint,
    provider: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let provider_opt = optional_string(env, &provider)?;
        let result = runtime().block_on(facade::list_aggregated_ips(
            state(),
            page as u32,
            per_page as u32,
            provider_opt.as_deref(),
        ));
        match result {
            Ok(resp) => Ok(ok_json(env, &resp)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// List individual results for a specific IP address.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_getIpResults(
    mut env: JNIEnv,
    _class: JClass,
    ip: JString,
    page: jint,
    per_page: jint,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let ip_str = jstring_to_string(env, &ip)?;
        let result = runtime().block_on(facade::get_ip_results(
            state(),
            &ip_str,
            page as u32,
            per_page as u32,
        ));
        match result {
            Ok(resp) => Ok(ok_json(env, &resp)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/// List all CDN providers. Returns `Vec<Provider>` JSON array.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_listProviders(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let result = runtime().block_on(facade::list_providers(state()));
        match result {
            Ok(providers) => Ok(ok_json(env, &providers)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Get a single provider by ID. Returns `Provider` JSON.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_getProvider(
    mut env: JNIEnv,
    _class: JClass,
    provider_id: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &provider_id)?;
        let result = runtime().block_on(facade::get_provider(state(), &id));
        match result {
            Ok(p) => Ok(ok_json(env, &p)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Create a new custom provider. `req_json` is a JSON `CreateProviderRequest`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_createProvider(
    mut env: JNIEnv,
    _class: JClass,
    req_json: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let json = jstring_to_string(env, &req_json)?;
        let req: a_scanner_core::models::CreateProviderRequest =
            serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {e}"))?;
        let result = runtime().block_on(facade::create_provider(state(), &req));
        match result {
            Ok(p) => Ok(ok_json(env, &p)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Update an existing provider. `req_json` is a JSON `UpdateProviderRequest`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_updateProvider(
    mut env: JNIEnv,
    _class: JClass,
    provider_id: JString,
    req_json: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &provider_id)?;
        let json = jstring_to_string(env, &req_json)?;
        let req: a_scanner_core::models::UpdateProviderRequest =
            serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {e}"))?;
        let result = runtime().block_on(facade::update_provider(state(), &id, &req));
        match result {
            Ok(p) => Ok(ok_json(env, &p)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Delete a custom provider.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_deleteProvider(
    mut env: JNIEnv,
    _class: JClass,
    provider_id: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &provider_id)?;
        let result = runtime().block_on(facade::delete_provider(state(), &id));
        match result {
            Ok(()) => Ok(ok_void(env)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

// ---------------------------------------------------------------------------
// Provider Ranges
// ---------------------------------------------------------------------------

/// List all IP ranges for a provider. Returns `Vec<ProviderRange>` JSON.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_getProviderRanges(
    mut env: JNIEnv,
    _class: JClass,
    provider_id: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &provider_id)?;
        let result = runtime().block_on(facade::get_provider_ranges(state(), &id));
        match result {
            Ok(ranges) => Ok(ok_json(env, &ranges)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Fetch ranges from upstream URLs and store them. Returns `Vec<ProviderRange>` JSON.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_fetchProviderRanges(
    mut env: JNIEnv,
    _class: JClass,
    provider_id: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &provider_id)?;
        let result = runtime().block_on(facade::fetch_provider_ranges(state(), &id));
        match result {
            Ok(ranges) => Ok(ok_json(env, &ranges)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Create a custom IP range. `req_json` is a JSON `CreateRangeRequest`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_createCustomRange(
    mut env: JNIEnv,
    _class: JClass,
    provider_id: JString,
    req_json: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &provider_id)?;
        let json = jstring_to_string(env, &req_json)?;
        let req: a_scanner_core::models::CreateRangeRequest =
            serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {e}"))?;
        let result = runtime().block_on(facade::create_custom_range(state(), &id, &req));
        match result {
            Ok(r) => Ok(ok_json(env, &r)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Update a range. `req_json` is a JSON `UpdateRangeRequest`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_updateRange(
    mut env: JNIEnv,
    _class: JClass,
    range_id: JString,
    req_json: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &range_id)?;
        let json = jstring_to_string(env, &req_json)?;
        let req: a_scanner_core::models::UpdateRangeRequest =
            serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {e}"))?;
        let result = runtime().block_on(facade::update_range(state(), &id, &req));
        match result {
            Ok(r) => Ok(ok_json(env, &r)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Delete a range by ID.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_deleteRange(
    mut env: JNIEnv,
    _class: JClass,
    range_id: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &range_id)?;
        let result = runtime().block_on(facade::delete_range(state(), &id));
        match result {
            Ok(()) => Ok(ok_void(env)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Bulk toggle enabled/disabled for multiple ranges.
///
/// `req_json` is a JSON `BulkToggleRequest`:
/// `{"range_ids":["…","…"],"enabled":true}`
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_bulkToggleRanges(
    mut env: JNIEnv,
    _class: JClass,
    req_json: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let json = jstring_to_string(env, &req_json)?;
        let req: a_scanner_core::models::BulkToggleRequest =
            serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {e}"))?;
        let result = runtime().block_on(facade::bulk_toggle_ranges(state(), &req));
        match result {
            Ok(()) => Ok(ok_void(env)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

// ---------------------------------------------------------------------------
// Provider Settings
// ---------------------------------------------------------------------------

/// Get auto-update settings for a provider. Returns `ProviderSettings` JSON.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_getProviderSettings(
    mut env: JNIEnv,
    _class: JClass,
    provider_id: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &provider_id)?;
        let result = runtime().block_on(facade::get_provider_settings(state(), &id));
        match result {
            Ok(s) => Ok(ok_json(env, &s)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}

/// Update auto-update settings. `req_json` is a JSON `UpdateProviderSettingsRequest`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_ascanner_bridge_ScannerBridge_updateProviderSettings(
    mut env: JNIEnv,
    _class: JClass,
    provider_id: JString,
    req_json: JString,
) -> jstring {
    safe_jni_call(&mut env, |env| {
        let id = jstring_to_string(env, &provider_id)?;
        let json = jstring_to_string(env, &req_json)?;
        let req: a_scanner_core::models::UpdateProviderSettingsRequest =
            serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {e}"))?;
        let result =
            runtime().block_on(facade::update_provider_settings(state(), &id, &req));
        match result {
            Ok(s) => Ok(ok_json(env, &s)),
            Err(e) => Ok(err_json(env, &e)),
        }
    })
}
