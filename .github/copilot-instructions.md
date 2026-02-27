# Copilot Instructions — α-scanner

## Project Overview

α-scanner is a Rust-based application for scanning CDN IP addresses (Cloudflare, Gcore, and custom providers) to find ones that are not filtered by firewalls such as Iran's Great Firewall (GFW). It provides both a **web UI** (React + MUI) and a **native Android app** (React Native) for initiating scans, viewing results, and managing IP ranges. The Android app runs scans **on-device** via JNI (no HTTP server needed) and requires **root access** for elevated network operations.

## Tech Stack

| Layer            | Technology                                                      |
|------------------|-----------------------------------------------------------------|
| Core Library     | Rust, Tokio, SQLite (sqlx), rustls                              |
| Web Backend      | Rust, Axum 0.8, tower-http, rust-embed                         |
| Mobile Backend   | Rust, JNI 0.21 (cdylib → `libmobile_backend.so`)               |
| Web Frontend     | React 19, TypeScript, MUI 7, Zustand 5, Vite 7, React Router 7 |
| Mobile App       | React Native 0.84 (bare workflow), TypeScript, React Native Paper, Zustand 5 |
| Auth             | Argon2, JWT (jsonwebtoken, HS256, 24h expiry)                   |
| Database         | SQLite (via sqlx, WAL mode, automatic migrations)               |
| Build            | Cargo workspace (Rust), Vite (web frontend), Gradle + React Native CLI (mobile) |

## Architecture Overview

The Rust backend is split into a **Cargo workspace** with three crates:

- **`core`** (`a-scanner-core`) — library crate containing all shared business logic: scanner, services, models, database, error types, and a facade API. Has **no dependency** on Axum, HTTP, or JNI. Has a `bundled-sqlite` feature flag for Android builds.
- **`web-backend`** (`a-scanner-web`) — binary crate that wraps `core` with Axum HTTP routes, WebSocket support, and embedded static frontend files. Produces the `a-scanner` binary. Depends on `core`.
- **`mobile-backend`** (`a-scanner-mobile`) — `cdylib` crate that wraps `core` with JNI bridge functions for Android. Depends on `core` with `bundled-sqlite` feature. Produces `libmobile_backend.so`.

This separation ensures the scanning engine and business logic are reusable across both web and mobile without duplication.

## Project Structure

