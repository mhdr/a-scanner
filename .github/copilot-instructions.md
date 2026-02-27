# Copilot Instructions — α-scanner

## Project Overview

α-scanner is a Rust-based application for scanning Cloudflare and other CDN IP addresses to find ones that are not filtered by firewalls such as Iran's Great Firewall (GFW). It provides both a **web UI** (React + MUI) and a **native Android app** (React Native) for initiating scans, viewing results, and managing IP ranges. The Android app runs scans **on-device** via JNI (no HTTP server needed) and requires **root access** for elevated network operations.

## Tech Stack

| Layer            | Technology                                             |
|------------------|--------------------------------------------------------|
| Core Library     | Rust (shared scanner, services, models, DB logic)      |
| Web Backend      | Rust, Axum (thin HTTP layer over core)                 |
| Mobile Backend   | Rust, JNI (thin JNI bridge over core for Android)      |
| Web Frontend     | React, TypeScript, MUI, Zustand                        |
| Mobile App       | React Native (bare workflow), TypeScript, React Native Paper, Zustand |
| Database         | SQLite (via sqlx with compile-time checked queries)    |
| Build            | Cargo workspace (Rust), Vite (web frontend), React Native CLI (mobile) |

## Architecture Overview

The Rust backend is split into a **Cargo workspace** with three crates:

- **`core`** — library crate containing all shared business logic: scanner, services, models, database, error types, and a facade API. Has **no dependency** on Axum, HTTP, or JNI.
- **`web-backend`** — binary crate that wraps `core` with Axum HTTP routes, WebSocket support, and embedded static frontend files. Depends on `core`.
- **`mobile-backend`** — `cdylib` crate that wraps `core` with JNI bridge functions for Android. Depends on `core`. Produces `libmobile_backend.so`.

This separation ensures the scanning engine and business logic are reusable across both web and mobile without duplication.

## Project Structure

```
a-scanner/
├── Cargo.toml                        # [workspace] root — members: crates/*
├── .github/
│   └── copilot-instructions.md
├── run-backend.sh                    # Dev script: start web backend
├── run-frontend.sh                   # Dev script: start web frontend (Vite)
├── build-web.sh                      # Build web deployable (frontend + web-backend)
├── build-mobile.sh                   # Build Android APK (mobile-backend .so + RN app)
├── migrations/                       # SQLite migrations (shared, at workspace root)
│   ├── 20260226000000_initial.sql
│   ├── ...
│
├── crates/
│   ├── core/
│   │   ├── Cargo.toml               # Lib crate: sqlx, serde, tokio, tracing, etc.
│   │   └── src/
│   │       ├── lib.rs               # Re-exports all modules
│   │       ├── error.rs             # Unified error types (thiserror)
│   │       ├── db/mod.rs            # Database pool, queries, migrations
│   │       ├── models/mod.rs        # Domain types (Scan, ScanResult, Provider, etc.)
│   │       ├── scanner/             # IP scanning/probing engine
│   │       │   ├── mod.rs
│   │       │   ├── orchestrator.rs
│   │       │   └── provider.rs
│   │       ├── services/            # Business logic layer
│   │       │   ├── mod.rs
│   │       │   ├── auth_service.rs
│   │       │   ├── provider_service.rs
│   │       │   ├── scan_service.rs
│   │       │   └── result_service.rs
│   │       └── facade.rs            # High-level async API (no HTTP/JNI types)
│   │
│   ├── web-backend/
│   │   ├── Cargo.toml               # Bin crate: core (path dep), axum, tower-http, rust-embed
│   │   └── src/
│   │       ├── main.rs              # Axum server entry point
│   │       ├── lib.rs               # AppState (wraps core::CoreState + web concerns)
│   │       └── routes/              # HTTP route handlers
│   │           ├── mod.rs
│   │           ├── auth.rs
│   │           ├── providers.rs
│   │           ├── results.rs
│   │           ├── scans.rs
│   │           ├── ws.rs
│   │           └── static_files.rs
│   │
│   └── mobile-backend/
│       ├── Cargo.toml               # cdylib crate: core (path dep), jni, once_cell, tokio, serde_json
│       └── src/
│           └── lib.rs               # JNI bridge functions (Java_com_ascanner_bridge_*)
│
├── frontend/                         # React web frontend (unchanged)
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/                     # HTTP fetch wrappers → /api/v1/*
│       ├── components/
│       ├── pages/
│       ├── stores/                  # Zustand stores (HTTP-based)
│       ├── types/
│       └── theme.ts
│
├── mobile/                           # React Native Android app
│   ├── package.json
│   ├── android/
│   │   └── app/src/main/
│   │       ├── java/com/ascanner/
│   │       │   ├── bridge/
│   │       │   │   └── ScannerBridge.kt     # JNI external declarations
│   │       │   └── modules/
│   │       │       ├── ScannerModule.kt     # React Native Native Module
│   │       │       └── ScannerPackage.kt    # Module registration
│   │       └── jniLibs/
│   │           └── arm64-v8a/
│   │               └── libmobile_backend.so # Built from mobile-backend crate
│   └── src/
│       ├── App.tsx
│       ├── native/
│       │   └── ScannerBridge.ts     # Typed wrapper around NativeModules.ScannerModule
│       ├── components/
│       ├── hooks/
│       ├── screens/                 # LoginScreen, ScansScreen, ScanDetailScreen, etc.
│       ├── stores/                  # Zustand stores (JNI-based, adapted from frontend)
│       └── types/                   # Reused from frontend/src/types/
│
└── README.md
```

