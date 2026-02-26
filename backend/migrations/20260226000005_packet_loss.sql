-- Add packet loss percentage column to scan results.
ALTER TABLE scan_results ADD COLUMN packet_loss REAL;
