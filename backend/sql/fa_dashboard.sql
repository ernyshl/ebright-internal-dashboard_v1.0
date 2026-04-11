-- FA Dashboard data table
-- Run this once against ebrightleads_db (port 5433)

CREATE TABLE IF NOT EXISTS fa_dashboard_data (
  id          SERIAL PRIMARY KEY,
  branch_code VARCHAR(10) NOT NULL UNIQUE,
  fa_active   INTEGER NOT NULL DEFAULT 0,
  inv_apr1819 INTEGER NOT NULL DEFAULT 0,
  inv_apr2526 INTEGER NOT NULL DEFAULT 0,
  backlog     INTEGER GENERATED ALWAYS AS (GREATEST(fa_active - inv_apr1819 - inv_apr2526, 0)) STORED,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

-- Seed with initial data (20 branches, no DPU)
INSERT INTO fa_dashboard_data (branch_code, fa_active, inv_apr1819, inv_apr2526, updated_by)
VALUES
  ('ONL',  660, 8,  6,  'system'),
  ('ST',   510, 7,  2,  'system'),
  ('CJY',  480, 7,  6,  'system'),
  ('SA',   390, 8,  5,  'system'),
  ('PJY',  312, 5,  4,  'system'),
  ('AMP',  315, 6,  6,  'system'),
  ('BBB',  296, 5,  9,  'system'),
  ('DK',   271, 5,  6,  'system'),
  ('KLG',  256, 4,  5,  'system'),
  ('KD',   250, 5,  6,  'system'),
  ('SHA',  178, 4,  5,  'system'),
  ('DA',   155, 4,  5,  'system'),
  ('SP',   131, 4,  4,  'system'),
  ('BSP',  81,  3,  4,  'system'),
  ('EGR',  72,  3,  3,  'system'),
  ('BTHO', 71,  3,  2,  'system'),
  ('RBY',  14,  2,  1,  'system'),
  ('TSG',  8,   3,  5,  'system'),
  ('KW',   5,   2,  3,  'system'),
  ('KTG',  6,   2,  4,  'system')
ON CONFLICT (branch_code) DO NOTHING;
