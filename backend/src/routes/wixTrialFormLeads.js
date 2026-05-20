const express = require('express');
const { pool } = require('../db');
const { env }  = require('../env');

const router = express.Router();

// ── GHL location configs (same source as googleAdsLeads.js — update both if tokens rotate) ──
const LOCATION_MAPPING = {
  'online':                 { locationId: 'Vpl9uLtDIHvddSSZztMA', token: 'pit-04d5417e-9400-448e-8f18-ab1ddcf70700' },
  'subang_taipan':          { locationId: 'usaXD9ZihKNI9lNqueE4', token: 'pit-ff268089-be71-45cb-9225-e6f7129d2547' },
  'setia_alam':             { locationId: 'DoKT0lXGyQFz8DHoVOm4', token: 'pit-362bf359-27b3-4166-a55e-f698e915af9e' },
  'sri_petaling':           { locationId: 'wREGaqHXvoxHiNTj02mJ', token: 'pit-74e28a7b-30a3-48d7-8902-0c12b23cccc1' },
  'kota_damansara':         { locationId: '3IxS5tbD1lvDxMGMSczL', token: 'pit-ce36e258-f128-4094-be1b-c1271f81442f' },
  'putrajaya':              { locationId: 'BBqrR8ckJ87m4YojupLZ', token: 'pit-d95a6a82-e8f2-4855-9169-204accfbf84d' },
  'ampang':                 { locationId: 'cqr1ywf20KLTFSDCytCx', token: 'pit-7d5f7f52-1c30-49d6-b30e-8a5715beb88d' },
  'cyberjaya':              { locationId: '4xnM7ZmlbYAVFVqY1bX8', token: 'pit-ac5b7372-a5a0-4cdd-9828-38a74362706c' },
  'klang':                  { locationId: 'ByhyzMBuV43aAzOsZffy', token: 'pit-db64a126-6605-48c3-9aa6-04622670c69e' },
  'denai_alam':             { locationId: '7myL6WBNCz4rlxhE1GfC', token: 'pit-fba13e5a-ce2c-46eb-bae7-fb9e352a0e4a' },
  'bandar_baru_bangi':      { locationId: 'oUjhd0TVocJcZ1cMMi2G', token: 'pit-03fe8042-925c-4694-90b1-e86cfacdaeae' },
  'danau_kota':             { locationId: 'HTsl0vOTuEAVw85S9I16', token: 'pit-f93e4594-99fe-43ed-9f9d-d6f766d4cd6d' },
  'shah_alam':              { locationId: '3ZNi0O4QkJiJ49QWnc19', token: 'pit-80debf55-6796-4ac9-8170-a9c2e69330e4' },
  'bandar_tun_hussein_onn': { locationId: 'gtZGYA7BGWfx54pND4nw', token: 'pit-e1e94f64-9950-4cd4-8cf1-acbaa4059ffd' },
  'eco_grandeur':           { locationId: 'EyX5ziXrAPuCOHoMutip', token: 'pit-503e96e5-e6a1-4e37-8fa9-dd48f67c3248' },
  'bandar_seri_putra':      { locationId: 'FuQByFeUURbkBl2YA61q', token: 'pit-d891efe2-0f9b-410f-b7b4-a192c4c3f62c' },
  'bandar_rimbayu':         { locationId: 'RtnVTOWs5GRREHyiTxaT', token: 'pit-6914cf46-ce4e-4b4a-a2fc-f0ae33ac9159' },
  'taman_seri_gombak':      { locationId: 'XUCj8GKwaYGPFB3LFm17', token: 'pit-1c61ad71-ff45-411c-8899-034e9e797959' },
  'kajang_ttdi_grove':      { locationId: 'QpIeU8mksO4PHvBIudQQ', token: 'pit-8f5445fa-b413-4137-8bed-00f8e9c15efb' },
  'kota_warisan':           { locationId: 'XeId139CcA8Wl6h5zTJT', token: 'pit-506bc22f-a756-4d80-b7ef-76fdee54a6e5' },
  'tropicana_sungai_buloh': { locationId: 'baTAHn1jvxmUZS0J5pBf', token: 'pit-04919c9d-db5c-4c31-9923-b8fa08ea32d2' },
  'puncak_jalil':           { locationId: 'xdiXYPd2m6LZWNTQVAIj', token: 'pit-3cd62cb3-1acf-435f-98ba-bc53fae93a2e' },
  'puchong_utama':          { locationId: 'dVVxStgEAxPktzsNEb5B', token: 'pit-ac07c188-6b62-4b6e-8d94-486d6b624ef5' },
};

