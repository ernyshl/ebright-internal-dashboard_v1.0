const https = require('https');

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
  'online':                 { tag: 'onl',  region: 'rc' },
  'subang_taipan':          { tag: 'st',   region: 'ra' },
  'setia_alam':             { tag: 'sa',   region: 'ra' },
  'sri_petaling':           { tag: 'sp',   region: 'rb' },
  'kota_damansara':         { tag: 'kd',   region: 'rb' },
  'putrajaya':              { tag: 'pjy',  region: 'rc' },
  'ampang':                 { tag: 'amp',  region: 'rb' },
  'cyberjaya':              { tag: 'cjy',  region: 'rc' },
  'klang':                  { tag: 'klg',  region: 'ra' },
  'denai_alam':             { tag: 'da',   region: 'ra' },
  'bandar_baru_bangi':      { tag: 'bbb',  region: 'rc' },
  'danau_kota':             { tag: 'dk',   region: 'rb' },
  'shah_alam':              { tag: 'sha',  region: 'ra' },
  'bandar_tun_hussein_onn': { tag: 'btho', region: 'rb' },
  'eco_grandeur':           { tag: 'egr',  region: 'ra' },
  'bandar_seri_putra':      { tag: 'bsp',  region: 'rc' },
  'bandar_rimbayu':         { tag: 'rby',  region: 'ra' },
  'taman_seri_gombak':      { tag: 'tsg',  region: 'rb' },
  'kajang_ttdi_grove':      { tag: 'ktg',  region: 'rb' },
  'kota_warisan':           { tag: 'kw',   region: 'rc' },
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

function ghlRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const req = https.request({
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

// Creates one GHL contact for the parent and one opportunity per child.
// Falls back to a single parent-named opportunity when children is empty.
async function pushToGHL(fullName, email, phone, locationKey, leadSource, children) {
  const locationConfig = LOCATION_MAPPING[locationKey];
  if (!locationConfig) {
    console.warn(`[GHL push] No location config for key: ${locationKey}`);
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
    source: leadSource,
    tags,
  });

  const contactId = contactRes.body?.contact?.id || contactRes.body?.meta?.contactId || null;
  if (!contactId) {
    console.error('[GHL push] Contact creation failed:', JSON.stringify(contactRes.body));
    return;
  }

  const pipelinesRes = await ghlRequest('GET', `/opportunities/pipelines?locationId=${locationId}`, token);
  const pipelines    = pipelinesRes.body?.pipelines || [];
  const pipeline     = pipelines.find(p => p.name === PIPELINE_NAME_MAP[locationKey]) || pipelines[0];
  if (!pipeline) {
    console.warn(`[GHL push] No pipeline found for ${locationKey}`);
    return;
  }

  const stage = pipeline.stages?.find(s =>
    s.name.toLowerCase().includes('new lead') || s.name.toLowerCase().includes('(nl)')
  ) || pipeline.stages?.[0];

  if (!stage) return;

  const slots = (Array.isArray(children) && children.length > 0) ? children : [null];

  for (const child of slots) {
    const childName = (child?.name || child?.childName || '').trim();
    const uniqueId  = Date.now().toString().slice(-4);
    const oppName   = childName
      ? `${fullName} — ${childName} [#${uniqueId}]`
      : `${fullName} [#${uniqueId}]`;

    await ghlRequest('POST', '/opportunities/', token, {
      locationId,
      pipelineId:      pipeline.id,
      pipelineStageId: stage.id,
      contactId,
      name:   oppName,
      status: 'open',
      source: leadSource,
    });
  }

  console.log(`[GHL push] ${locationKey} — contact + ${slots.length} opp(s) for ${email || phone}`);
}

module.exports = { LOCATION_MAPPING, pushToGHL };
