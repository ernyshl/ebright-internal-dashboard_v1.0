import requests
import psycopg2
import json
import config
from datetime import datetime, timedelta, timezone

_FALLBACK_PAGE_ID = '559765171036273'

def load_credentials(cur):
    """Load leads token and page_id from meta_integration table. Falls back to config."""
    try:
        cur.execute("SELECT access_token, page_id FROM meta_integration ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if row and row[0] and row[1]:
            return row[0], row[1]
    except Exception as e:
        print(f"⚠️  Could not read meta_integration ({e}) — using config fallback.")
    return config.LEADS_ACCESS_TOKEN, _FALLBACK_PAGE_ID

# Fallback list used only if the database table is not yet created
_FALLBACK_META_FORMS = [
    {"name": "20260215 | PHY | ENG | GHL OD APPROVE", "form_id": "1217070490531605"},
    {"name": "20260215 | PHY | BM | GHL OD APPROVE", "form_id": "1971214837106292"},
    {"name": "20260314 | PHY | ENG | AREA C | GHL OD APPROVED", "form_id": "1136262605625530"},
    {"name": "20260314 | PHY | BM | AREA C | GHL OD APPROVED", "form_id": "1373957884755575"},
    {"name": "20260314 | PHY | ENG | AREA A | GHL OD APPROVED", "form_id": "1411077366998575"},
    {"name": "20260314 | PHY | BM | AREA A | GHL OD APPROVED", "form_id": "943551538218415"},
    {"name": "20260314 | PHY | ENG | AREA B | GHL OD APPROVED", "form_id": "1243322951200313"},
    {"name": "20260314 | PHY | BM | AREA B | GHL OD APPROVED", "form_id": "4516923295215092"},
    {"name": "20260303 | PHY | ENG | KAJANG TTDI GROVE OD Approved", "form_id": "4209984119332047"},
    {"name": "20260227 | PHY | BM | KAJANG TTDI GROVE", "form_id": "1816765919009148"},
    {"name": "20260127 | PHY | BM | TSG, KW, KTG W LINKTREE", "form_id": "4435411490074376"},
    {"name": "20260127 | PHY | ENG | TSG, KW, KTG W LINKTREE", "form_id": "1925948721384448"},
    {"name": "20251223 | PHY | ENG | GHL OD APPROVE", "form_id": "1268254652017265"},
    {"name": "20251223 | PHY | BM | GHL OD APPROVE", "form_id": "850355237903687"},
    {"name": "20260407 | PHY | BM | ECO GRANDEUR | GHL OD APPROVED", "form_id": "1155424079979206"},
    {"name": "20260407 | PHY | ENG | DENAI ALAM | GHL OD APPROVED", "form_id": "2062282897652004"},
    {"name": "20260407 | PHY | BM | DENAI ALAM | GHL OD APPROVED", "form_id": "1322730996392806"},
    {"name": "20260407 | PHY | ENG | ECO GRANDEUR | GHL OD APPROVED", "form_id": "1625352692048509"},
    {"name": "20260412 | PHY | BM | AREA C | GHL OD APPROVED | REV 1", "form_id": "970052438877373"},
    {"name": "20260412 | PHY | ENG | AREA C | GHL OD APPROVED | REV 1", "form_id": "1209300324416643"},
    {"name": "20260412 | PHY | BM | AREA B | GHL OD APPROVED", "form_id": "947544387983602"},
    {"name": "20260412 | PHY | ENG | AREA B | GHL OD APPROVED", "form_id": "1471312711449450"},
    {"name": "20260412 | PHY | BM | AREA A | GHL OD APPROVED", "form_id": "1632088241461117"},
    {"name": "20260412 | PHY | ENG | AREA A | GHL OD APPROVED", "form_id": "1996083164314509"},
]


def discover_forms(leads_token, page_id):
    """Auto-discover all leadgen forms on the page — ACTIVE and INACTIVE/ARCHIVED.
    Including non-active forms catches leads from forms that were paused mid-day
    before the sync ran (previously those leads were silently dropped)."""
    url = f"https://graph.facebook.com/v21.0/{page_id}/leadgen_forms"
    params = {"access_token": leads_token, "fields": "id,name,status", "limit": 100}
    forms = []
    while url:
        res = requests.get(url, params=params).json()
        if "error" in res:
            print(f"  ❌ Error listing forms: {res['error']['message']}")
            return []
        for f in res.get("data", []):
            forms.append({"name": f.get("name", ""), "form_id": f["id"], "status": f.get("status", "UNKNOWN")})
        url = res.get("paging", {}).get("next")
        params = None
    active = sum(1 for f in forms if f["status"] == "ACTIVE")
    print(f"🔎 Discovered {len(forms)} forms ({active} active, {len(forms) - active} inactive/archived).")
    return forms

def load_meta_forms(cur):
    """Load active Meta forms from DB. Falls back to hardcoded list if table missing."""
    try:
        cur.execute(
            "SELECT form_name, form_id FROM ad_form_config WHERE platform = 'meta' AND is_active = TRUE ORDER BY created_at"
        )
        rows = cur.fetchall()
        if rows:
            forms = [{"name": r[0], "form_id": r[1]} for r in rows]
            print(f"✅ Loaded {len(forms)} active Meta forms from database.")
            return forms
        print("⚠️  No active Meta forms in database — using fallback list.")
        return _FALLBACK_META_FORMS
    except Exception as e:
        print(f"⚠️  Could not query ad_form_config ({e}) — using fallback list.")
        return _FALLBACK_META_FORMS

def get_page_token(leads_token, page_id):
    res = requests.get(f'https://graph.facebook.com/v21.0/{page_id}', params={
        'access_token': leads_token,
        'fields': 'access_token'
    }).json()
    if 'error' in res:
        raise Exception(f"Page token error: {res['error']['message']}")
    return res['access_token']

_SYNC_SINCE = int((datetime.now(timezone.utc) - timedelta(days=3)).timestamp())

def fetch_leads(form_id, page_token):
    """Fetch leads created in the last 3 days. The 3-day window catches leads from
    forms that were paused mid-day or had delayed Meta API delivery, without
    re-paginating through years of historical data on archived forms."""
    leads = []
    url = f'https://graph.facebook.com/v21.0/{form_id}/leads'
    params = {'access_token': page_token, 'fields': 'id,created_time,field_data,ad_id,adset_id,campaign_id,ad_name,adset_name,campaign_name', 'limit': 100, 'since': _SYNC_SINCE}
    while url:
        res = requests.get(url, params=params).json()
        if 'error' in res:
            print(f"  ❌ Error: {res['error']['message']}")
            break
        leads.extend(res.get('data', []))
        url = res.get('paging', {}).get('next')
        params = None
    return leads

# Cache to avoid redundant Marketing API calls for the same campaign_id
_campaign_name_cache = {}

def resolve_campaign_names(campaign_ids, token):
    """Fetch accurate campaign names from the Marketing API by campaign_id.
    The leads endpoint sometimes returns adset/form names instead of the true
    campaign name. The Marketing API /{campaign_id} is the authoritative source."""
    unresolved = [cid for cid in campaign_ids if cid and cid not in _campaign_name_cache]
    if not unresolved:
        return

    # Use batch API to resolve up to 50 campaign IDs per request
    batch_size = 50
    for i in range(0, len(unresolved), batch_size):
        batch = unresolved[i:i + batch_size]
        batch_payload = [{"method": "GET", "relative_url": f"{cid}?fields=id,name"} for cid in batch]
        res = requests.post(
            "https://graph.facebook.com/v21.0/",
            params={"access_token": token},
            json={"batch": batch_payload}
        ).json()
        for item in res:
            if item.get("code") == 200:
                body = json.loads(item["body"])
                _campaign_name_cache[body["id"]] = body.get("name")
    print(f"   📊 Resolved {len(unresolved)} campaign names from Marketing API.")

def parse_lead(lead, form_id, form_name):
    campaign_id = lead.get('campaign_id')
    return {
        'lead_id':       lead['id'],
        'form_id':       form_id,
        'form_name':     form_name,
        'created_time':  lead['created_time'],
        'raw_data':      lead['field_data'],
        'ad_id':         lead.get('ad_id'),
        'adset_id':      lead.get('adset_id'),
        'campaign_id':   campaign_id,
        'ad_name':       lead.get('ad_name'),
        'adset_name':    lead.get('adset_name'),
        # Use Marketing API name if available, fall back to leads endpoint value
        'campaign_name': _campaign_name_cache.get(campaign_id) if campaign_id else lead.get('campaign_name'),
    }

def sync():
    print(f"🚀 Starting Meta Leads Sync: {datetime.now()}")
    conn = psycopg2.connect(**config.DB_CONFIG)
    cur = conn.cursor()
    cur.execute("SET search_path = public")
    # Get existing lead IDs
    cur.execute("SELECT lead_id FROM meta_leads")
    existing = set(row[0] for row in cur.fetchall())
    print(f"📦 Existing leads in DB: {len(existing)}")
    leads_token, page_id = load_credentials(cur)
    page_token = get_page_token(leads_token, page_id)
    meta_forms = discover_forms(page_token, page_id)
    if not meta_forms:
        print("⚠️  Auto-discovery returned 0 forms; falling back to ad_form_config table.")
        meta_forms = load_meta_forms(cur)
    print(f"📋 Forms to sync: {len(meta_forms)}")
    total_inserted = 0
    total_duplicate = 0
    for form in meta_forms:
        form_id = form['form_id']
        form_name = form['name']
        print(f"\n📝 Form: {form_name} [{form.get('status', '?')}]")
        leads = fetch_leads(form_id, page_token)
        print(f"   Found: {len(leads)} leads")
        # Resolve accurate campaign names from Marketing API for new leads only
        new_leads = [l for l in leads if l['id'] not in existing]
        campaign_ids = {l.get('campaign_id') for l in new_leads if l.get('campaign_id')}
        if campaign_ids:
            resolve_campaign_names(campaign_ids, page_token)
        inserted = 0
        duplicate = 0
        for lead in leads:
            if lead['id'] in existing:
                duplicate += 1
                continue
            p = parse_lead(lead, form_id, form_name)
            cur.execute("""
                INSERT INTO meta_leads (lead_id, form_id, form_name, raw_data, lead_created_time,
                                        ad_id, adset_id, campaign_id, ad_name, adset_name, campaign_name)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (lead_id) DO UPDATE SET
                  ad_id         = EXCLUDED.ad_id,
                  adset_id      = EXCLUDED.adset_id,
                  campaign_id   = EXCLUDED.campaign_id,
                  ad_name       = EXCLUDED.ad_name,
                  adset_name    = EXCLUDED.adset_name,
                  campaign_name = EXCLUDED.campaign_name
            """, (p['lead_id'], p['form_id'], p['form_name'],
                  json.dumps({"field_data": p['raw_data'], "created_time": p['created_time']}),
                  p['created_time'],
                  p['ad_id'], p['adset_id'], p['campaign_id'],
                  p['ad_name'], p['adset_name'], p['campaign_name']))
            existing.add(lead['id'])
            inserted += 1
            total_inserted += 1

            # Push new lead to GHL via backend webhook
            try:
                field_map = {f['name']: (f['values'][0] if f['values'] else '') for f in p['raw_data']}
                raw_branch = field_map.get('please_choose_your_preferred_branch', '')
                # ONLINE trial class forms (GHL OD APPROVED) have no branch field — route to online pipeline
                fn_upper = form_name.upper()
                if not raw_branch and 'ONLINE' in fn_upper and 'GHL' in fn_upper and 'COACH' not in fn_upper:
                    raw_branch = 'online'
                requests.post(
                    'https://dashboard.ebright.my/api/meta-leads/webhook',
                    json={
                        'fullName':   field_map.get('full_name', ''),
                        'email':      field_map.get('email', ''),
                        'phone':      field_map.get('phone_number', field_map.get('phone', '')),
                        'rawBranch':  raw_branch,
                        'campaignName': p['campaign_name'] or '',
                    },
                    timeout=10,
                )
            except Exception as _ghl_err:
                print(f"   ⚠️  GHL push error for {p['lead_id']}: {_ghl_err}")
        conn.commit()
        print(f"   ➕ Inserted: {inserted} | ⏭ Duplicate: {duplicate}")

    # Fix any records missing created_time in raw_data
    cur.execute("""
        UPDATE meta_leads 
        SET raw_data = raw_data || jsonb_build_object('created_time', lead_created_time)
        WHERE raw_data->>'created_time' IS NULL 
        AND lead_created_time IS NOT NULL
    """)
    conn.commit()
    print(f"🔧 Fixed missing created_time in raw_data")

    cur.close()
    conn.close()
    print(f"\n🏁 Done! Total inserted: {total_inserted}")

if __name__ == "__main__":
    sync()
