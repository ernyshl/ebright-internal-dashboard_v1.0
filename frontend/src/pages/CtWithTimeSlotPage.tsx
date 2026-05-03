import { useState, useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import {
  getApiDateRange,
  formatDateRange,
  PIPELINE_TO_BRANCH,
  REGION_PIPELINES,
} from '../lib/leadsSheet';

const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'last_week',  label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
];

// Operational days + canonical CT slots per day type.
// Match by HHMM prefix because GHL's full string varies (e.g. "1800 | 6:00pm" vs "1800 | 06:00pm").
const CAL_DAYS = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const WEEKDAY_SLOTS = [
  { code: '1800', label: '1800 | 6:00pm' },
  { code: '1915', label: '1915 | 7:15pm' },
  { code: '2030', label: '2030 | 8:30pm' },
];
const WEEKEND_SLOTS = [
  { code: '0915', label: '0915 | 09:15am' },
  { code: '1030', label: '1030 | 10:30am' },
  { code: '1200', label: '1200 | 12:00pm' },
  { code: '1315', label: '1315 | 01:15pm' },
  { code: '1445', label: '1445 | 02:45pm' },
  { code: '1600', label: '1600 | 04:00pm' },
  { code: '1730', label: '1730 | 05:30pm' },
];
const SLOTS_FOR_DAY = (day: string) =>
  (day === 'Saturday' || day === 'Sunday') ? WEEKEND_SLOTS : WEEKDAY_SLOTS;

