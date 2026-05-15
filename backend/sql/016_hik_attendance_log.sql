-- 016_hik_attendance_log.sql
--
-- Local table for Hikvision access-control events pushed directly to the
-- dashboard server. Independent of hrfs."AttendanceLog" (foreign table
-- mirroring the upstream HR system) — both can coexist.
--
-- Each row is one HTTP push from a scanner. Some events are clock-ins,
-- some are clock-outs, some are failed auth attempts. We store everything
-- and let downstream queries decide how to interpret major/minor event types.

CREATE TABLE IF NOT EXISTS hik_attendance_log (
  id              BIGSERIAL PRIMARY KEY,

  -- Device identity (from XML payload — every event includes these)
  device_serial   TEXT,                       -- e.g. 'GM8463747'
  device_name     TEXT,                       -- e.g. 'T&A Access Controller'
  device_mac      TEXT,                       -- e.g. '88:DE:39:5B:F1:0E'
  device_ip       TEXT,                       -- LAN IP at the branch

  -- Employee / scan result
  emp_no          TEXT,                       -- employeeNoString
  emp_name        TEXT,                       -- name (sometimes blank if device only has IDs)
  verify_mode     TEXT,                       -- fingerPrint / card / face / pwd

  -- Event metadata
  event_type      TEXT,                       -- AccessControllerEvent / etc.
  major_event     INTEGER,                    -- 5 = access
  minor_event     INTEGER,                    -- 75 = fingerprint authenticated, etc.
  attendance_status TEXT,                     -- checkIn / checkOut / undefined

  -- Timestamps
  scan_time       TIMESTAMPTZ,                -- event's dateTime field, parsed
  received_at     TIMESTAMPTZ DEFAULT NOW(),  -- server clock when we received the push

  -- Raw payload for debugging / reprocessing
  raw_xml         TEXT
);

CREATE INDEX IF NOT EXISTS ix_hik_attendance_device_time
  ON hik_attendance_log (device_serial, scan_time DESC);

CREATE INDEX IF NOT EXISTS ix_hik_attendance_emp_time
  ON hik_attendance_log (emp_no, scan_time DESC);

CREATE INDEX IF NOT EXISTS ix_hik_attendance_received
  ON hik_attendance_log (received_at DESC);
