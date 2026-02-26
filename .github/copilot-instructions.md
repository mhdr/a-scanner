# Copilot Instructions — α-scanner

## Project Overview

α-scanner is a Rust-based web application for scanning Cloudflare and other CDN IP addresses to find ones that are not filtered by firewalls such as Iran's Great Firewall (GFW). It provides a web UI for initiating scans, viewing results, and managing IP ranges.

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Backend  | Rust, Axum                        |
| Frontend | React, TypeScript, MUI, Zustand   |
| Database | SQLite (via sqlx with compile-time checked queries) |
| Build    | Cargo (backend), Vite (frontend)  |

## Project Structure

```
a-scanner/
├── .github/
│   └── copilot-instructions.md
├── run-backend.sh               # Dev script: start backend
├── run-frontend.sh              # Dev script: start frontend
├── build.sh                     # Build single deployable executable
├── backend/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs              # Entry point, Axum server setup
│   │   ├── lib.rs               # Re-exports, app state
│   │   ├── routes/              # Axum route handlers (one file per resource)
│   │   │   └── static_files.rs  # Serves embedded frontend assets
│   │   ├── models/              # Database models & domain types
│   │   ├── db/                  # Database migrations, queries, connection pool
│   │   ├── scanner/             # Core scanning logic (IP probing, concurrency)
│   │   ├── services/            # Business logic layer between routes and db
│   │   └── error.rs             # Unified error types implementing IntoResponse
│   └── migrations/              # SQLite migrations (sqlx)
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx             # React entry point
│       ├── App.tsx              # Root component, router setup
│       ├── api/                 # API client functions (fetch wrappers)
│       ├── components/          # Reusable MUI-based UI components
│       ├── pages/               # Page-level components (one per route)
│       ├── stores/              # Zustand stores (one file per domain)
│       ├── types/               # TypeScript type definitions
│       └── theme.ts             # MUI theme customization
└── README.md
```

## Backend Guidelines

### Axum Patterns

- Use `axum::Router` to define routes. Group routes by resource under `routes/`.
- Use `axum::extract::State` to share application state (DB pool, config).
- Define a shared `AppState` struct holding the SQLite connection pool and any shared configuration.
- Use extractors (`Json`, `Path`, `Query`) for request parsing.
- Return `impl IntoResponse` or `Result<Json<T>, AppError>` from handlers.
- Use `tower_http` middleware for CORS, logging, and serving the frontend static files.

### Database (SQLite + sqlx)

- Use `sqlx::SqlitePool` for async connection pooling.
- Place SQL migrations in `backend/migrations/` using sqlx-cli conventions.
- Prefer `sqlx::query_as!` for compile-time checked queries when practical.
- Use `sqlx::FromRow` derive on model structs.
- Always use parameterized queries — never interpolate user input into SQL.

### Error Handling

- Define a unified `AppError` enum in `error.rs` that implements `IntoResponse`.
- Map domain errors, database errors, and validation errors into appropriate HTTP status codes.
- Use `thiserror` for ergonomic error definitions.
- Return structured JSON error responses: `{ "error": "message" }`.

### Scanner Module

- The scanner module contains the core IP scanning/probing logic.
- Use `tokio` for async concurrency when probing IPs.
- Support configurable concurrency limits, timeouts, and retry policies.
- CDN providers (Cloudflare, etc.) should be abstracted behind a trait so new providers can be added.
- Store scan results (IP, latency, status, provider, timestamp) in the database.

### General Rust Conventions

- Use `serde` with `Serialize`/`Deserialize` for all API request/response types.
- Prefer `anyhow::Result` in application code; use `thiserror` for library-style error enums.
- Use `tracing` (not `log`) for structured logging.
- Format code with `rustfmt`; lint with `clippy`.
- Write doc comments (`///`) on public items.

## Frontend Guidelines

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

### Zustand

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

### API Client

- Place all API call functions in `api/` directory.
- Use `fetch` (or a thin wrapper) — avoid heavy HTTP client libraries.
- Define base URL from environment variable (`VITE_API_URL`).
- All API functions should be typed: accept typed params, return typed responses.
- Handle errors consistently — throw on non-OK responses.

## API Design

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

### Backend
- Use `#[tokio::test]` for async tests.
- Use an in-memory SQLite database for tests.
- Test route handlers using `axum::test::TestClient` (from `axum-test` crate).
- Place unit tests in `#[cfg(test)] mod tests` within each module.
- Place integration tests in `backend/tests/`.

### Frontend
- Use Vitest as the test runner.
- Use React Testing Library for component tests.
- Mock API calls in tests — don't hit real endpoints.
- Test Zustand stores independently by calling actions and asserting state.

## Development Workflow

- Run backend: `./run-backend.sh` (or `cd backend && cargo run`)
- Run frontend: `./run-frontend.sh` (or `cd frontend && npm run dev`)
- Run all backend tests: `cd backend && cargo test`
- Run all frontend tests: `cd frontend && npm test`
- The backend serves the frontend's built static files in production.
- In development, use Vite's proxy to forward `/api` requests to the backend.

### Dev Scripts

The project root contains convenience scripts for development:

- `run-backend.sh` — starts the Rust backend via `cargo run`
- `run-frontend.sh` — installs npm dependencies if needed, then starts the Vite dev server

## Deployment

The project produces a **single self-contained executable**. The React frontend is compiled to static files and embedded into the Rust binary at build time using [`rust-embed`](https://crates.io/crates/rust-embed). This means no separate web server or static file directory is needed in production.

### How it works

1. The frontend is built with `npm run build`, producing `frontend/dist/`.
2. The backend compiles with `cargo build --release`. The `rust-embed` crate embeds all files from `frontend/dist/` into the binary.
3. At runtime, the server serves API routes under `/api/v1/` and falls back to the embedded frontend assets for all other paths (SPA routing via `index.html` fallback).

### Build script

- `build.sh` — builds the frontend, then compiles the backend in release mode, producing `backend/target/release/a-scanner`.

The resulting binary can be copied to any compatible machine and run directly:

```bash
./a-scanner
```

Environment variables:
- `DATABASE_URL` — SQLite connection string (default: `sqlite:scanner.db?mode=rwc`)
- `LISTEN_ADDR` — Bind address (default: `0.0.0.0:3000`)
