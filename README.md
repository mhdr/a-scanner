# α-scanner

A dual-platform application for scanning CDN IP addresses (Cloudflare, Gcore, and custom providers) to find ones that are not filtered by network firewalls such as Iran's Great Firewall (GFW).

**Two deployment modes:**

- **Web** — Self-contained single binary with embedded React frontend. Deploy on a server, access via browser.
- **Android** — React Native app that runs scans on-device via JNI. Requires a **rooted** Android device for elevated network operations (no server needed).

Both share a common Rust core library for scanning logic, database, and business rules.

## Features

- **Two-phase scanning** — Fast TCP reachability probe followed by optional extended analysis (TLS handshake, TTFB, download speed, jitter, packet loss)
- **Weighted scoring** — Composite score from multiple network metrics to rank clean IPs (25% TTFB, 30% speed, 15% jitter, 10% TLS, 20% packet loss)
- **Real-time progress** — WebSocket-based live updates (web) / JNI polling (mobile)
- **Multi-provider support** — Built-in CDN providers plus custom provider definitions with configurable SNI and upstream IP range URLs
- **IP range management** — Per-provider CIDR range listing, enable/disable individual blocks, bulk toggle, fetch from upstream, add custom ranges
- **Auto-updating ranges** — Background loop fetches fresh IP ranges from upstream URLs on a configurable interval per provider
- **Responsive UI** — Material UI (web) / React Native Paper (mobile) with adaptive layouts
- **Authentication** — Argon2 password hashing, JWT (HS256, 24h expiry), change-password support
- **On-device scanning (mobile)** — All scanning runs locally on a rooted Android device via JNI, no server required
- **Root access (mobile)** — Raises file descriptor limits for high-concurrency scanning, verifies root at startup
- **Single binary deployment (web)** — Frontend embedded via `rust-embed`, static musl linking, no runtime dependencies
- **Systemd installer (web)** — Interactive install script with upgrade/uninstall support, configurable port/bind/log-level
- **SQLite with WAL mode** — Zero-config embedded database with automatic migrations

## Architecture

The Rust backend is organized as a **Cargo workspace** with three crates:

- **`core`** — Library crate with all shared business logic: scanner, services, models, database, facade API. No dependency on Axum, HTTP, or JNI.
- **`web-backend`** — Binary crate wrapping `core` with Axum HTTP routes, WebSocket support, and embedded static frontend files.
- **`mobile-backend`** — `cdylib` crate wrapping `core` with JNI bridge functions for Android. Produces `libmobile_backend.so`.

## Tech Stack

| Layer            | Technology                                                      |
|------------------|-----------------------------------------------------------------|
| Core Library     | Rust, Tokio, SQLite (sqlx), rustls                              |
| Web Backend      | Rust, Axum 0.8, tower-http, rust-embed                         |
| Mobile Backend   | Rust, JNI 0.21 (cdylib → `libmobile_backend.so`)               |
| Web Frontend     | React 19, TypeScript, MUI 7, Zustand 5, Vite, React Router 7   |
| Mobile App       | React Native 0.84, TypeScript, React Native Paper, Zustand 5   |
| Auth             | Argon2, JWT (jsonwebtoken)                                      |
| Build            | Cargo workspace, Vite (web), Gradle + React Native CLI (mobile) |

## Quick Start — Web

### Option 1 — Download & Install (Production)

Download the pre-built binary from the [Releases](../../releases) page, then run the interactive installer:

```bash
sudo ./install.sh
```

This installs α-scanner as a systemd service. Non-interactive setup:

```bash
sudo ./install.sh --port 8080 --bind 0.0.0.0 --log info --yes
```

To uninstall: `sudo ./install.sh uninstall`

### Option 2 — Run Directly

```bash
./a-scanner
```

Open `http://localhost:3000`. Default credentials: `admin` / `admin`.

### Option 3 — Build from Source

**Prerequisites:** Rust 1.75+, Node.js 20+, npm, musl-tools

```bash
./build.sh
```

Produces `target/x86_64-unknown-linux-musl/release/a-scanner`.

## Quick Start — Android

### Prerequisites

- **Rooted Android device** (arm64-v8a / aarch64)
- Android NDK 27+ with `ANDROID_NDK_HOME` set (or NDK clang on `$PATH`)
- Rust target: `rustup target add aarch64-linux-android`
- Node.js 22+, npm
- Java 17+ (for Gradle)
- Android SDK with build-tools and platform matching `mobile/android/build.gradle`

### Build the APK

```bash
./build-mobile.sh
```

This will:
1. Cross-compile the Rust `mobile-backend` for `aarch64-linux-android`
2. Copy `libmobile_backend.so` to `mobile/android/app/src/main/jniLibs/arm64-v8a/`
3. Install npm dependencies and build the release APK via Gradle

