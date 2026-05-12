// Receives Hikvision ISAPI Event Notification HTTP pushes from access-control
// terminals (DS-K1T804AMF and similar). Scanners are configured to POST XML
// payloads here whenever a fingerprint / card / face scan happens.
//
// Auth: HTTP Basic. Hikvision devices support this via the
//   httpAuthenticationMethod=digest|basic field in /ISAPI/Event/notification/httpHosts.
//   We use basic with a single shared credential set in env (HIK_PUSH_USER / HIK_PUSH_PASS).
//
// Body: raw XML (Content-Type: application/xml or text/xml). Some firmwares
//   send multipart/form-data when the event includes a snapshot — we accept
//   anything and pluck the XML chunk out.
//
// Storage: one row per push into hik_attendance_log (see backend/sql/016_*).

const express = require('express');
const { pool } = require('../db');
const { env } = require('../env');

const router = express.Router();

// Capture raw body for any content-type — Hikvision sends XML, multipart, sometimes
// gzipped. We just need the bytes; downstream parsers pull out what they need.
router.use(express.raw({ type: '*/*', limit: '5mb' }));

function checkBasicAuth(req) {
  const expectedUser = env.HIK_PUSH_USER;
  const expectedPass = env.HIK_PUSH_PASS;
  if (!expectedUser || !expectedPass) {
    // If env not set, accept everything — useful for first-boot testing.
    // Set HIK_PUSH_USER and HIK_PUSH_PASS in production .env to require auth.
    return true;
  }
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const [u, p] = decoded.split(':');
  return u === expectedUser && p === expectedPass;
}

// Find the XML chunk inside a possibly multipart body. If the body already
// starts with `<?xml` or `<EventNotificationAlert`, return as-is. Otherwise
// look for a part with Content-Type: application/xml.
function extractXml(rawBody) {
  const text = rawBody.toString('utf8');
  if (text.trimStart().startsWith('<?xml') || text.trimStart().startsWith('<Event')) {
    return text;
  }
  // Multipart — naive boundary parse, just find the first XML block.
  const xmlStart = text.indexOf('<EventNotificationAlert');
  const xmlEnd = text.indexOf('</EventNotificationAlert>');
  if (xmlStart !== -1 && xmlEnd !== -1) {
    return text.slice(xmlStart, xmlEnd + '</EventNotificationAlert>'.length);
  }
  return null;
}

// Extract a single XML tag's text content. Returns null if not present.
// Handles namespaces and self-closing tags gracefully.
function pick(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

// Hikvision dates come as ISO-ish with TZ offset or naked, e.g.
//   "2026-05-12T08:30:00+08:00"  ✓ standard
//   "2026-05-12T08:30:00Z"        ✓
//   "2026-05-12T08:30:00"         naked — assume device's local time = MYT
function parseScanTime(raw) {
  if (!raw) return null;
  // If no offset / Z, append +08:00 (MYT) so Postgres stores the right moment.
  const hasTz = /[+-]\d{2}:?\d{2}|Z$/.test(raw);
  const iso = hasTz ? raw : `${raw}+08:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Health probe — useful for verifying the endpoint is reachable before
// pointing a scanner at it. Anonymous, no auth.
router.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'hik-events', ts: new Date().toISOString() });
});

// Main event sink.
router.post('/', async (req, res) => {
  if (!checkBasicAuth(req)) {
    return res.status(401).set('WWW-Authenticate', 'Basic realm="hik-events"').end();
  }

  const xml = extractXml(req.body);
  if (!xml) {
    // Acknowledge anyway so the device doesn't retry-spam; just log it.
    // eslint-disable-next-line no-console
    console.warn('[hik-events] non-XML body, length=', req.body?.length || 0);
    return res.status(200).end();
  }

  // Inner <AccessControllerEvent> sub-block, for emp/auth fields.
  const innerMatch = xml.match(/<AccessControllerEvent>([\s\S]*?)<\/AccessControllerEvent>/);
  const inner = innerMatch ? innerMatch[1] : xml;

  const row = {
    device_serial:     pick(inner, 'serialNo') || pick(xml, 'macAddress'),  // serialNo isn't always present
    device_name:       pick(inner, 'deviceName') || pick(xml, 'deviceName'),
    device_mac:        pick(xml, 'macAddress'),
    device_ip:         pick(xml, 'ipAddress'),
    emp_no:            pick(inner, 'employeeNoString') || pick(inner, 'employeeNo'),
    emp_name:          pick(inner, 'name'),
    verify_mode:       pick(inner, 'currentVerifyMode'),
    event_type:        pick(xml, 'eventType'),
    major_event:       parseInt(pick(inner, 'majorEventType'), 10) || null,
    minor_event:       parseInt(pick(inner, 'subEventType') || pick(inner, 'minorEventType'), 10) || null,
    attendance_status: pick(inner, 'attendanceStatus'),
    scan_time:         parseScanTime(pick(xml, 'dateTime')),
  };

  try {
    await pool.query(
      `INSERT INTO hik_attendance_log
         (device_serial, device_name, device_mac, device_ip,
          emp_no, emp_name, verify_mode,
          event_type, major_event, minor_event, attendance_status,
          scan_time, raw_xml)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        row.device_serial, row.device_name, row.device_mac, row.device_ip,
        row.emp_no, row.emp_name, row.verify_mode,
        row.event_type, row.major_event, row.minor_event, row.attendance_status,
        row.scan_time, xml,
      ],
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[hik-events] insert failed:', err.message);
    // Return 200 anyway so the device doesn't retry into oblivion; we have
    // the raw XML and would re-ingest from logs if needed.
  }

  // Hikvision wants a 200 with empty body to acknowledge.
  res.status(200).end();
});

module.exports = { hikEventsRouter: router };