```
a-scanner/
├── Cargo.toml                        # [workspace] root — members: crates/*
├── .cargo/config.toml                # Android NDK cross-compilation config (aarch64 + armv7)
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/
│       ├── build-android.yml         # CI: build Android APK
│       └── build-web.yml            # CI: build web binary + run tests
├── build.sh                          # Build web deployable (frontend + static musl binary)
├── build-mobile.sh                   # Build Android APK (Rust .so for arm64+armv7 + RN app)
├── deploy.sh                         # Package web release zip to deploy/
├── deploy-mobile.sh                  # Package mobile APK to deploy/
├── install.sh                        # Interactive systemd installer (web, 622 lines)
├── run-backend.sh                    # Dev script: start web backend
├── run-frontend.sh                   # Dev script: start web frontend (Vite)
├── migrations/                       # SQLite migrations (shared, at workspace root)
│   ├── 20260226000000_initial.sql
│   ├── ...                           # 8 migration files total
│
├── crates/
│   ├── core/
│   │   ├── Cargo.toml               # Lib crate: sqlx, serde, tokio, tracing, etc.
│   │   └── src/
│   │       ├── lib.rs               # Re-exports all modules
│   │       ├── error.rs             # Unified error types (thiserror)
│   │       ├── facade.rs            # High-level async API (no HTTP/JNI types)
│   │       ├── db/mod.rs            # Database pool, queries, migrations
│   │       ├── models/mod.rs        # Domain types (Scan, ScanResult, Provider, etc.)
│   │       ├── scanner/             # IP scanning/probing engine
│   │       │   ├── mod.rs           # Probing functions, ScanConfig, CdnProvider trait
│   │       │   ├── orchestrator.rs  # Two-phase scan orchestration, CancellationToken
│   │       │   └── provider.rs      # CDN provider impl, CIDR fetching/expansion
│   │       └── services/            # Business logic layer
│   │           ├── mod.rs
│   │           ├── auth_service.rs
│   │           ├── provider_service.rs
│   │           ├── scan_service.rs
│   │           └── result_service.rs
│   │
│   ├── web-backend/
│   │   ├── Cargo.toml               # Bin crate: core (path dep), axum, tower-http, rust-embed
│   │   └── src/
│   │       ├── main.rs              # Axum server entry point
│   │       ├── lib.rs               # AppState (wraps core::CoreState)
│   │       ├── error.rs             # HTTP error mapping (CoreError → AppError → IntoResponse)
│   │       └── routes/              # HTTP route handlers
│   │           ├── mod.rs           # Route tree + JWT auth middleware
│   │           ├── auth.rs          # POST /login, PUT /password, GET /me
│   │           ├── providers.rs     # CRUD providers, ranges, settings, fetch
│   │           ├── results.rs       # GET results, aggregated, per-IP
│   │           ├── scans.rs         # CRUD scans, start, stop, delete
│   │           ├── ws.rs            # WebSocket scan progress streaming
│   │           └── static_files.rs  # Embedded frontend via rust-embed
│   │
│   └── mobile-backend/
│       ├── Cargo.toml               # cdylib crate: core (path dep), jni, once_cell, tokio, serde_json
│       └── src/
│           └── lib.rs               # 28 JNI bridge functions (Java_com_ascanner_bridge_*)
│
├── frontend/                         # React web frontend
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                  # AuthGuard + routes (/login, /scans, /providers, /results)
│       ├── theme.ts
│       ├── api/
│       │   ├── client.ts           # fetch-based HTTP wrapper, JWT from localStorage
│       │   └── index.ts            # Re-exports
│       ├── components/
│       │   ├── ChangePasswordDialog.tsx
│       │   └── Layout.tsx           # Sidebar navigation layout
│       ├── hooks/
│       │   └── useScanProgress.ts   # WebSocket-based scan progress
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── ScansPage.tsx
│       │   ├── ScanDetailPage.tsx
│       │   ├── ProvidersPage.tsx
│       │   ├── ResultsPage.tsx
│       │   └── IpDetailPage.tsx
│       ├── stores/                  # Zustand stores (HTTP-based)
│       │   ├── authStore.ts
│       │   ├── scanStore.ts
│       │   ├── providerStore.ts
│       │   ├── resultStore.ts
│       │   └── scanPreferencesStore.ts
│       └── types/
│           └── index.ts             # Shared TypeScript domain types
│
├── mobile/                           # React Native Android app (no auth — single-user device)
│   ├── package.json
│   ├── android/
│   │   └── app/src/main/
│   │       ├── java/com/ascanner/
│   │       │   ├── MainActivity.kt
│   │       │   ├── MainApplication.kt
│   │       │   ├── bridge/
│   │       │   │   └── ScannerBridge.kt     # JNI external declarations
│   │       │   └── modules/
│   │       │       ├── ScannerModule.kt     # React Native Native Module
│   │       │       └── ScannerPackage.kt    # Module registration
│   │       └── jniLibs/
│   │           ├── arm64-v8a/
│   │           │   └── libmobile_backend.so # Built from mobile-backend crate
│   │           └── armeabi-v7a/
│   │               └── libmobile_backend.so
│   └── src/
│       ├── App.tsx                  # Drawer navigator (Scans, Providers, Results tabs)
│       ├── theme.ts
│       ├── native/
│       │   └── ScannerBridge.ts     # Typed wrapper around NativeModules.ScannerModule
│       ├── components/              # (empty — shared components TBD)
│       ├── hooks/
│       │   └── useScanProgress.ts   # Poll-based scan progress (500ms interval)
│       ├── screens/
│       │   ├── ScansScreen.tsx
│       │   ├── ScanDetailScreen.tsx
│       │   ├── ProvidersScreen.tsx
│       │   ├── ResultsScreen.tsx
│       │   └── IpDetailScreen.tsx
│       ├── stores/                  # Zustand stores (JNI-based)
│       │   ├── appStore.ts          # Init, root check, FD limits
│       │   ├── scanStore.ts
│       │   ├── providerStore.ts
│       │   ├── resultStore.ts
│       │   └── scanPreferencesStore.ts
│       └── types/
│           └── index.ts             # Domain types (shared shape, plus PollProgressResponse)
│
├── deploy/                           # Built release artifacts
│   ├── a-scanner-YYYY.MM.DD.zip     # Web release (binary + install.sh)
│   └── a-scanner-mobile-YYYY.MM.DD.apk
│
└── README.md
```

