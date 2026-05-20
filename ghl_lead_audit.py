#!/usr/bin/env python3
"""
Hourly audit: compare master_leads_base count per branch vs GHL opportunity count.
When DB > GHL for any branch, automatically finds and pushes the missing leads.
Sends Telegram alert to 178748547 summarising what was pushed.
Run: python3 /home/staff1/ghl_lead_audit.py
"""

import psycopg2
import requests
import time
from collections import defaultdict
from datetime import datetime, timezone

AUDIT_START = '2026-05-20'  # When GHL integrations went live
GHL_BASE    = 'https://services.leadconnectorhq.com'
BOT_TOKEN   = '8783294413:AAHpYwH-3rn7opYoi6CFDC3GkXdY7LPZJvQ'
CHAT_ID     = '178748547'

DB_CONFIG = {
    'dbname': 'ebrightleads_db', 'user': 'optidept',
    'password': 'ebrightoptidept2025', 'host': '103.209.156.174', 'port': '5433'
}

LOCATIONS = {
    'online':                 {'locationId': 'Vpl9uLtDIHvddSSZztMA', 'token': 'pit-04d5417e-9400-448e-8f18-ab1ddcf70700', 'label': 'Online'},
    'subang_taipan':          {'locationId': 'usaXD9ZihKNI9lNqueE4', 'token': 'pit-ff268089-be71-45cb-9225-e6f7129d2547', 'label': 'Subang Taipan'},
    'setia_alam':             {'locationId': 'DoKT0lXGyQFz8DHoVOm4', 'token': 'pit-362bf359-27b3-4166-a55e-f698e915af9e', 'label': 'Setia Alam'},
    'sri_petaling':           {'locationId': 'wREGaqHXvoxHiNTj02mJ', 'token': 'pit-74e28a7b-30a3-48d7-8902-0c12b23cccc1', 'label': 'Sri Petaling'},
    'kota_damansara':         {'locationId': '3IxS5tbD1lvDxMGMSczL', 'token': 'pit-ce36e258-f128-4094-be1b-c1271f81442f', 'label': 'Kota Damansara'},
    'putrajaya':              {'locationId': 'BBqrR8ckJ87m4YojupLZ', 'token': 'pit-d95a6a82-e8f2-4855-9169-204accfbf84d', 'label': 'Putrajaya'},
    'ampang':                 {'locationId': 'cqr1ywf20KLTFSDCytCx', 'token': 'pit-7d5f7f52-1c30-49d6-b30e-8a5715beb88d', 'label': 'Ampang'},
    'cyberjaya':              {'locationId': '4xnM7ZmlbYAVFVqY1bX8', 'token': 'pit-ac5b7372-a5a0-4cdd-9828-38a74362706c', 'label': 'Cyberjaya'},
    'klang':                  {'locationId': 'ByhyzMBuV43aAzOsZffy', 'token': 'pit-db64a126-6605-48c3-9aa6-04622670c69e', 'label': 'Klang'},
    'denai_alam':             {'locationId': '7myL6WBNCz4rlxhE1GfC', 'token': 'pit-fba13e5a-ce2c-46eb-bae7-fb9e352a0e4a', 'label': 'Denai Alam'},
    'bandar_baru_bangi':      {'locationId': 'oUjhd0TVocJcZ1cMMi2G', 'token': 'pit-03fe8042-925c-4694-90b1-e86cfacdaeae', 'label': 'Bandar Baru Bangi'},
    'danau_kota':             {'locationId': 'HTsl0vOTuEAVw85S9I16', 'token': 'pit-f93e4594-99fe-43ed-9f9d-d6f766d4cd6d', 'label': 'Danau Kota'},
    'shah_alam':              {'locationId': '3ZNi0O4QkJiJ49QWnc19', 'token': 'pit-80debf55-6796-4ac9-8170-a9c2e69330e4', 'label': 'Shah Alam'},
    'bandar_tun_hussein_onn': {'locationId': 'gtZGYA7BGWfx54pND4nw', 'token': 'pit-e1e94f64-9950-4cd4-8cf1-acbaa4059ffd', 'label': 'Bandar Tun Hussein Onn'},
    'eco_grandeur':           {'locationId': 'EyX5ziXrAPuCOHoMutip', 'token': 'pit-503e96e5-e6a1-4e37-8fa9-dd48f67c3248', 'label': 'Eco Grandeur'},
    'bandar_seri_putra':      {'locationId': 'FuQByFeUURbkBl2YA61q', 'token': 'pit-d891efe2-0f9b-410f-b7b4-a192c4c3f62c', 'label': 'Bandar Seri Putra'},
    'bandar_rimbayu':         {'locationId': 'RtnVTOWs5GRREHyiTxaT', 'token': 'pit-6914cf46-ce4e-4b4a-a2fc-f0ae33ac9159', 'label': 'Bandar Rimbayu'},
    'taman_seri_gombak':      {'locationId': 'XUCj8GKwaYGPFB3LFm17', 'token': 'pit-1c61ad71-ff45-411c-8899-034e9e797959', 'label': 'Taman Sri Gombak'},
    'kajang_ttdi_grove':      {'locationId': 'QpIeU8mksO4PHvBIudQQ', 'token': 'pit-8f5445fa-b413-4137-8bed-00f8e9c15efb', 'label': 'Kajang'},
    'kota_warisan':           {'locationId': 'XeId139CcA8Wl6h5zTJT', 'token': 'pit-506bc22f-a756-4d80-b7ef-76fdee54a6e5', 'label': 'Kota Warisan'},
    'tropicana_sungai_buloh': {'locationId': 'baTAHn1jvxmUZS0J5pBf', 'token': 'pit-04919c9d-db5c-4c31-9923-b8fa08ea32d2', 'label': 'Tropicana Sungai Buloh'},
    'puncak_jalil':           {'locationId': 'xdiXYPd2m6LZWNTQVAIj', 'token': 'pit-3cd62cb3-1acf-435f-98ba-bc53fae93a2e', 'label': 'Puncak Jalil'},
    'puchong_utama':          {'locationId': 'dVVxStgEAxPktzsNEb5B', 'token': 'pit-ac07c188-6b62-4b6e-8d94-486d6b624ef5', 'label': 'Puchong Utama'},
}

