import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { ALL_BRANCHES, DAYS } from '../../lib/okr/constants';
import { weekRange } from '../../lib/okr/utils';
import { USE_MOCK, MOCK_WEEK, MOCK_RECORDS } from '../../lib/okr/mock';
import { apiFetch } from '../../lib/api';

// ─── helpers ────────────────────────────────────────────────────────────────

function localYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function toWednesday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localYMD(d);
}
function thisWeekWed() {
  return toWednesday(localYMD(new Date()));
}

function smartDay(records) {
  if (USE_MOCK || !records.length) return 'wed';
  for (const { key } of DAYS) {
    const filled = records.some(r =>
      (r[`${key}_attended`] || 0) + (r[`${key}_absent`] || 0) +
      (r[`${key}_frozen`]   || 0) + (r[`${key}_replaced`] || 0) > 0
    );
    if (!filled) return key;
  }
  return 'sun';
}

const n = v => parseInt(v) || 0;

const AONE_DAY_MAP = {
  wednesday: 'wed', wed: 'wed',
  thursday: 'thu',  thu: 'thu',
  friday: 'fri',    fri: 'fri',
  saturday: 'sat',  sat: 'sat',
  sunday: 'sun',    sun: 'sun',
};
const AONE_STATUS = new Set(['attended', 'absent', 'frozen', 'replaced']);
const DAY_OFFSET: Record<string, number> = { wed: 0, thu: 1, fri: 2, sat: 3, sun: 4 };

// ─── AOne Excel parser ───────────────────────────────────────────────────────
// Reads the raw AOne attendance export (one row per student per lesson)
// and counts attended/absent/frozen/replaced per day of the week.

function parseAoneExport(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!raw.length) { reject(new Error('File is empty')); return; }

        const keys = Object.keys(raw[0]);
        const colStatus = keys.find(k => k.toLowerCase().includes('attendance status'));
        const colDay    = keys.find(k => k.toLowerCase() === 'day');

        if (!colStatus || !colDay) {
          reject(new Error('Cannot find "Attendance Status" or "Day" column — make sure this is an AOne attendance export'));
          return;
        }

        const counts = Object.fromEntries(
          DAYS.map(({ key }) => [key, { absent: 0, attended: 0, frozen: 0, replaced: 0 }])
        );

        raw.forEach(row => {
          const status = String(row[colStatus] ?? '').toLowerCase().trim();
          const dayKey = AONE_DAY_MAP[String(row[colDay] ?? '').toLowerCase().trim()];
          if (dayKey && AONE_STATUS.has(status)) counts[dayKey][status]++;
        });

        resolve({ counts, totalRows: raw.length });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Component ───────────────────────────────────────────────────────────────
// filterBranch: pass user's branch name when RBAC is live — restricts table to that branch only