## Core Crate Guidelines

The `core` crate is the **single source of truth** for all business logic, shared by both web and mobile backends.

### Facade API (`core::facade`)

- Expose a high-level async API that does NOT depend on Axum, HTTP, WebSocket, or JNI types.
- All facade functions accept `&CoreState` and return `Result<T>`.
- `CoreState` struct holds: `SqlitePool`, `Arc<TlsConnector>`, `jwt_secret: Vec<u8>`, per-scan `broadcast::Sender<ScanProgressEvent>` map, and per-scan `CancellationToken` map.
- `init(db_path: &str) -> Result<CoreState>` — creates DB pool, runs migrations, seeds admin user, retrieves/creates JWT secret, spawns provider auto-update background loop, creates TLS connector.
- Scan progress is delivered via `tokio::sync::broadcast` channels (not WebSocket — that's a web concern).
- Scan cancellation uses `tokio_util::sync::CancellationToken`.
- The web-backend wraps `CoreState` in its own `AppState` and bridges broadcast channels to WebSocket.
- The mobile-backend stores `CoreState` in a `OnceCell<CoreState>` and polls broadcast channels via JNI.

### Facade Functions

The facade exposes these async functions (all taking `&CoreState`):

- **Auth**: `login()`, `validate_token()`, `change_password()`
- **Scans**: `list_scans()`, `get_scan()`, `start_scan()`, `stop_scan()`, `get_scan_results()`, `delete_completed_scans()`
- **Results**: `list_results()`, `list_aggregated_ips()`, `get_ip_results()`
- **Providers**: `list_providers()`, `get_provider()`, `create_provider()`, `update_provider()`, `delete_provider()`
- **Ranges**: `get_provider_ranges()`, `fetch_provider_ranges()`, `create_custom_range()`, `update_range()`, `delete_range()`, `bulk_toggle_ranges()`
- **Settings**: `get_provider_settings()`, `update_provider_settings()`

### Database (SQLite + sqlx)

- Use `sqlx::SqlitePool` for async connection pooling. WAL mode is enabled by default.
- SQL migrations live at the **workspace root** in `migrations/` (shared by web and mobile). Currently 8 migration files covering: scans, scan_results, provider_ranges, provider_settings, providers, users, settings tables.
- Use `sqlx::FromRow` derive on model structs.
- Always use parameterized queries — never interpolate user input into SQL.
- Seeded data: Cloudflare + Gcore built-in providers, default admin user.

### Error Handling

- Define a unified `CoreError` enum in `core::error` using `thiserror`.
- Variants: `NotFound`, `BadRequest`, `Unauthorized`, `Database(sqlx::Error)`, `Internal(anyhow::Error)`.
- `CoreError` must NOT implement `IntoResponse` (that's a web-backend concern).
- The web-backend maps `CoreError` into its own `AppError` that implements `IntoResponse` (`NotFound→404`, `BadRequest→400`, `Unauthorized→401`, `Database/Internal→500`).
- The mobile-backend maps `CoreError` into JSON error strings for JNI.
- Return structured error info: `{ "error": "message" }`.

### Scanner Module

- The scanner module contains the core IP scanning/probing logic.
- **Two-phase scanning**: Phase 1 — fast TCP reachability probe; Phase 2 — extended analysis (TLS handshake, TTFB, download speed, jitter, packet loss).
- Use `tokio` for async concurrency when probing IPs.
- `ScanConfig` struct with defaults: concurrency 3000, timeout 2000ms, port 443, samples 3.
- CDN providers abstracted behind the `CdnProvider` trait: `name()`, `id()`, `sni()`, `ip_range_urls()`, `response_format()`. `DbProvider` implements this trait.
- Orchestrator uses `CancellationToken` for scan cancellation, bulk DB flush for results.
- Provider module handles CIDR fetching (text + JSON formats) and range expansion.
- Store scan results (IP, latency, status, provider, TLS time, TTFB, speed, jitter, packet loss, score) in the database.

### General Rust Conventions

- Use `serde` with `Serialize`/`Deserialize` for all API request/response types.
- Prefer `anyhow::Result` in application code; use `thiserror` for library-style error enums.
- Use `tracing` (not `log`) for structured logging.
- Format code with `rustfmt`; lint with `clippy`.
- Write doc comments (`///`) on public items.
- Keep `core` free of any platform-specific (web/mobile) dependencies.

## Web Backend Guidelines

The `web-backend` crate is a thin Axum wrapper over `core`. It adds HTTP routing, WebSocket support, CORS, compression (brotli + gzip), and embedded static frontend files.

### Axum Patterns

- Use `axum::Router` to define routes. Group routes by resource under `routes/`.
- Use `axum::extract::State` to share `AppState` (wraps `core::CoreState`).
- Use extractors (`Json`, `Path`, `Query`) for request parsing.
- Return `impl IntoResponse` or `Result<Json<T>, AppError>` from handlers.
- Use `tower_http` middleware for CORS (allow-all in dev), tracing, and compression.
- Route handlers should delegate to `core` facade/services — keep handlers thin.
- JWT auth middleware (`require_auth`) checks `Authorization: Bearer <token>` header on protected routes.
- WebSocket auth via query param: `/api/v1/ws/scans/:id?token=<jwt>`.

### Route Organization

- **Public**: `/api/v1/auth` (login)
- **Protected** (JWT middleware): `/api/v1/scans`, `/api/v1/results`, `/api/v1/providers`
- **WebSocket**: `/api/v1/ws/scans/:id` (scan progress streaming)
- **Fallback**: embedded static files (SPA with `index.html` fallback)

## Mobile Backend Guidelines

The `mobile-backend` crate is a `cdylib` that exposes `core` functionality to Android via JNI.

### JNI Bridge Patterns

- Use the `jni` crate (0.21+) for JNI interop.
- Crate type must be `["cdylib"]` to produce `libmobile_backend.so`.
- Use `once_cell::sync::OnceCell` to store a persistent `tokio::Runtime` and `CoreState` for the app's lifetime.
- Each JNI function blocks on the tokio runtime (`runtime.block_on(...)`) to call async core functions.
- Pass complex types as **JSON strings** (`JString`) for simplicity — serialize with `serde_json`.
- JNI function naming follows the convention: `Java_com_ascanner_bridge_ScannerBridge_<methodName>`.
- **Never panic** across the JNI boundary — catch all errors and return JSON `{ "error": "message" }`.
- For scan progress, use a poll-based model: `startScan` stores a `broadcast::Receiver` in a `HashMap`, and `pollScanProgress` drains available events.

### Root Access

- The Android device has **root access** (`su` available).
- Use `std::process::Command` to run `su -c <command>` for privileged operations.
- On init, raise file descriptor limits via `su -c ulimit -n 65536` for high-concurrency scanning.
- `checkRootAccess()` runs `su -c id` and returns `true` if exit code is 0.
- Show a warning in the mobile app if root is unavailable.
- Consider granting `NET_RAW` capability via root for future raw socket needs.

### Cross-Compilation

- Targets: `aarch64-linux-android` (ARM64) and `armv7-linux-androideabi` (ARMv7).
- Requires Android NDK r29 with clang linkers configured in `.cargo/config.toml` (API level 31).
- SQLite: use sqlx with the `bundled-sqlite` feature for Android (no system SQLite dependency).
- Build commands:
  ```bash
  cargo build --target aarch64-linux-android -p mobile-backend --release
  cargo build --target armv7-linux-androideabi -p mobile-backend --release
  ```
- Outputs: `target/<target>/release/libmobile_backend.so` → copied to `jniLibs/arm64-v8a/` and `jniLibs/armeabi-v7a/`.

## Web Frontend Guidelines

### Responsive Design (Desktop & Mobile)

- The app must work well on both **desktop browsers** and **mobile devices**.
- Use MUI's responsive utilities (`useMediaQuery`, `useTheme`, breakpoints in `sx` prop) to adapt layouts.
- Use MUI's breakpoint system (`xs`, `sm`, `md`, `lg`, `xl`) in `sx` and `Grid` for responsive sizing.
- Design mobile-first: start with the small-screen layout, then enhance for larger screens.
- Ensure touch-friendly tap targets (minimum 48×48px for interactive elements).
- Use responsive typography — MUI's `theme.typography` with `responsiveFontSizes()` where appropriate.
- Avoid fixed widths that break on narrow viewports; prefer relative units (`%`, `vw`) and `maxWidth`.
- Test layouts at common breakpoints: 360px (mobile), 768px (tablet), 1024px+ (desktop).
- Use MUI `<Drawer>` (temporary variant) for mobile navigation instead of persistent sidebars.
- Use `<Dialog fullScreen>` on mobile for complex forms or detail views when appropriate.
- Data tables (`<DataGrid>`) should use fewer visible columns on mobile; hide non-essential columns via responsive `columnVisibilityModel` or switch to a card/list layout on small screens.

### React + TypeScript

- Use functional components with hooks exclusively — no class components.
- Use TypeScript strict mode. Define explicit types for all props, API responses, and store state.
- Use React Router for client-side routing.
- Keep components small and focused. Extract reusable logic into custom hooks.

### MUI (Material UI)

- Use MUI components (`Button`, `TextField`, `DataGrid`, `Card`, `Dialog`, etc.) as the primary UI library.
- Customize the MUI theme in `theme.ts` and apply it via `<ThemeProvider>`.
- Use the `sx` prop for one-off styles; use `styled()` for reusable styled components.
- Prefer MUI's `<Box>`, `<Stack>`, and `<Grid>` for layout.
- Use `<DataGrid>` for tabular scan results with sorting, filtering, and pagination.

### Zustand (Web)

- Create one store per domain (e.g., `scanStore`, `settingsStore`, `resultStore`).
- Keep stores flat — avoid deeply nested state.
- Use Zustand's `create` function with the `immer` middleware for immutable updates when state is complex.
- Define actions inside the store (co-locate state and mutations).
- Export typed custom hooks: `useScanStore`, `useSettingsStore`, etc.
- For async operations (API calls), handle loading/error states within the store.

Example store pattern:
```ts
interface ScanState {
  results: ScanResult[];
  isLoading: boolean;
  error: string | null;
  fetchResults: () => Promise<void>;
  startScan: (config: ScanConfig) => Promise<void>;
}
```

### API Client (Web)

- Place all API call functions in `api/` directory.
- Use `fetch` (or a thin wrapper) — avoid heavy HTTP client libraries.
- Define base URL from environment variable (`VITE_API_URL`).
- All API functions should be typed: accept typed params, return typed responses.
- Handle errors consistently — throw on non-OK responses.

## Mobile App Guidelines

The mobile app is a **React Native bare workflow** (not Expo) Android-only application. It communicates with the Rust `core` library directly via JNI — **no HTTP server** runs on-device.

### Architecture

- **Kotlin JNI Bridge** (`ScannerBridge.kt`): loads `libmobile_backend.so`, declares `external` JNI functions.
- **React Native Native Module** (`ScannerModule.kt`): wraps `ScannerBridge` calls with `@ReactMethod` annotations, returns results via `Promise`, runs JNI calls on background threads.
- **TypeScript Bridge** (`src/native/ScannerBridge.ts`): typed wrapper around `NativeModules.ScannerModule` — JSON.parse/stringify at the boundary.
- **Zustand Stores**: adapted from `frontend/src/stores/` but call `ScannerBridge.*` instead of HTTP `fetch`.
- **Types**: reused from `frontend/src/types/` (same domain model).

### React Native + TypeScript

- Use functional components with hooks exclusively.
- Use TypeScript strict mode.
- Navigation: `@react-navigation/native` with stack + drawer navigators.
- Keep screens focused. Extract reusable logic into custom hooks.

### UI Library (React Native Paper)

- Use [React Native Paper](https://callstack.github.io/react-native-paper/) as the component library (Material Design).
- Dark theme matching the web app's color scheme.
- Screens: ScansScreen, ScanDetailScreen, ProvidersScreen, ResultsScreen, IpDetailScreen.
- No login screen — the mobile app has **no authentication** (single-user on-device).
- Ensure touch-friendly tap targets and proper spacing for mobile UX.

### Zustand (Mobile)

- Same patterns as web: one store per domain, flat state, actions co-located.
- Key difference: store actions call `ScannerBridge.*` (JNI) instead of `fetch('/api/v1/...')`.
- `appStore` handles app initialization, root access check, and FD limit configuration.
- For scan progress, poll `ScannerBridge.pollScanProgress(scanId)` every 500ms while a scan is running (no WebSocket needed since everything is in-process).

### Scan Progress (Mobile)

- No WebSocket on mobile — use a **polling model**.
- `startScan()` returns a scan ID. The store sets up a `setInterval` polling loop calling `pollScanProgress(scanId)` every 500ms.
- Progress events are the same shape as the web WebSocket events, just delivered via polling.
- Stop polling when the scan completes or fails.

## Shared Types

- `frontend/src/types/` and `mobile/src/types/` share the **same TypeScript type definitions** (Scan, ScanResult, Provider, ScanConfig, etc.).
- Mobile types include `PollProgressResponse` (mobile-specific) and exclude auth types (no auth on mobile).
- When changing domain types in `core::models`, update the TypeScript types in both frontends.
- Consider a shared types package or simple file copy to keep them in sync.

## API Design (Web)

- Use RESTful JSON API conventions.
- Prefix all backend API routes with `/api/v1/`.
- Use plural nouns for resources: `/api/v1/scans`, `/api/v1/results`, `/api/v1/providers`.
- Use proper HTTP methods: `GET` (list/read), `POST` (create/action), `PUT` (full update), `PATCH` (partial update), `DELETE` (remove).
- Return appropriate status codes: `200`, `201`, `400`, `404`, `500`.
- Support pagination via `?page=1&per_page=50` query params for list endpoints.
- Use `Content-Type: application/json` for all request/response bodies.

Key endpoints:
- `POST /api/v1/auth/login` — authenticate, returns JWT
- `GET /api/v1/auth/me` — get current user info
- `PUT /api/v1/auth/password` — change password
- `POST /api/v1/scans` — start a new scan
- `GET /api/v1/scans` — list scans
- `GET /api/v1/scans/:id` — get scan details
- `POST /api/v1/scans/:id/stop` — stop a running scan
- `GET /api/v1/scans/:id/results` — get results for a scan
- `DELETE /api/v1/scans` — delete completed scans
- `GET /api/v1/results` — list all results (filterable)
- `GET /api/v1/results/aggregated` — list aggregated IP results
- `GET /api/v1/results/ip/:ip` — get results for a specific IP
- `GET /api/v1/providers` — list CDN providers
- `POST /api/v1/providers` — create custom provider
- `GET /api/v1/providers/:id` — get provider details
- `PUT /api/v1/providers/:id` — update provider
- `DELETE /api/v1/providers/:id` — delete custom provider
- `GET /api/v1/providers/:id/ranges` — list IP ranges
- `POST /api/v1/providers/:id/ranges` — create custom IP range
- `POST /api/v1/providers/:id/ranges/fetch` — fetch ranges from upstream
- `PATCH /api/v1/providers/:id/ranges/bulk` — bulk toggle ranges
- `PUT /api/v1/providers/:id/ranges/:range_id` — update a range
- `DELETE /api/v1/providers/:id/ranges/:range_id` — delete a range
- `GET /api/v1/providers/:id/settings` — get auto-update settings
- `PUT /api/v1/providers/:id/settings` — update auto-update settings
- `GET /api/v1/ws/scans/:id?token=<jwt>` — WebSocket for real-time progress

## Testing

### Core Crate
- Use `#[tokio::test]` for async tests.
- Use an in-memory SQLite database for tests.
- Place unit tests in `#[cfg(test)] mod tests` within each module.
- Test facade functions and services independently.

### Web Backend
- Test route handlers using `axum::test::TestClient` (from `axum-test` crate).
- Place integration tests in `crates/web-backend/tests/`.

### Mobile Backend
- Test JNI functions using standard Rust tests (call the underlying async functions, not JNI directly).
- Integration testing requires an Android emulator or device.

### Web Frontend
- Use Vitest as the test runner.
- Use React Testing Library for component tests.
- Mock API calls in tests — don't hit real endpoints.
- Test Zustand stores independently by calling actions and asserting state.

### Mobile App
- Use Jest as the test runner (React Native default).
- Mock `NativeModules.ScannerModule` in tests.
- Test Zustand stores independently with mocked JNI bridge.

## Development Workflow

- Run web backend: `./run-backend.sh` (or `cd crates/web-backend && cargo run`)
- Run web frontend: `./run-frontend.sh` (or `cd frontend && npm run dev`)
- Run Rust tests: `cargo test --workspace --exclude a-scanner-mobile` (mobile-backend requires Android target)
- Run web frontend lint: `cd frontend && npm run lint`
- Run mobile lint: `cd mobile && npm run lint`
- Run mobile app: `cd mobile && npx react-native run-android`
- The web backend serves the frontend's built static files in production.
- In development, use Vite's proxy to forward `/api` requests to the web backend.

### Dev Scripts

- `run-backend.sh` — kills port 3000 if busy, creates `frontend/dist/` stub, starts via `cargo run -p a-scanner-web`
- `run-frontend.sh` — kills port 5173 if busy, installs npm dependencies if needed, starts the Vite dev server

## Deployment

### Web (Single Executable)

The web deployment produces a **single self-contained executable**. The React frontend is compiled to static files and embedded into the Rust binary at build time using [`rust-embed`](https://crates.io/crates/rust-embed). Static musl linking ensures no runtime dependencies.

1. The frontend is built with `npm run build`, producing `frontend/dist/`.
2. The web-backend compiles with `cargo build -p web-backend --release --target x86_64-unknown-linux-musl`. `rust-embed` embeds `frontend/dist/` into the binary.
3. At runtime, the server serves API routes under `/api/v1/` and falls back to the embedded frontend assets for all other paths (SPA routing via `index.html` fallback).

Build script: `build.sh`

```bash
./a-scanner
```

Environment variables:
- `DATABASE_URL` — SQLite connection string (default: `sqlite:scanner.db?mode=rwc`)
- `LISTEN_ADDR` — Bind address (default: `0.0.0.0:3000`)
- `RUST_LOG` — Log level (default: `info`)

Deploy script: `deploy.sh` — runs `build.sh` then packages `a-scanner` + `install.sh` into `deploy/a-scanner-YYYY.MM.DD.zip`.

Interactive installer: `install.sh` — installs as a systemd service with configurable port, bind address, log level. Supports upgrade and uninstall.

### Mobile (Android APK)

The mobile deployment produces an **Android APK** containing the React Native app and the embedded `libmobile_backend.so`.

Build script: `build-mobile.sh`
1. Build Rust: `cargo build --target aarch64-linux-android -p mobile-backend --release` (+ armv7)
2. Copy `libmobile_backend.so` to `mobile/android/app/src/main/jniLibs/arm64-v8a/` (+ `armeabi-v7a/`)
3. Install npm dependencies and build the release APK via Gradle

Options: `build-mobile.sh debug` (faster build), `build-mobile.sh --skip-rust` (JS-only changes)

Deploy script: `deploy-mobile.sh` — runs `build-mobile.sh` then copies APK to `deploy/a-scanner-mobile-YYYY.MM.DD.apk`.

The resulting APK runs entirely on-device — no server needed. Requires a **rooted Android device** for full functionality.

### Release Profiles

The workspace `Cargo.toml` configures release builds with: LTO enabled, single codegen unit, binary stripping, `opt-level = "z"` (size optimization), and `panic = "abort"`.

## CI/CD

Two GitHub Actions workflows:

- **`build-web.yml`** — Builds the frontend, the static musl binary, runs tests, and uploads the binary as an artifact. Triggered on changes to `crates/core/`, `crates/web-backend/`, or `frontend/`.
- **`build-android.yml`** — Builds the Rust `.so`, React Native APK, and uploads it as an artifact. Triggered on changes to `crates/core/`, `crates/mobile-backend/`, or `mobile/`.
