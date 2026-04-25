import { useState, useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import { getApiDateRange, formatDateRange, PIPELINE_TO_BRANCH, BRANCH_TO_PIPELINE, REGION_PIPELINES } from '../lib/leadsSheet';

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
];
const SLOTS_FOR_DAY = (day: string) =>
  (day === 'Saturday' || day === 'Sunday') ? WEEKEND_SLOTS : WEEKDAY_SLOTS;

// Mon-Sun of the current MYT week, returned as YYYY-MM-DD strings.
function thisWeekMonSun() {
  const now = new Date();
  // Convert to MYT (UTC+8) for week boundary
  const myt = new Date(now.getTime() + (8 * 60 - now.getTimezoneOffset()) * 60 * 1000);
  const dow = myt.getUTCDay(); // 0=Sun..6=Sat
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(myt);
  mon.setUTCDate(myt.getUTCDate() + diffToMon);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(mon), to: fmt(sun) };
}

const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'last_week',  label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'my_filter',  label: 'My Filter (Sat-Sun)' },
];

const ALL_BRANCHES = Object.keys(BRANCH_TO_PIPELINE).filter(b => b !== 'Kajang'); // avoid duplicate

export function TallyPage() {
  const [preset, setPreset] = useState('today');
  const [branch, setBranch] = useState('');
  const [source, setSource] = useState('');
  const { date_from, date_to } = getApiDateRange(preset);

  const params = new URLSearchParams({ date_from, date_to });
  if (branch) {
    // For tally, raw side filters by branch name, GHL side by pipeline code
    params.set('pipeline', branch);
  }
  if (source) params.set('lead_source', source);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tally', date_from, date_to, branch, source],
    queryFn: () => apiFetch(`/api/ghl-stages/tally?${params}`),
    staleTime: 2 * 60 * 1000,
  });

  // Trial Slot calendar — always Mon-Sun of the current MYT week.
  const week = useMemo(() => thisWeekMonSun(), []);
  const [region, setRegion] = useState<'A' | 'B' | 'C' | 'all'>('all');
  const { data: calData, isLoading: calLoading, refetch: calRefetch } = useQuery({
    queryKey: ['ct-calendar', week.from, week.to],
    queryFn: () => apiFetch(`/api/ghl-stages/ct-calendar?date_from=${week.from}&date_to=${week.to}`),
    staleTime: 2 * 60 * 1000,
  });

  // Aggregate { pipeline -> day -> slotCode -> count }
  const calMap = useMemo(() => {
    const m: Record<string, Record<string, Record<string, number>>> = {};
    for (const r of (calData?.rows || [])) {
      const code = String(r.time_slot || '').split('|')[0].trim();
      const day = String(r.preferred_day || '').trim();
      if (!r.pipeline_name || !code || !day) continue;
      m[r.pipeline_name] ??= {};
      m[r.pipeline_name][day] ??= {};
      m[r.pipeline_name][day][code] = (m[r.pipeline_name][day][code] || 0) + Number(r.n || 0);
    }
    return m;
  }, [calData]);

  const visiblePipelines = useMemo(() => {
    if (region === 'all') {
      return [...REGION_PIPELINES['Region A'], ...REGION_PIPELINES['Region B'], ...REGION_PIPELINES['Region C']];
    }
    return REGION_PIPELINES[`Region ${region}`] || [];
  }, [region]);

  const rawLeads = data?.rawLeads || [];
  const ghlLeads = data?.ghlLeads || [];

  // Build sets for matching
  const { rawOnly, ghlOnly, matched, allSources } = useMemo(() => {
    const ghlEmails = new Set(ghlLeads.map(r => r.email).filter(Boolean));
    const rawEmails = new Set(rawLeads.map(r => r.email).filter(Boolean));

    const rawOnly = rawLeads.filter(r => r.email && !ghlEmails.has(r.email));
    const ghlOnly = ghlLeads.filter(r => r.email && !rawEmails.has(r.email));
    const matched = rawLeads.filter(r => r.email && ghlEmails.has(r.email));

    const sources = new Set();
    rawLeads.forEach(r => { if (r.lead_source) sources.add(r.lead_source); });
    ghlLeads.forEach(r => { if (r.lead_source) sources.add(r.lead_source); });

    return { rawOnly, ghlOnly, matched, allSources: Array.from(sources).sort() };
  }, [rawLeads, ghlLeads]);

  const dateLabel = formatDateRange(preset);

  const fmtDate = (d) => d ? new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  }) : '';

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">To Tally</h1>
          <p className="headerSubtitle">Raw Data vs GHL Data · {dateLabel}</p>
        </div>
      </div>

      <div className="ldFilterBar">
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

      <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Branch</label>
          <select className="filterSelect" value={branch} onChange={e => setBranch(e.target.value)}>
            <option value="">All Branches</option>
            {ALL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Lead Source</label>
          <select className="filterSelect" value={source} onChange={e => setSource(e.target.value)}>
            <option value="">All Sources</option>
            {allSources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {(branch || source) && (
          <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}>
            <button className="btn btnGhost btnSmall" onClick={() => { setBranch(''); setSource(''); }}>Clear</button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading…</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{rawLeads.length}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Raw (DB)</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{ghlLeads.length}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>GHL</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>{matched.length}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Matched</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--brand)' }}>{rawOnly.length}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Missing from GHL</div>
            </div>
          </div>

          {/* Side by side tables */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Raw Data (left) */}
            <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                Raw Data (DB) — {rawLeads.length} leads
              </div>
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Branch</th>
                    <th>Source</th>
                    <th>Date</th>
                    <th>In GHL?</th>
                  </tr>
                </thead>
                <tbody>
                  {rawLeads.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No raw leads</td></tr>
                  ) : rawLeads.map((r, i) => {
                    const inGhl = r.email && ghlLeads.some(g => g.email === r.email);
                    return (
                      <tr key={i} style={!inGhl ? { background: 'var(--brandLight)' } : {}}>
                        <td style={{ fontSize: 11, color: 'var(--muted)' }}>{i + 1}</td>
                        <td style={{ fontSize: 12 }}>{r.full_name || '—'}</td>
                        <td style={{ fontSize: 11 }}>{r.email || '—'}</td>
                        <td style={{ fontSize: 12 }}>{r.branch || '—'}</td>
                        <td style={{ fontSize: 11 }}>{r.lead_source || '—'}</td>
                        <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(r.submitted_at)}</td>
                        <td style={{ textAlign: 'center' }}>
                          {inGhl
                            ? <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 12 }}>Yes</span>
                            : <span style={{ color: 'var(--brand)', fontWeight: 600, fontSize: 12 }}>No</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* GHL Data (right) */}
            <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                GHL Data — {ghlLeads.length} leads
              </div>
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Last Name</th>
                    <th>Email</th>
                    <th>Pipeline</th>
                    <th>Stage</th>
                    <th>Source</th>
                    <th>Preferred Day</th>
                    <th>Time Slot</th>
                    <th>Date</th>
                    <th>In DB?</th>
                  </tr>
                </thead>
                <tbody>
                  {ghlLeads.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No GHL leads</td></tr>
                  ) : ghlLeads.map((r, i) => {
                    const inDb = r.email && rawLeads.some(d => d.email === r.email);
                    return (
                      <tr key={i} style={!inDb ? { background: 'var(--warningLight, #fefce8)' } : {}}>
                        <td style={{ fontSize: 11, color: 'var(--muted)' }}>{i + 1}</td>
                        <td style={{ fontSize: 12 }}>{r.last_name || '—'}</td>
                        <td style={{ fontSize: 11 }}>{r.email || '—'}</td>
                        <td style={{ fontSize: 12 }}>{PIPELINE_TO_BRANCH[r.pipeline_name] || r.pipeline_name || '—'}</td>
                        <td style={{ fontSize: 12 }}>{r.stage_key || '—'}</td>
                        <td style={{ fontSize: 11 }}>{r.lead_source || '—'}</td>
                        <td style={{ fontSize: 11 }}>{r.preferred_day || '—'}</td>
                        <td style={{ fontSize: 11 }}>{r.time_slot || '—'}</td>
                        <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(r.received_at)}</td>
                        <td style={{ textAlign: 'center' }}>
                          {inDb
                            ? <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 12 }}>Yes</span>
                            : <span style={{ color: 'var(--warning, #854d0e)', fontWeight: 600, fontSize: 12 }}>No</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ───── Trial Slot Calendar (CT bookings, this week Mon-Sun) ───── */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Trial Slots — This Week</h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            CTs received {week.from} → {week.to}
          </span>
          <button className="btn btnGhost btnSmall" onClick={() => calRefetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
        </div>

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

        {calLoading ? (
          <div className="card" style={{ textAlign: 'center', padding: 24 }}>
            <div className="loadingDots"><span /><span /><span /></div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(640px, 1fr))', gap: 16 }}>
            {visiblePipelines.map(pipeline => {
              const branchName = PIPELINE_TO_BRANCH[pipeline] || pipeline;
              const branchData = calMap[pipeline] || {};
              return (
                <div key={pipeline} className="card" style={{ padding: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12 }}>
                    {pipeline} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {branchName}</span>
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
                    {/* Slot rows — up to 4 (weekend) */}
                    {[0, 1, 2, 3].map(rowIdx => (
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
        )}
      </div>
    </div>
  );
}
