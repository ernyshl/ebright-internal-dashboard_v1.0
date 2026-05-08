// AMF (Hikvision DS-K1T804A) direct-device attendance sync.
//
// Why this exists: the vendor middleware that bridges the AMF terminal to
// ebright_hrfs_scanner2.AttendanceLog is unreliable during outages — scans
// recorded while it's offline never make it into the DB. The DS-K1T804A
// itself buffers up to 50,000 events on-board (see AMF user guide §7.10.3,
// "Up to 50,000 attendance records can be saved"), so polling the device
// directly via ISAPI lets us recover any events the middleware missed.
//
// Integration shape:
//   * GET  /ISAPI/System/deviceInfo?format=json  → device serial number (cached)
//   * POST /ISAPI/AccessControl/AcsEvent?format=json  → paged event search
//
// Event → AttendanceLogST mapping:
//   ISAPI returns one record per *scan* (AcsEvent), but AttendanceLogST is
//   one row per (date, empNo) with paired clockIn/clockOut columns —
//   matching the upstream shape produced by the vendor middleware. We
//   replicate that pairing client-side: per (date, empNo) group, MIN(time)
//   → clockInTime, MAX(time) → clockOutTime (NULL if only one event that day).
//   The same ON CONFLICT upsert pattern as stSync.js merges with rows the
//   vendor middleware may have already written.
//
// Watermark: amf_sync_state.last_sync_at. On first run (or fresh DB) we
// look back AMF_SYNC_LOOKBACK_DAYS to bound the initial query.
//
// Auth: HTTP Digest (RFC 2617, MD5). Hikvision firmware uses Digest by default
// on ISAPI; the minimal implementation below covers MD5 / qop=auth, which is
// what DS-K1T804A firmware emits. If a future firmware switches to MD5-sess
// or SHA-256 we'll need to extend digestFetch.

const crypto = require('crypto');
const { pool: targetPool } = require('../db');
const { env } = require('../env');

function log(msg, extra) {
  // eslint-disable-next-line no-console
  if (extra !== undefined) console.log(`[amfSync] ${msg}`, extra);
  else console.log(`[amfSync] ${msg}`);
}

function logErr(msg, err) {
  // Node's global fetch wraps the real error in `cause`. Surface both so
  // "fetch failed" doesn't hide ECONNRESET / EPROTO / etc.
  let detail = '';
  if (err && err.cause) {
    const c = err.cause;
    detail = ` (cause: ${c.code || ''} ${c.message || c}`.trim() + ')';
  }
  // eslint-disable-next-line no-console
  console.error(`[amfSync] ${msg}:`, (err && (err.message || err)) + detail);
}

// ------------------------------------------------------------
// Minimal HTTP Digest auth wrapper around global fetch (Node 18+)
// ------------------------------------------------------------
function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }

function parseDigestHeader(h) {
  const out = {};
  // Strip leading "Digest " then split on commas at the top level. Values
  // can be quoted or unquoted; this regex handles both.
  const body = h.replace(/^Digest\s+/i, '');
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|([^,]*))/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    out[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3].trim();
  }
  return out;
}

