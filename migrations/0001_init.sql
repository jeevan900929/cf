CREATE TABLE IF NOT EXISTS greeting_counts (
  name TEXT PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_receipts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
