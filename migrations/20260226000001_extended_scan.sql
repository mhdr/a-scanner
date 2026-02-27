-- Add extended scan configuration columns to scans table
ALTER TABLE scans ADD COLUMN mode TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE scans ADD COLUMN concurrency INTEGER NOT NULL DEFAULT 64;
ALTER TABLE scans ADD COLUMN timeout_ms INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE scans ADD COLUMN port INTEGER NOT NULL DEFAULT 443;
ALTER TABLE scans ADD COLUMN extended INTEGER NOT NULL DEFAULT 0;

-- Add extended metrics columns to scan_results table
ALTER TABLE scan_results ADD COLUMN tls_latency_ms INTEGER;
ALTER TABLE scan_results ADD COLUMN ttfb_ms INTEGER;
ALTER TABLE scan_results ADD COLUMN download_speed_kbps REAL;
ALTER TABLE scan_results ADD COLUMN jitter_ms REAL;
ALTER TABLE scan_results ADD COLUMN success_rate REAL;
ALTER TABLE scan_results ADD COLUMN score REAL;

-- Index for sorting by score in extended scans
CREATE INDEX IF NOT EXISTS idx_scan_results_score ON scan_results(score);
