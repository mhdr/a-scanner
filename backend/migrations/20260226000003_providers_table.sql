-- Providers table: stores CDN provider definitions (both built-in and custom).
CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sni TEXT NOT NULL,
    ip_range_urls TEXT NOT NULL DEFAULT '[]',  -- JSON array of URL strings
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Seed built-in providers.
INSERT OR IGNORE INTO providers (id, name, description, sni, ip_range_urls, is_builtin, created_at, updated_at)
VALUES
    ('cloudflare', 'Cloudflare', 'Cloudflare CDN IP ranges', 'cloudflare.com', '["https://www.cloudflare.com/ips-v4"]', 1, datetime('now'), datetime('now')),
    ('gcore', 'Gcore', 'Gcore CDN IP ranges', 'gcore.com', '["https://api.gcore.com/cdn/public-net-list"]', 1, datetime('now'), datetime('now'));