export function DailyBulkEntry({ filterBranch = null }) {
  const qc           = useQueryClient();
  const fileInputRef = useRef(null);

  const [weekDate, setWeekDate]         = useState(USE_MOCK ? MOCK_WEEK : thisWeekWed());
  const [day, setDay]                   = useState('wed');
  const smartDayDoneRef = useRef(false); // prevent refetches from resetting the active tab
  const [rows, setRows]                 = useState({});
  const [isSaving, setIsSaving]         = useState(false);
  const [saveStatus, setSaveStatus]     = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isUploading, setIsUploading]   = useState(false);
  // Which branch the uploaded file belongs to (admin picks; RBAC auto-uses filterBranch)
  const [uploadBranch, setUploadBranch] = useState(ALL_BRANCHES[0]);

  const visibleBranches = filterBranch
    ? ALL_BRANCHES.filter(b => b === filterBranch)
    : ALL_BRANCHES;

  const { data } = useQuery({
    queryKey: ['okr-week', weekDate],
    queryFn: () => USE_MOCK
      ? { records: MOCK_RECORDS }
      : apiFetch(`/api/okr-attendance?week_date=${weekDate}&limit=100`),
    enabled: !!weekDate,
  });
  const weekRecords = data?.records ?? [];

  // Reset smart-day tracking whenever the user picks a new week
  useEffect(() => { smartDayDoneRef.current = false; setDay('wed'); }, [weekDate]);

  // Run smart day only once per week (when data first loads), ignore background refetches
  useEffect(() => {
    if (!smartDayDoneRef.current && weekRecords.length > 0) {
      smartDayDoneRef.current = true;
      setDay(smartDay(weekRecords));
    }
  }, [weekRecords]);

  // Pre-fill all 5 days from saved DB data whenever week changes
  useEffect(() => {
    const r = {};
    ALL_BRANCHES.forEach(b => {
      const rec = weekRecords.find(x => x.branch === b);
      r[b] = {};
      DAYS.forEach(({ key }) => {
        r[b][key] = {
          absent:   String(rec?.[`${key}_absent`]   ?? ''),
          attended: String(rec?.[`${key}_attended`] ?? ''),
          frozen:   String(rec?.[`${key}_frozen`]   ?? ''),
          replaced: String(rec?.[`${key}_replaced`] ?? ''),
        };
      });
    });
    setRows(r);
  }, [weekRecords]);

  const cell = (branch, dayKey, field, val) =>
    setRows(p => ({
      ...p,
      [branch]: { ...p[branch], [dayKey]: { ...p[branch]?.[dayKey], [field]: val } },
    }));

  // ── Upload handler ──
  // Branch selects their date, picks their branch (admin) or auto-assigned (RBAC),
  // uploads AOne file → system counts all 5 days → fills this branch's rows
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(null);
    const targetBranch = filterBranch ?? uploadBranch;

    try {
      const { counts, totalRows } = await parseAoneExport(file);

      setRows(prev => ({
        ...prev,
        [targetBranch]: Object.fromEntries(
          DAYS.map(({ key }) => [key, {
            absent:   String(counts[key].absent),
            attended: String(counts[key].attended),
            frozen:   String(counts[key].frozen),
            replaced: String(counts[key].replaced),
          }])
        ),
      }));

      // Auto-switch to the first day that has data
      const firstDataDay = DAYS.find(d => Object.values(counts[d.key]).some(v => v > 0));
      if (firstDataDay) setDay(firstDataDay.key);

      const summary = DAYS
        .filter(d => Object.values(counts[d.key]).some(v => v > 0))
        .map(({ key, label }) =>
          `${label}: ${counts[key].attended} attended, ${counts[key].absent} absent, ${counts[key].frozen} frozen, ${counts[key].replaced} replaced`
        ).join(' · ');

      setUploadStatus({
        type: 'ok',
        msg: `${targetBranch} — ${totalRows} student rows read. ${summary || 'No data found for Wed–Sun.'}`,
      });
    } catch (err) {
      setUploadStatus({ type: 'error', msg: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  // ── Save ──
  const handleSave = async () => {
    if (!weekDate) return;
    setIsSaving(true);
    setSaveStatus(null);

    const payloads = ALL_BRANCHES.map(b => {
      const ex = weekRecords.find(r => r.branch === b) || {};
      const payload = {
        branch: b, week_date: weekDate,
        not_enrolled:             ex.not_enrolled             ?? 0,
        outstanding_invoice_disc: ex.outstanding_invoice_disc ?? 0,
        expired_package:          ex.expired_package          ?? 0,
        newly_enrolled:           ex.newly_enrolled           ?? 0,
        partially_paid_unpaid:    ex.partially_paid_unpaid    ?? 0,
        active_students:          ex.active_students          ?? 0,
        outstanding_invoice_pct:  ex.outstanding_invoice_pct  ?? 0,
      };
      DAYS.forEach(({ key }) => {
        ['absent', 'attended', 'frozen', 'replaced'].forEach(f => {
          const cellVal = rows[b]?.[key]?.[f];
          payload[`${key}_${f}`] = (cellVal !== '' && cellVal !== undefined)
            ? n(cellVal)
            : (ex[`${key}_${f}`] ?? 0);
        });
      });
      return payload;
    });

    try {
      if (USE_MOCK) {
        await new Promise(r => setTimeout(r, 700));
      } else {
        await Promise.all(payloads.map(p =>
          apiFetch('/api/okr-attendance', { method: 'POST', body: p })
        ));
      }
      qc.invalidateQueries({ queryKey: ['okr-week'] });
      qc.invalidateQueries({ queryKey: ['okr-list'] });
      qc.invalidateQueries({ queryKey: ['okr-dash'] });
      setSaveStatus('ok');
    } catch {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus(null), 4000);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="okrDailyBulk">

      {/* Step 1: Select week */}
      <div className="okrDailyBulkControls">
        <div className="formGroup">
          <label>Week</label>
          <input type="date" value={weekDate}
            onChange={e => setWeekDate(toWednesday(e.target.value))} />
          {weekDate && (() => {
            const d = new Date(weekDate + 'T00:00:00');
            d.setDate(d.getDate() + (DAY_OFFSET[day] ?? 0));
            const dayLabel = DAYS.find(x => x.key === day)?.label ?? '';
            const dayDate = `${d.getDate()}/${d.getMonth() + 1}`;
            return <div className="okrWeekRangePill">{weekRange(weekDate)} · {dayLabel} {dayDate}</div>;
          })()}
        </div>
        <div className="formGroup">
          <label>View Day</label>
          <div className="okrDayTabs">
            {DAYS.map(d => (
              <button key={d.key} type="button"
                className={`okrDayTab${day === d.key ? ' okrDayTabActive' : ''}`}
                onClick={() => setDay(d.key)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Step 2: Upload AOne file */}
      <div className="okrUploadSection">
        <div className="okrUploadSectionTitle">
          Upload AOne Attendance Export
          <span className="okrUploadHint"> — auto-fills all 5 days for the selected branch</span>
        </div>
        <div className="okrExcelBar">
          {/* Branch picker — hidden in RBAC mode (filterBranch is set) */}
          {!filterBranch && (
            <div className="okrUploadBranchSelect">
              <label>Branch</label>
              <select value={uploadBranch} onChange={e => setUploadBranch(e.target.value)}>
                {ALL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }} onChange={handleUpload} />
          <button type="button" className="okrExcelBtn okrExcelBtnUpload"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}>
            {isUploading ? '⏳ Reading file...' : '📂 Upload AOne File'}
          </button>
        </div>

        {uploadStatus && (
          <div className={`okrExcelStatusBar okrExcelStatus${uploadStatus.type === 'ok' ? 'Ok' : 'Err'}`}>
            {uploadStatus.type === 'ok' ? '✅' : '❌'} {uploadStatus.msg}
          </div>
        )}
      </div>

      {/* RBAC notice */}
      {filterBranch && (
        <div className="okrRbacNotice">
          Your branch: <strong>{filterBranch}</strong>
        </div>
      )}

      {/* Step 3: Review table (shows selected day) */}
      <div className="okrBulkTableWrap">
        <div className="okrBulkTable">
          <div className="okrBulkHead">
            <span>Branch</span>
            <span>Absent</span>
            <span>Attended</span>
            <span>Frozen</span>
            <span>Replaced</span>
          </div>
          {visibleBranches.map((b, i) => (
            <div key={b} className={`okrBulkRow${i % 2 === 0 ? ' okrBulkRowAlt' : ''}`}>
              <span className="okrBulkBranch">{b}</span>
              {['absent', 'attended', 'frozen', 'replaced'].map(f => (
                <input key={f} type="number" min="0" placeholder="0"
                  value={rows[b]?.[day]?.[f] ?? ''}
                  onChange={e => cell(b, day, f, e.target.value)} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Step 4: Save */}
      <div className="okrSaveRow">
        <button type="button" className="okrSaveBtn"
          onClick={handleSave} disabled={isSaving || !weekDate}>
          {isSaving ? 'Saving...' : `✓ Save ${filterBranch ? '1 Branch' : `All ${visibleBranches.length} Branches`}`}
        </button>
        {saveStatus === 'ok'    && <div className="okrSaveStatus okrSaveStatusOk">✅ Saved!</div>}
        {saveStatus === 'error' && <div className="okrSaveStatus okrSaveStatusErr">❌ Save failed — check backend.</div>}
      </div>
    </div>
  );
}
