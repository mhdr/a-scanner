# α-scanner

A self-contained web application for scanning CDN IP addresses (Cloudflare, Gcore, and custom providers) to find ones that are not filtered by network firewalls such as Iran's Great Firewall (GFW).

The React frontend is compiled and embedded into a single Rust binary — no separate web server or static file directory needed. Just run the executable.

## Features

- **Two-phase scanning** — Fast TCP reachability probe followed by optional extended analysis (TLS handshake, TTFB, download speed, jitter, packet loss)
- **Weighted scoring** — Composite score from multiple network metrics to rank clean IPs (25% TTFB, 30% speed, 15% jitter, 10% TLS, 20% packet loss)
- **Real-time progress** — WebSocket-based live updates with automatic HTTP polling fallback
- **Multi-provider support** — Built-in CDN providers plus custom provider definitions with configurable SNI and upstream IP range URLs
- **IP range management** — Per-provider CIDR range listing, enable/disable individual blocks, bulk toggle, fetch from upstream, add custom ranges
- **Auto-updating ranges** — Background loop fetches fresh IP ranges from upstream URLs on a configurable interval per provider
- **Responsive UI** — Mobile-first Material UI design with adaptive data grids, drawer navigation on small screens
- **Authentication** — Argon2 password hashing, JWT (HS256, 24h expiry), change-password support
- **Single binary deployment** — Frontend embedded via `rust-embed`, static musl linking, no runtime dependencies
- **Systemd installer** — Interactive install script with upgrade/uninstall support, configurable port/bind/log-level
- **SQLite with WAL mode** — Zero-config embedded database with automatic migrations

## Tech Stack

| Layer     | Technology                                            |
|-----------|-------------------------------------------------------|
| Backend   | Rust, Axum 0.8, Tokio, SQLite (sqlx)                 |
| Frontend  | React 19, TypeScript, MUI 7, Zustand 5, Vite, React Router 7 |
| Auth      | Argon2, JWT (jsonwebtoken)                            |
| TLS       | rustls + tokio-rustls (no OpenSSL dependency)         |
| Build     | Cargo (static musl binary) + Vite                    |

## Quick Start

### Option 1 — Download & Install (Production)

Download the pre-built binary for your platform from the [Releases](../../releases) page, then run the interactive installer:

```bash
sudo ./install.sh
```

This installs α-scanner as a systemd service. You can also pass flags for non-interactive setup:

```bash
sudo ./install.sh --port 8080 --bind 0.0.0.0 --log info --yes
```

To uninstall:

```bash
sudo ./install.sh uninstall
```

### Option 2 — Run Directly

```bash
# Just run the binary
./a-scanner
```

Open `http://localhost:3000` in your browser. Default credentials: `admin` / `admin`.

### Option 3 — Build from Source

**Prerequisites:** Rust (1.75+), Node.js (20+), npm

```bash
# Build the single self-contained executable
./build.sh
```

This produces `backend/target/x86_64-unknown-linux-musl/release/a-scanner`.

## Development

Start the backend and frontend dev servers separately:

```bash
# Terminal 1 — Backend (port 3000)
./run-backend.sh

# Terminal 2 — Frontend dev server (port 5173, proxies /api to backend)
./run-frontend.sh
```

Open `http://localhost:5173` for the frontend with hot-reload.

### Running Tests

```bash
# Backend tests
cd backend && cargo test

# Frontend lint
cd frontend && npm run lint
```

## Configuration

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

## API Reference

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
├── build.sh                  # Build single deployable binary
├── install.sh                # Interactive systemd installer
├── run-backend.sh            # Dev: start backend
├── run-frontend.sh           # Dev: start frontend
├── backend/
│   ├── Cargo.toml
│   ├── migrations/           # SQLite migrations (sqlx)
│   └── src/
│       ├── main.rs           # Entry point, server setup
│       ├── lib.rs            # AppState, shared types
│       ├── error.rs          # Unified error handling
│       ├── routes/           # Axum route handlers
│       │   ├── auth.rs       # Login, password change
│       │   ├── scans.rs      # Scan CRUD + WebSocket
│       │   ├── results.rs    # Result queries
│       │   ├── providers.rs  # Provider & range management
│       │   ├── ws.rs         # WebSocket handler
│       │   └── static_files.rs
│       ├── models/           # Database models
│       ├── services/         # Business logic layer
│       ├── scanner/          # Core scanning engine
│       │   ├── orchestrator.rs  # Two-phase scan orchestration
│       │   └── provider.rs     # CDN provider trait & impl
│       └── db/               # Database pool & setup
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx           # Router setup
        ├── api/              # Typed fetch wrappers
        ├── components/       # Layout, dialogs
        ├── hooks/            # useScanProgress (WS + polling)
        ├── pages/            # Login, Scans, ScanDetail, Providers, Results
        ├── stores/           # Zustand stores (auth, scan, provider, result)
        ├── types/            # TypeScript type definitions
        └── theme.ts          # MUI theme
```

## License

This project is provided as-is for educational and personal use.