function buildDigestAuth({ username, password, method, uri, body = '', params }) {
  const cnonce = crypto.randomBytes(8).toString('hex');
  const nc = '00000001';
  // qop may be a comma-list like "auth, auth-int". Prefer auth-int for
  // requests with a body so the body integrity is signed (Hikvision firmware
  // sometimes rejects auth-only POSTs with a 401-after-retry).
  const qopOptions = (params.qop || 'auth').split(',').map(s => s.trim());
  const qop = (body && qopOptions.includes('auth-int')) ? 'auth-int' : qopOptions[0];
  const ha1 = md5(`${username}:${params.realm}:${password}`);
  // RFC 2617: HA2 for auth-int = MD5(method:uri:MD5(entity-body))
  const ha2 = qop === 'auth-int'
    ? md5(`${method}:${uri}:${md5(body)}`)
    : md5(`${method}:${uri}`);
  const response = md5(`${ha1}:${params.nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  const parts = [
    `username="${username}"`,
    `realm="${params.realm}"`,
    `nonce="${params.nonce}"`,
    `uri="${uri}"`,
    `qop=${qop}`,
    `nc=${nc}`,
    `cnonce="${cnonce}"`,
    `response="${response}"`,
    `algorithm=${params.algorithm || 'MD5'}`,
  ];
  if (params.opaque) parts.push(`opaque="${params.opaque}"`);
  return 'Digest ' + parts.join(', ');
}

async function fetchWithTimeout(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), env.AMF_SYNC_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function digestFetch(url, opts, username, password) {
  // Hikvision firmware closes keep-alive sockets between the 401 challenge
  // and the authenticated retry, which surfaces as "UND_ERR_SOCKET other
  // side closed" in undici. Force Connection: close so each request gets
  // a fresh TCP connection.
  const noKeepAlive = { Connection: 'close' };
  // Each request gets its own timeout — the digest 401-then-retry flow
  // can otherwise blow a single shared budget on a slow device.
  const first = await fetchWithTimeout(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...noKeepAlive },
  });
  if (first.status !== 401) return first;
  const wa = first.headers.get('www-authenticate') || '';
  if (!/^digest/i.test(wa)) {
    throw new Error(`expected Digest challenge, got: ${wa.slice(0, 80)}`);
  }
  await first.text().catch(() => {});
  const params = parseDigestHeader(wa);
  if (process.env.AMF_DEBUG) log(`digest challenge: ${wa.slice(0, 200)}`);
  const u = new URL(url);
  const uri = u.pathname + u.search;
  const method = (opts.method || 'GET').toUpperCase();
  const body = typeof opts.body === 'string' ? opts.body : '';
  const auth = buildDigestAuth({ username, password, method, uri, body, params });
  const second = await fetchWithTimeout(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...noKeepAlive, Authorization: auth },
  });
  if (second.status === 401 && process.env.AMF_DEBUG) {
    log(`digest retry rejected. challenge2: ${(second.headers.get('www-authenticate') || '').slice(0, 200)}`);
  }
  return second;
}

// ------------------------------------------------------------
// ISAPI calls
// ------------------------------------------------------------
function baseUrl() {
  return `http://${env.AMF_HOST}:${env.AMF_PORT}`;
}

// Some DS-K1T8xx firmware ignores ?format=json and replies with XML even
// when we set Accept: application/json. deviceInfo only needs one field
// (the serial), so we cheap-parse it out of either format.
function extractTagValue(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : null;
}

async function getDeviceSerial() {
  const url = `${baseUrl()}/ISAPI/System/deviceInfo?format=json`;
  const res = await digestFetch(
    url,
    { method: 'GET', headers: { Accept: 'application/json' } },
    env.AMF_USERNAME, env.AMF_PASSWORD,
  );
  if (!res.ok) throw new Error(`deviceInfo HTTP ${res.status}`);
  const text = await res.text();
  if (text.trim().startsWith('<')) {
    return extractTagValue(text, 'serialNumber')
        || extractTagValue(text, 'deviceID')
        || extractTagValue(text, 'serialNo')
        || null;
  }
  const j = JSON.parse(text);
  // Field name varies a bit by firmware: serialNumber on most, deviceID on some.
  const info = j.DeviceInfo || j.deviceInfo || j;
  return info.serialNumber || info.deviceID || info.serialNo || null;
}

// Hikvision search returns up to maxResults per call and uses
// searchResultPosition for paging. responseStatusStrg is one of
// "OK" | "MORE" | "NO MATCH" — we keep paging while "MORE" or until
// numOfMatches < maxResults.
async function fetchEventsPage({ searchID, position, startISO, endISO }) {
  const url = `${baseUrl()}/ISAPI/AccessControl/AcsEvent?format=json`;
  // DS-K1T804AMF V1.4.1 hard caps from capabilities: maxResults<=10,
  // searchID<=20 chars. Higher values cause badParameters.
  const pageSize = Math.min(env.AMF_SYNC_PAGE_SIZE, 10);
  // The capabilities response misleadingly lists typed minor fields
  // (minorAlarm/minorEvent/etc) — those are NOT accepted by this firmware
  // and trigger MessageParametersLack. The actual working schema uses plain
  // `minor`. major=0 + minor=0 = "all event types"; we filter to attendance
  // events later in JS by checking the per-event `attendanceStatus` field.
  // (Mirrors what works for the AcsEventTotalNum endpoint on the same device.)
  const body = {
    AcsEventCond: {
      searchID,
      searchResultPosition: position,
      maxResults: pageSize,
      major: 0,
      minor: 0,
      startTime: startISO,
      endTime: endISO,
    },
  };
  const res = await digestFetch(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    },
    env.AMF_USERNAME, env.AMF_PASSWORD,
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`AcsEvent HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const j = JSON.parse(text);
  const e = j.AcsEvent || {};
  return {
    status: e.responseStatusStrg || 'OK',
    matches: e.numOfMatches || 0,
    total: e.totalMatches || 0,
    list: e.InfoList || [],
  };
}

// ------------------------------------------------------------
// Pull + group + upsert
// ------------------------------------------------------------
async function loadWatermark() {
  const r = await targetPool.query(`SELECT last_sync_at, device_serial FROM amf_sync_state WHERE id = 1`);
  return r.rows[0] || { last_sync_at: null, device_serial: null };
}

async function saveWatermark(lastSyncAt, deviceSerial) {
  await targetPool.query(
    `UPDATE amf_sync_state
     SET last_sync_at = $1, device_serial = COALESCE($2, device_serial), updated_at = NOW()
     WHERE id = 1`,
    [lastSyncAt, deviceSerial]
  );
}

// Hikvision `time` is ISO 8601 with timezone, e.g. "2026-04-28T09:14:33+08:00".
// AttendanceLogST.clockInTime / clockOutTime are TEXT and the vendor
// middleware writes plain "HH:mm:ss" (the dashboard slices the first 5 chars
// to render "HH:mm"). Persisting the raw ISO string here would render as
// "2026-" on the dashboard. extractTime() returns the local-clock HH:mm:ss
// portion of the ISO string so AMF rows match the vendor convention.
function pickEmpNo(ev)   { return ev.employeeNoString || ev.employeeNo || ev.employeeID || null; }
function pickEmpName(ev) { return ev.name || ev.userName || null; }
function pickTime(ev)    { return ev.time || ev.eventTime || null; }

function extractTime(iso) {
  if (!iso) return null;
  // ISO format from device: "YYYY-MM-DDTHH:mm:ss+HH:MM". chars 11..18 are the
  // local clock-time portion. Bare "HH:mm:ss" passes through unchanged.
  if (iso.length >= 19 && iso[10] === 'T') return iso.slice(11, 19);
  return iso;
}

function ymd(iso) { return iso.slice(0, 10); } // 'YYYY-MM-DD'

// Hikvision wants 'YYYY-MM-DDTHH:mm:ss±HH:MM' — no millis, explicit offset.
// We send UTC (+00:00) so device-side timezone config doesn't matter for the
// query window; events come back with the device's own offset.
function formatHikTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`;
}

function pairEvents(events, deviceSerial) {
  // Group by (date, empNo); compute MIN/MAX time. Skip events without empNo
  // (anonymous denials etc) — they don't fit the AttendanceLogST schema.
  const groups = new Map();
  for (const ev of events) {
    const empNo = pickEmpNo(ev);
    const t = pickTime(ev);
    if (!empNo || !t) continue;
    const date = ymd(t);
    const key = `${date}|${empNo}`;
    let g = groups.get(key);
    if (!g) {
      g = { date, empNo, empName: pickEmpName(ev), first: t, last: t };
      groups.set(key, g);
    } else {
      if (t < g.first) g.first = t;
      if (t > g.last) g.last = t;
      if (!g.empName && pickEmpName(ev)) g.empName = pickEmpName(ev);
    }
  }
  // clockOut = last only if it differs from first.
  // Fall back to empNo for empName because Hikvision AcsEvent payloads on
  // this firmware don't include the user's name, and AttendanceLogST.empName
  // is NOT NULL. The dashboard query in stAttendance.js LEFT JOINs
  // BranchStaff to get the display name from HR records, so the stored
  // empName is just a placeholder; using empNo here matches what the vendor
  // middleware does for walk-up scans (visible as rows with empNo="2",
  // "10000001" etc in the existing data).
  return Array.from(groups.values()).map(g => ({
    date: g.date,
    empNo: g.empNo,
    empName: g.empName || g.empNo,
    clockInTime: extractTime(g.first),
    clockInSerialNo: deviceSerial,
    clockOutTime: g.first === g.last ? null : extractTime(g.last),
    clockOutSerialNo: g.first === g.last ? null : deviceSerial,
  }));
}

async function upsertOne(row) {
  // Same upsert + WHERE-distinct-from pattern as stSync.js so reruns are
  // idempotent and we can tell INSERT vs UPDATE vs SKIP from RETURNING.
  const r = await targetPool.query(
    `INSERT INTO public."AttendanceLogST"
       ("date", "empNo", "empName",
        "clockInTime", "clockInSerialNo", "clockInEmailSent",
        "clockOutTime", "clockOutSerialNo", "clockOutEmailSent",
        "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,false,$6,$7,false,NOW(),NOW())
     ON CONFLICT ("date", "empNo") DO UPDATE SET
       "clockOutTime"      = EXCLUDED."clockOutTime",
       "clockOutSerialNo"  = EXCLUDED."clockOutSerialNo",
       "empName"           = COALESCE(EXCLUDED."empName", "AttendanceLogST"."empName"),
       "updatedAt"         = NOW()
     WHERE "AttendanceLogST"."clockOutTime"     IS DISTINCT FROM EXCLUDED."clockOutTime"
        OR "AttendanceLogST"."clockOutSerialNo" IS DISTINCT FROM EXCLUDED."clockOutSerialNo"
        OR "AttendanceLogST"."empName"          IS DISTINCT FROM COALESCE(EXCLUDED."empName", "AttendanceLogST"."empName")
     RETURNING (xmax = 0) AS was_inserted`,
    [row.date, row.empNo, row.empName,
     row.clockInTime, row.clockInSerialNo,
     row.clockOutTime, row.clockOutSerialNo]
  );
  if (r.rows.length === 0) return 'skipped';
  return r.rows[0].was_inserted ? 'inserted' : 'updated';
}

// ------------------------------------------------------------
// Public entry point
// ------------------------------------------------------------
async function runAmfSync({ dryRun = false } = {}) {
  if (!env.AMF_HOST || !env.AMF_USERNAME || !env.AMF_PASSWORD) {
    log('AMF_HOST / AMF_USERNAME / AMF_PASSWORD not set — skipping');
    return { skipped: true };
  }

  const t0 = Date.now();
  const wm = await loadWatermark();
  const now = new Date();
  // Sliding 3-day backfill: every run pulls the last 3 days from the device,
  // even if the watermark is more recent. This is what makes "close laptop for
  // a few days, reopen, see the data" work — the device's on-board buffer is
  // re-scanned every tick so any events that never made it into our DB get
  // recovered. Re-fetching events we already have is cheap: the upsert WHERE
  // IS-DISTINCT-FROM clause skips no-op writes.
  // If the watermark is OLDER than 3 days (e.g. laptop was off for a week),
  // we extend the window back to the watermark instead so nothing falls
  // through the gap.
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400_000);
  const watermarkOrFallback = wm.last_sync_at
    ? new Date(wm.last_sync_at)
    : new Date(now.getTime() - env.AMF_SYNC_LOOKBACK_DAYS * 86400_000);
  const start = watermarkOrFallback < threeDaysAgo ? watermarkOrFallback : threeDaysAgo;
  // Hikvision ISAPI rejects ISO8601 with 'Z' suffix and fractional seconds
  // on some firmware. Format as 'YYYY-MM-DDTHH:mm:ss±HH:MM' instead.
  const startISO = formatHikTime(start);
  const endISO = formatHikTime(now);

  log(`mode=${dryRun ? 'DRY-RUN' : 'WRITE'} host=${env.AMF_HOST}:${env.AMF_PORT} ` +
      `window=${startISO} → ${endISO} ` +
      `(watermark=${wm.last_sync_at ? wm.last_sync_at.toISOString() : 'NONE'})`);

  // Retry deviceInfo up to 3 times before giving up. The first call after a
  // cold device or laptop wake routinely times out on the digest handshake
  // (Hikvision closes keep-alive between 401 and retry), and a single
  // failure here would otherwise cancel the entire run — meaning scans
  // accumulated while the laptop was off would NOT be recovered until the
  // next 5-min tick. Retrying inline lets a single startup pull succeed
  // even when the device is slow to wake.
  let serial;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      serial = await getDeviceSerial();
      lastErr = null;
      log(`device serial=${serial || '(unknown)'} (attempt ${attempt})`);
      break;
    } catch (e) {
      lastErr = e;
      logErr(`deviceInfo attempt ${attempt}/3 failed`, e);
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 3000));
    }
  }
  if (lastErr) {
    logErr('deviceInfo failed after 3 attempts — device unreachable or auth wrong', lastErr);
    return { error: 'deviceInfo', message: lastErr.message };
  }

  // searchID is capped at 20 chars by this firmware — a full UUID (36 chars)
  // is rejected as badParameters. 16 hex chars is unique enough for a session
  // and well within the limit.
  const searchID = crypto.randomBytes(8).toString('hex');
  const allEvents = [];
  let position = 0;
  let pages = 0;
  for (;;) {
    let page;
    let lastErr;
    // Retry up to 3 times on transient failures (timeout, socket reset).
    // The device is intermittently slow under load and a single dropped
    // page would otherwise lose hundreds of events of progress.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        page = await fetchEventsPage({ searchID, position, startISO, endISO });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        logErr(`AcsEvent page ${pages + 1} attempt ${attempt} failed`, e);
        if (attempt < 3) {
          // Linear backoff — 2s, 4s. Keeps total worst-case page time bounded
          // so a stuck device fails the run within reasonable wall-clock.
          await new Promise(r => setTimeout(r, attempt * 2000));
        }
      }
    }
    if (lastErr) {
      return { error: 'AcsEvent', message: lastErr.message, pages, fetched: allEvents.length };
    }
    pages++;
    allEvents.push(...page.list);
    log(`page ${pages}: status=${page.status} got=${page.list.length} total=${page.total} cum=${allEvents.length}`);
    if (page.list.length === 0) break;
    if (page.status === 'NO MATCH' || page.status === 'NO MATCHES') break;
    if (page.list.length < env.AMF_SYNC_PAGE_SIZE && page.status !== 'MORE') break;
    position += page.list.length;
    // Safety: bail if device claims more than 50k matches — that's the
    // hardware ceiling, anything bigger means a bad query.
    if (allEvents.length > 50_000) {
      logErr('aborting paging', new Error(`exceeded 50k events (got ${allEvents.length}) — query window too wide?`));
      break;
    }
  }

  const grouped = pairEvents(allEvents, serial);
  const firstT = allEvents.length ? pickTime(allEvents[0]) : null;
  const lastT = allEvents.length ? pickTime(allEvents[allEvents.length - 1]) : null;
  log(`fetched ${allEvents.length} events → ${grouped.length} (date,empNo) groups; first=${firstT} last=${lastT}`);

  if (dryRun) {
    log('--dry-run: no rows written. Sample of what would be upserted (max 10):');
    for (const r of grouped.slice(0, 10)) {
      // eslint-disable-next-line no-console
      console.log('  ', JSON.stringify(r));
    }
    return { dryRun: true, fetched: allEvents.length, grouped: grouped.length, ms: Date.now() - t0 };
  }

  let inserted = 0, updated = 0, skipped = 0;
  for (const row of grouped) {
    try {
      const result = await upsertOne(row);
      if (result === 'inserted') inserted++;
      else if (result === 'updated') updated++;
      else skipped++;
    } catch (e) {
      logErr(`upsert failed for ${row.date}/${row.empNo}`, e);
    }
  }

  // Only advance the watermark when at least one row was successfully written
  // (or when there was nothing to write — empty pull is also a clean state).
  // If every upsert failed, the watermark stays where it was so the next run
  // re-fetches the same events. Skipped rows count as success — they mean
  // the row already existed unchanged, which is the idempotent no-op case.
  const allFailed = grouped.length > 0 && inserted === 0 && updated === 0 && skipped === 0;
  const ms = Date.now() - t0;
  if (allFailed) {
    logErr(`tick ${ms}ms — every upsert failed`,
      new Error(`fetched=${allEvents.length} groups=${grouped.length} but 0 succeeded; watermark NOT advanced`));
    return { fetched: allEvents.length, grouped: grouped.length, inserted, updated, skipped, ms, error: 'all-upserts-failed' };
  }
  // Watermark = last event time we actually saw, NOT now() — so a clock skew
  // between device and server can't silently drop events.
  const newWm = lastT ? new Date(lastT) : start;
  await saveWatermark(newWm, serial);
  log(`tick ${ms}ms — fetched=${allEvents.length} groups=${grouped.length} ` +
      `inserted=${inserted} updated=${updated} skipped=${skipped} new_watermark=${newWm.toISOString()}`);
  return { fetched: allEvents.length, grouped: grouped.length, inserted, updated, skipped, ms };
}