BRANCH_TAGS = {
    'online':                 {'tag': 'onl',  'region': 'r3'},
    'subang_taipan':          {'tag': 'st',   'region': 'r2'},
    'setia_alam':             {'tag': 'sa',   'region': 'r2'},
    'sri_petaling':           {'tag': 'sp',   'region': 'r3'},
    'kota_damansara':         {'tag': 'kd',   'region': 'r3'},
    'putrajaya':              {'tag': 'pjy',  'region': 'r2'},
    'ampang':                 {'tag': 'amp',  'region': 'r2'},
    'cyberjaya':              {'tag': 'cjy',  'region': 'r2'},
    'klang':                  {'tag': 'klg',  'region': 'r2'},
    'denai_alam':             {'tag': 'da',   'region': 'r3'},
    'bandar_baru_bangi':      {'tag': 'bbb',  'region': 'r2'},
    'danau_kota':             {'tag': 'dk',   'region': 'r3'},
    'shah_alam':              {'tag': 'sha',  'region': 'r2'},
    'bandar_tun_hussein_onn': {'tag': 'btho', 'region': 'r3'},
    'eco_grandeur':           {'tag': 'egr',  'region': 'r3'},
    'bandar_seri_putra':      {'tag': 'bsp',  'region': 'r3'},
    'bandar_rimbayu':         {'tag': 'rby',  'region': 'r2'},
    'taman_seri_gombak':      {'tag': 'tsg',  'region': 'r3'},
    'kajang_ttdi_grove':      {'tag': 'ktg',  'region': 'r3'},
    'kota_warisan':           {'tag': 'kw',   'region': 'r2'},
    'tropicana_sungai_buloh': {'tag': 'tsb',  'region': 'ra'},
    'puncak_jalil':           {'tag': 'pjl',  'region': 'rb'},
    'puchong_utama':          {'tag': 'pu',   'region': 'rc'},
}

