#!/bin/bash
# Calls the refresh_master_leads_base() function which incrementally tops up
# master_leads_base with new Meta + TikTok rows from meta_leads / social_posts.
# Idempotent — safe to run as often as you like.
#
# Install (every 5 minutes):
#   crontab -e
#   */5 * * * * /home/staff1/ebright-dashboard/backend/scripts/refresh-master-leads-base.sh >> /tmp/master-leads-base-refresh.log 2>&1

set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-postgres_leads}"

RESULT=$(docker exec -i "$DB_CONTAINER" psql -U optidept -d ebrightleads_db -t -A -F'|' \
  -c "SELECT * FROM refresh_master_leads_base();" 2>&1) || {
  echo "[$(date)] refresh failed: $RESULT"
  exit 0   # don't fail cron run loudly; log and move on
}

IFS='|' read -r META_INS TT_INS <<< "$RESULT"
echo "[$(date)] meta_inserted=${META_INS:-0} tiktok_inserted=${TT_INS:-0}"
