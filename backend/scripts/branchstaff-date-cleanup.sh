#!/bin/bash
# Weekly cleanup of BranchStaff start_date / endDate text formats.
# Runs the try_parse_messy_date UPDATE through the FDW, then posts a
# summary line to Telegram so we know it ran (or that the DB was down).
#
# Install: append to crontab -e on wintest-server, e.g.
#   0 8 * * 1 /home/staff1/ebright-dashboard/backend/scripts/branchstaff-date-cleanup.sh >> /tmp/branchstaff-cleanup.log 2>&1
# That fires every Monday at 08:00 MYT.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is not set (check $ENV_FILE)}"
: "${TELEGRAM_ALLOWED_CHATS:?TELEGRAM_ALLOWED_CHATS is not set (check $ENV_FILE)}"

BOT_TOKEN="$TELEGRAM_BOT_TOKEN"
# Re-use the report broadcast list; falls back to ALLOWED if unset.
REPORT_CHATS="${TELEGRAM_REPORT_CHATS:-$TELEGRAM_ALLOWED_CHATS}"
DB_CONTAINER="${DB_CONTAINER:-postgres_leads}"

REPORT_DATE=$(TZ="Asia/Kuala_Lumpur" date '+%d %b %Y')

# Bash JSON-string escape (handles \\ \" \n \r \t) — same helper as
# telegram-report.sh, kept inline so this script is self-contained.
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '"%s"' "$s"
}

broadcast() {
  local text="$1"
  local payload
  payload=$(json_escape "$text")
  IFS=',' read -ra CHATS <<< "$REPORT_CHATS"
  for chat in "${CHATS[@]}"; do
    chat_clean=$(echo "$chat" | tr -d ' ')
    [ -z "$chat_clean" ] && continue
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
      -H "Content-Type: application/json" \
      -d "{\"chat_id\":${chat_clean},\"text\":${payload},\"parse_mode\":\"Markdown\"}" > /dev/null
  done
}

# UPDATE both columns and report counts in one round-trip via CTEs.
# RETURNING populates the count CTEs even though we don't read individual rows.
read -r -d '' SQL <<'EOSQL' || true
WITH s AS (
  UPDATE hrfs."BranchStaff"
     SET start_date = to_char(try_parse_messy_date(start_date), 'YYYY-MM-DD')
   WHERE start_date IS NOT NULL
     AND try_parse_messy_date(start_date) IS NOT NULL
     AND to_char(try_parse_messy_date(start_date), 'YYYY-MM-DD') <> start_date
   RETURNING 1
), e AS (
  UPDATE hrfs."BranchStaff"
     SET "endDate" = to_char(try_parse_messy_date("endDate"), 'YYYY-MM-DD')
   WHERE "endDate" IS NOT NULL
     AND try_parse_messy_date("endDate") IS NOT NULL
     AND to_char(try_parse_messy_date("endDate"), 'YYYY-MM-DD') <> "endDate"
   RETURNING 1
)
SELECT
  (SELECT COUNT(*) FROM s) AS start_changed,
  (SELECT COUNT(*) FROM e) AS end_changed,
  (SELECT COUNT(*) FROM hrfs."BranchStaff"
    WHERE start_date IS NOT NULL AND TRIM(start_date) <> ''
      AND NOT (start_date ~ '^\d{4}-\d{2}-\d{2}')) AS start_year_less,
  (SELECT COUNT(*) FROM hrfs."BranchStaff"
    WHERE "endDate" IS NOT NULL AND TRIM("endDate") <> ''
      AND NOT ("endDate" ~ '^\d{4}-\d{2}-\d{2}')) AS end_year_less;
EOSQL

DB_FAILED=0
RESULT=$(docker exec -i "$DB_CONTAINER" psql -U optidept -d ebrightleads_db -t -A -F'|' -c "$SQL" 2>/dev/null) || DB_FAILED=1

if [ "$DB_FAILED" -eq 1 ] || [ -z "$RESULT" ]; then
  broadcast "🧹 *BranchStaff Date Cleanup* — ${REPORT_DATE}

⚠️ DB unreachable. Skipped this week."
  echo "[$(date)] DB unreachable; skipped"
  exit 0
fi

IFS='|' read -r START_CHANGED END_CHANGED START_YEARLESS END_YEARLESS <<< "$RESULT"

broadcast "🧹 *BranchStaff Date Cleanup* — ${REPORT_DATE}

Updated: *${START_CHANGED:-0}* start_date · *${END_CHANGED:-0}* endDate
Year-less left: ${START_YEARLESS:-?} start · ${END_YEARLESS:-?} end"

echo "[$(date)] start_changed=${START_CHANGED} end_changed=${END_CHANGED} start_yearless=${START_YEARLESS} end_yearless=${END_YEARLESS}"
