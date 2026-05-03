-- 011_branchstaff_date_cleanup.sql
--
-- Two-part: (1) create a date-parser helper, (2) provide UPDATE statements
-- (commented out) that the operator runs manually after eyeballing the
-- dry-run. The UPDATEs write to a foreign table (hrfs.BranchStaff via
-- hrfs_server FDW), which propagates to the upstream HRFS database — only
-- run them if you have authority to modify HRFS source data and you've
-- confirmed the dry-run looks right.
--
-- BranchStaff.start_date and endDate are TEXT with mixed formats:
--   ISO 'YYYY-MM-DD'                                 (already correct)
--   'Nth Month YYYY' / 'NTH MONTH YYYY'              ('1st November 2025')
--   'N Mon YYYY'                                     ('06 May 2023')
--   typos: '22th January 2026', '31th December 2026' (handled — strip any
--                                                     ordinal suffix after
--                                                     a digit)
--   year-less: '11th January'                        (correctly stays NULL)

-- ─── Part 1: Helper function ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION try_parse_messy_date(s text) RETURNS date AS $$
DECLARE
  cleaned text;
BEGIN
  IF s IS NULL OR TRIM(s) = '' THEN
    RETURN NULL;
  END IF;

  -- ISO YYYY-MM-DD prefix (fast path, most common)
  IF s ~ '^\d{4}-\d{2}-\d{2}' THEN
    BEGIN
      RETURN substring(s, 1, 10)::date;
    EXCEPTION WHEN OTHERS THEN
      -- malformed ISO, fall through
    END;
  END IF;

  -- Strip ordinal suffix after a digit, case-insensitive. Postgres POSIX
  -- regex does NOT support \b (which gets parsed as literal backspace) —
  -- the simple '(\d+)(st|nd|rd|th)' pattern is sufficient for our data
  -- since ordinals only follow digits, never inside words. Tolerates
  -- typos like '22th' / '3TH' by stripping any of the four suffixes.
  cleaned := regexp_replace(TRIM(s), '(\d+)(st|nd|rd|th)', '\1', 'gi');

  -- Expand 2-digit years in dash format (e.g. '9-Nov-24' → '9-Nov-2024').
  -- Assume 20xx — anyone in BranchStaff hired in the 1900s is implausible.
  cleaned := regexp_replace(cleaned, '^(\d{1,2})-([A-Za-z]+)-(\d{2})$', '\1-\2-20\3');

  -- Try DD Month YYYY (full month name; Postgres' to_date is lenient and
  -- accepts both full and abbreviated names with this format).
  BEGIN
    RETURN to_date(cleaned, 'DD Month YYYY');
  EXCEPTION WHEN OTHERS THEN
    -- continue
  END;

  -- Try DD Mon YYYY (3-letter month, redundant but cheap)
  BEGIN
    RETURN to_date(cleaned, 'DD Mon YYYY');
  EXCEPTION WHEN OTHERS THEN
    -- continue
  END;

  -- Try DD-Mon-YYYY (after the 2-digit-year expansion above)
  BEGIN
    RETURN to_date(cleaned, 'DD-Mon-YYYY');
  EXCEPTION WHEN OTHERS THEN
    -- continue
  END;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;


-- ─── Part 2: Dry-run preview (read-only) ────────────────────────────────────
-- Run this FIRST and eyeball the parsed column before doing any UPDATE.
--
--   SELECT start_date AS raw,
--          try_parse_messy_date(start_date) AS parsed,
--          to_char(try_parse_messy_date(start_date), 'YYYY-MM-DD') AS iso_form
--   FROM hrfs."BranchStaff"
--   WHERE start_date IS NOT NULL
--     AND TRIM(start_date) <> ''
--     AND NOT (start_date ~ '^\d{4}-\d{2}-\d{2}')
--   ORDER BY parsed NULLS LAST, start_date;
--
--   -- Same audit for endDate:
--   SELECT "endDate" AS raw,
--          try_parse_messy_date("endDate") AS parsed
--   FROM hrfs."BranchStaff"
--   WHERE "endDate" IS NOT NULL
--     AND TRIM("endDate") <> ''
--     AND NOT ("endDate" ~ '^\d{4}-\d{2}-\d{2}')
--   ORDER BY parsed NULLS LAST, "endDate";


-- ─── Part 3: Actual UPDATE — uncomment and run inside a transaction ─────────
-- Wrap in BEGIN/COMMIT (or BEGIN/ROLLBACK to test). Updates only rows where
-- the parser returned a real date AND the ISO form differs from the current
-- value, so it's idempotent and skips rows the parser couldn't handle.
--
--   BEGIN;
--
--   UPDATE hrfs."BranchStaff"
--      SET start_date = to_char(try_parse_messy_date(start_date), 'YYYY-MM-DD')
--    WHERE start_date IS NOT NULL
--      AND try_parse_messy_date(start_date) IS NOT NULL
--      AND to_char(try_parse_messy_date(start_date), 'YYYY-MM-DD') <> start_date;
--
--   UPDATE hrfs."BranchStaff"
--      SET "endDate" = to_char(try_parse_messy_date("endDate"), 'YYYY-MM-DD')
--    WHERE "endDate" IS NOT NULL
--      AND try_parse_messy_date("endDate") IS NOT NULL
--      AND to_char(try_parse_messy_date("endDate"), 'YYYY-MM-DD') <> "endDate";
--
--   -- Verify counts before committing:
--   SELECT
--     COUNT(*) FILTER (WHERE start_date ~ '^\d{4}-\d{2}-\d{2}')        AS start_iso,
--     COUNT(*) FILTER (WHERE start_date IS NOT NULL
--                        AND TRIM(start_date) <> ''
--                        AND NOT (start_date ~ '^\d{4}-\d{2}-\d{2}')) AS start_still_text,
--     COUNT(*) FILTER (WHERE "endDate" ~ '^\d{4}-\d{2}-\d{2}')         AS end_iso,
--     COUNT(*) FILTER (WHERE "endDate" IS NOT NULL
--                        AND TRIM("endDate") <> ''
--                        AND NOT ("endDate" ~ '^\d{4}-\d{2}-\d{2}'))  AS end_still_text
--   FROM hrfs."BranchStaff";
--
--   -- If counts look right (start_still_text only has year-less / garbage rows):
--   COMMIT;
--   -- If anything looks wrong:
--   -- ROLLBACK;
