import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { ALL_BRANCHES, DAYS } from '../../lib/okr/constants';
import { apiFetch } from '../../lib/api';
import { calcMetrics } from '../../lib/okr/utils';

const AONE_DAY_MAP: Record<string, string> = {
  wednesday: 'wed', wed: 'wed',
  thursday: 'thu',  thu: 'thu',
  friday: 'fri',    fri: 'fri',
  saturday: 'sat',  sat: 'sat',
  sunday: 'sun',    sun: 'sun',
};
const AONE_STATUS = new Set(['attended', 'absent', 'frozen', 'replaced']);
const INFER_DAY: Record<number, string> = { 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 0: 'sun' };

function localYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function toWednesday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localYMD(d);
}

function parseExcelDate(val: any): Date | null {
  if (val === '' || val == null) return null;
  if (typeof val === 'number') {
    // Excel serial date
    const info = XLSX.SSF.parse_date_code(val);
    if (info) return new Date(info.y, info.m - 1, info.d);
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

interface WeekEntry {
  week_date: string;
  branch: string;
  counts: Record<string, { absent: number; attended: number; frozen: number; replaced: number }>;
  rows: number;
}

function parseYearlyAone(file: File, branch: string): Promise<WeekEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result as ArrayBuffer, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];
        if (!raw.length) { reject(new Error('File is empty')); return; }

        const keys = Object.keys(raw[0]);
        const colStatus = keys.find(k => k.toLowerCase().includes('attendance status'));
        const colDay    = keys.find(k => k.toLowerCase() === 'day');
        const colDate   = keys.find(k => /lesson.*date|class.*date|^date$/i.test(k));

        if (!colStatus) { reject(new Error('No "Attendance Status" column found')); return; }
        if (!colDate)   { reject(new Error('No date column found. Expect a column named "Date", "Lesson Date", or "Class Date"')); return; }

        // Group by week_date
        const byWeek: Record<string, Record<string, { absent: number; attended: number; frozen: number; replaced: number }>> = {};
        const rowsByWeek: Record<string, number> = {};

        raw.forEach((row: any) => {
          const status = String(row[colStatus] ?? '').toLowerCase().trim();
          if (!AONE_STATUS.has(status)) return;

          const date = parseExcelDate(row[colDate]);
          if (!date) return;

          const wed = toWednesday(localYMD(date));

          let dayKey: string | undefined;
          if (colDay) dayKey = AONE_DAY_MAP[String(row[colDay] ?? '').toLowerCase().trim()];
          if (!dayKey) dayKey = INFER_DAY[date.getDay()];
          if (!dayKey) return;

          if (!byWeek[wed]) {
            byWeek[wed] = Object.fromEntries(DAYS.map(({ key }) => [key, { absent: 0, attended: 0, frozen: 0, replaced: 0 }]));
            rowsByWeek[wed] = 0;
          }
          byWeek[wed][dayKey][status as 'absent' | 'attended' | 'frozen' | 'replaced']++;
          rowsByWeek[wed]++;
        });

        const result: WeekEntry[] = Object.entries(byWeek).map(([week_date, counts]) => ({
          week_date, branch, counts, rows: rowsByWeek[week_date],
        }));

        if (!result.length) { reject(new Error('No valid Wed–Sun attendance rows found. Check the Date and Day columns.')); return; }

        resolve(result.sort((a, b) => a.week_date.localeCompare(b.week_date)));
      } catch (err: any) { reject(err); }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsArrayBuffer(file);
  });
}

