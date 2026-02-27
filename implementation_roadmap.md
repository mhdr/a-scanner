# α-scanner Mobile App — Implementation Roadmap

Architecture: **Cargo workspace split** (core + web-backend + mobile-backend) + **React Native Android app** with JNI bridge. The device has **root access**.

---

## Phase 1: Split Rust Backend into Cargo Workspace

> **Goal**: Extract shared logic into `core` crate, keep `web-backend` as a thin Axum wrapper, both in a Cargo workspace.

### Step 1.1 — Create Workspace Structure

```
a-scanner/
├── Cargo.toml                    # [workspace] root
├── crates/
│   ├── core/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── db/mod.rs         ← from backend/src/db/
│   │       ├── error.rs          ← from backend/src/error.rs
│   │       ├── models/mod.rs     ← from backend/src/models/
│   │       ├── scanner/          ← from backend/src/scanner/ (mod, orchestrator, provider)
│   │       └── services/         ← from backend/src/services/ (auth, provider, scan, result)
│   │
│   ├── web-backend/
│   │   ├── Cargo.toml            # depends on core
│   │   └── src/
│   │       ├── main.rs           ← from backend/src/main.rs
│   │       ├── lib.rs            ← from backend/src/lib.rs (AppState, but imports core::*)
│   │       └── routes/           ← from backend/src/routes/ (auth, providers, results, scans, ws, static_files)
│   │
│   └── mobile-backend/           # (created empty, filled in Phase 3)
│       ├── Cargo.toml            # depends on core
│       └── src/
│           └── lib.rs
│
├── migrations/                   ← from backend/migrations/
├── frontend/                     # unchanged
└── mobile/                       # React Native app (Phase 4)
```

