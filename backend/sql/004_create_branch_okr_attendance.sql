-- OKR Attendance table: stores weekly student attendance OKR data per branch
CREATE TABLE IF NOT EXISTS branch_okr_attendance (
  id SERIAL PRIMARY KEY,
  branch VARCHAR(255) NOT NULL,
  week_date DATE NOT NULL, -- The Wednesday (start) of the tracked week

  -- Online section
  total_online_attendance INTEGER DEFAULT 0,
  online_conversion_rate NUMERIC(5,2) DEFAULT 0,
  avg_online_trial_pax NUMERIC(5,2) DEFAULT 0,
  total_onl_attendance INTEGER DEFAULT 0,

  -- Daily attendance: Wednesday
  wed_absent INTEGER DEFAULT 0,
  wed_attended INTEGER DEFAULT 0,
  wed_frozen INTEGER DEFAULT 0,
  wed_replaced INTEGER DEFAULT 0,

  -- Daily attendance: Thursday
  thu_absent INTEGER DEFAULT 0,
  thu_attended INTEGER DEFAULT 0,
  thu_frozen INTEGER DEFAULT 0,
  thu_replaced INTEGER DEFAULT 0,

  -- Daily attendance: Friday
  fri_absent INTEGER DEFAULT 0,
  fri_attended INTEGER DEFAULT 0,
  fri_frozen INTEGER DEFAULT 0,
  fri_replaced INTEGER DEFAULT 0,

  -- Daily attendance: Saturday
  sat_absent INTEGER DEFAULT 0,
  sat_attended INTEGER DEFAULT 0,
  sat_frozen INTEGER DEFAULT 0,
  sat_replaced INTEGER DEFAULT 0,

  -- Daily attendance: Sunday
  sun_absent INTEGER DEFAULT 0,
  sun_attended INTEGER DEFAULT 0,
  sun_frozen INTEGER DEFAULT 0,
  sun_replaced INTEGER DEFAULT 0,

  -- Discrepancy details (manually entered)
  not_enrolled INTEGER DEFAULT 0,        -- 1a) Not enrolled to any lesson
  outstanding_invoice_disc INTEGER DEFAULT 0, -- 1b) With outstanding invoice
  expired_package INTEGER DEFAULT 0,     -- 1c) Expired Package
  newly_enrolled INTEGER DEFAULT 0,      -- 1d) Newly enrolled student

  -- Parent-Coach Meetup
  pc_meetup_invited INTEGER DEFAULT 0,
  pc_meetup_showup INTEGER DEFAULT 0,

  -- Outstanding Invoices (AOne)
  outstanding_invoice_pct NUMERIC(5,2) DEFAULT 0,
  partially_paid_unpaid INTEGER DEFAULT 0,
  active_students INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(branch, week_date)
);