// ------------------------------------------------------------
// Recurring loop
// ------------------------------------------------------------
// Why this exists in addition to the one-shot runAmfSync():
//   The vendor middleware bridge can die mid-session, and the laptop running
//   this backend may be closed for hours. The device buffers up to 50k events
//   locally. A single startup pull only catches the first reopen — anything
//   that happens *during* a long-running session while the middleware is dead
//   would otherwise sit on the device until next restart. Polling on an
//   interval drains the buffer continuously so the dashboard stays current.
let amfIntervalHandle = null;
let amfRunning = false; // re-entry guard — a slow page must not stack ticks

function startAmfSync() {
  if (!env.AMF_HOST || !env.AMF_USERNAME || !env.AMF_PASSWORD) {
    log('AMF_HOST / AMF_USERNAME / AMF_PASSWORD not set — recurring sync disabled');
    return { stop: () => {} };
  }

  log(`starting recurring sync — interval=${env.AMF_SYNC_INTERVAL_MS}ms`);

  const tick = async () => {
    if (amfRunning) {
      log('previous run still in progress — skipping tick');
      return;
    }
    amfRunning = true;
    try {
      await runAmfSync();
    } catch (e) {
      logErr('scheduled run failed', e);
    } finally {
      amfRunning = false;
    }
  };

  // Kick off the first run immediately so reopening the laptop drains the
  // device's buffer without waiting AMF_SYNC_INTERVAL_MS.
  tick();
  amfIntervalHandle = setInterval(tick, env.AMF_SYNC_INTERVAL_MS);
  // Don't keep the event loop alive after everything else exits.
  if (amfIntervalHandle.unref) amfIntervalHandle.unref();

  return {
    stop: () => {
      if (amfIntervalHandle) clearInterval(amfIntervalHandle);
      amfIntervalHandle = null;
      log('recurring sync stopped');
    },
  };
}

module.exports = { runAmfSync, startAmfSync };
