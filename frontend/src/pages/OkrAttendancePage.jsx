import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

// ── MOCK DATA (set USE_MOCK=true to preview without backend) ──
const USE_MOCK = false;
const MOCK_WEEK = '2026-04-09';

export const REGIONS = {
  A: [
    { name: 'Rimbayu',       code: 'RBY' },
    { name: 'Klang',         code: 'KLG' },
    { name: 'Shah Alam',     code: 'SHA' },
    { name: 'Setia Alam',    code: 'SA'  },
    { name: 'Denai Alam',    code: 'DA'  },
    { name: 'Eco Grandeur',  code: 'EGR' },
    { name: 'Subang Taipan', code: 'ST'  },
  ],
  B: [
    { name: 'Danau Kota',             code: 'DK'   },
    { name: 'Kota Damansara',         code: 'KD'   },
    { name: 'Ampang',                 code: 'AMP'  },
    { name: 'Sri Petaling',           code: 'SP'   },
    { name: 'Bandar Tun Hussein Onn', code: 'BTHO' },
    { name: 'Kajang TTDI Groove',     code: 'KTG'  },
    { name: 'Taman Sri Gombak',       code: 'TSG'  },
  ],
  C: [
    { name: 'Putrajaya',              code: 'PJY' },
    { name: 'Kota Warisan',           code: 'KW'  },
    { name: 'Bandar Baru Bangi',      code: 'BBB' },
    { name: 'Cyberjaya',              code: 'CJY' },
    { name: 'Bandar Seri Putra',      code: 'BSP' },
    { name: 'Dataran Puchong Utama',  code: 'DPU' },
    { name: 'Online',                 code: 'ONL' },
  ],
};

// flat lookup: name → { code, region }
export const BRANCH_META = Object.entries(REGIONS).reduce((acc, [region, branches]) => {
  branches.forEach(b => { acc[b.name] = { code: b.code, region }; });
  return acc;
}, {});

const ALL_BRANCHES = Object.values(REGIONS).flat().map(b => b.name);

// lcg: deterministic pseudo-random per branch so every branch looks different
function lcg(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}
function makeMockRecord(branch, seed) {
  const rng = lcg(seed * 999 + 7);
  const r = (min, max) => Math.round(min + rng() * (max - min));
  // vary attendance profile: some branches perform well, some poorly
  const profile = seed % 3; // 0=strong, 1=average, 2=weak
  const attBase = profile === 0 ? [18, 24] : profile === 1 ? [12, 18] : [6, 13];
  const absBase = profile === 0 ? [1, 4]   : profile === 1 ? [3, 7]   : [6, 12];
  return {
    id: seed, branch, week_date: MOCK_WEEK,
    total_online_attendance: r(400, 650), online_conversion_rate: r(18, 45),
    avg_online_trial_pax: r(2, 7), total_onl_attendance: r(110, 210),
    wed_absent: r(0, 2),           wed_attended: r(0, 4),            wed_frozen: r(0, 1), wed_replaced: r(0, 1),
    thu_absent: r(0, 2),           thu_attended: r(0, 4),            thu_frozen: r(0, 1), thu_replaced: r(0, 1),
    fri_absent: r(absBase[0]-1, absBase[1]-1), fri_attended: r(attBase[0]-4, attBase[1]-4), fri_frozen: r(0, 2), fri_replaced: r(0, 2),
    sat_absent: r(absBase[0], absBase[1]+2),   sat_attended: r(attBase[0]+4, attBase[1]+8), sat_frozen: r(1, 3), sat_replaced: r(2, 5),
    sun_absent: r(absBase[0]-1, absBase[1]+1), sun_attended: r(attBase[0], attBase[1]+4),   sun_frozen: r(1, 3), sun_replaced: r(1, 4),
    not_enrolled: r(5, 18), outstanding_invoice_disc: r(15, 35),
    expired_package: r(6, 18), newly_enrolled: r(2, 10),
    pc_meetup_invited: r(8, 25), pc_meetup_showup: r(4, 18),
    outstanding_invoice_pct: parseFloat((r(8, 32) + rng() * 2).toFixed(2)),
    partially_paid_unpaid: r(12, 40), active_students: r(130, 220),
  };
}
const MOCK_RECORDS = ALL_BRANCHES.map((b, i) => makeMockRecord(b, i + 1));

const DAYS = [
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const EMPTY_FORM = {
  branch: '', week_date: '',
  total_online_attendance: '', online_conversion_rate: '',
  avg_online_trial_pax: '', total_onl_attendance: '',
  wed_absent: '', wed_attended: '', wed_frozen: '', wed_replaced: '',
  thu_absent: '', thu_attended: '', thu_frozen: '', thu_replaced: '',
  fri_absent: '', fri_attended: '', fri_frozen: '', fri_replaced: '',
  sat_absent: '', sat_attended: '', sat_frozen: '', sat_replaced: '',
  sun_absent: '', sun_attended: '', sun_frozen: '', sun_replaced: '',
  not_enrolled: '', outstanding_invoice_disc: '',
  expired_package: '', newly_enrolled: '',
  pc_meetup_invited: '', pc_meetup_showup: '',
  outstanding_invoice_pct: '', partially_paid_unpaid: '', active_students: '',
};

function n(val) { const v = parseFloat(val); return isNaN(v) ? 0 : v; }

// Format a Wednesday date string into "D/M – D/M" week range (Wed to Tue)
function weekRange(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  return `${d.getDate()}/${d.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}`;
}

// Subtract n weeks from a date string, return YYYY-MM-DD
function prevWeekDate(dateStr, weeksBack = 1) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - weeksBack * 7);
  return d.toISOString().slice(0, 10);
}

// Generate mock records for a different week with slight variation
function getMockWeekRecords(week_date, shiftSeed = 1) {
  return ALL_BRANCHES.map((_b, i) => {
    const base = MOCK_RECORDS[i];
    const rng = lcg((i + 1) * 997 + shiftSeed * 41);
    const vary = (val, range) => Math.max(0, Math.round(n(val) + (rng() - 0.5) * range));
    return {
      ...base,
      id: base.id + shiftSeed * 100,
      week_date,
      wed_attended: vary(base.wed_attended, 2),  wed_absent: vary(base.wed_absent, 1),
      thu_attended: vary(base.thu_attended, 4),  thu_absent: vary(base.thu_absent, 3),
      fri_attended: vary(base.fri_attended, 6),  fri_absent: vary(base.fri_absent, 4),
      sat_attended: vary(base.sat_attended, 8),  sat_absent: vary(base.sat_absent, 5),
      sun_attended: vary(base.sun_attended, 6),  sun_absent: vary(base.sun_absent, 4),
      total_onl_attendance: vary(base.total_onl_attendance, 15),
      active_students: vary(base.active_students, 5),
      outstanding_invoice_pct: parseFloat(Math.max(0, n(base.outstanding_invoice_pct) + (rng() - 0.5) * 4).toFixed(2)),
      pc_meetup_invited: vary(base.pc_meetup_invited, 4),
      pc_meetup_showup: vary(base.pc_meetup_showup, 4),
    };
  });
}

