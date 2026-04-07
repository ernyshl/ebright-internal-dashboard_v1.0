// Branch name (from DB clean_branch) → Pipeline code (from Google Sheet)
export const BRANCH_TO_PIPELINE = {
  'Online':                  '01 ONL',
  'Subang Taipan':           '02 ST',
  'Sri Petaling':            '03 SP',
  'Setia Alam':              '04 SA',
  'Kota Damansara':          '05 KD',
  'Putrajaya':               '06 PJY',
  'Ampang':                  '07 AMP',
  'Cyberjaya':               '08 CJY',
  'Klang':                   '09 KLG',
  'Denai Alam':              '10 DA',
  'Bandar Baru Bangi':       '11 BBB',
  'Danau Kota':              '12 DK',
  'Shah Alam':               '13 SHA',
  'Bandar Tun Hussein Onn':  '14 BTHO',
  'Eco Grandeur':            '15 EGR',
  'Bandar Seri Putra':       '16 BSP',
  'Bandar Rimbayu':          '17 RBY',
  'Kajang Perdana':          '18 TSG',
  'Kajang':                  '18 TSG',
  'Kajang TTDI Grove':       '18 TSG',
  'Kota Warisan':            '19 KW',
  'Taman Sri Gombak':        '20 KTG',
  'Dataran Puchong Utama':   '21 DPU',
};

const SHEET_ID = '1o011OFPYmR0Y36tHRf6UEqMaJwjGoO0ntpXUEsPTI3w';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

export const PIPELINE_REGION = {
  '01 ONL':  'Region C',
  '02 ST':   'Region A',
  '03 SP':   'Region B',
  '04 SA':   'Region A',  // Setia Alam
  '05 KD':   'Region B',
  '06 PJY':  'Region C',
  '07 AMP':  'Region B',
  '08 CJY':  'Region C',
  '09 KLG':  'Region A',
  '10 DA':   'Region A',
  '11 BBB':  'Region C',
  '12 DK':   'Region B',
  '13 SHA':  'Region A',  // Shah Alam
  '14 BTHO': 'Region B',
  '15 EGR':  'Region A',
  '16 BSP':  'Region C',
  '17 RBY':  'Region A',
  '18 TSG':  'Region B',
  '19 KW':   'Region C',
  '20 KTG':  'Region B',
  '21 DPU':  'Region C',  // Dataran Puchong Utama
};

export const REGION_PIPELINES = {
  'Region A': ['02 ST', '04 SA', '09 KLG', '10 DA', '13 SHA', '15 EGR', '17 RBY'],
  'Region B': ['03 SP', '05 KD', '07 AMP', '12 DK', '14 BTHO', '18 TSG', '20 KTG'],
  'Region C': ['01 ONL', '06 PJY', '08 CJY', '11 BBB', '16 BSP', '19 KW', '21 DPU'],
};

export const ALL_PIPELINES = Object.keys(PIPELINE_REGION).sort();

// Reverse map: pipeline code → branch name (first match wins for duplicates like 18 TSG)
export const PIPELINE_TO_BRANCH = {
  '01 ONL':  'Online',
  '02 ST':   'Subang Taipan',
  '03 SP':   'Sri Petaling',
  '04 SA':   'Setia Alam',
  '05 KD':   'Kota Damansara',
  '06 PJY':  'Putrajaya',
  '07 AMP':  'Ampang',
  '08 CJY':  'Cyberjaya',
  '09 KLG':  'Klang',
  '10 DA':   'Denai Alam',
  '11 BBB':  'Bandar Baru Bangi',
  '12 DK':   'Danau Kota',
  '13 SHA':  'Shah Alam',
  '14 BTHO': 'Bandar Tun Hussein Onn',
  '15 EGR':  'Eco Grandeur',
  '16 BSP':  'Bandar Seri Putra',
  '17 RBY':  'Bandar Rimbayu',
  '18 TSG':  'Kajang TTDI Grove',
  '19 KW':   'Kota Warisan',
  '20 KTG':  'Taman Sri Gombak',
  '21 DPU':  'Dataran Puchong Utama',
};

function parseDate(str) {
  if (!str) return null;
  const parts = str.trim().split(' ');
  const dateParts = parts[0].split('/');
  if (dateParts.length !== 3) return null;
  const [day, month, year] = dateParts;
  const [h = 0, m = 0, s = 0] = (parts[1] || '0:0:0').split(':');
  const d = new Date(Number(year), Number(month) - 1, Number(day), Number(h), Number(m), Number(s));
  return isNaN(d.getTime()) ? null : d;
}

