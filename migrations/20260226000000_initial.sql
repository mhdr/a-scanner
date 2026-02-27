CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    total_ips INTEGER NOT NULL DEFAULT 0,
    scanned_ips INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_results (
    id TEXT PRIMARY KEY NOT NULL,
    scan_id TEXT NOT NULL,
    ip TEXT NOT NULL,
    latency_ms INTEGER,
    is_reachable BOOLEAN NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scan_results_scan_id ON scan_results(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_reachable ON scan_results(is_reachable);
CREATE INDEX IF NOT EXISTS idx_scan_results_latency ON scan_results(latency_ms);
