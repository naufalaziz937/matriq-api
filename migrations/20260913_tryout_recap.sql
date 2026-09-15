-- Safe for an existing recap table; creates it only when absent.
CREATE TABLE IF NOT EXISTS tryout_recap (
  recap_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  pu NUMERIC(8,2), ppu NUMERIC(8,2), pbm NUMERIC(8,2), pk NUMERIC(8,2),
  lbi NUMERIC(8,2), lbe NUMERIC(8,2), pm NUMERIC(8,2),
  total_score NUMERIC(8,2) NOT NULL,
  recap_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tryout_recap ADD COLUMN IF NOT EXISTS platform VARCHAR(100);
ALTER TABLE tryout_recap ADD COLUMN IF NOT EXISTS tryout_name VARCHAR(150);
CREATE INDEX IF NOT EXISTS tryout_recap_user_date_idx ON tryout_recap (user_id, recap_at DESC, recap_id DESC);
CREATE INDEX IF NOT EXISTS tryout_recap_date_idx ON tryout_recap (recap_at DESC, recap_id DESC);
