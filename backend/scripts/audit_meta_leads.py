#!/usr/bin/env python3
"""
audit_meta_leads.py — read-only sync coverage audit.

Compares Meta's view of leads on a given MYT date vs what we have in
postgres `meta_leads`. Helps diagnose why Branch Distribution / Telegram
counts can lag Meta's Leads Center UI even after the JOIN-dedup fix.

Usage:
  python3 audit_meta_leads.py                  # audits "yesterday MYT"
  python3 audit_meta_leads.py 2026-05-03       # audits a specific MYT date

Lives next to sync_meta_leads.py on wintest-server. No DB writes.
"""

import os
import sys
import json
import time
import requests
import psycopg2
from datetime import datetime, date, timedelta, timezone
from collections import defaultdict

# Reuse the same config the sync uses.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.expanduser("~/ebright-live-dashboard"))
import config  # noqa: E402

GRAPH = "https://graph.facebook.com/v21.0"
MYT = timezone(timedelta(hours=8))


def parse_target_date(argv):
    if len(argv) > 1:
        return date.fromisoformat(argv[1])
    return (datetime.now(MYT) - timedelta(days=1)).date()


def myt_day_to_utc_range(target):
    """Return (start_utc, end_utc) covering one MYT day as ISO strings for Meta."""
    start_myt = datetime.combine(target, datetime.min.time(), tzinfo=MYT)
    end_myt = start_myt + timedelta(days=1)
    return start_myt.astimezone(timezone.utc), end_myt.astimezone(timezone.utc)


def get_page_token():
    """sync_meta_leads.py reads from meta_integration; replicate that here."""
    conn = psycopg2.connect(config.DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT access_token FROM meta_integration ORDER BY id DESC LIMIT 1"
            )
            row = cur.fetchone()
            if row and row[0]:
                return row[0]
    finally:
        conn.close()
    return getattr(config, "LEADS_ACCESS_TOKEN", None)


def fetch_all_forms(token, page_id):
    """Every form on the Page, regardless of status (ACTIVE, PAUSED, ARCHIVED, DRAFT)."""
    forms = []
    url = f"{GRAPH}/{page_id}/leadgen_forms"
    params = {"access_token": token, "fields": "id,name,status", "limit": 100}
    while url:
        r = requests.get(url, params=params, timeout=30)
        if r.status_code != 200:
            print(f"⚠️  leadgen_forms error: {r.status_code} {r.text[:200]}")
            break
        data = r.json()
        forms.extend(data.get("data", []))
        paging = data.get("paging", {})
        url = paging.get("next")
        params = None  # next URL has its own access_token
    return forms


def fetch_form_leads(token, form_id, start_utc, end_utc):
    """All leads for one form whose created_time falls inside [start_utc, end_utc).
    Follows paging. Returns list of dicts {id, created_time}."""
    out = []
    # Meta's `filtering` param accepts ISO with offset; we pass UTC.
    flt = json.dumps([
        {"field": "time_created", "operator": "GREATER_THAN", "value": int(start_utc.timestamp())},
        {"field": "time_created", "operator": "LESS_THAN", "value": int(end_utc.timestamp())},
    ])
    url = f"{GRAPH}/{form_id}/leads"
    params = {
        "access_token": token,
        "fields": "id,created_time",
        "limit": 100,
        "filtering": flt,
    }
    page = 0
    while url and page < 50:  # hard cap to avoid runaway loops
        r = requests.get(url, params=params, timeout=30)
        if r.status_code != 200:
            return out, f"{r.status_code} {r.text[:120]}"
        data = r.json()
        out.extend(data.get("data", []))
        url = data.get("paging", {}).get("next")
        params = None
        page += 1
        time.sleep(0.05)  # gentle pacing
    return out, None


def fetch_db_leads(target):
    """All meta_leads with raw_data->>'created_time' inside the MYT day."""
    start_utc, end_utc = myt_day_to_utc_range(target)
    conn = psycopg2.connect(config.DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT lead_id, form_id, form_name,
                       (raw_data ->> 'created_time')::timestamptz AS ct
                FROM meta_leads
                WHERE (raw_data ->> 'created_time')::timestamptz >= %s
                  AND (raw_data ->> 'created_time')::timestamptz <  %s
                """,
                (start_utc, end_utc),
            )
            return cur.fetchall()
    finally:
        conn.close()


def main():
    target = parse_target_date(sys.argv)
    start_utc, end_utc = myt_day_to_utc_range(target)
    print(f"🔍 Audit window: {target} MYT ({start_utc.isoformat()} → {end_utc.isoformat()} UTC)")

    token = get_page_token()
    if not token:
        print("❌ No access token. Check meta_integration table or config.LEADS_ACCESS_TOKEN.")
        sys.exit(1)

    page_id = getattr(config, "PAGE_ID", None) or os.environ.get("PAGE_ID")
    if not page_id:
        print("❌ PAGE_ID not configured in config.py.")
        sys.exit(1)

    print(f"📄 Page: {page_id}")

    forms = fetch_all_forms(token, page_id)
    by_status = defaultdict(int)
    for f in forms:
        by_status[f.get("status", "?")] += 1
    print(f"📋 Total forms on Page: {len(forms)}  ({dict(by_status)})")

    meta_truth_ids = set()
    per_form = {}  # form_id → (name, status, leads_on_meta, error)
    for i, f in enumerate(forms, 1):
        leads, err = fetch_form_leads(token, f["id"], start_utc, end_utc)
        per_form[f["id"]] = {
            "name": f.get("name", ""),
            "status": f.get("status", "?"),
            "leads": leads,
            "error": err,
        }
        for ld in leads:
            meta_truth_ids.add(ld["id"])
        if i % 25 == 0:
            print(f"   …{i}/{len(forms)} forms scanned")

    print(f"📊 Total leads on Meta for {target} MYT: {len(meta_truth_ids)}")

    db_rows = fetch_db_leads(target)
    db_ids = {r[0] for r in db_rows}
    print(f"🗄  Total leads in our meta_leads for {target} MYT: {len(db_ids)}")

    missing = meta_truth_ids - db_ids
    extra = db_ids - meta_truth_ids
    print(f"\n❗ Missing from DB (on Meta but not synced): {len(missing)}")
    print(f"➕ In DB but not in Meta's response: {len(extra)}  (usually a date-edge case)")

    # Per-form breakdown of misses
    if missing:
        miss_by_form = defaultdict(list)
        for fid, data in per_form.items():
            for ld in data["leads"]:
                if ld["id"] in missing:
                    miss_by_form[fid].append(ld)

        print("\n📌 Missing leads grouped by form (top 20):")
        ordered = sorted(miss_by_form.items(), key=lambda kv: -len(kv[1]))[:20]
        for fid, leads in ordered:
            meta = per_form[fid]
            print(
                f"  - [{meta['status']:>8}] {fid}  {meta['name'][:60]}  "
                f"missing={len(leads)} of {len(meta['leads'])}"
            )

    # Surface forms that errored (perm issues, etc.)
    errored = [(fid, m) for fid, m in per_form.items() if m["error"]]
    if errored:
        print(f"\n⚠️  Forms that errored ({len(errored)}):")
        for fid, m in errored[:20]:
            print(f"  - [{m['status']}] {fid} {m['name'][:60]}  → {m['error']}")

    print("\n✅ Audit complete (read-only — no DB writes).")


if __name__ == "__main__":
    main()
