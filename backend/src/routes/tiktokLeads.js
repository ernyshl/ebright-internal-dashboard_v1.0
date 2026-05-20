const express = require('express');
const { env } = require('../env');

const router = express.Router();

// Same GHL config as wixTrialFormLeads.js — update both if tokens rotate
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

// TikTok form branch values strip parentheticals then normalize.
// Two branches need explicit overrides after stripping:
//   "Kajang (TTDI Grove)"       → "kajang"  → kajang_ttdi_grove
//   "Puchong (Dataran Puchong)" → "puchong" → puchong_utama
const TIKTOK_BRANCH_OVERRIDES = {
  'kajang':  'kajang_ttdi_grove',
  'puchong': 'puchong_utama',
};

function resolveTiktokBranch(rawBranch) {
  if (!rawBranch) return null;
  const stripped = rawBranch.replace(/\s*\([^)]*\)\s*/g, '').trim();
  const normalized = stripped
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (TIKTOK_BRANCH_OVERRIDES[normalized]) return TIKTOK_BRANCH_OVERRIDES[normalized];
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
    console.warn(`[TikTok → GHL] No location config for key: ${locationKey}`);
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
    source: 'TikTok',
    tags,
  });

  const contactId = contactRes.body?.contact?.id || contactRes.body?.meta?.contactId || null;
  if (!contactId) {
    console.error('[TikTok → GHL] Contact creation failed:', JSON.stringify(contactRes.body));
    return;
  }

  const pipelinesRes = await ghlRequest('GET', `/opportunities/pipelines?locationId=${locationId}`, token);
  const pipelines    = pipelinesRes.body?.pipelines || [];
  const expectedName = PIPELINE_NAME_MAP[locationKey];
  const pipeline     = pipelines.find(p => p.name === expectedName) || pipelines[0];
  if (!pipeline) {
    console.warn(`[TikTok → GHL] No pipeline found for ${locationKey}`);
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
    source: 'TikTok',
  });

  console.log(`[TikTok → GHL] Contact + opportunity created for ${email} in ${locationKey}`);
}

router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;

    if (env.TIKTOK_GHL_WEBHOOK_KEY && payload.webhook_key !== env.TIKTOK_GHL_WEBHOOK_KEY) {
      return res.status(401).json({ error: 'Invalid webhook key' });
    }

    const fullName  = (payload.fullName  || '').trim();
    const email     = (payload.email     || '').trim().toLowerCase();
    const phone     = (payload.phone     || '').trim();
    const rawBranch = (payload.rawBranch || '').trim();

    if (!email && !phone) {
      return res.status(200).json({ status: 'ignored', reason: 'no contact info' });
    }

    const locationKey = resolveTiktokBranch(rawBranch);
    if (!locationKey) {
      console.warn(`[TikTok → GHL] Could not resolve branch: "${rawBranch}"`);
      return res.status(200).json({ status: 'ok', ghl: 'skipped', reason: `unknown branch: ${rawBranch}` });
    }

    pushToGHL(fullName, email, phone, locationKey)
      .catch(err => console.error('[TikTok → GHL] push failed:', err.message));

    return res.status(200).json({ status: 'ok', ghl: 'queued', branch: locationKey });
  } catch (err) {
    console.error('[TikTok GHL webhook]', err.message);
    return res.status(200).json({ status: 'error', message: err.message });
  }
});

module.exports = { tiktokLeadsRouter: router };