function getStageKey(stage) {
  const s = (stage || '').toLowerCase();
  if (s.includes('new lead')) return 'NL';
  if (s.includes('confirmed')) return 'CT';
  if (s.includes('show')) return 'SU';
  if (s.includes('enrolled')) return 'ENR';
  return null;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const parseRow = (line) => {
    const values = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    values.push(cur.trim());
    return values;
  };

  const headers = parseRow(lines[0]).map(h => h.replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, ''); });
    return row;
  }).filter(r => r['Date']);
}

export async function fetchLeadsData() {
  const res = await fetch(CSV_URL);
  const text = await res.text();
  const rows = parseCSV(text);

  return rows.map(row => {
    const pipeline = (row['Pipeline'] || '').trim();
    return {
      date: parseDate(row['Date']),
      type: row['Type'],
      lastName: row['Last Name'],
      email: row['Email'],
      phone: row['Phone Number'],
      stage: getStageKey(row['Stage']),
      branch: row['Branch'],
      pipeline,
      region: PIPELINE_REGION[pipeline] || 'Unknown',
    };
  }).filter(r => r.date && r.stage);
}

// Returns raw rows for bulk import (preserves original Stage text)
export async function fetchLeadsRawForImport() {
  const res = await fetch(CSV_URL);
  const text = await res.text();
  const rows = parseCSV(text);

  return rows.map(row => {
    const d = parseDate(row['Date']);
    return {
      email: (row['Email'] || '').trim(),
      last_name: (row['Last Name'] || '').trim(),
      phone: (row['Phone Number'] || '').trim(),
      stage_raw: (row['Stage'] || '').trim(),
      pipeline_name: (row['Pipeline'] || '').trim(),
      branch: (row['Branch'] || '').trim(),
      student_name: '',
      contact_type: (row['Type'] || 'lead').trim(),
      lead_source: '',
      received_at: d ? d.toISOString() : null,
    };
  }).filter(r => r.stage_raw && r.email);
}

export function getDateRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = (d) => new Date(d.getTime() + 86400000 - 1);

  if (preset === 'today') {
    return { from: today, to: endOfDay(today) };
  }
  if (preset === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { from: y, to: endOfDay(y) };
  }
  if (preset === 'this_week') {
    const mon = new Date(today);
    const day = today.getDay();
    mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    return { from: mon, to: endOfDay(today) };
  }
  if (preset === 'last_week') {
    const day = today.getDay();
    const thisMon = new Date(today);
    thisMon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
    const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1);
    return { from: lastMon, to: endOfDay(lastSun) };
  }
  if (preset === 'this_month') {
    const m = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: m, to: endOfDay(today) };
  }
  if (preset === 'last_month') {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last  = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: first, to: endOfDay(last) };
  }
  if (preset === 'my_filter') {
    // This Saturday to next Sunday (Sat + 8 days)
    const sat = new Date(today);
    const daysAgo = (today.getDay() - 6 + 7) % 7;
    sat.setDate(today.getDate() - daysAgo);
    const nextSun = new Date(sat);
    nextSun.setDate(sat.getDate() + 8);
    return { from: sat, to: endOfDay(nextSun) };
  }
  return { from: today, to: endOfDay(today) };
}

export function filterByPreset(rows, preset) {
  const { from, to } = getDateRange(preset);
  return rows.filter(r => r.date >= from && r.date <= to);
}

export function computeMetrics(rows) {
  const c = { NL: 0, CT: 0, SU: 0, ENR: 0 };
  for (const r of rows) if (c[r.stage] !== undefined) c[r.stage]++;
  const pct = (a, b) => b > 0 ? (a / b * 100).toFixed(2) + '%' : 'No data';
  return {
    ...c,
    convRate: pct(c.ENR, c.NL),
    confRate: pct(c.CT, c.NL),
    showUpRate: pct(c.SU, c.CT),
    enrolRate: pct(c.ENR, c.SU),
  };
}

export function computeByPipeline(rows) {
  const map = {};
  for (const r of rows) {
    if (!map[r.pipeline]) map[r.pipeline] = { NL: 0, CT: 0, SU: 0, ENR: 0 };
    if (map[r.pipeline][r.stage] !== undefined) map[r.pipeline][r.stage]++;
  }
  return map;
}

export function getApiDateRange(preset) {
  const { from, to } = getDateRange(preset);
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { date_from: fmt(from), date_to: fmt(to) };
}

export function formatDateRange(preset) {
  const { from, to } = getDateRange(preset);
  const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (preset === 'today' || preset === 'yesterday') return fmt(from);
  return `${fmt(from)} – ${fmt(to)}`;
}