The APK will be at `mobile/android/app/build/outputs/apk/release/app-release.apk`.

### Install on Device

```bash
adb install mobile/android/app/build/outputs/apk/release/app-release.apk
```

### Build Options

```bash
./build-mobile.sh debug        # debug build (faster, larger)
./build-mobile.sh --skip-rust  # skip Rust build (JS-only changes)
```

### Release Signing

By default, release builds use the debug keystore. To sign with a release keystore:

1. Generate a keystore:
   ```bash
   keytool -genkeypair -v -storetype PKCS12 \
     -keystore mobile/android/app/release.keystore \
     -alias ascanner -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Set the signing credentials (in `mobile/android/gradle.properties` or as environment variables):
   ```properties
   ASCANNER_RELEASE_STORE_FILE=release.keystore
   ASCANNER_RELEASE_STORE_PASSWORD=your_password
   ASCANNER_RELEASE_KEY_ALIAS=ascanner
   ASCANNER_RELEASE_KEY_PASSWORD=your_password
   ```

3. Build: `./build-mobile.sh release`

> **Note:** Never commit the release keystore. It is excluded via `.gitignore`.

## Development

### Web

Start the backend and frontend dev servers separately:

```bash
# Terminal 1 — Backend (port 3000)
./run-backend.sh

# Terminal 2 — Frontend dev server (port 5173, proxies /api to backend)
./run-frontend.sh
```

Open `http://localhost:5173` for the frontend with hot-reload.

### Mobile

```bash
# Start Metro bundler
cd mobile && npx react-native start

# In another terminal — build and run on connected device / emulator
cd mobile && npx react-native run-android
```

> You need `libmobile_backend.so` in `jniLibs/` first. Run `./build-mobile.sh` at least once (or `./build-mobile.sh debug` for faster iteration).

### Running Tests

```bash
# Rust tests (core + web-backend, excludes mobile-backend which needs Android target)
cargo test --workspace --exclude a-scanner-mobile

# Frontend lint
cd frontend && npm run lint

# Mobile lint
cd mobile && npm run lint
```

## Deployment

### Web

```bash
# Build + package into a versioned zip (binary + install.sh)
./deploy.sh
# Output: deploy/a-scanner-YYYY.MM.DD.zip
```

### Mobile

```bash
# Build + package APK with date-based versioning
./deploy-mobile.sh
# Output: deploy/a-scanner-mobile-YYYY.MM.DD.apk
```

## Configuration (Web)

| Environment Variable | Default                       | Description              |
|----------------------|-------------------------------|--------------------------|
| `DATABASE_URL`       | `sqlite:scanner.db?mode=rwc`  | SQLite connection string |
| `LISTEN_ADDR`        | `0.0.0.0:3000`               | Server bind address      |
| `RUST_LOG`           | `info`                        | Log level (`trace`, `debug`, `info`, `warn`, `error`) |

## How Scanning Works

### Phase 1 — TCP Probe

Connects to each IP on the target port (default 443) with configurable concurrency (default 3000) and timeout (default 2000ms). Identifies which IPs are reachable.

### Phase 2 — Extended Analysis (optional)

For reachable IPs discovered in Phase 1, performs detailed measurements:

| Metric | Description |
|--------|-------------|
| **TLS Handshake** | Time to complete TLS negotiation |
| **TTFB** | Time-To-First-Byte via `GET /cdn-cgi/trace` |
| **Download Speed** | Throughput from 10 requests on a keep-alive connection |
| **Jitter** | Variation across multiple samples |
| **Packet Loss** | Percentage of failed TCP probes over multiple attempts |
| **Score** | Weighted composite (lower = better) |

## CI/CD

Two GitHub Actions workflows are provided:

- **`build-android.yml`** — Builds the Rust `.so`, React Native APK, and uploads it as an artifact. Triggered on changes to `crates/core/`, `crates/mobile-backend/`, or `mobile/`.
- **`build-web.yml`** — Builds the frontend, the static musl binary, runs tests, and uploads the binary as an artifact. Triggered on changes to `crates/core/`, `crates/web-backend/`, or `frontend/`.

### Setting up release signing in CI

1. Base64-encode your release keystore: `base64 -w0 mobile/android/app/release.keystore`
2. Add these GitHub repository secrets:
   - `RELEASE_KEYSTORE_BASE64` — the base64-encoded keystore
   - `RELEASE_STORE_PASSWORD` — keystore password
   - `RELEASE_KEY_ALIAS` — key alias (e.g., `ascanner`)
   - `RELEASE_KEY_PASSWORD` — key password

## API Reference (Web)

