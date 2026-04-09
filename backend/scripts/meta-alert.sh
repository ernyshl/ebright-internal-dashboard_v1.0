#!/bin/bash
# Telegram alert if meta sync log hasn't updated in 15 minutes
# Run via cron every 5 minutes

BOT_TOKEN="8783294413:AAHpYwH-3rn7opYoi6CFDC3GkXdY7LPZJvQ"
CHAT_ID="178748547"
LOG_FILE="/home/staff1/ebright-live-dashboard/meta_sync.log"
ALERT_FLAG="/tmp/meta_alert_sent"

# Check if log file exists
if [ ! -f "$LOG_FILE" ]; then
  # Only alert once per outage
  if [ ! -f "$ALERT_FLAG" ]; then
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
      -H "Content-Type: application/json" \
      -d "{\"chat_id\":${CHAT_ID},\"text\":\"⚠️ *Meta Sync Alert*\n\nLog file not found: ${LOG_FILE}\n\nMeta sync may not be running.\",\"parse_mode\":\"Markdown\"}" > /dev/null
    touch "$ALERT_FLAG"
  fi
  exit 0
fi

# Get last modified time of log file (seconds since epoch)
LAST_MOD=$(stat -c %Y "$LOG_FILE" 2>/dev/null)
NOW=$(date +%s)
DIFF=$(( NOW - LAST_MOD ))

# 15 minutes = 900 seconds
if [ "$DIFF" -gt 900 ]; then
  # Only alert once per outage (don't spam)
  if [ ! -f "$ALERT_FLAG" ]; then
    MINS=$(( DIFF / 60 ))
    LAST_TIME=$(date -d "@${LAST_MOD}" '+%I:%M %p')
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
      -H "Content-Type: application/json" \
      -d "{\"chat_id\":${CHAT_ID},\"text\":\"⚠️ *Meta Sync Alert*\n\nMeta sync log hasn't updated in *${MINS} minutes*.\nLast update: ${LAST_TIME}\n\nCheck if the sync scripts are running and if Meta has paused your app.\",\"parse_mode\":\"Markdown\"}" > /dev/null
    touch "$ALERT_FLAG"
  fi
else
  # Log is fresh — remove alert flag so next outage triggers alert
  rm -f "$ALERT_FLAG"
fi