const BRANCH_TAGS = {
  'online':                 { tag: 'onl',  region: 'r3' },
  'subang_taipan':          { tag: 'st',   region: 'r2' },
  'setia_alam':             { tag: 'sa',   region: 'r2' },
  'sri_petaling':           { tag: 'sp',   region: 'r3' },
  'kota_damansara':         { tag: 'kd',   region: 'r3' },
  'putrajaya':              { tag: 'pjy',  region: 'r2' },
  'ampang':                 { tag: 'amp',  region: 'r2' },
  'cyberjaya':              { tag: 'cjy',  region: 'r2' },
  'klang':                  { tag: 'klg',  region: 'r2' },
  'denai_alam':             { tag: 'da',   region: 'r3' },
  'bandar_baru_bangi':      { tag: 'bbb',  region: 'r2' },
  'danau_kota':             { tag: 'dk',   region: 'r3' },
  'shah_alam':              { tag: 'sha',  region: 'r2' },
  'bandar_tun_hussein_onn': { tag: 'btho', region: 'r3' },
  'eco_grandeur':           { tag: 'egr',  region: 'r3' },
  'bandar_seri_putra':      { tag: 'bsp',  region: 'r3' },
  'bandar_rimbayu':         { tag: 'rby',  region: 'r2' },
  'taman_seri_gombak':      { tag: 'tsg',  region: 'r3' },
  'kajang_ttdi_grove':      { tag: 'ktg',  region: 'r3' },
  'kota_warisan':           { tag: 'kw',   region: 'r2' },
  'tropicana_sungai_buloh': { tag: 'tsb',  region: 'ra' },
  'puncak_jalil':           { tag: 'pjl',  region: 'rb' },
  'puchong_utama':          { tag: 'pu',   region: 'rc' },
};

const PIPELINE_NAME_MAP = {
  'online':                 '01 ONL',
  'subang_taipan':          '02 ST',
  'setia_alam':             '03 SA',
  'sri_petaling':           '04 SP',
  'kota_damansara':         '05 KD',
  'putrajaya':              '06 PJY',
  'ampang':                 '07 AMP',
  'cyberjaya':              '08 CJY',
  'klang':                  '09 KLG',
  'denai_alam':             '10 DA',
  'bandar_baru_bangi':      '11 BBB',
  'danau_kota':             '12 DK',
  'shah_alam':              '13 SHA',
  'bandar_tun_hussein_onn': '14 BTHO',
  'eco_grandeur':           '15 EGR',
  'bandar_seri_putra':      '16 BSP',
  'bandar_rimbayu':         '17 RBY',
  'taman_seri_gombak':      '18 TSG',
  'kajang_ttdi_grove':      '19 KTG',
  'kota_warisan':           '20 KW',
  'tropicana_sungai_buloh': '21 TSB',
  'puncak_jalil':           '22 PJL',
  'puchong_utama':          '23 PU',
};

// The form's BRANCH_TO_LOCATION uses slightly different keys for two branches
const LOCATION_KEY_ALIASES = {
  'dataran_puchong_utama': 'puchong_utama',
  'taman_sri_gombak':      'taman_seri_gombak',
};

// Maps normalized location key → official branch name matching VALID_BRANCHES in leadsCentre
const LOCATION_KEY_TO_OFFICIAL = {
  'online':                 'Online',
  'subang_taipan':          'Subang Taipan',
  'setia_alam':             'Setia Alam',
  'sri_petaling':           'Sri Petaling',
  'kota_damansara':         'Kota Damansara',
  'putrajaya':              'Putrajaya',
  'ampang':                 'Ampang',
  'cyberjaya':              'Cyberjaya',
  'klang':                  'Klang',
  'denai_alam':             'Denai Alam',
  'bandar_baru_bangi':      'Bandar Baru Bangi',
  'danau_kota':             'Danau Kota',
  'shah_alam':              'Shah Alam',
  'bandar_tun_hussein_onn': 'Bandar Tun Hussein Onn',
  'eco_grandeur':           'Eco Grandeur',
  'bandar_seri_putra':      'Bandar Seri Putra',
  'bandar_rimbayu':         'Rimbayu',
  'taman_seri_gombak':      'Taman Sri Gombak',
  'kajang_ttdi_grove':      'Kajang',
  'kota_warisan':           'Kota Warisan',
  'puchong_utama':          'Dataran Puchong Utama',
  'tropicana_sungai_buloh': 'Tropicana Sungai Buloh',
  'puncak_jalil':           'Puncak Jalil',
};

function resolveLocationKey(rawKey) {
  if (!rawKey) return null;
  const normalized = LOCATION_KEY_ALIASES[rawKey] || rawKey;
  return LOCATION_MAPPING[normalized] ? normalized : null;
}