// Parse tab-separated Excel paste (handles empty leading columns, flexible headers)
function parseExcelPaste(text) {
  const lines = text.trim().split(/\r?\n/).map(l => l.split('\t').map(c => c.trim()));

  const DAY_KEYS = { wed: 1, thu: 1, fri: 1, sat: 1, sun: 1 };

  // Partial-match patterns so "Absent", "Total Absent", "Abs" etc. all work
  const PATT = {
    absent:   /abs/i,
    attended: /att/i,
    replaced: /rep/i,
    frozen:   /fr(o|e)/i,   // frozen / freeze / fro
  };

  // ── Strategy A: header-based (preferred) ──
  const headerIdx = lines.findIndex(row =>
    row.some(c => c && Object.values(PATT).some(p => p.test(c)))
  );

  const fields = {};
  let totals = null;

  if (headerIdx !== -1) {
    const headers = lines[headerIdx];
    const col = {
      absent:   headers.findIndex(h => PATT.absent.test(h)),
      attended: headers.findIndex(h => PATT.attended.test(h)),
      replaced: headers.findIndex(h => PATT.replaced.test(h)),
      frozen:   headers.findIndex(h => PATT.frozen.test(h)),
    };

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const row = lines[i];
      let dayKey = null;
      for (let c = 0; c < Math.min(4, row.length); c++) {
        const candidate = row[c].toLowerCase().slice(0, 3);
        if (DAY_KEYS[candidate]) { dayKey = candidate; break; }
      }
      if (dayKey) {
        if (col.absent   >= 0) fields[`${dayKey}_absent`]   = row[col.absent]   || '0';
        if (col.attended >= 0) fields[`${dayKey}_attended`] = row[col.attended] || '0';
        if (col.replaced >= 0) fields[`${dayKey}_replaced`] = row[col.replaced] || '0';
        if (col.frozen   >= 0) fields[`${dayKey}_frozen`]   = row[col.frozen]   || '0';
      } else {
        // Totals row
        const hasNums = Object.values(col).some(ci => ci >= 0 && row[ci] && !isNaN(+row[ci]));
        if (hasNums) {
          totals = {
            absent:   col.absent   >= 0 ? (+row[col.absent]   || 0) : 0,
            attended: col.attended >= 0 ? (+row[col.attended] || 0) : 0,
            replaced: col.replaced >= 0 ? (+row[col.replaced] || 0) : 0,
            frozen:   col.frozen   >= 0 ? (+row[col.frozen]   || 0) : 0,
          };
          const nums = row.filter(c => c !== '' && !isNaN(+c)).map(Number);
          totals.grand = nums.length ? nums[nums.length - 1] : null;
        }
      }
    }
  } else {
    // ── Strategy B: no header — positional fallback ──
    // Assumes columns after the day label are: Absent, Attended, Replaced, Frozen
    for (const row of lines) {
      let dayKey = null;
      let dayColIdx = -1;
      for (let c = 0; c < Math.min(4, row.length); c++) {
        const candidate = row[c].toLowerCase().slice(0, 3);
        if (DAY_KEYS[candidate]) { dayKey = candidate; dayColIdx = c; break; }
      }
      if (!dayKey) continue;
      const nums = [];
      for (let c = dayColIdx + 1; c < row.length; c++) {
        if (row[c] !== '' && !isNaN(+row[c])) nums.push(+row[c]);
      }
      if (nums.length >= 2) {
        fields[`${dayKey}_absent`]   = String(nums[0]);
        fields[`${dayKey}_attended`] = String(nums[1]);
        fields[`${dayKey}_replaced`] = String(nums[2] ?? 0);
        fields[`${dayKey}_frozen`]   = String(nums[3] ?? 0);
      }
    }
  }

  return Object.keys(fields).length > 0 ? { fields, totals } : null;
}

function calcMetrics(r) {
  const totalAttended = DAYS.reduce((s, d) => s + n(r[`${d.key}_attended`]), 0);
  const totalAbsent   = DAYS.reduce((s, d) => s + n(r[`${d.key}_absent`]), 0);
  const totalFrozen   = DAYS.reduce((s, d) => s + n(r[`${d.key}_frozen`]), 0);
  const totalReplaced = DAYS.reduce((s, d) => s + n(r[`${d.key}_replaced`]), 0);

  // Excel: =SUM(KD23:KD34) → absent + attended + frozen + replaced
  const totalAttendance = totalAbsent + totalAttended + totalFrozen + totalReplaced;

  // Excel: =SUM(KD28:KD32) / (SUM(KD28:KD32) + SUM(KD23:KD27))
  // → attended / (attended + absent)
  const attendanceRate = (totalAttended + totalAbsent) > 0
    ? (totalAttended / (totalAttended + totalAbsent)) * 100 : 0;

  // Excel: =SUM(KD29:KD32) / SUM(KD24:KD34)
  // Numerator   = Thu–Sun attended = total_attended - wed_attended
  // Denominator = Thu–Sun absent + ALL attended + frozen + replaced
  //             = total_attendance - wed_absent
  const wedAttended = n(r.wed_attended);
  const wedAbsent   = n(r.wed_absent);
  const rateWithFreezeNum = totalAttended - wedAttended;
  const rateWithFreezeDen = totalAttendance - wedAbsent;
  const attendanceRateWithFreeze = rateWithFreezeDen > 0
    ? (rateWithFreezeNum / rateWithFreezeDen) * 100 : 0;

  // Discrepancy = Active Students (AOne) − Total Mastercopy Attendance
  // Formula: =KE49-KE35 → active_students - totalAttendance
  const discrepancy = n(r.active_students) - totalAttendance;
  const totalDisc = n(r.not_enrolled) + n(r.outstanding_invoice_disc) + n(r.expired_package) + n(r.newly_enrolled);
  // Remaining = Discrepancy − Total Discrepancy (auto)
  const remainingDisc = discrepancy - totalDisc;

  // Outstanding Invoice % = (Partially Paid + Unpaid) / Active Students × 100
  const outstandingInvoicePct = n(r.active_students) > 0
    ? parseFloat(((n(r.partially_paid_unpaid) / n(r.active_students)) * 100).toFixed(2))
    : 0;

  return { totalAttended, totalAbsent, totalFrozen, totalReplaced, totalAttendance, attendanceRate, attendanceRateWithFreeze, discrepancy, totalDisc, remainingDisc, outstandingInvoicePct };
}

function getRateColor(rate) {
  if (rate >= 85) return 'var(--success)';
  if (rate >= 75) return 'var(--warning)';
  return 'var(--brand)';
}

