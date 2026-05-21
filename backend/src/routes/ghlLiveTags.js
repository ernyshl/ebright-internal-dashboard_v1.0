const https = require('https');
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_ROLES = ['super_admin', 'ceo', 'marketing', 'od', 'rm', 'hr', 'tv'];

const BRANCHES = [
  { key: 'online',                 label: '01 ONL',  region: 'Region C', locationId: 'Vpl9uLtDIHvddSSZztMA', token: 'pit-04d5417e-9400-448e-8f18-ab1ddcf70700' },
  { key: 'subang_taipan',          label: '02 ST',   region: 'Region A', locationId: 'usaXD9ZihKNI9lNqueE4', token: 'pit-ff268089-be71-45cb-9225-e6f7129d2547' },
  { key: 'setia_alam',             label: '03 SA',   region: 'Region A', locationId: 'DoKT0lXGyQFz8DHoVOm4', token: 'pit-362bf359-27b3-4166-a55e-f698e915af9e' },
  { key: 'sri_petaling',           label: '04 SP',   region: 'Region B', locationId: 'wREGaqHXvoxHiNTj02mJ', token: 'pit-74e28a7b-30a3-48d7-8902-0c12b23cccc1' },
  { key: 'kota_damansara',         label: '05 KD',   region: 'Region B', locationId: '3IxS5tbD1lvDxMGMSczL', token: 'pit-ce36e258-f128-4094-be1b-c1271f81442f' },
  { key: 'putrajaya',              label: '06 PJY',  region: 'Region C', locationId: 'BBqrR8ckJ87m4YojupLZ', token: 'pit-d95a6a82-e8f2-4855-9169-204accfbf84d' },
  { key: 'ampang',                 label: '07 AMP',  region: 'Region B', locationId: 'cqr1ywf20KLTFSDCytCx', token: 'pit-7d5f7f52-1c30-49d6-b30e-8a5715beb88d' },
  { key: 'cyberjaya',              label: '08 CJY',  region: 'Region C', locationId: '4xnM7ZmlbYAVFVqY1bX8', token: 'pit-ac5b7372-a5a0-4cdd-9828-38a74362706c' },
  { key: 'klang',                  label: '09 KLG',  region: 'Region A', locationId: 'ByhyzMBuV43aAzOsZffy', token: 'pit-db64a126-6605-48c3-9aa6-04622670c69e' },
  { key: 'denai_alam',             label: '10 DA',   region: 'Region A', locationId: '7myL6WBNCz4rlxhE1GfC', token: 'pit-fba13e5a-ce2c-46eb-bae7-fb9e352a0e4a' },
  { key: 'bandar_baru_bangi',      label: '11 BBB',  region: 'Region C', locationId: 'oUjhd0TVocJcZ1cMMi2G', token: 'pit-03fe8042-925c-4694-90b1-e86cfacdaeae' },
  { key: 'danau_kota',             label: '12 DK',   region: 'Region B', locationId: 'HTsl0vOTuEAVw85S9I16', token: 'pit-f93e4594-99fe-43ed-9f9d-d6f766d4cd6d' },
  { key: 'shah_alam',              label: '13 SHA',  region: 'Region A', locationId: '3ZNi0O4QkJiJ49QWnc19', token: 'pit-80debf55-6796-4ac9-8170-a9c2e69330e4' },
  { key: 'bandar_tun_hussein_onn', label: '14 BTHO', region: 'Region B', locationId: 'gtZGYA7BGWfx54pND4nw', token: 'pit-e1e94f64-9950-4cd4-8cf1-acbaa4059ffd' },
  { key: 'eco_grandeur',           label: '15 EGR',  region: 'Region A', locationId: 'EyX5ziXrAPuCOHoMutip', token: 'pit-503e96e5-e6a1-4e37-8fa9-dd48f67c3248' },
  { key: 'bandar_seri_putra',      label: '16 BSP',  region: 'Region C', locationId: 'FuQByFeUURbkBl2YA61q', token: 'pit-d891efe2-0f9b-410f-b7b4-a192c4c3f62c' },
  { key: 'bandar_rimbayu',         label: '17 RBY',  region: 'Region A', locationId: 'RtnVTOWs5GRREHyiTxaT', token: 'pit-6914cf46-ce4e-4b4a-a2fc-f0ae33ac9159' },
  { key: 'taman_seri_gombak',      label: '18 TSG',  region: 'Region B', locationId: 'XUCj8GKwaYGPFB3LFm17', token: 'pit-1c61ad71-ff45-411c-8899-034e9e797959' },
  { key: 'kajang_ttdi_grove',      label: '19 KTG',  region: 'Region B', locationId: 'QpIeU8mksO4PHvBIudQQ', token: 'pit-8f5445fa-b413-4137-8bed-00f8e9c15efb' },
  { key: 'kota_warisan',           label: '20 KW',   region: 'Region C', locationId: 'XeId139CcA8Wl6h5zTJT', token: 'pit-506bc22f-a756-4d80-b7ef-76fdee54a6e5' },
  { key: 'tropicana_sungai_buloh', label: '21 TSB',  region: 'Region A', locationId: 'baTAHn1jvxmUZS0J5pBf', token: 'pit-04919c9d-db5c-4c31-9923-b8fa08ea32d2' },
  { key: 'puncak_jalil',           label: '22 PJL',  region: 'Region B', locationId: 'xdiXYPd2m6LZWNTQVAIj', token: 'pit-3cd62cb3-1acf-435f-98ba-bc53fae93a2e' },
  { key: 'puchong_utama',          label: '23 PU',   region: 'Region C', locationId: 'dVVxStgEAxPktzsNEb5B', token: 'pit-ac07c188-6b62-4b6e-8d94-486d6b624ef5' },
];