export function CtWithTimeSlotPage() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState('this_week');
  const [region, setRegion] = useState<'A' | 'B' | 'C' | 'all'>('all');
  const { date_from, date_to } = getApiDateRange(preset);
  const dateLabel = formatDateRange(preset);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ct-calendar', date_from, date_to],
    queryFn: () => apiFetch(`/api/ghl-stages/ct-calendar?date_from=${date_from}&date_to=${date_to}`),
    staleTime: 2 * 60 * 1000,
  });

  // Aggregate { pipeline -> day -> slotCode -> count }
  const calMap = useMemo(() => {
    const m: Record<string, Record<string, Record<string, number>>> = {};
    for (const r of (data?.rows || [])) {
      const code = String(r.time_slot || '').split('|')[0].trim();
      const day = String(r.preferred_day || '').trim();
      if (!r.pipeline_name || !code || !day) continue;
      m[r.pipeline_name] ??= {};
      m[r.pipeline_name][day] ??= {};
      m[r.pipeline_name][day][code] = (m[r.pipeline_name][day][code] || 0) + Number(r.n || 0);
    }
    return m;
  }, [data]);

  const visiblePipelines = useMemo(() => {
    if (region === 'all') {
      return [...REGION_PIPELINES['Region A'], ...REGION_PIPELINES['Region B'], ...REGION_PIPELINES['Region C']];
    }
    return REGION_PIPELINES[`Region ${region}`] || [];
  }, [region]);

  // Aggregate totals across visible pipelines: per-day and grand total.
  const summary = useMemo(() => {
    const perDay: Record<string, number> = { Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0 };
    let grand = 0;
    for (const pipeline of visiblePipelines) {
      const branchData = calMap[pipeline] || {};
      for (const day of CAL_DAYS) {
        const slots = SLOTS_FOR_DAY(day);
        const dayTotal = slots.reduce((s, slot) => s + (branchData[day]?.[slot.code] || 0), 0);
        perDay[day] += dayTotal;
        grand += dayTotal;
      }
    }
    return { perDay, grand };
  }, [calMap, visiblePipelines]);

  // Tile click → open GHL Lead Centre filtered to this pipeline + CT stage + same date range.
  const openInLeadCentre = (pipeline: string) => {
    const params = new URLSearchParams({ preset, stage: 'CT', pipeline });
    navigate(`/ghl-lead-centre?${params.toString()}`);
  };

  // Summary card click → open GHL Lead Centre filtered to CT + current region.
  const openRegionInLeadCentre = () => {
    const params = new URLSearchParams({ preset, stage: 'CT' });
    if (region !== 'all') params.set('region', `Region ${region}`);
    navigate(`/ghl-lead-centre?${params.toString()}`);
  };

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">CT with Time Slot</h1>
          <p className="headerSubtitle">Confirmed-trial bookings by branch · {dateLabel}</p>
        </div>
      </div>

      {/* Date preset filter */}
      <div className="ldFilterBar" style={{ marginBottom: 12 }}>
        {PRESETS.map(p => (
          <button
            key={p.key}
            className={`btn ${preset === p.key ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => setPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      {/* Region filter */}
      <div className="ldFilterBar" style={{ marginBottom: 16 }}>
        {(['all', 'A', 'B', 'C'] as const).map(r => (
          <button
            key={r}
            className={`btn ${region === r ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => setRegion(r)}
          >
            {r === 'all' ? 'All Regions' : `Region ${r}`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading…</p>
        </div>
      ) : (
        <>
        {/* Summary across visible pipelines */}
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontWeight: 600 }}>
              Total CTs <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {region === 'all' ? 'All Regions' : `Region ${region}`} · {visiblePipelines.length} branch{visiblePipelines.length === 1 ? '' : 'es'}</span>
            </div>
            <div
              style={{ fontSize: 32, fontWeight: 700, cursor: 'pointer' }}
              onClick={openRegionInLeadCentre}
              title="View all CTs in GHL Lead Centre"
            >
              {summary.grand}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {CAL_DAYS.map(day => (
              <div
                key={`sum-${day}`}
                onClick={openRegionInLeadCentre}
                title="View all CTs in GHL Lead Centre"
                style={{
                  textAlign: 'center', padding: 10, borderRadius: 6, cursor: 'pointer',
                  background: summary.perDay[day] > 0 ? 'var(--brandLight, #dbeafe)' : 'var(--bg2, #f8fafc)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{day.slice(0, 3)}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.perDay[day]}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(640px, 1fr))', gap: 16 }}>
          {visiblePipelines.map(pipeline => {
            const branchName = PIPELINE_TO_BRANCH[pipeline] || pipeline;
            const branchData = calMap[pipeline] || {};
            const branchTotal = CAL_DAYS.reduce((sum, day) => {
              const slots = SLOTS_FOR_DAY(day);
              return sum + slots.reduce((dSum, s) => dSum + (branchData[day]?.[s.code] || 0), 0);
            }, 0);
            return (
              <div
                key={pipeline}
                className="card"
                style={{ padding: 16, cursor: 'pointer' }}
                onClick={() => openInLeadCentre(pipeline)}
                title="Click to open this branch's CTs in GHL Lead Centre"
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600 }}>
                    {pipeline} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {branchName}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Total: <strong style={{ color: 'var(--text)' }}>{branchTotal}</strong>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {/* Day headers */}
                  {CAL_DAYS.map(day => (
                    <div key={`h-${day}`} style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', padding: '4px 0', color: 'var(--muted)' }}>
                      {day.slice(0, 3)}
                    </div>
                  ))}
                  {/* Day totals */}
                  {CAL_DAYS.map(day => {
                    const slots = SLOTS_FOR_DAY(day);
                    const total = slots.reduce((sum, s) => sum + (branchData[day]?.[s.code] || 0), 0);
                    return (
                      <div key={`t-${day}`} style={{
                        textAlign: 'center', padding: 8, borderRadius: 6,
                        background: total > 0 ? 'var(--brandLight, #dbeafe)' : 'var(--bg2, #f8fafc)',
                        fontWeight: 700, fontSize: 18,
                      }}>
                        {total}
                      </div>
                    );
                  })}
                  {/* Slot rows — up to 7 (weekend) */}
                  {[0, 1, 2, 3, 4, 5, 6].map(rowIdx => (
                    <Fragment key={`row-${rowIdx}`}>
                      {CAL_DAYS.map(day => {
                        const slots = SLOTS_FOR_DAY(day);
                        const slot = slots[rowIdx];
                        if (!slot) {
                          return <div key={`s-${day}-${rowIdx}`} />;
                        }
                        const count = branchData[day]?.[slot.code] || 0;
                        return (
                          <div key={`s-${day}-${rowIdx}`} style={{
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '6px 4px',
                            textAlign: 'center',
                            background: count > 0 ? 'var(--successLight, #dcfce7)' : 'transparent',
                          }}>
                            <div style={{ fontSize: 9, color: 'var(--muted)' }}>{slot.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>{count}</div>
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
