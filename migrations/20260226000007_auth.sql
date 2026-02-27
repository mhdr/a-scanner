-- Users table (single admin user, seeded at runtime)
CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY NOT NULL,
    username   TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- App-level key-value settings (e.g. jwt_secret)
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
