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

# Query leads by source (today)
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
GROUP BY 1
ORDER BY count DESC;
"

# Query total spend today across Meta + Google + TikTok (each uses its own latest date)
SPEND_SQL="
SELECT
  (SELECT COALESCE(SUM(spend), 0) FROM meta_spend
     WHERE data_date::date = (SELECT MAX(data_date::date) FROM meta_spend))
  +
  (SELECT COALESCE(SUM(spend), 0) FROM google_spend
     WHERE data_date::date = (SELECT MAX(data_date::date) FROM google_spend))
  +
  (SELECT COALESCE(SUM(spend), 0) FROM tiktok_spend
     WHERE data_date::date = (SELECT MAX(data_date::date) FROM tiktok_spend))
  AS total_spend;
"

# Execute queries
LEADS_RESULT=$(docker exec "$DB_CONTAINER" sh -c "psql \$DATABASE_URL -t -A -F'|' -c \"$LEADS_SQL\"" 2>/dev/null)
SPEND_RESULT=$(docker exec "$DB_CONTAINER" sh -c "psql \$DATABASE_URL -t -A -c \"$SPEND_SQL\"" 2>/dev/null)

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

# JSON-escape the message body once, then broadcast to every configured chat
MESSAGE_JSON=$(python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' <<< "$MESSAGE")

IFS=',' read -ra CHATS <<< "$REPORT_CHATS"
SENT=0
for chat in "${CHATS[@]}"; do
  chat_clean=$(echo "$chat" | tr -d ' ')
  [ -z "$chat_clean" ] && continue
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":${chat_clean},\"text\":${MESSAGE_JSON},\"parse_mode\":\"Markdown\"}" > /dev/null
  SENT=$((SENT + 1))
done

echo "Report sent to ${SENT} chat(s) at $(date)"
