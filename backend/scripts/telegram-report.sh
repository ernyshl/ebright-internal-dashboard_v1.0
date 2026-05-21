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

# Query leads from master_leads_powerbi — the live view that correctly converts
# UTC Meta timestamps to MYT and already excludes Sara recruitment form IDs.
# master_leads_base had a timezone bug (stored UTC as timestamp-without-tz,
# then AT TIME ZONE 'MYT' re-interpreted it as MYT, shifting late-UTC leads
# to the wrong day and undercounting by ~8 leads/day).
LEADS_SQL="
SELECT
  CASE
    WHEN TRIM(lead_source) = 'Meta' THEN 'Meta'
    WHEN TRIM(lead_source) = 'TikTok' THEN 'TikTok'
    WHEN LOWER(TRIM(lead_source)) IN ('trial class form','online conversion form') THEN 'Website (Conversion)'
    WHEN LOWER(TRIM(lead_source)) = 'roadshow' THEN 'Roadshow'
    WHEN LOWER(TRIM(lead_source)) IN ('self generated lead','self-generated lead','selfgenerated lead','self generated','self-generated','sgl','s.g.l') THEN 'Self Generated Lead'
    WHEN LOWER(TRIM(lead_source)) IN ('walk in','walk-in','walkin','walk_in') THEN 'Walk In'
    WHEN LOWER(TRIM(lead_source)) = 'website' THEN 'Website (Organic)'
    ELSE 'Others'
  END as source,
  COUNT(*) as count