All endpoints are under `/api/v1/`. Authentication is required for all routes except login.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/login` | Authenticate, returns JWT |
| `GET`  | `/api/v1/auth/me` | Get current user info |
| `PUT`  | `/api/v1/auth/password` | Change password |

### Scans

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/v1/scans` | List scans (paginated) |
| `POST` | `/api/v1/scans` | Create and start a new scan |
| `GET`  | `/api/v1/scans/{id}` | Get scan details |
| `GET`  | `/api/v1/scans/{id}/results` | Get scan results (paginated) |
| `GET`  | `/api/v1/scans/{id}/ws?token=<jwt>` | WebSocket for real-time progress |

### Results

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/v1/results` | List all results (filter by `reachable_only`, `provider`) |

### Providers

| Method  | Path | Description |
|---------|------|-------------|
| `GET`   | `/api/v1/providers` | List all providers |
| `POST`  | `/api/v1/providers` | Create custom provider |
| `GET`   | `/api/v1/providers/{id}` | Get provider details |
| `PUT`   | `/api/v1/providers/{id}` | Update provider |
| `DELETE` | `/api/v1/providers/{id}` | Delete custom provider |
| `GET`   | `/api/v1/providers/{id}/ranges` | List IP ranges |
| `POST`  | `/api/v1/providers/{id}/ranges` | Create custom IP range |
| `POST`  | `/api/v1/providers/{id}/ranges/fetch` | Fetch ranges from upstream |
| `PATCH` | `/api/v1/providers/{id}/ranges/bulk` | Bulk toggle ranges |
| `PUT`   | `/api/v1/providers/{id}/ranges/{range_id}` | Update a range |
| `DELETE` | `/api/v1/providers/{id}/ranges/{range_id}` | Delete a range |
| `GET`   | `/api/v1/providers/{id}/settings` | Get auto-update settings |
| `PUT`   | `/api/v1/providers/{id}/settings` | Update auto-update settings |

## Project Structure

```
a-scanner/
├── Cargo.toml                    # Workspace root
├── build.sh                      # Build web (frontend + static musl binary)
├── build-mobile.sh               # Build Android (Rust .so + APK)
├── deploy.sh                     # Package web release zip
├── deploy-mobile.sh              # Package mobile release APK
├── install.sh                    # Interactive systemd installer (web)
├── run-backend.sh                # Dev: start web backend
├── run-frontend.sh               # Dev: start web frontend
├── migrations/                   # SQLite migrations (shared)
├── .cargo/config.toml            # Android NDK cross-compilation config
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/
│       ├── build-android.yml     # CI: build Android APK
│       └── build-web.yml         # CI: build web binary + run tests
│
├── crates/
│   ├── core/                     # Shared Rust library
│   │   └── src/
│   │       ├── lib.rs            # Re-exports all modules
│   │       ├── facade.rs         # High-level async API
│   │       ├── error.rs          # Unified error types (thiserror)
│   │       ├── db/               # Database pool, queries, migrations
│   │       ├── models/           # Domain types
│   │       ├── scanner/          # Scanning engine (orchestrator, provider)
│   │       └── services/         # Business logic (auth, scan, provider, result)
│   │
│   ├── web-backend/              # Axum HTTP server
│   │   └── src/
│   │       ├── main.rs           # Server entry point
│   │       ├── lib.rs            # AppState (wraps CoreState)
│   │       ├── error.rs          # HTTP error mapping
│   │       └── routes/           # Route handlers
│   │
│   └── mobile-backend/           # JNI bridge for Android (cdylib)
│       └── src/
│           └── lib.rs            # JNI functions → core facade
│
├── frontend/                     # React web frontend
│   └── src/
│       ├── api/                  # HTTP fetch wrappers
│       ├── components/           # Layout, dialogs
│       ├── hooks/                # useScanProgress (WS + polling)
│       ├── pages/                # Login, Scans, ScanDetail, Providers, Results
│       ├── stores/               # Zustand stores (HTTP-based)
│       └── types/                # TypeScript type definitions
│
└── mobile/                       # React Native Android app
    ├── android/
    │   └── app/src/main/
    │       ├── java/com/ascanner/
    │       │   ├── bridge/       # ScannerBridge.kt (JNI declarations)
    │       │   └── modules/      # ScannerModule.kt (RN Native Module)
    │       └── jniLibs/arm64-v8a/  # libmobile_backend.so (built artifact)
    └── src/
        ├── native/               # TypeScript JNI bridge wrapper
        ├── screens/              # Login, Scans, ScanDetail, Providers, Results
        ├── stores/               # Zustand stores (JNI-based)
        └── types/                # Shared type definitions
```

## License

This project is provided as-is for educational and personal use.
