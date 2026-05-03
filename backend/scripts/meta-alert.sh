#!/bin/bash
# Telegram alert if meta sync log hasn't updated in 30 minutes
# Run via cron every 5 minutes

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
# Recipients for ops alerts — comma-separated, broadcast to all.
# Defaults to the FIRST chat in TELEGRAM_ALLOWED_CHATS so noisy alerts don't
# fan out to the full allowlist unless explicitly configured.
ALERT_CHATS="${TELEGRAM_ALERT_CHATS:-${TELEGRAM_ALLOWED_CHATS%%,*}}"
LOG_FILE="${META_SYNC_LOG:-/home/staff1/ebright-live-dashboard/meta_sync.log}"
ALERT_FLAG="/tmp/meta_alert_sent"

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

# Broadcast a Markdown-formatted alert to every chat in ALERT_CHATS
send_alert() {
  local text="$1"
  local payload
  payload=$(json_escape "$text")
  IFS=',' read -ra CHATS <<< "$ALERT_CHATS"
  for chat in "${CHATS[@]}"; do
    chat_clean=$(echo "$chat" | tr -d ' ')
    [ -z "$chat_clean" ] && continue
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
      -H "Content-Type: application/json" \
      -d "{\"chat_id\":${chat_clean},\"text\":${payload},\"parse_mode\":\"Markdown\"}" > /dev/null
  done
}

# Check if log file exists
if [ ! -f "$LOG_FILE" ]; then
  if [ ! -f "$ALERT_FLAG" ]; then
    send_alert "⚠️ *Meta Sync Alert*

Log file not found: ${LOG_FILE}

Meta sync may not be running."
    touch "$ALERT_FLAG"
  fi
  exit 0
fi

# Get last modified time of log file (seconds since epoch)
LAST_MOD=$(stat -c %Y "$LOG_FILE" 2>/dev/null)
NOW=$(date +%s)
DIFF=$(( NOW - LAST_MOD ))

# 30 minutes = 1800 seconds
if [ "$DIFF" -gt 1800 ]; then
  if [ ! -f "$ALERT_FLAG" ]; then
    MINS=$(( DIFF / 60 ))
    LAST_TIME=$(date -d "@${LAST_MOD}" '+%I:%M %p')
    send_alert "⚠️ *Meta Sync Alert*

Meta sync log hasn't updated in *${MINS} minutes*.
Last update: ${LAST_TIME}

Check if the sync scripts are running and if Meta has paused your app."
    touch "$ALERT_FLAG"
  fi
else
  # Log is fresh — remove alert flag so next outage triggers alert
  rm -f "$ALERT_FLAG"
fi
