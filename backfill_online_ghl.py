"""
One-off: push existing ONLINE trial class Meta leads to GHL.
These were skipped because there's no branch field in the form — now routed to 'online'.
Targets forms: *| ONLINE |* with GHL OD APPROVED (excluding COACH/recruitment forms).
"""
import psycopg2
import requests
import json
import config

WEBHOOK_URL = 'https://dashboard.ebright.my/api/meta-leads/webhook'

ONLINE_FORM_PATTERNS = [
    '20260408 | BM | ONLINE | GHL OD APPROVED',
    '20260408 | ENG | ONLINE | GHL OD APPROVED',
    '20260424 | BM | ONLINE | GHL OD APPROVED',
]

def run():
    conn = psycopg2.connect(**config.DB_CONFIG)
    cur = conn.cursor()
    cur.execute("SET search_path = public")

    placeholders = ','.join(['%s'] * len(ONLINE_FORM_PATTERNS))
    cur.execute(f"""
        SELECT lead_id, form_name, raw_data, campaign_name
        FROM meta_leads
        WHERE form_name IN ({placeholders})
        ORDER BY lead_created_time
    """, ONLINE_FORM_PATTERNS)

    rows = cur.fetchall()
    print(f"Found {len(rows)} ONLINE leads to backfill.")

    pushed = 0
    skipped = 0
    for lead_id, form_name, raw_data, campaign_name in rows:
        field_data = raw_data.get('field_data', [])
        field_map = {f['name']: (f['values'][0] if f['values'] else '') for f in field_data}

        full_name = field_map.get('full_name', '')
        email     = field_map.get('email', '')
        phone     = field_map.get('phone_number', field_map.get('phone', ''))

        if not email and not phone:
            print(f"  ⏭  Skip {lead_id} — no contact info")
            skipped += 1
            continue

        try:
            r = requests.post(WEBHOOK_URL, json={
                'fullName':     full_name,
                'email':        email,
                'phone':        phone,
                'rawBranch':    'online',
                'campaignName': campaign_name or '',
            }, timeout=10)
            resp = r.json()
            ghl = resp.get('ghl', '?')
            print(f"  ✅ {lead_id} ({full_name}) → {ghl}")
            pushed += 1
        except Exception as e:
            print(f"  ❌ {lead_id}: {e}")
            skipped += 1

    cur.close()
    conn.close()
    print(f"\nDone. Pushed: {pushed} | Skipped/errors: {skipped}")

if __name__ == '__main__':
    run()