## Core Crate Guidelines

The `core` crate is the **single source of truth** for all business logic, shared by both web and mobile backends.

### Facade API (`core::facade`)

- Expose a high-level async API that does NOT depend on Axum, HTTP, WebSocket, or JNI types.
- All facade functions accept `&CoreState` and return `Result<T>`.
- `CoreState` struct holds: `SqlitePool`, `Arc<TlsConnector>`, JWT secret, and any shared config.
- `init(db_path: &str) -> Result<CoreState>` — creates DB pool, runs migrations, sets up TLS.
- Scan progress is delivered via `tokio::sync::broadcast` channels (not WebSocket — that's a web concern).
- The web-backend wraps `CoreState` in its own `AppState` and bridges broadcast channels to WebSocket.
- The mobile-backend stores `CoreState` in a `OnceCell<CoreState>` and polls broadcast channels via JNI.

### Database (SQLite + sqlx)

- Use `sqlx::SqlitePool` for async connection pooling.
- SQL migrations live at the **workspace root** in `migrations/` (shared by web and mobile).
- Prefer `sqlx::query_as!` for compile-time checked queries when practical.
- Use `sqlx::FromRow` derive on model structs.
- Always use parameterized queries — never interpolate user input into SQL.

### Error Handling

- Define a unified `CoreError` enum in `core::error` using `thiserror`.
- `CoreError` must NOT implement `IntoResponse` (that's a web-backend concern).
- The web-backend maps `CoreError` into its own `AppError` that implements `IntoResponse`.
- The mobile-backend maps `CoreError` into JSON error strings for JNI.
- Return structured error info: `{ "error": "message" }`.

### Scanner Module

- The scanner module contains the core IP scanning/probing logic.
- Use `tokio` for async concurrency when probing IPs.
- Support **configurable** concurrency limits, timeouts, and retry policies (mobile may use lower concurrency for battery conservation).
- CDN providers (Cloudflare, etc.) should be abstracted behind a trait so new providers can be added.
- Store scan results (IP, latency, status, provider, timestamp) in the database.

### General Rust Conventions

- Use `serde` with `Serialize`/`Deserialize` for all API request/response types.
- Prefer `anyhow::Result` in application code; use `thiserror` for library-style error enums.
- Use `tracing` (not `log`) for structured logging.
- Format code with `rustfmt`; lint with `clippy`.
- Write doc comments (`///`) on public items.
- Keep `core` free of any platform-specific (web/mobile) dependencies.

## Web Backend Guidelines

The `web-backend` crate is a thin Axum wrapper over `core`. It adds HTTP routing, WebSocket support, CORS, and embedded static frontend files.

### Axum Patterns

- Use `axum::Router` to define routes. Group routes by resource under `routes/`.
- Use `axum::extract::State` to share `AppState` (wraps `core::CoreState` + web-specific fields like scan channel maps).
- Use extractors (`Json`, `Path`, `Query`) for request parsing.
- Return `impl IntoResponse` or `Result<Json<T>, AppError>` from handlers.
- Use `tower_http` middleware for CORS, logging, and serving the frontend static files.
- Route handlers should delegate to `core` facade/services — keep handlers thin.

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

- Target: `aarch64-linux-android` (ARM64 Android devices).
- Requires Android NDK with the appropriate clang linker configured in `.cargo/config.toml`.
- SQLite: use sqlx with the `bundled` SQLite feature for Android (no system SQLite dependency).
- Build command: `cargo build --target aarch64-linux-android -p mobile-backend --release`
- Output: `target/aarch64-linux-android/release/libmobile_backend.so`

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
- Screens: LoginScreen, ScansScreen, ScanDetailScreen, ProvidersScreen, ResultsScreen.
- Ensure touch-friendly tap targets and proper spacing for mobile UX.

### Zustand (Mobile)

- Same patterns as web: one store per domain, flat state, actions co-located.
- Key difference: store actions call `ScannerBridge.*` (JNI) instead of `fetch('/api/v1/...')`.
- For scan progress, poll `ScannerBridge.pollScanProgress(scanId)` every 500ms while a scan is running (no WebSocket needed since everything is in-process).

### Scan Progress (Mobile)

- No WebSocket on mobile — use a **polling model**.
- `startScan()` returns a scan ID. The store sets up a `setInterval` polling loop calling `pollScanProgress(scanId)` every 500ms.
- Progress events are the same shape as the web WebSocket events, just delivered via polling.
- Stop polling when the scan completes or fails.

## Shared Types

- `frontend/src/types/` and `mobile/src/types/` share the **same TypeScript type definitions** (Scan, ScanResult, Provider, ScanConfig, etc.).
- When changing domain types in `core::models`, update the TypeScript types in both frontends.
- Consider a shared types package or simple file copy to keep them in sync.

## API Design (Web)

- Use RESTful JSON API conventions.
- Prefix all backend API routes with `/api/v1/`.
- Use plural nouns for resources: `/api/v1/scans`, `/api/v1/results`, `/api/v1/providers`.
- Use proper HTTP methods: `GET` (list/read), `POST` (create/action), `PUT` (full update), `DELETE` (remove).
- Return appropriate status codes: `200`, `201`, `400`, `404`, `500`.
- Support pagination via `?page=1&per_page=50` query params for list endpoints.
- Use `Content-Type: application/json` for all request/response bodies.

Key endpoints:
- `POST /api/v1/scans` — start a new scan
- `GET /api/v1/scans` — list scans
- `GET /api/v1/scans/:id` — get scan details
- `GET /api/v1/scans/:id/results` — get results for a scan
- `GET /api/v1/results` — list all results (filterable)
- `GET /api/v1/providers` — list supported CDN providers

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
- Run all Rust tests: `cargo test` (from workspace root — tests core + web-backend)
- Run web frontend tests: `cd frontend && npm test`
- Run mobile app: `cd mobile && npx react-native run-android`
- The web backend serves the frontend's built static files in production.
- In development, use Vite's proxy to forward `/api` requests to the web backend.

### Dev Scripts

- `run-backend.sh` — starts the web backend via `cargo run -p web-backend`
- `run-frontend.sh` — installs npm dependencies if needed, then starts the Vite dev server

## Deployment

### Web (Single Executable)

The web deployment produces a **single self-contained executable**. The React frontend is compiled to static files and embedded into the Rust binary at build time using [`rust-embed`](https://crates.io/crates/rust-embed).

1. The frontend is built with `npm run build`, producing `frontend/dist/`.
2. The web-backend compiles with `cargo build -p web-backend --release`. `rust-embed` embeds `frontend/dist/` into the binary.
3. At runtime, the server serves API routes under `/api/v1/` and falls back to the embedded frontend assets for all other paths (SPA routing via `index.html` fallback).

Build script: `build-web.sh`

```bash
./a-scanner
```

Environment variables:
- `DATABASE_URL` — SQLite connection string (default: `sqlite:scanner.db?mode=rwc`)
- `LISTEN_ADDR` — Bind address (default: `0.0.0.0:3000`)

### Mobile (Android APK)

The mobile deployment produces an **Android APK** containing the React Native app and the embedded `libmobile_backend.so`.

Build script: `build-mobile.sh`
1. Build Rust: `cargo build --target aarch64-linux-android -p mobile-backend --release`
2. Copy `libmobile_backend.so` to `mobile/android/app/src/main/jniLibs/arm64-v8a/`
3. Build APK: `cd mobile && npx react-native build-android --mode=release`

The resulting APK runs entirely on-device — no server needed. Requires a **rooted Android device** for full functionality.

## Implementation Roadmap Reference

See `implementation_roadmap.md` for the detailed phased plan:
1. **Phase 1**: Split Rust backend into Cargo workspace (core + web-backend)
2. **Phase 2**: Define core's public facade API for mobile consumption
3. **Phase 3**: Create mobile-backend JNI bridge crate
4. **Phase 4**: Build React Native Android app
5. **Phase 5**: Root access integration
6. **Phase 6**: Build pipeline & packaging
