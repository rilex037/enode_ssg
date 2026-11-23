-- D1 schema for the dynamic page layer (vendor-neutral: same shape works
-- on any SQL database — see ARCHITECTURE.md for porting notes).

-- Source of truth for content pages. `html` is trusted pipeline output.
CREATE TABLE IF NOT EXISTS pages (
  path        TEXT PRIMARY KEY,                    -- "/docs/hello"
  title       TEXT NOT NULL,
  description TEXT,
  html        TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Site-wide version; "version" is bumped to invalidate every cached page.
CREATE TABLE IF NOT EXISTS site_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO site_meta (key, value) VALUES ('version', '0');