BRANCH_TO_KEY = {
    'Online': 'online',
    'Subang Taipan': 'subang_taipan',
    'Subang Taipan (USJ 10)': 'subang_taipan',
    'Setia Alam': 'setia_alam',
    'Setia Alam (Sunsuria Forum)': 'setia_alam',
    'Sri Petaling': 'sri_petaling',
    'Kota Damansara': 'kota_damansara',
    'Putrajaya': 'putrajaya',
    'Putrajaya (Presint 15)': 'putrajaya',
    'Ampang': 'ampang',
    'Ampang (Jalan Ampang Utama 1/1)': 'ampang',
    'Cyberjaya': 'cyberjaya',
    'Klang': 'klang',
    'Klang (Bandar Botanic)': 'klang',
    'Denai Alam': 'denai_alam',
    'Bandar Baru Bangi': 'bandar_baru_bangi',
    'Danau Kota': 'danau_kota',
    'Shah Alam': 'shah_alam',
    'Bandar Tun Hussein Onn': 'bandar_tun_hussein_onn',
    'Eco Grandeur': 'eco_grandeur',
    'Bandar Seri Putra': 'bandar_seri_putra',
    'Bandar Rimbayu': 'bandar_rimbayu',
    'Rimbayu': 'bandar_rimbayu',
    'Taman Sri Gombak': 'taman_seri_gombak',
    'Kajang': 'kajang_ttdi_grove',
    'Kota Warisan': 'kota_warisan',
    'Tropicana Sungai Buloh': 'tropicana_sungai_buloh',
    'Puncak Jalil': 'puncak_jalil',
    'Puchong': 'puchong_utama',
    'Dataran Puchong Utama': 'puchong_utama',
}

# Inverted: location key → list of DB branch name variants
KEY_TO_BRANCHES = defaultdict(list)
for branch, key in BRANCH_TO_KEY.items():
    KEY_TO_BRANCHES[key].append(branch)

AUTO_PUSH_SOURCES = (
    'Meta', 'TikTok',
    'Trial Class Form', 'trial_class_form',
    'Website', 'website',
    'Online Conversion Form',
)


def ghl_headers(token):
    return {'Authorization': f'Bearer {token}', 'Version': '2021-07-28', 'Content-Type': 'application/json'}