export function YearlyBulkEntry() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedBranch, setSelectedBranch] = useState(ALL_BRANCHES[0]);
  const [selectedYear, setSelectedYear]     = useState(new Date().getFullYear());
  const [preview, setPreview]               = useState<WeekEntry[] | null>(null);
  const [uploadStatus, setUploadStatus]     = useState<{ type: 'ok' | 'error'; msg: string } | null>(null);
  const [isSaving, setIsSaving]             = useState(false);
  const [saveStatus, setSaveStatus]         = useState<{ saved: number; skipped: number } | null>(null);
  const [isUploading, setIsUploading]       = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(null);
    setPreview(null);
    setSaveStatus(null);

    try {
      const entries = await parseYearlyAone(file, selectedBranch);
      const filtered = entries.filter(e => {
        const y = new Date(e.week_date + 'T00:00:00').getFullYear();
        return y === selectedYear;
      });
      if (!filtered.length) {
        setUploadStatus({ type: 'error', msg: `No data found for ${selectedYear}. File may contain data for a different year.` });
      } else {
        setPreview(filtered);
        setUploadStatus({ type: 'ok', msg: `Found ${filtered.length} weeks of data for ${selectedBranch} in ${selectedYear}.` });
      }
    } catch (err: any) {
      setUploadStatus({ type: 'error', msg: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!preview?.length) return;
    setIsSaving(true);
    setSaveStatus(null);

    let saved = 0;
    let skipped = 0;
    for (const entry of preview) {
      try {
        const payload: Record<string, any> = {
          branch: entry.branch,
          week_date: entry.week_date,
        };
        DAYS.forEach(({ key }) => {
          payload[`${key}_absent`]   = entry.counts[key]?.absent   ?? 0;
          payload[`${key}_attended`] = entry.counts[key]?.attended ?? 0;
          payload[`${key}_frozen`]   = entry.counts[key]?.frozen   ?? 0;
          payload[`${key}_replaced`] = entry.counts[key]?.replaced ?? 0;
        });
        const metrics = calcMetrics(payload);
        payload.outstanding_invoice_pct = metrics.outstandingInvoicePct;
        await apiFetch('/api/okr-attendance', { method: 'POST', body: payload });
        saved++;
      } catch {
        skipped++;
      }
    }

    qc.invalidateQueries({ queryKey: ['okr-list'] });
    qc.invalidateQueries({ queryKey: ['okr-week'] });
    qc.invalidateQueries({ queryKey: ['okr-dash'] });
    qc.invalidateQueries({ queryKey: ['okr-yearly'] });
    setIsSaving(false);
    setSaveStatus({ saved, skipped });
    setPreview(null);
  };

  const years = [new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear()];

  return (
    <div className="okrEntryForm" style={{ maxWidth: 900 }}>
      <div className="okrEntryHeader">
        <h2>📆 Yearly Entry</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--textSecondary)', marginTop: 4 }}>
          Upload an AOne attendance export (full year). Requires a <strong>Date</strong> column (e.g. "Lesson Date") and <strong>Attendance Status</strong> column.
        </p>
      </div>

      {/* ── Selectors ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Branch</div>
          <select
            value={selectedBranch}
            onChange={e => { setSelectedBranch(e.target.value); setPreview(null); setSaveStatus(null); }}
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #cbd5e1', borderRadius: 8, fontSize: '0.95rem', fontWeight: 600, background: '#fff' }}
          >
            {ALL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Year</div>
          <select
            value={selectedYear}
            onChange={e => { setSelectedYear(Number(e.target.value)); setPreview(null); setSaveStatus(null); }}
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #cbd5e1', borderRadius: 8, fontSize: '0.95rem', fontWeight: 600, background: '#fff' }}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* ── File upload ── */}
      <div style={{ background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: 12, padding: '28px 24px', textAlign: 'center', marginBottom: 20 }}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📂</div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Upload AOne Attendance Export</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--textSecondary)', marginBottom: 16 }}>
          Covers the entire year · Must include Date + Attendance Status columns
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          style={{ padding: '10px 28px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', background: 'var(--brand, #e1251b)', color: '#fff' }}
        >
          {isUploading ? 'Reading file...' : 'Choose File'}
        </button>
      </div>

      {/* ── Upload status ── */}
      {uploadStatus && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.85rem', fontWeight: 600,
          background: uploadStatus.type === 'ok' ? '#f0fdf4' : '#fef2f2',
          border: `1.5px solid ${uploadStatus.type === 'ok' ? '#86efac' : '#fca5a5'}`,
          color: uploadStatus.type === 'ok' ? '#15803d' : '#b91c1c' }}>
          {uploadStatus.type === 'ok' ? '✅' : '❌'} {uploadStatus.msg}
        </div>
      )}

      {/* ── Preview table ── */}
      {preview && preview.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.9rem' }}>
            Preview — {preview.length} weeks to save
          </div>
          <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr', background: '#f1f5f9', padding: '8px 14px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>Week</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span><span>Rows</span>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {preview.map(e => (
                <div key={e.week_date} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr', padding: '7px 14px', borderTop: '1px solid var(--border)', fontSize: '0.82rem' }}>
                  <span style={{ fontWeight: 600 }}>{e.week_date}</span>
                  {['wed','thu','fri','sat','sun'].map(d => (
                    <span key={d} style={{ color: 'var(--textSecondary)' }}>
                      {e.counts[d].attended}a / {e.counts[d].absent}x
                    </span>
                  ))}
                  <span style={{ color: 'var(--textSecondary)' }}>{e.rows}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="okrSaveRow" style={{ marginTop: 16 }}>
            <button type="button" className="okrSaveBtn" onClick={handleSave} disabled={isSaving}>
              {isSaving ? `Saving...` : `✓ Save ${preview.length} weeks`}
            </button>
            <button type="button" className="okrClearBtn" onClick={() => { setPreview(null); setUploadStatus(null); }}>✕ Cancel</button>
          </div>
        </div>
      )}

      {/* ── Save result ── */}
      {saveStatus && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: '#f0fdf4', border: '1.5px solid #86efac', fontSize: '0.85rem', fontWeight: 600, color: '#15803d' }}>
          ✅ Saved {saveStatus.saved} weeks successfully{saveStatus.skipped > 0 ? ` (${saveStatus.skipped} skipped due to errors)` : ''}.
          Weekly entries now appear in the Yearly View automatically.
        </div>
      )}
    </div>
  );
}