FROM master_leads_powerbi
WHERE (submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
  AND TRIM(clean_branch) = ANY(ARRAY['Online','Subang Taipan','Sri Petaling','Setia Alam','Kota Damansara','Putrajaya','Ampang','Cyberjaya','Klang','Denai Alam','Bandar Baru Bangi','Danau Kota','Shah Alam','Bandar Tun Hussein Onn','Eco Grandeur','Bandar Seri Putra','Rimbayu','Kajang','Kota Warisan','Taman Sri Gombak','Dataran Puchong Utama','Tropicana Sungai Buloh','Puncak Jalil'])
  AND sibling_index = 1
GROUP BY 1
ORDER BY count DESC;
"

# Total including all siblings (for regional context).
TOTAL_WITH_SIBLINGS_SQL="
SELECT COUNT(*) as count
FROM master_leads_powerbi
WHERE (submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
  AND TRIM(clean_branch) = ANY(ARRAY['Online','Subang Taipan','Sri Petaling','Setia Alam','Kota Damansara','Putrajaya','Ampang','Cyberjaya','Klang','Denai Alam','Bandar Baru Bangi','Danau Kota','Shah Alam','Bandar Tun Hussein Onn','Eco Grandeur','Bandar Seri Putra','Rimbayu','Kajang','Kota Warisan','Taman Sri Gombak','Dataran Puchong Utama','Tropicana Sungai Buloh','Puncak Jalil']);
"

# Total spend today — mirrors Marketing Performance "Main Marketing" total.
# Main Marketing = FB (Group) + FB (Mokhir/Online) + TikTok + Google.
# Sara is intentionally excluded (matches backend/src/routes/marketing.js
# sumPeriods which omits sara from main_marketing). All three Meta channels
# live in meta_spend; Google lives in google_spend.
SPEND_SQL="
SELECT
  COALESCE((SELECT SUM(spend) FROM meta_spend
     WHERE data_date::date = (SELECT MAX(data_date::date) FROM meta_spend)
       AND account_id IN ('${META_MAIN_FB_ID}','${META_ONLINE_ID}','${META_TT_ID}')
       AND UPPER(campaign_name) NOT LIKE '%FRANCHISE%'
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

# Sara Recruitment leads — identified by presence of 'position' or 'education'
# field keys in raw_data, which are exclusive to Sara's recruitment forms.
SARA_LEADS_SQL="
SELECT COUNT(*) FROM meta_leads
WHERE (lead_created_time AT TIME ZONE 'Asia/Kuala_Lumpur')::date
      = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(raw_data->'field_data') f
    WHERE f->>'name' ILIKE '%position%' OR f->>'name' ILIKE '%education%'
  );
"

# Execute queries — capture exit code without aborting on `set -e` so we can
# fall through to a 'Data unavailable' broadcast if the DB call fails.
DB_FAILED=0
LEADS_RESULT=$(docker exec "$DB_CONTAINER" sh -c "psql \$DATABASE_URL -t -A -F'|' -c \"$LEADS_SQL\"" 2>/dev/null) || DB_FAILED=1
SPEND_RESULT=$(docker exec "$DB_CONTAINER" sh -c "psql \$DATABASE_URL -t -A -c \"$SPEND_SQL\"" 2>/dev/null) || DB_FAILED=1
SARA_LEADS_RESULT=$(docker exec "$DB_CONTAINER" sh -c "psql \$DATABASE_URL -t -A -c \"$SARA_LEADS_SQL\"" 2>/dev/null) || true
TOTAL_WITH_SIBLINGS_RESULT=$(docker exec "$DB_CONTAINER" sh -c "psql \$DATABASE_URL -t -A -c \"$TOTAL_WITH_SIBLINGS_SQL\"" 2>/dev/null) || true

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

# Parse Sara recruitment leads
SARA_LEADS=$(echo "$SARA_LEADS_RESULT" | tr -d '[:space:]')
SARA_LEADS=${SARA_LEADS:-0}

# Parse total with siblings
TOTAL_WITH_SIBLINGS=$(echo "$TOTAL_WITH_SIBLINGS_RESULT" | tr -d '[:space:]')
TOTAL_WITH_SIBLINGS=${TOTAL_WITH_SIBLINGS:-0}

# Parse spend
TOTAL_SPEND=$(echo "$SPEND_RESULT" | tr -d '[:space:]')
TOTAL_SPEND=${TOTAL_SPEND:-0}

# Calculate CPL — only paid-channel leads (Meta + TikTok + Website Conversion)
PAID_LEADS=$((META + TIKTOK + WEBSITE_CONV))
if [ "$PAID_LEADS" -gt 0 ]; then
  CPL=$(echo "scale=2; $TOTAL_SPEND / $PAID_LEADS" | bc 2>/dev/null || echo "0")
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

*Recruitment Leads*
━━━━━━━━━━━━━━━━━━
TOTAL: *${SARA_LEADS}*

*Executive Summary*
━━━━━━━━━━━━━━━━━━
TOTAL (without siblings): *${TOTAL}*
TOTAL (with siblings): *${TOTAL_WITH_SIBLINGS}*
Total Spend Today: *${FMT_SPEND}*
Cost Per Lead: *${FMT_CPL}*"

broadcast "$MESSAGE"

# Save computed numbers to DB cache so /report bot command always returns
# the same figures that were just broadcast — avoids sync race conditions.
CACHE_SQL="
INSERT INTO telegram_report_cache
  (report_date, meta_count, tiktok_count, website_conv, roadshow, sgl, walkin, website_org, others,
   total_leads, total_leads_with_siblings, sara_leads, total_spend, cpl, updated_at)
VALUES (
  (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
  ${META}, ${TIKTOK}, ${WEBSITE_CONV}, ${ROADSHOW}, ${SGL}, ${WALKIN}, ${WEBSITE_ORG}, ${OTHERS},
  ${TOTAL}, ${TOTAL_WITH_SIBLINGS}, ${SARA_LEADS}, ${TOTAL_SPEND}, ${CPL}, NOW()
)
ON CONFLICT (report_date) DO UPDATE SET
  meta_count                = EXCLUDED.meta_count,
  tiktok_count              = EXCLUDED.tiktok_count,
  website_conv              = EXCLUDED.website_conv,
  roadshow                  = EXCLUDED.roadshow,
  sgl                       = EXCLUDED.sgl,
  walkin                    = EXCLUDED.walkin,
  website_org               = EXCLUDED.website_org,
  others                    = EXCLUDED.others,
  total_leads               = EXCLUDED.total_leads,
  total_leads_with_siblings = EXCLUDED.total_leads_with_siblings,
  sara_leads                = EXCLUDED.sara_leads,
  total_spend               = EXCLUDED.total_spend,
  cpl                       = EXCLUDED.cpl,
  updated_at                = NOW();
"
docker exec "$DB_CONTAINER" sh -c "psql \$DATABASE_URL -q -c \"$CACHE_SQL\"" 2>/dev/null || true
echo "Cache saved at $(date)"