def get_db_counts():
    """Count auto-pushed leads per branch key from master_leads_base since AUDIT_START."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur  = conn.cursor()
    cur.execute("""
        SELECT branch, count(*)
        FROM public.master_leads_base
        WHERE submission_date >= %s
          AND source = ANY(%s)
        GROUP BY branch
    """, (AUDIT_START, list(AUTO_PUSH_SOURCES)))
    rows = cur.fetchall()
    cur.close(); conn.close()

    counts = {}
    unknown = []
    for branch, cnt in rows:
        key = BRANCH_TO_KEY.get(branch)
        if key:
            counts[key] = counts.get(key, 0) + cnt
        elif branch:
            unknown.append(f"{branch}({cnt})")
    if unknown:
        print(f"  [WARN] Unmapped DB branches: {', '.join(unknown)}")
    return counts


def get_db_leads_for_branch(branch_key):
    """Return all auto-push leads for a branch since AUDIT_START, ordered by submission_date."""
    branch_names = KEY_TO_BRANCHES[branch_key]
    conn = psycopg2.connect(**DB_CONFIG)
    cur  = conn.cursor()
    cur.execute("""
        SELECT full_name, lower(trim(email)) as email, phone, source
        FROM public.master_leads_base
        WHERE submission_date >= %s
          AND source = ANY(%s)
          AND branch = ANY(%s)
        ORDER BY submission_date ASC
    """, (AUDIT_START, list(AUTO_PUSH_SOURCES), branch_names))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [{'name': r[0], 'email': r[1], 'phone': r[2] or '', 'source': r[3]} for r in rows]


def get_ghl_count_and_contacts(location_id, token):
    """
    Paginate GHL opps since AUDIT_START.
    Returns (total_count, {contactId: opp_count}).
    """
    hdrs  = ghl_headers(token)
    count = 0
    contact_opps = defaultdict(int)
    start_after = start_after_id = None

    while True:
        url = f'{GHL_BASE}/opportunities/search?location_id={location_id}&limit=100'
        if start_after and start_after_id:
            url += f'&startAfter={start_after}&startAfterId={start_after_id}'
        try:
            r = requests.get(url, headers=hdrs, timeout=15)
            r.raise_for_status()
        except Exception as e:
            print(f"    [ERR] GHL request failed: {e}")
            return -1, {}

        data = r.json()
        opps = data.get('opportunities', [])
        if not opps:
            break

        for opp in opps:
            if opp.get('createdAt', '') >= AUDIT_START:
                count += 1
                cid = opp.get('contactId')
                if cid:
                    contact_opps[cid] += 1

        if opps[-1].get('createdAt', '') < AUDIT_START:
            break

        meta = data.get('meta', {})
        start_after    = meta.get('startAfter')
        start_after_id = meta.get('startAfterId')
        if not start_after_id:
            break
        time.sleep(0.2)

    return count, dict(contact_opps)


def get_nl_stage(location_id, token):
    """Fetch the pipeline ID and NL stage ID for a location."""
    hdrs = ghl_headers(token)
    try:
        r = requests.get(f'{GHL_BASE}/opportunities/pipelines?locationId={location_id}', headers=hdrs, timeout=15)
        r.raise_for_status()
        for pipeline in r.json().get('pipelines', []):
            nl = next((s for s in pipeline.get('stages', []) if 'New Lead' in s['name']), None)
            if nl:
                return pipeline['id'], nl['id']
    except Exception as e:
        print(f"    [ERR] Pipeline fetch failed: {e}")
    return None, None


def find_ghl_contact(email, location_id, token):
    """Search GHL for a contact by email. Returns contactId or None."""
    hdrs = ghl_headers(token)
    try:
        r = requests.get(
            f'{GHL_BASE}/contacts/search?locationId={location_id}&query={email}',
            headers=hdrs, timeout=10
        )
        contacts = r.json().get('contacts', [])
        if contacts:
            return contacts[0]['id']
    except Exception:
        pass
    return None


def create_ghl_contact(lead, location_id, token, branch_key):
    """Create a GHL contact and return its ID."""
    hdrs   = ghl_headers(token)
    bt     = BRANCH_TAGS.get(branch_key, {})
    tags   = ['new lead', bt.get('tag', ''), bt.get('region', '')]
    parts  = (lead['name'] or '').split()
    payload = {
        'locationId': location_id,
        'firstName':  parts[0] if parts else '',
        'lastName':   ' '.join(parts[1:]) if len(parts) > 1 else '',
        'email':      lead['email'],
        'phone':      lead['phone'],
        'source':     lead['source'],
        'tags':       [t for t in tags if t],
    }
    try:
        r = requests.post(f'{GHL_BASE}/contacts/', json=payload, headers=hdrs, timeout=10)
        r.raise_for_status()
        data = r.json()
        return data.get('contact', data).get('id')
    except Exception as e:
        print(f"    [ERR] Contact create failed: {e}")
        return None


def create_ghl_opp(contact_id, lead, location_id, token, pipeline_id, stage_id):
    """Create a GHL opportunity in the NL stage."""
    hdrs     = ghl_headers(token)
    opp_name = f"{lead['name']} [#{str(int(time.time() * 1000))[-4:]}]"
    payload  = {
        'locationId':      location_id,
        'pipelineId':      pipeline_id,
        'pipelineStageId': stage_id,
        'contactId':       contact_id,
        'name':            opp_name,
        'source':          lead['source'],
        'status':          'open',
    }
    try:
        r = requests.post(f'{GHL_BASE}/opportunities/', json=payload, headers=hdrs, timeout=10)
        r.raise_for_status()
        data = r.json()
        opp_id = data.get('opportunity', data).get('id', '?')
        print(f"      ✅ Pushed: {opp_name} (opp {opp_id})")
        return opp_id
    except Exception as e:
        print(f"      ❌ Opp create failed for {lead['name']}: {e}")
        return None


def push_missing_leads(branch_key, loc, contact_opp_counts):
    """
    Find leads in DB that are missing from GHL and push them.
    Returns list of pushed lead names.
    """
    location_id = loc['locationId']
    token       = loc['token']

    db_leads = get_db_leads_for_branch(branch_key)
    if not db_leads:
        return []

    pipeline_id, stage_id = get_nl_stage(location_id, token)
    if not pipeline_id:
        print(f"    [ERR] Could not find NL stage for {loc['label']}")
        return []

    # Group DB leads by email to handle same person submitting multiple forms
    email_to_leads = defaultdict(list)
    for lead in db_leads:
        email_to_leads[lead['email']].append(lead)

    pushed = []

    for email, leads in email_to_leads.items():
        contact_id = find_ghl_contact(email, location_id, token)
        time.sleep(0.25)

        if contact_id is None:
            # Contact missing entirely — create and push all their leads
            contact_id = create_ghl_contact(leads[0], location_id, token, branch_key)
            time.sleep(0.25)
            if not contact_id:
                continue
            for lead in leads:
                create_ghl_opp(contact_id, lead, location_id, token, pipeline_id, stage_id)
                pushed.append(lead['name'])
                time.sleep(0.3)
        else:
            # Contact exists — compare opp count
            ghl_opp_count = contact_opp_counts.get(contact_id, 0)
            db_count      = len(leads)
            missing       = db_count - ghl_opp_count
            if missing > 0:
                for lead in leads[:missing]:
                    create_ghl_opp(contact_id, lead, location_id, token, pipeline_id, stage_id)
                    pushed.append(lead['name'])
                    time.sleep(0.3)

    return pushed


def send_telegram(text):
    url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
    try:
        requests.post(url, json={'chat_id': CHAT_ID, 'text': text, 'parse_mode': 'HTML'}, timeout=10)
    except Exception as e:
        print(f"  [ERR] Telegram send failed: {e}")


def run():
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    print(f"[{now}] GHL lead audit starting...\n")

    db_counts  = get_db_counts()
    auto_fixed = []   # (label, pushed_names)

    for key, loc in sorted(LOCATIONS.items(), key=lambda x: x[1]['label']):
        db_count                   = db_counts.get(key, 0)
        ghl_count, contact_opp_map = get_ghl_count_and_contacts(loc['locationId'], loc['token'])
        time.sleep(0.2)

        if ghl_count < 0:
            print(f"  ❓ {loc['label']:28s}  DB={db_count:4d}  GHL=ERR")
            continue

        diff = db_count - ghl_count

        if diff > 0:
            print(f"  ⚠️  {loc['label']:28s}  DB={db_count:4d}  GHL={ghl_count:4d}  MISSING {diff} — auto-pushing...")
            pushed = push_missing_leads(key, loc, contact_opp_map)
            if pushed:
                auto_fixed.append((loc['label'], pushed))
        elif ghl_count > db_count:
            print(f"  🔵 {loc['label']:28s}  DB={db_count:4d}  GHL={ghl_count:4d}  GHL+{ghl_count - db_count}")
        else:
            print(f"  ✅ {loc['label']:28s}  DB={db_count:4d}  GHL={ghl_count:4d}  OK")

    print()
    if auto_fixed:
        lines = []
        total = 0
        for label, names in auto_fixed:
            lines.append(f"  • <b>{label}</b>: {', '.join(names)}")
            total += len(names)
        msg  = f"🔧 <b>GHL Auto-Fix</b> — {now}\n\n"
        msg += f"{total} missing lead(s) detected and auto-pushed:\n"
        msg += "\n".join(lines)
        send_telegram(msg)
        print(f"Auto-pushed {total} lead(s) across {len(auto_fixed)} branch(es). Telegram sent.")
    else:
        print("All branches matched. Nothing to push.")


if __name__ == '__main__':
    run()
