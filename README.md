# α-scanner

A web-based tool for scanning Cloudflare and other CDN IP addresses to find ones that are not filtered by firewalls such as Iran's Great Firewall (GFW).

## Tech Stack

- **Backend:** Rust + Axum + SQLite (sqlx)
- **Frontend:** React + TypeScript + MUI + Zustand + Vite

## Getting Started

### Prerequisites

- Rust (1.75+)
- Node.js (20+)
- npm

### Backend

```sh
cd backend
cargo run
```

The server starts on `http://localhost:3000`.

### Frontend

```sh
cd frontend
npm install
npm run dev
```

The dev server starts on `http://localhost:5173` and proxies `/api` requests to the backend.

### Build for Production

```sh
# Build frontend
cd frontend && npm run build

# Build backend
cd backend && cargo build --release
```

## API Endpoints

| Method | Path                        | Description              |
|--------|-----------------------------|--------------------------|
| GET    | `/api/v1/scans`             | List all scans           |
| POST   | `/api/v1/scans`             | Start a new scan         |
| GET    | `/api/v1/scans/:id`         | Get scan details         |
| GET    | `/api/v1/scans/:id/results` | Get results for a scan   |
| GET    | `/api/v1/results`           | List all results         |
| GET    | `/api/v1/providers`         | List CDN providers       |

## Project Structure

```
a-scanner/
├── backend/          # Rust/Axum backend
│   ├── src/
│   │   ├── main.rs       # Entry point
│   │   ├── lib.rs        # App state, re-exports
│   │   ├── error.rs      # Unified error type
│   │   ├── routes/       # API route handlers
│   │   ├── models/       # Database models
│   │   ├── services/     # Business logic
│   │   ├── scanner/      # IP scanning logic
│   │   └── db/           # Database setup
│   └── migrations/       # SQLite migrations
├── frontend/         # React/Vite frontend
│   └── src/
│       ├── api/          # API client
│       ├── components/   # Reusable components
│       ├── pages/        # Page components
│       ├── stores/       # Zustand stores
│       └── types/        # TypeScript types
└── README.md
```
