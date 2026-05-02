#!/bin/bash
# Telegram Daily Report Bot
# Runs via cron at 9am, 12pm, 3pm, 6pm, 9pm MYT

set -euo pipefail

# Load env from backend/.env (this script lives in backend/scripts/)
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
# Recipients for scheduled reports — comma-separated, broadcast to all.
# Falls back to TELEGRAM_ALLOWED_CHATS if TELEGRAM_REPORT_CHATS is not set.
REPORT_CHATS="${TELEGRAM_REPORT_CHATS:-$TELEGRAM_ALLOWED_CHATS}"
DB_CONTAINER="${DB_CONTAINER:-ebright-dashboard-backend}"

# Get current time in MYT
REPORT_TIME=$(TZ="Asia/Kuala_Lumpur" date '+%I:%M %p')
REPORT_DATE=$(TZ="Asia/Kuala_Lumpur" date '+%d %b %Y')

# Query leads by source (today) — without siblings, matches Branch Distribution
# top Summary + Lead Sources sections (which both filter sibling_index = 1).
LEADS_SQL="
SELECT
  CASE
    WHEN TRIM(lead_source) = 'Meta' THEN 'Meta'
    WHEN TRIM(lead_source) = 'TikTok' THEN 'TikTok'
    WHEN LOWER(TRIM(lead_source)) = 'trial class form' THEN 'Website (Conversion)'
    WHEN LOWER(TRIM(lead_source)) = 'roadshow' THEN 'Roadshow'
    WHEN LOWER(TRIM(lead_source)) IN ('self generated lead','self-generated lead','selfgenerated lead','self generated','self-generated','sgl','s.g.l') THEN 'Self Generated Lead'
    WHEN LOWER(TRIM(lead_source)) IN ('walk in','walk-in','walkin','walk_in') THEN 'Walk In'
    WHEN LOWER(TRIM(lead_source)) = 'website' THEN 'Website (Organic)'
    ELSE 'Others'
  END as source,
  COUNT(*) as count
FROM master_leads_powerbi
WHERE (submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
  AND sibling_index = 1
GROUP BY 1
ORDER BY count DESC;
"

# Total spend today — mirrors the marketing dashboard exactly.
# Sums the 4 Meta ad accounts (META_MAIN_FB_ID, META_SARA_ID, META_ONLINE_ID,
# META_TT_ID — all from meta_spend) plus google_spend. The tiktok_spend table
# is intentionally NOT used because the dashboard's "TikTok" channel comes
# from META_TT_ID inside meta_spend, not from tiktok_spend. Earlier attempts
# that used MAX(spend) GROUP BY account_id under-counted because meta_spend
# has multiple campaigns per account.
SPEND_SQL="
SELECT
  COALESCE((SELECT SUM(spend) FROM meta_spend
     WHERE data_date::date = (SELECT MAX(data_date::date) FROM meta_spend)
       AND account_id IN ('${META_MAIN_FB_ID}','${META_SARA_ID}','${META_ONLINE_ID}','${META_TT_ID}')
   ), 0)
  +
  COALESCE((SELECT SUM(spend) FROM google_spend
     WHERE data_date::date = (SELECT MAX(data_date::date) FROM google_spend)
   ), 0)
  AS total_spend;
"

# Bash JSON-string escape (handles \\ \" \n \r \t) — replaces python3 json.dumps
# so the cron environment doesn't need python3 in PATH. Returns a quoted string.
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '"%s"' "$s"
}

# Broadcast a Markdown message to every chat in REPORT_CHATS.
broadcast() {
  local text="$1"
  local payload
  payload=$(json_escape "$text")
  IFS=',' read -ra CHATS <<< "$REPORT_CHATS"
  local sent=0
  for chat in "${CHATS[@]}"; do
    chat_clean=$(echo "$chat" | tr -d ' ')
    [ -z "$chat_clean" ] && continue
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
      -H "Content-Type: application/json" \
      -d "{\"chat_id\":${chat_clean},\"text\":${payload},\"parse_mode\":\"Markdown\"}" > /dev/null
    sent=$((sent + 1))
  done
  echo "Report sent to ${sent} chat(s) at $(date)"
}

# Execute queries — capture exit code without aborting on `set -e` so we can
# fall through to a 'Data unavailable' broadcast if the DB call fails.
DB_FAILED=0
LEADS_RESULT=$(docker exec "$DB_CONTAINER" sh -c "psql \$DATABASE_URL -t -A -F'|' -c \"$LEADS_SQL\"" 2>/dev/null) || DB_FAILED=1
SPEND_RESULT=$(docker exec "$DB_CONTAINER" sh -c "psql \$DATABASE_URL -t -A -c \"$SPEND_SQL\"" 2>/dev/null) || DB_FAILED=1

if [ "$DB_FAILED" -eq 1 ]; then
  broadcast "⚠️ *Ebright Report — Data unavailable*

DB could not be reached. Please check manually.

📅 ${REPORT_DATE} | ⏰ ${REPORT_TIME}"
  exit 0
fi

# Parse leads into variables
META=0; TIKTOK=0; WEBSITE_CONV=0; ROADSHOW=0; SGL=0; WALKIN=0; WEBSITE_ORG=0; OTHERS=0; TOTAL=0

while IFS='|' read -r source count; do
  [ -z "$source" ] && continue
  count=${count:-0}
  TOTAL=$((TOTAL + count))
  case "$source" in
    "Meta") META=$count ;;
    "TikTok") TIKTOK=$count ;;
    "Website (Conversion)") WEBSITE_CONV=$count ;;
    "Roadshow") ROADSHOW=$count ;;
    "Self Generated Lead") SGL=$count ;;
    "Walk In") WALKIN=$count ;;
    "Website (Organic)") WEBSITE_ORG=$count ;;
    "Others") OTHERS=$count ;;
  esac
done <<< "$LEADS_RESULT"

# Parse spend
TOTAL_SPEND=$(echo "$SPEND_RESULT" | tr -d '[:space:]')
TOTAL_SPEND=${TOTAL_SPEND:-0}

# Calculate CPL
if [ "$TOTAL" -gt 0 ]; then
  CPL=$(echo "scale=2; $TOTAL_SPEND / $TOTAL" | bc 2>/dev/null || echo "0")
else
  CPL="0"
fi

# Format spend with RM
FMT_SPEND=$(printf "RM %.2f" "$TOTAL_SPEND")
FMT_CPL=$(printf "RM %.2f" "$CPL")

# Build message
MESSAGE="📊 *Ebright Daily Report*
📅 ${REPORT_DATE} | ⏰ ${REPORT_TIME}

*Today's Leads*
━━━━━━━━━━━━━━━━━━
Meta: *${META}*
TikTok: *${TIKTOK}*
Website (Conversion): *${WEBSITE_CONV}*
Roadshow: *${ROADSHOW}*
Self Generated Lead: *${SGL}*
Walk In: *${WALKIN}*
Website (Organic): *${WEBSITE_ORG}*
Others: *${OTHERS}*
━━━━━━━━━━━━━━━━━━
TOTAL: *${TOTAL}*

*Executive Summary*
━━━━━━━━━━━━━━━━━━
Total Leads Today: *${TOTAL}*
Total Spend Today: *${FMT_SPEND}*
Cost Per Lead: *${FMT_CPL}*"

broadcast "$MESSAGE"