function ghlGet(path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'services.leadconnectorhq.com',
        path,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// Single-pass fetch: one paginated request per branch covers all 4 tags.
// Uses a 90-day lookback window so contacts created before the range that
// received CT/SU/ENR tags within the range are still counted.
// NL  = created in [dateFrom, dateTo]  AND has "new lead" tag
// CT/SU/ENR = updated in [dateFrom, dateTo] AND has "ctt"/"sut"/"enr" tag
async function fetchBranchCounts(branch, dateFrom, dateTo) {
  const lookback = new Date(dateFrom + 'T00:00:00+08:00');
  lookback.setDate(lookback.getDate() - 90);
  const fetchFrom = lookback.toISOString().split('T')[0];

  const nlFromTs  = new Date(dateFrom + 'T00:00:00+08:00').getTime();
  const nlToTs    = new Date(dateTo   + 'T23:59:59+08:00').getTime();

  let NL = 0, CT = 0, SU = 0, ENR = 0;
  let startAfter = null;
  let startAfterId = null;

  while (true) {
    let path = `/contacts/?locationId=${branch.locationId}&limit=100&startDate=${fetchFrom}&endDate=${dateTo}`;
    if (startAfter)   path += `&startAfter=${encodeURIComponent(startAfter)}`;
    if (startAfterId) path += `&startAfterId=${encodeURIComponent(startAfterId)}`;

    let body;
    try {
      const result = await ghlGet(path, branch.token);
      body = result.body;
    } catch {
      break;
    }

    const contacts = Array.isArray(body.contacts) ? body.contacts : [];

    for (const c of contacts) {
      const tags       = c.tags || [];
      const createdTs  = new Date(c.dateAdded).getTime();
      const updatedTs  = new Date(c.dateUpdated).getTime();
      const inNlRange  = createdTs >= nlFromTs && createdTs <= nlToTs;
      const inUpdRange = updatedTs >= nlFromTs && updatedTs <= nlToTs;

      if (inNlRange  && tags.includes('new lead')) NL++;
      if (inUpdRange && tags.includes('ctt'))      CT++;
      if (inUpdRange && tags.includes('sut'))      SU++;
      if (inUpdRange && tags.includes('enr'))      ENR++;
    }

    if (!body.meta?.nextPageUrl || contacts.length === 0) break;
    startAfter   = body.meta.startAfter   || null;
    startAfterId = body.meta.startAfterId || null;
  }

  return { key: branch.key, label: branch.label, region: branch.region, NL, CT, SU, ENR };
}

async function buildData(dateFrom, dateTo) {
  const results = await Promise.all(
    BRANCHES.map((b) =>
      fetchBranchCounts(b, dateFrom, dateTo).catch((err) => {
        console.error(`[ghl-live-tags] ${b.label} error:`, err.message);
        return { key: b.key, label: b.label, region: b.region, NL: 0, CT: 0, SU: 0, ENR: 0, error: true };
      })
    )
  );
  return { branches: results, fetchedAt: new Date().toISOString() };
}

// 5-minute in-memory cache with stale-while-revalidate.
// After the first cold load, every request returns instantly from cache.
// When the cache entry is older than CACHE_TTL the stale data is still served
// immediately and a background refresh runs so the *next* request is fresh.
const cache = new Map();
const refreshing = new Set();
const CACHE_TTL = 5 * 60 * 1000;

function bgRefresh(cacheKey, dateFrom, dateTo) {
  if (refreshing.has(cacheKey)) return;
  refreshing.add(cacheKey);
  buildData(dateFrom, dateTo)
    .then((data) => cache.set(cacheKey, { data, ts: Date.now() }))
    .catch((err) => console.error('[ghl-live-tags] bg refresh error:', err.message))
    .finally(() => refreshing.delete(cacheKey));
}

// ──────────────────────────────────────────────────────────────
// GET /api/ghl-live-tags/by-branch?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
// NL filtered by created date; CT/SU/ENR filtered by updated date.
// ──────────────────────────────────────────────────────────────
router.get('/by-branch', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { date_from = '', date_to = '' } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'date_from and date_to are required (YYYY-MM-DD)' });
    }

    const cacheKey = `${date_from}|${date_to}`;
    const cached = cache.get(cacheKey);

    if (cached) {
      const stale = Date.now() - cached.ts > CACHE_TTL;
      if (stale) bgRefresh(cacheKey, date_from, date_to);
      return res.json({ ...cached.data, isStale: stale });
    }

    // Cold cache — wait for full fetch then store and return
    const data = await buildData(date_from, date_to);
    cache.set(cacheKey, { data, ts: Date.now() });
    return res.json({ ...data, isStale: false });
  } catch (err) {
    return next(err);
  }
});

module.exports = { ghlLiveTagsRouter: router };