async function ghlRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const req = require('https').request({
      hostname: 'services.leadconnectorhq.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function pushToGHL(fullName, email, phone, locationKey) {
  const locationConfig = LOCATION_MAPPING[locationKey];
  if (!locationConfig) {
    console.warn(`[Wix Trial → GHL] No location config for key: ${locationKey}`);
    return;
  }

  const { locationId, token } = locationConfig;
  const nameParts  = (fullName || '').trim().split(/\s+/);
  const firstName  = nameParts[0] || '';
  const lastName   = nameParts.slice(1).join(' ') || '';
  const branchTags = BRANCH_TAGS[locationKey];
  const tags       = ['new lead', ...(branchTags ? [branchTags.tag, branchTags.region] : [])];

  const contactRes = await ghlRequest('POST', '/contacts', token, {
    locationId,
    firstName,
    lastName,
    email,
    phone,
    source: 'Trial Class Form',
    tags,
  });

  const contactId = contactRes.body?.contact?.id || contactRes.body?.meta?.contactId || null;
  if (!contactId) {
    console.error('[Wix Trial → GHL] Contact creation failed:', JSON.stringify(contactRes.body));
    return;
  }

  const pipelinesRes = await ghlRequest('GET', `/opportunities/pipelines?locationId=${locationId}`, token);
  const pipelines    = pipelinesRes.body?.pipelines || [];
  const expectedName = PIPELINE_NAME_MAP[locationKey];
  const pipeline     = pipelines.find(p => p.name === expectedName) || pipelines[0];
  if (!pipeline) {
    console.warn(`[Wix Trial → GHL] No pipeline found for ${locationKey}`);
    return;
  }

  const stage = pipeline.stages?.find(s =>
    s.name.toLowerCase().includes('new lead') || s.name.toLowerCase().includes('(nl)')
  ) || pipeline.stages?.[0];

  if (!stage) return;

  const uniqueId = Date.now().toString().slice(-4);
  await ghlRequest('POST', '/opportunities/', token, {
    locationId,
    pipelineId:      pipeline.id,
    pipelineStageId: stage.id,
    contactId,
    name:   `${fullName} [#${uniqueId}]`,
    status: 'open',
    source: 'Trial Class Form',
  });

  console.log(`[Wix Trial → GHL] Contact + opportunity created for ${email} in ${locationKey}`);
}

// ── Webhook handler ────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;

    if (env.WIX_TRIAL_WEBHOOK_KEY) {
      if (payload.webhook_key !== env.WIX_TRIAL_WEBHOOK_KEY) {
        return res.status(401).json({ error: 'Invalid webhook key' });
      }
    }

    const parentName  = (payload.parentName  || '').trim();
    const parentEmail = (payload.parentEmail  || '').trim().toLowerCase();
    const parentPhone = (payload.parentPhone  || '').trim();

    if (!parentEmail && !parentPhone) {
      return res.status(200).json({ status: 'ignored', reason: 'no contact info' });
    }

    // Dedup: same email+phone submitted within 60 seconds
    const { rows: dup } = await pool.query(
      `SELECT 1 FROM wix_trial_form_leads
       WHERE LOWER(parent_email) = $1 AND parent_phone = $2
         AND received_at > NOW() - INTERVAL '60 seconds'
       LIMIT 1`,
      [parentEmail, parentPhone]
    );
    if (dup.length > 0) {
      return res.status(200).json({ status: 'ignored', reason: 'duplicate submission' });
    }

    const rawLocationKey = payload.locationKey || '';
    const locationKey    = resolveLocationKey(rawLocationKey);
    const branch         = locationKey ? (LOCATION_KEY_TO_OFFICIAL[locationKey] || null) : null;
    const children       = Array.isArray(payload.children) ? payload.children : [];
    const childrenCount  = Number(payload.childrenCount) || children.length;

    await pool.query(
      `INSERT INTO wix_trial_form_leads
         (parent_name, parent_phone, parent_email, children_count, children,
          preferred_branch, location_key, branch, remarks,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          lead_source, landing_page_url, device_type, fbclid, gclid, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        parentName, parentPhone, parentEmail, childrenCount,
        children.length > 0 ? JSON.stringify(children) : null,
        payload.preferredBranch || '', rawLocationKey, branch,
        payload.remarks || '',
        payload.utm_source || '', payload.utm_medium || '',
        payload.utm_campaign || '', payload.utm_content || '', payload.utm_term || '',
        'Trial Class Form',
        payload.landing_page_url || '', payload.device_type || '',
        payload.fbclid || '', payload.gclid || '',
        JSON.stringify(payload),
      ]
    );

    await pool.query(
      `INSERT INTO master_leads_base (source, full_name, email, phone, branch, submission_date, campaign_name)
       VALUES ('trial_class_form', $1, $2, $3, $4, NOW(), $5)
       ON CONFLICT DO NOTHING`,
      [parentName, parentEmail, parentPhone, branch, payload.utm_campaign || null]
    );

    if (locationKey) {
      pushToGHL(parentName, parentEmail, parentPhone, locationKey)
        .catch(err => console.error('[Wix Trial → GHL] push failed:', err.message));
    } else {
      console.warn(`[Wix Trial] Could not resolve GHL location key for: ${rawLocationKey}`);
    }

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[Wix Trial webhook]', err.message);
    return res.status(200).json({ status: 'error', message: err.message });
  }
});

module.exports = { wixTrialFormLeadsRouter: router };
