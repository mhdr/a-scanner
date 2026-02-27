-- Add response_format column to providers.
-- "text" = one CIDR per line (Cloudflare style, default for custom providers)
-- "json" = JSON object with "addresses" / "addresses_v6" arrays (Gcore style)
ALTER TABLE providers ADD COLUMN response_format TEXT NOT NULL DEFAULT 'text';

-- Set Gcore to JSON format.
UPDATE providers SET response_format = 'json' WHERE id = 'gcore';