#### TODO
- [ ] Create root [Cargo.toml](file:///home/mahmood/git/a-scanner/backend/Cargo.toml) with `[workspace]` members
- [ ] Create `crates/core/Cargo.toml` — include: `sqlx`, `serde`, `thiserror`, `anyhow`, `tracing`, `chrono`, `uuid`, `ipnet`, `reqwest`, `rustls`, `tokio-rustls`, `webpki-roots`, `futures`, `rlimit`, `tokio`, `argon2`, `jsonwebtoken`, `rand`, `hex`
- [ ] Move `scanner/`, `services/`, `models/`, [db/](file:///home/mahmood/git/a-scanner/backend/scanner.db), [error.rs](file:///home/mahmood/git/a-scanner/backend/src/error.rs) into `crates/core/src/`
- [ ] Create `crates/core/src/lib.rs` — re-export all modules
- [ ] Create `crates/web-backend/Cargo.toml` — include: `core` (path dep), `axum`, `tower`, `tower-http`, `rust-embed`, `mime_guess`, `tokio`, `serde_json`, `tracing-subscriber`
- [ ] Move `routes/`, [main.rs](file:///home/mahmood/git/a-scanner/backend/src/main.rs), [lib.rs](file:///home/mahmood/git/a-scanner/backend/src/lib.rs) into `crates/web-backend/src/`
- [ ] Update all `use crate::` / `use a_scanner_backend::` imports to `use core::` (or whatever crate name you choose, e.g. `a_scanner_core`)
- [ ] Move `migrations/` to workspace root (shared between web and mobile)
- [ ] Verify: `cargo build` from workspace root succeeds
- [ ] Verify: `cargo test` from workspace root passes all existing tests
- [ ] Update [build.sh](file:///home/mahmood/git/a-scanner/build.sh), [run-backend.sh](file:///home/mahmood/git/a-scanner/run-backend.sh) to point to new `crates/web-backend` paths

<details>
<summary>💬 Prompt for this phase</summary>

```
Split the existing Rust backend at `backend/` into a Cargo workspace with two crates:

1. `crates/core` — a library crate containing:
   - `scanner/` (mod.rs, orchestrator.rs, provider.rs)
   - `services/` (auth_service.rs, provider_service.rs, scan_service.rs, result_service.rs)
   - `models/mod.rs`
   - `db/mod.rs`
   - `error.rs`
   - Dependencies: sqlx, serde, thiserror, anyhow, tracing, chrono, uuid, ipnet, reqwest, rustls, tokio-rustls, webpki-roots, futures, rlimit, tokio, argon2, jsonwebtoken, rand, hex

2. `crates/web-backend` — a binary crate containing:
   - `routes/` (auth.rs, providers.rs, results.rs, scans.rs, ws.rs, static_files.rs, mod.rs)
   - `main.rs` and `lib.rs` (AppState)
   - Dependencies: a-scanner-core (path = "../core"), axum, tower, tower-http, rust-embed, mime_guess, tokio, serde_json, tracing-subscriber

Create a root Cargo.toml workspace. Move migrations/ to the workspace root.
Update all imports from `crate::` to reference `a_scanner_core::` where needed.
The web-backend's AppState should import models, services, and scanner from core.
Make sure `cargo build` and `cargo test` pass after the refactor.
Update build.sh and run-backend.sh scripts to use the new workspace paths.
```

</details>

---

## Phase 2: Define Core's Public API for Mobile

> **Goal**: Make `core` usable without Axum — ensure it exposes clean async functions, not route handlers.

### Step 2.1 — Create a Facade / Service Layer in Core

#### TODO
- [ ] Audit `services/` — ensure none import Axum types (they likely don't, but verify)
- [ ] Ensure [AppState](file:///home/mahmood/git/a-scanner/backend/src/lib.rs#18-26)-like config (DB pool, TLS connector, JWT secret) lives in `core` as a `CoreConfig` or `CoreState` struct
- [ ] Create `core::facade` module with simple async functions:
  - `init(db_path: &str) -> CoreState` — initialize DB, run migrations, setup TLS
  - `login(state, username, password) -> Result<Token>`
  - `list_providers(state) -> Result<Vec<Provider>>`
  - `start_scan(state, config) -> ScanHandle` — returns a channel/stream for progress
  - `get_scan_results(state, scan_id) -> Result<Vec<ScanResult>>`
  - `list_scans(state) -> Result<Vec<Scan>>`
  - etc.
- [ ] Make progress events available via `tokio::sync::broadcast` or a callback trait (not WebSocket — that's a web concern)
- [ ] Verify: existing tests still pass

<details>
<summary>💬 Prompt for this phase</summary>

```
In the `crates/core` crate, create a facade module (`src/facade.rs`) that provides
a high-level async API for all scanner operations. This API must NOT depend on
Axum, WebSocket, or any HTTP types.

Create a `CoreState` struct in core that holds:
- SqlitePool
- TlsConnector (Arc)
- JWT secret

Provide these public async functions in the facade:
- init(db_path: &str) -> Result<CoreState> — creates DB pool, runs migrations, sets up TLS
- login(state: &CoreState, username: &str, password: &str) -> Result<String> (JWT token)
- list_providers(state: &CoreState) -> Result<Vec<Provider>>
- get_provider(state: &CoreState, id: i64) -> Result<Provider>
- create_provider(state: &CoreState, ...) -> Result<Provider>
- list_scans(state: &CoreState, page: i64, per_page: i64) -> Result<Vec<Scan>>
- start_scan(state: &CoreState, config: ScanConfig) -> Result<(String, broadcast::Receiver<ScanProgressEvent>)>
- get_scan_results(state: &CoreState, scan_id: &str, ...) -> Result<Vec<ScanResult>>

The web-backend's AppState should wrap CoreState and add web-specific concerns
(scan_channels HashMap, etc). Update web-backend routes to call facade functions
or continue using services directly.

All existing tests must pass.
```

</details>

---

## Phase 3: Mobile Backend — JNI Bridge

> **Goal**: Create `crates/mobile-backend` that exposes core functions via JNI to Kotlin.

### Step 3.1 — Setup JNI Crate

#### TODO
- [ ] Add `jni` crate dependency to `crates/mobile-backend/Cargo.toml`
- [ ] Set crate type to `cdylib` (produces `.so` for Android)
- [ ] Create JNI bridge functions that call `core::facade::*`
- [ ] Handle the Tokio runtime — create a persistent `Runtime` that lives for the app's lifetime
- [ ] Map Rust types to JNI-compatible types (use JSON strings for complex types — simplest approach)

### Step 3.2 — JNI Function Signatures

#### TODO
- [ ] `Java_com_ascanner_bridge_ScannerBridge_init(env, db_path: JString)` — initialize core, store `CoreState` in a static
- [ ] `Java_com_ascanner_bridge_ScannerBridge_login(env, username, password) -> JString` (JSON)
- [ ] `Java_com_ascanner_bridge_ScannerBridge_listProviders(env) -> JString` (JSON array)
- [ ] `Java_com_ascanner_bridge_ScannerBridge_startScan(env, configJson: JString) -> JString` (scan ID)
- [ ] `Java_com_ascanner_bridge_ScannerBridge_getScanProgress(env, scanId: JString) -> JString` (poll-based progress)
- [ ] `Java_com_ascanner_bridge_ScannerBridge_getScanResults(env, scanId: JString) -> JString` (JSON array)
- [ ] `Java_com_ascanner_bridge_ScannerBridge_listScans(env) -> JString`
- [ ] `Java_com_ascanner_bridge_ScannerBridge_requestRootAccess(env) -> jboolean` — run `su -c id` to verify root
- [ ] Handle errors gracefully — return JSON `{ "error": "message" }` instead of panicking

### Step 3.3 — Cross-Compilation Setup

#### TODO
- [ ] Install Android NDK
- [ ] Install Rust target: `rustup target add aarch64-linux-android`
- [ ] Configure `.cargo/config.toml` for Android linker:
  ```toml
  [target.aarch64-linux-android]
  linker = "/path/to/ndk/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android30-clang"
  ```
- [ ] Handle SQLite for Android — either use `sqlx` with bundled SQLite feature or link against Android's system SQLite
- [ ] Build: `cargo build --target aarch64-linux-android -p mobile-backend --release`
- [ ] Verify: produces `libmobile_backend.so`

<details>
<summary>💬 Prompt for this phase</summary>

```
Create the `crates/mobile-backend` crate as a JNI bridge to expose the core
scanner library to Android (Kotlin).

Setup:
- Cargo.toml: crate-type = ["cdylib"], dependencies: a-scanner-core (path dep),
  jni = "0.21", tokio (full features), serde_json, once_cell
- Target: aarch64-linux-android

Architecture:
- Use `once_cell::sync::OnceCell` to store a persistent tokio::Runtime and CoreState
- Each JNI function blocks on the runtime to call async core functions
- Pass complex types as JSON strings (JString) for simplicity
- Package name: com.ascanner.bridge.ScannerBridge

Implement these JNI functions:
1. init(dbPath: String) — creates tokio runtime, initializes CoreState, stores in OnceCell
2. login(username: String, password: String) -> String (JSON with token or error)
3. listProviders() -> String (JSON array)
4. startScan(configJson: String) -> String (scan ID)
5. pollScanProgress(scanId: String) -> String (JSON progress event)
6. getScanResults(scanId: String, page: Int, perPage: Int) -> String (JSON)
7. listScans(page: Int, perPage: Int) -> String (JSON)
8. checkRootAccess() -> Boolean

For scan progress, use a polling model: startScan stores a broadcast::Receiver
in a HashMap<String, Receiver>, and pollScanProgress drains available events.

Root access: use std::process::Command to run "su -c id" and check exit status.

Handle all errors gracefully — never panic, always return JSON error objects.
Add .cargo/config.toml for Android NDK cross-compilation.
```

</details>

---

## Phase 4: React Native Android App

> **Goal**: Build the Android app using React Native (Expo) with a native module bridging Kotlin ↔ Rust JNI.

### Step 4.1 — Project Setup

#### TODO
- [ ] Create React Native project: `npx -y react-native init AScanner --template react-native-template-typescript`
  - Or use Expo: `npx -y create-expo-app@latest mobile --template blank-typescript`
- [ ] Configure for **Android-only** — remove iOS targets
- [ ] Setup project structure:
  ```
  mobile/
  ├── android/
  │   └── app/src/main/java/com/ascanner/
  │       ├── bridge/
  │       │   └── ScannerBridge.kt          # JNI declarations
  │       └── modules/
  │           └── ScannerModule.kt          # React Native Native Module
  ├── src/
  │   ├── App.tsx
  │   ├── api/                              # calls NativeModule instead of HTTP
  │   ├── components/
  │   ├── hooks/
  │   ├── pages/
  │   ├── stores/                           # adapted from frontend/src/stores/
  │   └── types/                            # reuse from frontend/src/types/
  └── package.json
  ```

### Step 4.2 — Kotlin JNI Bridge

#### TODO
- [ ] Create `ScannerBridge.kt`:
  ```kotlin
  package com.ascanner.bridge

  object ScannerBridge {
      init { System.loadLibrary("mobile_backend") }

      external fun init(dbPath: String)
      external fun login(username: String, password: String): String
      external fun listProviders(): String
      external fun startScan(configJson: String): String
      external fun pollScanProgress(scanId: String): String
      external fun getScanResults(scanId: String, page: Int, perPage: Int): String
      external fun listScans(page: Int, perPage: Int): String
      external fun checkRootAccess(): Boolean
  }
  ```
- [ ] Copy `libmobile_backend.so` into `android/app/src/main/jniLibs/arm64-v8a/`

### Step 4.3 — React Native Native Module

#### TODO
- [ ] Create `ScannerModule.kt` — a React Native `ReactContextBaseJavaModule` that:
  - Wraps `ScannerBridge` calls
  - Uses `@ReactMethod` annotations
  - Returns results via `Promise` (React Native's async bridge)
  - Runs JNI calls on a background thread (coroutine or `AsyncTask`)
- [ ] Create `ScannerPackage.kt` — registers the native module
- [ ] Register in `MainApplication.kt`

### Step 4.4 — TypeScript API Layer

#### TODO
- [ ] Create `src/native/ScannerBridge.ts`:
  ```typescript
  import { NativeModules } from 'react-native';
  const { ScannerModule } = NativeModules;

  export const scanner = {
    init: (dbPath: string) => ScannerModule.init(dbPath),
    login: async (u: string, p: string) => JSON.parse(await ScannerModule.login(u, p)),
    listProviders: async () => JSON.parse(await ScannerModule.listProviders()),
    startScan: async (config: object) => JSON.parse(await ScannerModule.startScan(JSON.stringify(config))),
    // ...
  };
  ```
- [ ] Adapt Zustand stores from `frontend/src/stores/` to call `scanner.*` instead of `fetch('/api/v1/...')`
- [ ] Copy `frontend/src/types/` as-is (types are the same)

### Step 4.5 — UI Screens

#### TODO
- [ ] Replace MUI components with React Native Paper (or React Native Elements)
- [ ] Rewrite pages from `frontend/src/pages/`:
  - LoginPage → LoginScreen
  - ScansPage → ScansScreen
  - ScanDetailPage → ScanDetailScreen (progress polling instead of WebSocket)
  - ProvidersPage → ProvidersScreen
  - ResultsPage → ResultsScreen
- [ ] Navigation: `@react-navigation/native` with stack + drawer
- [ ] Theme: dark mode, matching the existing web theme colors

<details>
<summary>💬 Prompt for this phase</summary>

```
Create a React Native (bare workflow, not Expo) Android-only app in the `mobile/`
directory. The app consumes the Rust scanner core via JNI (no HTTP server).

1. Kotlin layer (android/app/src/main/java/com/ascanner/):
   - bridge/ScannerBridge.kt — JNI external declarations, loads libmobile_backend.so
   - modules/ScannerModule.kt — ReactContextBaseJavaModule wrapping ScannerBridge
   - modules/ScannerPackage.kt — registers ScannerModule

2. TypeScript layer:
   - src/native/ScannerBridge.ts — typed wrapper around NativeModules.ScannerModule
   - src/stores/ — adapt existing Zustand stores from frontend/src/stores/ to use
     the JNI bridge instead of HTTP fetch
   - src/types/ — copy from frontend/src/types/ (same domain types)

3. Screens (use React Native Paper for UI):
   - LoginScreen, ScansScreen, ScanDetailScreen, ProvidersScreen, ResultsScreen
   - Use @react-navigation/native with a drawer navigator
   - Dark theme matching the web app

4. For scan progress, poll pollScanProgress() every 500ms while a scan is running
   (no WebSocket needed since we're in-process).

5. Copy libmobile_backend.so to android/app/src/main/jniLibs/arm64-v8a/

The app should work completely offline — all scanning runs on-device via the
Rust core. Root access is available for elevated network operations.
```

</details>

---

## Phase 5: Root Access Integration

> **Goal**: Leverage root to raise file descriptor limits and bypass Android network restrictions.

#### TODO
- [ ] In `mobile-backend` JNI `init()`, run `su -c ulimit -n 65536` to raise fd limit before scanning
- [ ] Optionally run the tokio runtime in a root context if needed for raw socket access
- [ ] In `ScannerModule.kt`, call `checkRootAccess()` at startup and show a warning if not available
- [ ] Consider: grant the app `NET_RAW` capability via root for any future raw socket needs

<details>
<summary>💬 Prompt for this phase</summary>

```
In the mobile-backend JNI init function, add root access setup:
1. Run "su -c ulimit -n 65536" to raise file descriptor limit for high-concurrency scanning
2. Add a checkRootAccess() function that runs "su -c id" and returns true if exit code is 0
3. In the React Native ScannerModule, call checkRootAccess() during init and emit
   a warning event to JS if root is unavailable

In core, make the concurrency limit configurable (it's currently hardcoded at 3000)
so the mobile app can set it lower if needed (e.g. 500 for battery conservation).
```

</details>

---

## Phase 6: Build Pipeline & Packaging

#### TODO
- [ ] Create `build-mobile.sh` script:
  1. Build Rust: `cargo build --target aarch64-linux-android -p mobile-backend --release`
  2. Copy `.so` to `mobile/android/app/src/main/jniLibs/arm64-v8a/libmobile_backend.so`
  3. Build APK: `cd mobile && npx react-native build-android --mode=release`
- [ ] Add GitHub Actions workflow for Android builds
- [ ] Create `build-web.sh` (renamed from `build.sh`) for the web-only build
- [ ] Update root `README.md` with mobile build instructions

<details>
<summary>💬 Prompt for this phase</summary>

```
Create build-mobile.sh that:
1. Builds the mobile-backend crate for aarch64-linux-android (release mode)
2. Copies libmobile_backend.so to mobile/android/app/src/main/jniLibs/arm64-v8a/
3. Runs the React Native Android release build

Create a GitHub Actions workflow (.github/workflows/build-android.yml) that:
1. Sets up Rust, Android NDK, Node.js
2. Runs build-mobile.sh
3. Uploads the APK as a release artifact

Update README.md with a "Mobile App" section covering prerequisites and build steps.
```

</details>

---

## Execution Order

| Order | Phase | Depends On | Estimated Effort |
|-------|-------|-----------|-----------------|
| 1 | Phase 1 — Workspace split | Nothing | 2–3 hours |
| 2 | Phase 2 — Core facade API | Phase 1 | 1–2 hours |
| 3 | Phase 3 — JNI bridge | Phase 2 | 3–4 hours |
| 4 | Phase 4 — React Native app | Phase 3 | 6–8 hours |
| 5 | Phase 5 — Root integration | Phase 3 | 1 hour |
| 6 | Phase 6 — Build pipeline | Phase 4 | 1–2 hours |

**Total estimated effort: ~14–20 hours**

> [!TIP]
> Implement phases sequentially. After each phase, run all tests before moving on. Phase 1 is the most critical — if the workspace split breaks anything, it's easiest to catch early.
