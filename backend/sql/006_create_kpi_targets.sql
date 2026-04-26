-- Single-row table holding the global KPI targets used by Branch Performance.
-- Edited via PUT /api/branch-performance/targets (super_admin only).
CREATE TABLE IF NOT EXISTS kpi_targets (
  id              SERIAL PRIMARY KEY,
  conversion_rate NUMERIC(5,2) NOT NULL DEFAULT 7,
  confirmed_rate  NUMERIC(5,2) NOT NULL DEFAULT 40,
  show_up_rate    NUMERIC(5,2) NOT NULL DEFAULT 50,
  enrolment_rate  NUMERIC(5,2) NOT NULL DEFAULT 33,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID
);

INSERT INTO kpi_targets (conversion_rate, confirmed_rate, show_up_rate, enrolment_rate)
SELECT 7, 40, 50, 33
WHERE NOT EXISTS (SELECT 1 FROM kpi_targets);