function RateBar({ value, max = 100 }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = getRateColor(value);
  return (
    <div className="okrRateBarWrap">
      <div className="okrRateBar" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function OkrAttendancePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashBranch, setDashBranch] = useState('');
  const [dashWeek, setDashWeek] = useState(USE_MOCK ? MOCK_WEEK : '');
  const [filterBranch, setFilterBranch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');

  const { data: branchesData } = useQuery({
    queryKey: ['okr-branches'],
    queryFn: () => USE_MOCK ? { branches: ALL_BRANCHES } : apiFetch('/api/okr-attendance/branches'),
  });
  const branches = branchesData?.branches ?? [];

  // All records for selected week (for rankings)
  const { data: weekData } = useQuery({
    queryKey: ['okr-week', dashWeek],
    queryFn: () => USE_MOCK ? { records: MOCK_RECORDS } : apiFetch(`/api/okr-attendance?week_date=${dashWeek}&limit=100`),
    enabled: USE_MOCK || !!dashWeek,
  });
  const weekRecords = weekData?.records ?? [];

  // Previous 2 weeks for trend comparison
  const week1Date = prevWeekDate(dashWeek, 1);
  const week2Date = prevWeekDate(dashWeek, 2);

  const { data: week1Data } = useQuery({
    queryKey: ['okr-week', week1Date],
    queryFn: () => USE_MOCK ? { records: getMockWeekRecords(week1Date, 1) } : apiFetch(`/api/okr-attendance?week_date=${week1Date}&limit=100`),
    enabled: USE_MOCK ? !!week1Date : !!week1Date,
  });
  const week1Records = week1Data?.records ?? [];

  const { data: week2Data } = useQuery({
    queryKey: ['okr-week', week2Date],
    queryFn: () => USE_MOCK ? { records: getMockWeekRecords(week2Date, 2) } : apiFetch(`/api/okr-attendance?week_date=${week2Date}&limit=100`),
    enabled: USE_MOCK ? !!week2Date : !!week2Date,
  });
  const week2Records = week2Data?.records ?? [];

  // Single branch record
  const { data: dashData } = useQuery({
    queryKey: ['okr-dash', dashBranch, dashWeek],
    queryFn: () => USE_MOCK
      ? { records: [MOCK_RECORDS.find(r => r.branch === dashBranch) ?? MOCK_RECORDS[0]] }
      : apiFetch(`/api/okr-attendance?branch=${encodeURIComponent(dashBranch)}&week_date=${dashWeek}&limit=1`),
    enabled: USE_MOCK ? !!dashBranch : !!dashBranch && !!dashWeek,
  });
  const dashRecord = dashData?.records?.[0] ?? null;

  // History list
  const { data: listData, isLoading } = useQuery({
    queryKey: ['okr-list', filterBranch],
    queryFn: () => USE_MOCK
      ? { records: filterBranch ? MOCK_RECORDS.filter(r => r.branch === filterBranch) : MOCK_RECORDS }
      : apiFetch(`/api/okr-attendance?${filterBranch ? `branch=${encodeURIComponent(filterBranch)}&` : ''}limit=50`),
  });
  const records = listData?.records ?? [];

  const [saveStatus, setSaveStatus] = useState(null); // null | 'ok' | 'error'
  const [showPcMeetup, setShowPcMeetup] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (body) => USE_MOCK
      ? new Promise(resolve => setTimeout(() => resolve({ ok: true }), 600))
      : apiFetch('/api/okr-attendance', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries(['okr-list']);
      queryClient.invalidateQueries(['okr-week']);
      queryClient.invalidateQueries(['okr-dash']);
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus(null), 4000);
      if (!USE_MOCK) resetForm();
    },
    onError: (e) => {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 6000);
      console.error('Save error:', e);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiFetch(`/api/okr-attendance/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries(['okr-list']),
  });

  const [pasteStatus, setPasteStatus]   = useState(null);   // null | 'ok' | 'error'
  const [pastePreview, setPastePreview] = useState(null);   // totals object
  const pasteTextareaRef = useRef(null);

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setPasteStatus(null); setPastePreview(null); };

  const handleChange = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handlePaste = (e) => {
    const text = e.clipboardData?.getData('text') || '';
    // Clear the hidden textarea so it stays empty
    setTimeout(() => { if (pasteTextareaRef.current) pasteTextareaRef.current.value = ''; }, 0);
    const parsed = parseExcelPaste(text);
    if (parsed) {
      setForm(p => ({ ...p, ...parsed.fields }));
      setPastePreview(parsed.totals);
      setPasteStatus('ok');
      setTimeout(() => setPasteStatus(null), 4000);
    } else {
      setPasteStatus('error');
      setPastePreview(null);
      setTimeout(() => setPasteStatus(null), 4000);
    }
    e.preventDefault();
  };

  const handleEdit = (rec) => {
    setForm({
      branch: rec.branch, week_date: rec.week_date?.slice(0, 10),
      total_online_attendance: rec.total_online_attendance ?? '',
      online_conversion_rate: rec.online_conversion_rate ?? '',
      avg_online_trial_pax: rec.avg_online_trial_pax ?? '',
      total_onl_attendance: rec.total_onl_attendance ?? '',
      wed_absent: rec.wed_absent ?? '', wed_attended: rec.wed_attended ?? '',
      wed_frozen: rec.wed_frozen ?? '', wed_replaced: rec.wed_replaced ?? '',
      thu_absent: rec.thu_absent ?? '', thu_attended: rec.thu_attended ?? '',
      thu_frozen: rec.thu_frozen ?? '', thu_replaced: rec.thu_replaced ?? '',
      fri_absent: rec.fri_absent ?? '', fri_attended: rec.fri_attended ?? '',
      fri_frozen: rec.fri_frozen ?? '', fri_replaced: rec.fri_replaced ?? '',
      sat_absent: rec.sat_absent ?? '', sat_attended: rec.sat_attended ?? '',
      sat_frozen: rec.sat_frozen ?? '', sat_replaced: rec.sat_replaced ?? '',
      sun_absent: rec.sun_absent ?? '', sun_attended: rec.sun_attended ?? '',
      sun_frozen: rec.sun_frozen ?? '', sun_replaced: rec.sun_replaced ?? '',
      not_enrolled: rec.not_enrolled ?? '',
      outstanding_invoice_disc: rec.outstanding_invoice_disc ?? '',
      expired_package: rec.expired_package ?? '',
      newly_enrolled: rec.newly_enrolled ?? '',
      pc_meetup_invited: rec.pc_meetup_invited ?? '',
      pc_meetup_showup: rec.pc_meetup_showup ?? '',
      outstanding_invoice_pct: rec.outstanding_invoice_pct ?? '',
      partially_paid_unpaid: rec.partially_paid_unpaid ?? '',
      active_students: rec.active_students ?? '',
    });
    setEditingId(rec.id);
    setActiveTab('entry');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.branch || !form.week_date) { alert('Branch and week date required'); return; }
    // Inject the auto-calculated outstanding_invoice_pct before saving
    const metrics = calcMetrics(form);
    saveMutation.mutate({ ...form, outstanding_invoice_pct: metrics.outstandingInvoicePct });
  };

  const liveMetrics = useMemo(() => calcMetrics(form), [form]);
  const dashMetrics = useMemo(() => dashRecord ? calcMetrics(dashRecord) : null, [dashRecord]);

  // Per-branch records for trend card
  const trendRec0 = dashRecord;
  const trendRec1 = useMemo(() => week1Records.find(r => r.branch === dashBranch) ?? null, [week1Records, dashBranch]);
  const trendRec2 = useMemo(() => week2Records.find(r => r.branch === dashBranch) ?? null, [week2Records, dashBranch]);

  // Rankings: filter by region then sort by attendanceRate
  const rankedRecords = useMemo(() => {
    return weekRecords
      .filter(r => !regionFilter || BRANCH_META[r.branch]?.region === regionFilter)
      .map(r => ({ ...r, _m: calcMetrics(r) }))
      .sort((a, b) => b._m.attendanceRate - a._m.attendanceRate);
  }, [weekRecords, regionFilter]);
  const top5 = rankedRecords.slice(0, 5);
  const bottom5 = rankedRecords.slice(-5).reverse();

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'entry',     label: 'Data Entry', icon: '✏️' },
    { id: 'history',   label: 'History',    icon: '📋' },
  ];

  return (
    <div className="okrPage">
      {/* Page header */}
      <div className="okrHero">
        <div className="okrHeroLeft">
          <BackButton />
          <div className="okrHeroText">
            <h1 className="okrHeroTitle">OKR Attendance</h1>
            <p className="okrHeroSub">Weekly student attendance tracking per branch</p>
          </div>
        </div>
        <div className="okrHeroControls">
          <div className="okrHeroSelect">
            <span className="okrSelectIcon">🏢</span>
            <select value={dashBranch} onChange={e => setDashBranch(e.target.value)}>
              <option value="">Select Branch</option>
              {Object.entries(REGIONS).map(([region, list]) => (
                <optgroup key={region} label={`Region ${region}`}>
                  {list.map(b => (
                    <option key={b.name} value={b.name}>{b.name} ({b.code})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="okrHeroSelect">
            <span className="okrSelectIcon">📅</span>
            <input type="date" value={dashWeek} onChange={e => setDashWeek(e.target.value)} placeholder="Week date" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="okrTabBar">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`okrTabBtn${activeTab === t.id ? ' okrTabBtnActive' : ''}`}
            onClick={() => {
              if (t.id === 'entry' && !editingId) resetForm();
              setActiveTab(t.id);
            }}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD TAB ── */}
      {activeTab === 'dashboard' && (
        <div className="okrDashWrap">
          {!dashWeek ? (
            <div className="okrEmptyHero">
              <div className="okrEmptyIcon">📅</div>
              <h3>Select a week date above</h3>
              <p>Choose a week to view rankings and branch performance</p>
            </div>
          ) : (
            <>
              {/* ── Rankings box: top 5 + bottom 5 ── */}
              {rankedRecords.length > 0 && (
                <div className="okrRankCard">
                  <div className="okrRankCardHeader">
                    <div>
                      <span className="okrRankCardTitle">Branch Rankings — Week of {dashWeek}</span>
                      <span className="okrRankBadge" style={{ marginLeft: 10 }}>{rankedRecords.length} branches</span>
                    </div>
                    <div className="okrRegionTabs">
                      {['', 'A', 'B', 'C'].map(r => (
                        <button
                          key={r}
                          className={`okrRegionTab${regionFilter === r ? ' okrRegionTabActive' : ''}`}
                          onClick={() => setRegionFilter(r)}
                        >
                          {r === '' ? 'All' : `Region ${r}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="okrRankGrid">
                    {/* Top 5 */}
                    <div className="okrRankHalf">
                      <div className="okrRankHalfTitle okrRankTop">
                        <span>🏆</span> Top 5 — Attendance Rate
                      </div>
                      {top5.map((r, i) => {
                        const meta = BRANCH_META[r.branch];
                        return (
                          <div
                            key={r.id}
                            className={`okrRankRow${dashBranch === r.branch ? ' okrRankRowActive' : ''}`}
                            onClick={() => setDashBranch(r.branch)}
                          >
                            <span className="okrRankPos okrRankPosTop">{i + 1}</span>
                            <div className="okrRankInfo">
                              <div className="okrRankBranchRow">
                                <span className="okrRankBranch">{r.branch}</span>
                                <span className="okrRankCode">{meta?.code}</span>
                                <span className={`okrRegionPill okrRegion${meta?.region}`}>R{meta?.region}</span>
                              </div>
                              <RateBar value={r._m.attendanceRate} />
                            </div>
                            <span className="okrRankPct" style={{ color: getRateColor(r._m.attendanceRate) }}>
                              {r._m.attendanceRate.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Divider */}
                    <div className="okrRankDivider" />
                    {/* Bottom 5 */}
                    <div className="okrRankHalf">
                      <div className="okrRankHalfTitle okrRankBot">
                        <span>📉</span> Bottom 5 — Needs Attention
                      </div>
                      {bottom5.map((r, i) => {
                        const meta = BRANCH_META[r.branch];
                        return (
                          <div
                            key={r.id}
                            className={`okrRankRow${dashBranch === r.branch ? ' okrRankRowActive' : ''}`}
                            onClick={() => setDashBranch(r.branch)}
                          >
                            <span className="okrRankPos okrRankPosBot">{rankedRecords.length - bottom5.length + i + 1}</span>
                            <div className="okrRankInfo">
                              <div className="okrRankBranchRow">
                                <span className="okrRankBranch">{r.branch}</span>
                                <span className="okrRankCode">{meta?.code}</span>
                                <span className={`okrRegionPill okrRegion${meta?.region}`}>R{meta?.region}</span>
                              </div>
                              <RateBar value={r._m.attendanceRate} />
                            </div>
                            <span className="okrRankPct" style={{ color: getRateColor(r._m.attendanceRate) }}>
                              {r._m.attendanceRate.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── All branches overview (default) or branch detail ── */}
              {!dashBranch ? (
                <AllBranchesGrid
                  records={rankedRecords}
                  onSelect={setDashBranch}
                />
              ) : !dashRecord ? (
                <div className="okrEmptyHero okrEmptySmall">
                  <div className="okrEmptyIcon">📭</div>
                  <h3>No data for {dashBranch}</h3>
                  <p>Add data via the <button className="okrInlineBtn" onClick={() => setActiveTab('entry')}>Data Entry</button> tab</p>
                </div>
              ) : (
                <>
                  <button className="okrBackToAll" onClick={() => setDashBranch('')}>
                    ← All Branches
                  </button>
                  <WeekTrendCard weeks={[
                    { date: week2Date, record: trendRec2, metrics: trendRec2 ? calcMetrics(trendRec2) : null },
                    { date: week1Date, record: trendRec1, metrics: trendRec1 ? calcMetrics(trendRec1) : null },
                    { date: dashWeek,  record: trendRec0, metrics: dashMetrics },
                  ]} />
                  <BranchDetailCard record={dashRecord} metrics={dashMetrics} />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── DATA ENTRY TAB ── */}
      {activeTab === 'entry' && (
        <form className="okrEntryForm" onSubmit={handleSubmit}>
          <div className="okrEntryHeader">
            <h2>{editingId ? '✏️ Edit Record' : '➕ New Record'}</h2>
            <div className="okrEntryHeaderBtns">
              <button
                type="button"
                className={`okrPcToggleBtn${showPcMeetup ? ' okrPcToggleBtnActive' : ''}`}
                onClick={() => setShowPcMeetup(v => !v)}
                title="Parent-Coach Meetup (coming soon)"
              >
                🤝 PC Meetup {showPcMeetup ? '▲' : '▼'}
              </button>
              <button type="button" className="okrClearBtn" onClick={resetForm}>✕ Clear</button>
              {editingId && <button type="button" className="btnSecondary" onClick={resetForm}>Cancel</button>}
            </div>
          </div>

          {/* Parent-Coach Meetup — hidden by default, for future use */}
          {showPcMeetup && (
            <div className="okrEntrySection okrPcMeetupSection">
              <div className="okrEntrySectionTitle">
                🤝 Parent-Coach Meetup
                <span className="okrPcComingSoon">Coming soon — hidden from main flow</span>
              </div>
              <div className="okrEntryGrid2" style={{ maxWidth: 360 }}>
                <div className="formGroup">
                  <label>Invited</label>
                  <input type="number" name="pc_meetup_invited" value={form.pc_meetup_invited} onChange={handleChange} min="0" placeholder="0" />
                </div>
                <div className="formGroup">
                  <label>Show Up</label>
                  <input type="number" name="pc_meetup_showup" value={form.pc_meetup_showup} onChange={handleChange} min="0" placeholder="0" />
                </div>
              </div>
            </div>
          )}

          {/* Branch + week */}
          <div className="okrEntrySection">
            <div className="okrEntrySectionTitle">Record Info</div>
            <div className="okrEntryGrid2">
              <div className="formGroup">
                <label>Branch *</label>
                <select name="branch" value={form.branch} onChange={handleChange} required>
                  <option value="">Select branch...</option>
                  {Object.entries(REGIONS).map(([region, list]) => (
                    <optgroup key={region} label={`Region ${region}`}>
                      {list.map(b => (
                        <option key={b.name} value={b.name}>{b.name} ({b.code})</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="formGroup">
                <label>Week Date (Wednesday) *</label>
                <input type="date" name="week_date" value={form.week_date} onChange={handleChange} required />
                {form.week_date && (
                  <div className="okrWeekRangePill">{weekRange(form.week_date)}</div>
                )}
              </div>
            </div>
          </div>

          {/* Daily */}
          <div className="okrEntrySection">
            <div className="okrEntrySectionTitle">
              Daily Attendance <span className="okrEntrySectionHint">from Mastercopy</span>
            </div>

            {/* Hidden textarea — receives Ctrl+V, fires onPaste reliably in all browsers */}
            <textarea
              ref={pasteTextareaRef}
              className="okrPasteTextarea"
              onPaste={handlePaste}
              aria-hidden="true"
              tabIndex={-1}
            />
            {/* Visible paste zone — clicking focuses the hidden textarea */}
            <div
              className={`okrPasteZone${pasteStatus === 'ok' ? ' okrPasteZoneOk' : pasteStatus === 'error' ? ' okrPasteZoneErr' : ''}`}
              onClick={() => pasteTextareaRef.current?.focus()}
              tabIndex={0}
              role="button"
              aria-label="Click then Ctrl+V to paste Excel data"
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') pasteTextareaRef.current?.focus(); }}
            >
              {pasteStatus === 'ok'
                ? '✅ Data pasted successfully — fields filled below'
                : pasteStatus === 'error'
                ? '❌ Could not read table — make sure to copy the full table including the header row (Absent / Attended / Replaced / Frozen)'
                : <><span className="okrPasteIcon">📋</span> Click here then <kbd>Ctrl+V</kbd> to paste your Mastercopy table — fields fill automatically</>
              }
            </div>

            {/* Paste preview: totals confirmation */}
            {pastePreview && (
              <div className="okrPastePreview">
                <span className="okrPastePreviewLabel">Pasted totals:</span>
                <div className="okrPastePreviewCols">
                  {[
                    { label: 'Absent',   val: pastePreview.absent   },
                    { label: 'Attended', val: pastePreview.attended  },
                    { label: 'Replaced', val: pastePreview.replaced  },
                    { label: 'Frozen',   val: pastePreview.frozen    },
                  ].map(c => (
                    <div key={c.label} className="okrPastePreviewCol">
                      <span>{c.label}</span>
                      <strong>{c.val ?? '—'}</strong>
                    </div>
                  ))}
                  {pastePreview.grand != null && (
                    <div className="okrPastePreviewCol okrPastePreviewTotal">
                      <span>Total</span>
                      <strong>{pastePreview.grand}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="okrDailyGrid">
              <div className="okrDailyGridHead">
                <span>Day</span><span>Absent</span><span>Attended</span><span>Frozen</span><span>Replaced</span>
              </div>
              {DAYS.map(d => (
                <div className="okrDailyGridRow" key={d.key}>
                  <span className="okrDailyLabel">{d.label}</span>
                  {['absent','attended','frozen','replaced'].map(col => (
                    <input key={col} type="number" name={`${d.key}_${col}`}
                      value={form[`${d.key}_${col}`]} onChange={handleChange} min="0" placeholder="0" />
                  ))}
                </div>
              ))}
              <div className="okrDailyGridTotals">
                <span>Totals</span>
                <span>{liveMetrics.totalAbsent}</span>
                <span>{liveMetrics.totalAttended}</span>
                <span>{liveMetrics.totalFrozen}</span>
                <span>{liveMetrics.totalReplaced}</span>
              </div>
            </div>
            {/* Live calc pills */}
            <div className="okrLivePills">
              <div className="okrLivePill">
                <span>Total Attendance</span>
                <strong>{liveMetrics.totalAttendance}</strong>
              </div>
              <div className="okrLivePill">
                <span>Attendance Rate</span>
                <strong style={{ color: getRateColor(liveMetrics.attendanceRate) }}>
                  {liveMetrics.attendanceRate.toFixed(1)}%
                </strong>
              </div>
              <div className="okrLivePill">
                <span>Rate w/ Freeze</span>
                <strong style={{ color: getRateColor(liveMetrics.attendanceRateWithFreeze) }}>
                  {liveMetrics.attendanceRateWithFreeze.toFixed(1)}%
                </strong>
              </div>
            </div>
          </div>

          {/* Discrepancy Breakdown */}
          <div className="okrEntrySection">
            <div className="okrEntrySectionTitle">Discrepancy Breakdown</div>

            {/* Auto-calculated result pills */}
            <div className="okrLivePills" style={{ marginBottom: 16 }}>
              <div className="okrLivePill">
                <span>Discrepancy</span>
                <strong style={{ color: liveMetrics.discrepancy < 0 ? 'var(--brand)' : liveMetrics.discrepancy === 0 ? 'var(--success)' : 'var(--info)' }}>
                  {liveMetrics.discrepancy}
                </strong>
              </div>
              <div className="okrLivePill">
                <span>Total Discrepancy</span>
                <strong>{liveMetrics.totalDisc}</strong>
              </div>
              <div className="okrLivePill">
                <span>Remaining Discrepancies</span>
                <strong style={{ color: liveMetrics.remainingDisc === 0 ? 'var(--success)' : 'var(--brand)' }}>
                  {liveMetrics.remainingDisc}
                </strong>
              </div>
            </div>

            {/* 1a – 1d manual inputs */}
            <div className="okrEntryGrid4">
              {[
                { name: 'not_enrolled',            label: '1a) Not Enrolled to Any Lesson' },
                { name: 'outstanding_invoice_disc', label: '1b) With Outstanding Invoice' },
                { name: 'expired_package',          label: '1c) Expired Package' },
                { name: 'newly_enrolled',           label: '1d) Newly Enrolled Student' },
              ].map(f => (
                <div className="formGroup" key={f.name}>
                  <label>{f.label}</label>
                  <input type="number" name={f.name} value={form[f.name]} onChange={handleChange} min="0" placeholder="0" />
                </div>
              ))}
            </div>

          </div>

          {/* Outstanding Invoices (AOne) */}
          <div className="okrEntrySection">
            <div className="okrEntrySectionTitle">
              Outstanding Invoices (AOne)
              <span className="okrEntrySectionHint">Target: 20–25%</span>
            </div>
            <div className="okrEntryGrid3">
              <div className="formGroup">
                <label>Partially Paid + Unpaid</label>
                <input type="number" name="partially_paid_unpaid" value={form.partially_paid_unpaid} onChange={handleChange} min="0" placeholder="0" />
              </div>
              <div className="formGroup">
                <label>Active Students</label>
                <input type="number" name="active_students" value={form.active_students} onChange={handleChange} min="0" placeholder="0" />
                <span className="okrFieldNote">Also used for Discrepancy</span>
              </div>
              <div className="formGroup">
                <label>Outstanding Invoice %</label>
                <div className={`okrAutoCalcBox${liveMetrics.outstandingInvoicePct > 25 ? ' okrAutoCalcBoxWarn' : liveMetrics.outstandingInvoicePct > 0 ? ' okrAutoCalcBoxOk' : ''}`}>
                  {liveMetrics.outstandingInvoicePct.toFixed(2)}%
                  <span className="okrAutoCalcBoxHint">Partially Paid ÷ Active × 100</span>
                </div>
              </div>
            </div>
          </div>

          <div className="okrSaveRow">
            <button type="submit" className="okrSaveBtn" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : (editingId ? '✓ Update Record' : '✓ Save Record')}
            </button>
            {saveStatus === 'ok' && (
              <div className="okrSaveStatus okrSaveStatusOk">✅ Saved successfully!</div>
            )}
            {saveStatus === 'error' && (
              <div className="okrSaveStatus okrSaveStatusErr">❌ Save failed — check that the database table exists (run SQL migration) and the backend is running.</div>
            )}
          </div>
        </form>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && (
        <div className="okrHistWrap">
          <div className="okrHistFilters">
            <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
              <option value="">All Branches</option>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          {isLoading ? <p className="okrHistLoading">Loading...</p>
            : records.length === 0 ? (
              <div className="okrEmptyHero">
                <div className="okrEmptyIcon">📭</div>
                <h3>No records yet</h3>
                <p>Add data via the Data Entry tab</p>
              </div>
            ) : (
              <div className="okrHistTable">
                <div className="okrHistHead">
                  <span>Branch</span><span>Week</span><span>Attendance</span>
                  <span>Rate</span><span>Rate w/ Freeze</span><span>Active</span><span>Actions</span>
                </div>
                {records.map(r => {
                  const m = calcMetrics(r);
                  return (
                    <div key={r.id} className="okrHistRow">
                      <span className="okrHistBranch">{r.branch}</span>
                      <span className="okrHistWeek">{weekRange(r.week_date?.slice(0, 10))}</span>
                      <span>{m.totalAttendance}</span>
                      <span style={{ color: getRateColor(m.attendanceRate), fontWeight: 600 }}>{m.attendanceRate.toFixed(1)}%</span>
                      <span style={{ color: getRateColor(m.attendanceRateWithFreeze), fontWeight: 600 }}>{m.attendanceRateWithFreeze.toFixed(1)}%</span>
                      <span>{r.active_students ?? '—'}</span>
                      <span className="okrHistActions">
                        <button className="okrActBtn okrActView" onClick={() => { setDashBranch(r.branch); setDashWeek(r.week_date?.slice(0,10)); setActiveTab('dashboard'); }}>View</button>
                        <button className="okrActBtn okrActEdit" onClick={() => handleEdit(r)}>Edit</button>
                        <button className="okrActBtn okrActDel" onClick={() => { if (confirm('Delete this record?')) deleteMutation.mutate(r.id); }}>Del</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      )}
    </div>
  );
}

/* ── 3-Week Trend Card ── */
function WeekTrendCard({ weeks }) {
  // weeks = [{ date, record, metrics }, ...] ordered oldest → newest (index 0 = 2 weeks ago)
  const rows = [
    {
      label: 'Attendance Rate',
      fmt: (m) => m ? `${m.attendanceRate.toFixed(1)}%` : '—',
      val: (m) => m?.attendanceRate ?? null,
      isRate: true,
    },
    {
      label: 'Rate w/ Freeze',
      fmt: (m) => m ? `${m.attendanceRateWithFreeze.toFixed(1)}%` : '—',
      val: (m) => m?.attendanceRateWithFreeze ?? null,
      isRate: true,
    },
    {
      label: 'Total Attendance',
      fmt: (m) => m ? String(m.totalAttendance) : '—',
      val: (m) => m?.totalAttendance ?? null,
      isRate: false,
    },
    {
      label: 'Total Attended',
      fmt: (m) => m ? String(m.totalAttended) : '—',
      val: (m) => m?.totalAttended ?? null,
      isRate: false,
    },
    {
      label: 'Active Students',
      fmt: (_m, r) => r ? (r.active_students ?? '—') : '—',
      val: (_m, r) => r ? n(r.active_students) : null,
      isRate: false,
    },
    {
      label: 'Outstanding Inv. %',
      fmt: (_m, r) => r ? `${parseFloat(r.outstanding_invoice_pct || 0).toFixed(1)}%` : '—',
      val: (_m, r) => r ? parseFloat(r.outstanding_invoice_pct || 0) : null,
      isRate: true,
      invertTrend: true, // lower is better
    },
    {
      label: 'Discrepancy',
      fmt: (m) => m ? String(m.discrepancy) : '—',
      val: (m) => m?.discrepancy ?? null,
      isRate: false,
    },
    {
      label: 'Remaining Disc.',
      fmt: (m) => m ? String(m.remainingDisc) : '—',
      val: (m) => m?.remainingDisc ?? null,
      isRate: false,
    },
  ];

  function trendIcon(prev, curr, invertTrend) {
    if (prev === null || curr === null) return <span className="okrTrendNeutral">—</span>;
    const diff = curr - prev;
    if (Math.abs(diff) < 0.5) return <span className="okrTrendNeutral">→</span>;
    const positive = invertTrend ? diff < 0 : diff > 0;
    return positive
      ? <span className="okrTrendUp">▲ {Math.abs(diff).toFixed(diff % 1 === 0 ? 0 : 1)}</span>
      : <span className="okrTrendDown">▼ {Math.abs(diff).toFixed(diff % 1 === 0 ? 0 : 1)}</span>;
  }

  return (
    <div className="okrTrendCard">
      <div className="okrTrendCardTitle">📅 3-Week Trend</div>
      <div className="okrTrendTable">
        {/* Header row */}
        <div className="okrTrendRow okrTrendHead">
          <span className="okrTrendMetric">Metric</span>
          {weeks.map((w, i) => (
            <span key={i} className="okrTrendWeekCol">
              <span className="okrTrendWeekLabel">{i === 2 ? 'This Week' : i === 1 ? 'Last Week' : '2 Wks Ago'}</span>
              <span className="okrTrendWeekDate">{weekRange(w.date)}</span>
            </span>
          ))}
          <span className="okrTrendWeekCol">Trend</span>
        </div>
        {/* Data rows */}
        {rows.map(row => {
          const vals = weeks.map(w => ({ m: w.metrics, r: w.record }));
          return (
            <div key={row.label} className="okrTrendRow">
              <span className="okrTrendMetric">{row.label}</span>
              {vals.map((v, i) => {
                const rawVal = row.val(v.m, v.r);
                const color = row.isRate && rawVal !== null
                  ? (row.invertTrend
                      ? (rawVal <= 25 ? 'var(--success)' : 'var(--brand)')
                      : getRateColor(rawVal))
                  : 'var(--text)';
                return (
                  <span key={i} className="okrTrendWeekCol" style={{ color, fontWeight: i === 2 ? 700 : 400 }}>
                    {row.fmt(v.m, v.r)}
                  </span>
                );
              })}
              <span className="okrTrendWeekCol">
                {trendIcon(
                  row.val(vals[1]?.m, vals[1]?.r),
                  row.val(vals[2]?.m, vals[2]?.r),
                  row.invertTrend
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Branch Detail Card ── */
function BranchDetailCard({ record: r, metrics: m }) {
  const fp = (v, d = 1) => `${parseFloat(v || 0).toFixed(d)}%`;

  const kpis = [
    { label: 'Total Attendance',   value: m.totalAttendance,   unit: '',    color: 'var(--info)' },
    { label: 'Attendance Rate',    value: fp(m.attendanceRate, 2), unit: '',color: getRateColor(m.attendanceRate) },
    { label: 'Rate w/ Freeze',     value: fp(m.attendanceRateWithFreeze, 2), unit: '', color: getRateColor(m.attendanceRateWithFreeze) },
    { label: 'Active Students',    value: r.active_students ?? '—', unit: '', color: 'var(--text)' },
    { label: 'Outstanding Inv.',   value: fp(r.outstanding_invoice_pct, 2), unit: 'Target 20–25%', color: parseFloat(r.outstanding_invoice_pct) <= 25 ? 'var(--success)' : 'var(--brand)' },
    { label: 'Total ONL Attend.',  value: r.total_onl_attendance ?? 0, unit: '', color: 'var(--text)' },
  ];

  return (
    <div className="okrDetailCard">
      {/* Header */}
      <div className="okrDetailHeader">
        <div className="okrDetailHeaderLeft">
          <div className="okrDetailBranchIcon">🏢</div>
          <div>
            <h2 className="okrDetailBranch">{r.branch}</h2>
            <span className="okrDetailWeek">Week of {weekRange(r.week_date?.slice(0, 10))}</span>
          </div>
        </div>
        <div className="okrDetailHeaderRight">
          <div className="okrDetailBigRate">
            <span className="okrDetailBigRateNum" style={{ color: getRateColor(m.attendanceRate) }}>
              {m.attendanceRate.toFixed(1)}%
            </span>
            <span className="okrDetailBigRateLabel">Attendance Rate</span>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="okrKpiRow">
        {kpis.map(k => (
          <div className="okrKpi" key={k.label}>
            <span className="okrKpiLabel">{k.label}</span>
            <span className="okrKpiValue" style={{ color: k.color }}>{k.value}</span>
            {k.unit && <span className="okrKpiUnit">{k.unit}</span>}
          </div>
        ))}
      </div>

      <div className="okrDetailBody">
        {/* Daily breakdown */}
        <div className="okrDetailSection okrDetailSectionWide">
          <div className="okrDetailSectionTitle">📆 Daily Attendance</div>
          <div className="okrDailyLayout">
            {/* Table */}
            <div className="okrDayBreakTable">
              <div className="okrDayBreakHead">
                <span>Day</span><span>Absent</span><span>Attended</span><span>Frozen</span><span>Replaced</span>
              </div>
              {DAYS.map(d => (
                <div className="okrDayBreakRow" key={d.key}>
                  <span className="okrDayBreakDay">{d.label}</span>
                  <span className="okrDayBreakAbsent">{r[`${d.key}_absent`]}</span>
                  <span className="okrDayBreakAttend">{r[`${d.key}_attended`]}</span>
                  <span className="okrDayBreakFrozen">{r[`${d.key}_frozen`]}</span>
                  <span className="okrDayBreakReplace">{r[`${d.key}_replaced`]}</span>
                </div>
              ))}
              <div className="okrDayBreakTotals">
                <span>Total</span>
                <span>{m.totalAbsent}</span>
                <span>{m.totalAttended}</span>
                <span>{m.totalFrozen}</span>
                <span>{m.totalReplaced}</span>
              </div>
            </div>
            {/* Chart */}
            <DailyChart record={r} />
          </div>
        </div>

        {/* Attendance rates visual */}
        <div className="okrDetailSection">
          <div className="okrDetailSectionTitle">📈 Attendance Rate</div>
          <div className="okrRateVisual">
            <div className="okrRateVisualItem">
              <div className="okrRateVisualLabel">Standard Rate</div>
              <div className="okrRateVisualValue" style={{ color: getRateColor(m.attendanceRate) }}>
                {m.attendanceRate.toFixed(2)}%
              </div>
              <RateBar value={m.attendanceRate} />
              <div className="okrRateFormula">attended ÷ (attended + absent)</div>
            </div>
            <div className="okrRateVisualItem">
              <div className="okrRateVisualLabel">Rate WITH FREEZE</div>
              <div className="okrRateVisualValue" style={{ color: getRateColor(m.attendanceRateWithFreeze) }}>
                {m.attendanceRateWithFreeze.toFixed(2)}%
              </div>
              <RateBar value={m.attendanceRateWithFreeze} />
              <div className="okrRateFormula">(attended + frozen) ÷ (attended + frozen + absent)</div>
            </div>
          </div>
        </div>

        {/* Online */}
        <div className="okrDetailSection">
          <div className="okrDetailSectionTitle">🌐 Online Attendance</div>
          <div className="okrInfoList">
            <div className="okrInfoRow"><span>Total Online Attendance</span><strong>{r.total_online_attendance}</strong></div>
            <div className="okrInfoRow"><span>Conversion Rate</span><strong>{fp(r.online_conversion_rate, 1)}</strong></div>
            <div className="okrInfoRow"><span>Avg Trial Class Pax</span><strong>{r.avg_online_trial_pax}</strong></div>
            <div className="okrInfoRow okrInfoRowBold"><span>Total ONL Attendance</span><strong>{r.total_onl_attendance}</strong></div>
          </div>
        </div>

        {/* Discrepancy */}
        <div className="okrDetailSection">
          <div className="okrDetailSectionTitle">⚠️ Discrepancy</div>
          <div className="okrInfoList">
            <div className="okrInfoRow"><span>Discrepancy (Total – ONL)</span><strong>{m.discrepancy}</strong></div>
            <div className="okrInfoRow okrInfoRowSub"><span>1a) Not Enrolled</span><span>{r.not_enrolled}</span></div>
            <div className="okrInfoRow okrInfoRowSub"><span>1b) Outstanding Invoice</span><span>{r.outstanding_invoice_disc}</span></div>
            <div className="okrInfoRow okrInfoRowSub"><span>1c) Expired Package</span><span>{r.expired_package}</span></div>
            <div className="okrInfoRow okrInfoRowSub"><span>1d) Newly Enrolled</span><span>{r.newly_enrolled}</span></div>
            <div className="okrInfoRow okrInfoRowBold"><span>Total Discrepancy</span><strong>{m.totalDisc}</strong></div>
            <div className="okrInfoRow okrInfoRowBold">
              <span>Remaining</span>
              <strong style={{ color: m.remainingDisc === 0 ? 'var(--success)' : 'var(--brand)' }}>{m.remainingDisc}</strong>
            </div>
          </div>
        </div>

        {/* Parent-Coach */}
        <div className="okrDetailSection">
          <div className="okrDetailSectionTitle">🤝 Parent-Coach Meetup</div>
          <div className="okrMeetupWrap">
            <div className="okrMeetupStat">
              <span className="okrMeetupNum">{r.pc_meetup_invited ?? 0}</span>
              <span className="okrMeetupLabel">Invited</span>
            </div>
            <div className="okrMeetupArrow">→</div>
            <div className="okrMeetupStat">
              <span className="okrMeetupNum" style={{ color: 'var(--success)' }}>{r.pc_meetup_showup ?? 0}</span>
              <span className="okrMeetupLabel">Showed Up</span>
            </div>
            {n(r.pc_meetup_invited) > 0 && (
              <>
                <div className="okrMeetupArrow">=</div>
                <div className="okrMeetupStat">
                  <span className="okrMeetupNum" style={{ color: 'var(--info)' }}>
                    {((n(r.pc_meetup_showup) / n(r.pc_meetup_invited)) * 100).toFixed(0)}%
                  </span>
                  <span className="okrMeetupLabel">Show-up Rate</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Outstanding Invoices */}
        <div className="okrDetailSection">
          <div className="okrDetailSectionTitle">💰 Outstanding Invoices (AOne)</div>
          <div className="okrInvoiceWrap">
            <div className="okrInvoiceTarget">Target: 20–25%</div>
            <div className="okrInvoicePct" style={{ color: parseFloat(r.outstanding_invoice_pct) <= 25 ? 'var(--success)' : 'var(--brand)' }}>
              {fp(r.outstanding_invoice_pct, 2)}
            </div>
            <RateBar value={parseFloat(r.outstanding_invoice_pct || 0)} max={50} />
            <div className="okrInfoList" style={{ marginTop: 12 }}>
              <div className="okrInfoRow"><span>Partially Paid + Unpaid</span><strong>{r.partially_paid_unpaid}</strong></div>
              <div className="okrInfoRow"><span>Active Students</span><strong>{r.active_students}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Daily Attendance Bar Chart ── */
function DailyChart({ record: r }) {
  const data = DAYS.map(d => ({
    day: d.label,
    Attended:  n(r[`${d.key}_attended`]),
    Absent:    n(r[`${d.key}_absent`]),
    Frozen:    n(r[`${d.key}_frozen`]),
    Replaced:  n(r[`${d.key}_replaced`]),
  }));

  const COLORS = {
    Attended: '#059669',
    Absent:   '#dc2626',
    Frozen:   '#0284c7',
    Replaced: '#d97706',
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="okrChartTooltip">
        <div className="okrChartTooltipTitle">{label}</div>
        {payload.map(p => (
          <div key={p.name} className="okrChartTooltipRow">
            <span className="okrChartTooltipDot" style={{ background: p.fill }} />
            <span>{p.name}</span>
            <strong>{p.value}</strong>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="okrChartWrap">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 12, fontWeight: 700, fill: 'var(--textSecondary)' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            axisLine={false} tickLine={false} allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--borderLight)' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.78rem', paddingTop: 8 }} />
          <Bar dataKey="Attended" fill={COLORS.Attended} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="Absent"   fill={COLORS.Absent}   radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="Frozen"   fill={COLORS.Frozen}   radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="Replaced" fill={COLORS.Replaced} radius={[4, 4, 0, 0]} maxBarSize={26} />
          {/* Connected line showing attended trend across all days */}
          <Line
            dataKey="Attended"
            stroke={COLORS.Attended}
            strokeWidth={2.5}
            dot={{ r: 4, fill: COLORS.Attended, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6 }}
            type="monotone"
            legendType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── All Branches Overview Chart ── */
function AllBranchesGrid({ records, onSelect }) {
  if (!records.length) return (
    <div className="okrEmptyHero okrEmptySmall">
      <div className="okrEmptyIcon">📭</div>
      <h3>No data yet for this week</h3>
      <p>Add data via the Data Entry tab</p>
    </div>
  );

  const chartData = records.map(r => ({
    branch:   BRANCH_META[r.branch]?.code || r.branch,
    fullName: r.branch,
    region:   BRANCH_META[r.branch]?.region,
    Attended: r._m.totalAttended,
    Absent:   r._m.totalAbsent,
    Frozen:   r._m.totalFrozen,
    Replaced: r._m.totalReplaced,
    Rate:     parseFloat(r._m.attendanceRate.toFixed(1)),
  }));

  const COLORS = {
    Attended: '#059669',
    Absent:   '#dc2626',
    Frozen:   '#0284c7',
    Replaced: '#d97706',
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const entry = chartData.find(d => d.branch === label);
    return (
      <div className="okrChartTooltip">
        <div className="okrChartTooltipTitle">{entry?.fullName || label}</div>
        {payload.map(p => (
          <div key={p.name} className="okrChartTooltipRow">
            <span className="okrChartTooltipDot" style={{ background: p.fill || p.stroke }} />
            <span>{p.name}</span>
            <strong>{p.value}{p.name === 'Rate' ? '%' : ''}</strong>
          </div>
        ))}
      </div>
    );
  };

  const handleChartClick = (data) => {
    if (!data?.activeLabel) return;
    const entry = chartData.find(d => d.branch === data.activeLabel);
    if (entry) onSelect(entry.fullName);
  };

  // Chart needs a fixed wide width so all 21 branches fit without squashing
  const chartWidth = Math.max(960, records.length * 56);

  return (
    <div className="okrAllBranchWrap">
      <div className="okrAllBranchTitleRow">
        <span className="okrAllBranchTitle">All Branches — Attendance Overview</span>
        <span className="okrAllBranchHint">Click any bar to view branch details</span>
      </div>
      <div className="okrAllBranchChartScroll">
        <div style={{ width: chartWidth, minWidth: '100%' }}>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 20, left: -10, bottom: 48 }}
              barCategoryGap="22%"
              onClick={handleChartClick}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="branch"
                tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--textSecondary)' }}
                axisLine={false} tickLine={false}
                angle={-40} textAnchor="end" interval={0}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: 'var(--muted)' }}
                axisLine={false} tickLine={false} allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                axisLine={false} tickLine={false}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend
                iconType="circle" iconSize={8}
                wrapperStyle={{ fontSize: '0.78rem', paddingTop: 6 }}
              />
              <Bar yAxisId="left" dataKey="Attended" fill={COLORS.Attended} radius={[3,3,0,0]} maxBarSize={16} />
              <Bar yAxisId="left" dataKey="Absent"   fill={COLORS.Absent}   radius={[3,3,0,0]} maxBarSize={16} />
              <Bar yAxisId="left" dataKey="Frozen"   fill={COLORS.Frozen}   radius={[3,3,0,0]} maxBarSize={16} />
              <Bar yAxisId="left" dataKey="Replaced" fill={COLORS.Replaced} radius={[3,3,0,0]} maxBarSize={16} />
              <Line
                yAxisId="right"
                dataKey="Rate"
                name="Attend. Rate %"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                type="monotone"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
