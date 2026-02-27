-- Add working_ips column to track reachable IP count during scanning
ALTER TABLE scans ADD COLUMN working_ips INTEGER NOT NULL DEFAULT 0;
