CREATE TABLE IF NOT EXISTS processed_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  template_key TEXT NOT NULL,
  rendered_output TEXT NOT NULL,
  external_status INTEGER,
  created_at TEXT NOT NULL,
  processed_at TEXT NOT NULL
);
