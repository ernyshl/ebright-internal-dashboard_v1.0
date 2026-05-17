import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { nlToCtApi, NlToCtTab, TabPayload, BranchData } from '../api/nlToCt';
import { BRANCHES, TIME_SLOTS, SLOTS_BY_DAY, SlotDef } from '../lib/nlToCtSchema';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type ViewMode = 'grid' | 'cards' | 'tiles';

function formatWeekDate(iso: string): string {
  // Be defensive: backend may return either 'YYYY-MM-DD' or a full ISO
  // timestamp like '2026-05-12T16:00:00.000Z' (legacy code path).
  // Extract just the date prefix before splitting.
  const datePart = (iso || '').split('T')[0];
  const [y, m, d] = datePart.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

// ─── Capture modal ────────────────────────────────────────────────────
interface CaptureModalProps {
  tabId: number;
  slot: SlotDef;
  payload: TabPayload;
  onClose: () => void;
  onCaptured: (next: TabPayload) => void;
}
function CaptureModal({ tabId, slot, payload, onClose, onCaptured }: CaptureModalProps) {
  const captureM = useMutation({
    mutationFn: () => nlToCtApi.capture(tabId, slot.key),
    onSuccess: (next) => { onCaptured(next); onClose(); },
  });

  const branches = payload.branches.map(b => {
    const sd = b.slots.find(s => s.slot_key === slot.key)!;
    return { code: b.code, live: sd.actual_live, frozen: sd.actual_captured };
  });
  const anyFrozen = branches.some(b => b.frozen !== null);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
      <div style={{ background: 'white', padding: 20, borderRadius: 6, maxWidth: 560, width: '90%', maxHeight: '85vh', overflow: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>Capture {slot.day} {slot.time}</h2>
        {anyFrozen && (
          <div style={{ background: '#fff4d6', padding: 10, borderRadius: 4, marginBottom: 12 }}>
            ⚠ Some branches already have a frozen value for this slot. Confirming will overwrite them.
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ textAlign: 'left', padding: 6 }}>Branch</th>
              <th style={{ textAlign: 'center', padding: 6 }}>Existing frozen</th>
              <th style={{ textAlign: 'center', padding: 6 }}>Current sheet</th>
            </tr>
          </thead>
          <tbody>
            {branches.map(b => (
              <tr key={b.code}>
                <td style={{ padding: 6 }}>{b.code}</td>
                <td style={{ padding: 6, textAlign: 'center', color: b.frozen !== null ? '#444' : '#aaa' }}>{b.frozen ?? '—'}</td>
                <td style={{ padding: 6, textAlign: 'center', fontWeight: b.frozen !== b.live ? 600 : 400 }}>{b.live ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btnGhost" onClick={onClose} disabled={captureM.isPending}>Cancel</button>
          <button className="btn btnPrimary" onClick={() => captureM.mutate()} disabled={captureM.isPending}>
            {captureM.isPending ? 'Capturing…' : (anyFrozen ? 'Confirm re-capture' : 'Confirm capture')}
          </button>
        </div>
        {captureM.error && <p style={{ color: '#8a1f1f', marginTop: 8 }}>Capture failed.</p>}
      </div>
    </div>
  );
}

// ─── Cell colouring (grid view) ───────────────────────────────────────
function cellTint(goal: number | null, actual: number | null): string | undefined {
  if (actual == null || goal == null) return undefined;
  if (actual === 0) return '#fcb6b6';            // red
  if (actual >= goal) return '#b6f5c4';          // green
  return '#fff39c';                              // yellow
}

// ─── Grid view ────────────────────────────────────────────────────────
interface GridViewProps {
  payload: TabPayload;
  prev: TabPayload | null;
  onCaptureSlot: (slot: SlotDef) => void;
}
function GridView({ payload, prev, onCaptureSlot }: GridViewProps) {
  const byCode = useMemo(() => {
    const m = new Map<string, BranchData>();
    for (const b of payload.branches) m.set(b.code, b);
    return m;
  }, [payload]);

  const prevByCode = useMemo(() => {
    const m = new Map<string, BranchData>();
    if (prev) for (const b of prev.branches) m.set(b.code, b);
    return m;
  }, [prev]);

  // Totals row: aggregate NL/CT and per-slot Goal/Actual across all branches.
  const totals = useMemo(() => {
    let nl = 0;
    let ct = 0;
    const slotGoals: Record<string, number> = {};
    const slotActuals: Record<string, number> = {};
    const slotPrevActuals: Record<string, number> = {};
    for (const s of TIME_SLOTS) { slotGoals[s.key] = 0; slotActuals[s.key] = 0; slotPrevActuals[s.key] = 0; }
    for (const b of payload.branches) {
      nl += b.nl ?? 0;
      ct += b.ct ?? 0;
      for (const sd of b.slots) {
        slotGoals[sd.slot_key]   += sd.goal ?? 0;
        slotActuals[sd.slot_key] += sd.actual_captured ?? sd.actual_live ?? 0;
      }
    }
    if (prev) {
      for (const b of prev.branches) {
        for (const sd of b.slots) {
          slotPrevActuals[sd.slot_key] += sd.actual_captured ?? sd.actual_live ?? 0;
        }
      }
    }
    return { nl, ct, slotGoals, slotActuals, slotPrevActuals };
  }, [payload, prev]);

  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 1000 }}>
      <thead>
        <tr>
          <th style={{ padding: '6px 10px', background: '#f5f5f5', border: '1px solid #ddd' }} rowSpan={3}>Branch</th>
          <th style={{ padding: '6px 10px', background: '#fffae0', border: '1px solid #ddd' }} rowSpan={3}>NL</th>
          <th style={{ padding: '6px 10px', background: '#ffe6c8', border: '1px solid #ddd' }} rowSpan={3}>CT @ 40%</th>
          {SLOTS_BY_DAY.map(group => (
            <th
              key={group.day}
              colSpan={group.slots.length * 2}
              style={{ padding: '6px 10px', background: '#e8eef9', border: '1px solid #ddd', textAlign: 'center' }}
            >
              {group.day === 'Wed' ? 'Wednesday' : group.day === 'Thu' ? 'Thursday' : 'Friday'}
            </th>
          ))}
        </tr>
        <tr>
          {TIME_SLOTS.map(slot => {
            const anyFrozen = payload.branches.some(b => b.slots.find(s => s.slot_key === slot.key)?.actual_captured != null);
            return (
              <th
                key={slot.key}
                colSpan={2}
                style={{ padding: '6px 10px', background: '#e8eef9', border: '1px solid #ddd', textAlign: 'center' }}
              >
                {slot.time}{' '}
                <button
                  className="btn btnSmall"
                  style={{ marginLeft: 6, background: anyFrozen ? '#f0ad4e' : '#5cb85c', color: 'white', border: 'none', padding: '2px 6px', borderRadius: 3, cursor: 'pointer' }}
                  onClick={() => onCaptureSlot(slot)}
                  title={anyFrozen ? 'Re-capture this slot' : 'Capture this slot'}
                >
                  {anyFrozen ? 'Re-capture' : 'Capture'}
                </button>
              </th>
            );
          })}
        </tr>
        <tr>
          {TIME_SLOTS.flatMap(slot => [
            <th key={`${slot.key}-g`} style={{ padding: '4px 8px', border: '1px solid #ddd' }}>Goal</th>,
            <th key={`${slot.key}-a`} style={{ padding: '4px 8px', border: '1px solid #ddd' }}>Actual</th>,
          ])}
        </tr>
      </thead>
      <tbody>
        {/* Totals row — bold, grey, centered */}
        <tr style={{ background: '#e5e7eb', fontWeight: 700 }}>
          <td style={{ padding: '6px 10px', border: '1px solid #ddd', textAlign: 'center' }}>Total</td>
          <td style={{ padding: '6px 10px', border: '1px solid #ddd', textAlign: 'center' }}>{totals.nl}</td>
          <td style={{ padding: '6px 10px', border: '1px solid #ddd', textAlign: 'center' }}>{totals.ct}</td>
          {TIME_SLOTS.flatMap(slot => {
            const g = totals.slotGoals[slot.key];
            const a = totals.slotActuals[slot.key];
            return [
              <td key={`total-${slot.key}-g`} style={{ padding: '6px 10px', border: '1px solid #ddd', textAlign: 'center' }}>{g}</td>,
              <td key={`total-${slot.key}-a`} style={{ padding: '6px 10px', border: '1px solid #ddd', textAlign: 'center' }}>
                <div>{a}</div>
                {prev && (() => {
                  const prevA = totals.slotPrevActuals[slot.key];
                  const delta = a - prevA;
                  return (
                    <div style={{ fontSize: 10, color: '#666', marginTop: 2, fontWeight: 500 }}>
                      prev {prevA}{' '}
                      <span style={{ color: delta >= 0 ? '#1f7a1f' : '#8a1f1f' }}>
                        ({delta >= 0 ? '+' : ''}{delta})
                      </span>
                    </div>
                  );
                })()}
              </td>,
            ];
          })}
        </tr>
        {BRANCHES.map(b => {
          const bd = byCode.get(b.code);
          return (
            <tr key={b.code}>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontWeight: 600 }}>{b.code}</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd', background: '#fffae0', textAlign: 'center' }}>{bd?.nl ?? '—'}</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd', background: '#ffe6c8', textAlign: 'center' }}>{bd?.ct ?? '—'}</td>
              {TIME_SLOTS.flatMap(slot => {
                const sd = bd?.slots.find(s => s.slot_key === slot.key);
                const goal = sd?.goal ?? null;
                const displayActual = sd?.actual_captured ?? sd?.actual_live ?? null;
                const tint = cellTint(goal, displayActual);
                return [
                  <td key={`${b.code}-${slot.key}-g`} style={{ padding: '4px 8px', border: '1px solid #ddd', textAlign: 'center' }}>{goal ?? '—'}</td>,
                  <td key={`${b.code}-${slot.key}-a`} style={{ padding: '4px 8px', border: '1px solid #ddd', textAlign: 'center', background: tint, fontWeight: sd?.actual_captured != null ? 600 : 400 }}>
                    <div>{displayActual ?? '—'}</div>
                    {prev && (() => {
                      const psd = prevByCode.get(b.code)?.slots.find(s => s.slot_key === slot.key);
                      const prevA = psd?.actual_captured ?? psd?.actual_live ?? null;
                      const delta = displayActual != null && prevA != null ? displayActual - prevA : null;
                      return (
                        <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                          prev {prevA ?? '—'}{' '}
                          {delta != null && (
                            <span style={{ color: delta >= 0 ? '#1f7a1f' : '#8a1f1f' }}>
                              ({delta >= 0 ? '+' : ''}{delta})
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>,
                ];
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface CardsViewProps {
  payload: TabPayload;
  prev: TabPayload | null;
}
function CardsView({ payload, prev }: CardsViewProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {payload.branches.map(b => {
        const prevB = prev?.branches.find(x => x.code === b.code);
        const chartData = TIME_SLOTS.map(s => {
          const sd = b.slots.find(x => x.slot_key === s.key);
          const psd = prevB?.slots.find(x => x.slot_key === s.key);
          return {
            label: `${s.day} ${s.time}`,
            goal: sd?.goal ?? 0,
            actual: sd?.actual_captured ?? sd?.actual_live ?? 0,
            prevActual: psd ? (psd.actual_captured ?? psd.actual_live ?? 0) : null,
          };
        });
        return (
          <div key={b.code} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{b.code}</h3>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>NL {b.nl ?? '—'} · CT {b.ct ?? '—'}</span>
            </div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="goal" fill="#cfd8e3" name="Goal" />
                  <Bar dataKey="actual" name="Actual">
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.actual === 0 ? '#e36b6b' : d.actual >= d.goal ? '#5cb85c' : '#e6c84e'} />
                    ))}
                  </Bar>
                  {prev && <Bar dataKey="prevActual" fill="#9a9a9a" name="Last week" />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface TilesViewProps {
  payload: TabPayload;
  prev: TabPayload | null;
}
function TilesView({ payload, prev }: TilesViewProps) {
  // Tone palette shared across the slot summary and per-branch boxes.
  function tone(pct: number) {
    if (pct >= 100) return { accent: '#16a34a', soft: '#dcfce7' };
    if (pct >= 70)  return { accent: '#eab308', soft: '#fef9c3' };
    return { accent: '#dc2626', soft: '#fee2e2' };
  }
  function branchTint(goal: number | null, actual: number | null): string {
    if (actual == null || goal == null) return '#f3f4f6';
    if (actual === 0) return '#fee2e2';
    if (actual >= goal) return '#dcfce7';
    return '#fef9c3';
  }

  const dayName = (d: 'Wed' | 'Thu' | 'Fri') => d === 'Wed' ? 'Wednesday' : d === 'Thu' ? 'Thursday' : 'Friday';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {SLOTS_BY_DAY.map(group => (
        <div key={group.day}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: 16, fontWeight: 700, color: '#111827', borderBottom: '2px solid #e5e7eb', paddingBottom: 6 }}>
            {dayName(group.day)}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.slots.map(slot => {
              const branchRow = payload.branches.map(b => {
                const sd = b.slots.find(x => x.slot_key === slot.key);
                const psd = prev?.branches.find(x => x.code === b.code)?.slots.find(x => x.slot_key === slot.key);
                const actual = sd?.actual_captured ?? sd?.actual_live ?? null;
                const goal = sd?.goal ?? null;
                const prevA = psd ? (psd.actual_captured ?? psd.actual_live ?? null) : null;
                return { code: b.code, goal, actual, prevA };
              });
              const goalSum = branchRow.reduce((n, x) => n + (x.goal ?? 0), 0);
              const actualSum = branchRow.reduce((n, x) => n + (x.actual ?? 0), 0);
              const prevActualSum = branchRow.reduce((n, x) => n + (x.prevA ?? 0), 0);
              const pct = goalSum > 0 ? Math.round((actualSum / goalSum) * 100) : 0;
              const delta = actualSum - prevActualSum;
              const t = tone(pct);

              return (
                <div
                  key={slot.key}
                  style={{
                    display: 'flex',
                    gap: 16,
                    alignItems: 'stretch',
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: 12,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                >
                  {/* Slot summary, left */}
                  <div style={{ width: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 16, borderRight: '1px solid #f3f4f6' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{slot.time}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, color: t.accent, lineHeight: 1 }}>{pct}%</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {actualSum}<span style={{ color: '#9ca3af' }}> / {goalSum}</span>
                    </div>
                    {prev && (
                      <div style={{ fontSize: 11, color: delta >= 0 ? '#16a34a' : '#dc2626', marginTop: 4, fontWeight: 600 }}>
                        {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs last
                      </div>
                    )}
                  </div>

                  {/* Branch mini-boxes, right */}
                  <div style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))',
                    gap: 6,
                  }}>
                    {branchRow.map(b => (
                      <div
                        key={b.code}
                        title={`${b.code}: ${b.actual ?? '—'} / ${b.goal ?? '—'}`}
                        style={{
                          background: branchTint(b.goal, b.actual),
                          borderRadius: 6,
                          padding: '6px 4px',
                          textAlign: 'center',
                          border: '1px solid rgba(0,0,0,0.04)',
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#374151', letterSpacing: 0.3 }}>{b.code}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                          {b.actual ?? '—'}
                        </div>
                        {b.goal != null && (
                          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                            /{b.goal}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────
export function NlToCtBreakdownPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>('grid');
  const [captureSlot, setCaptureSlot] = useState<SlotDef | null>(null);

  const tabsQ = useQuery({
    queryKey: ['nl-to-ct', 'tabs'],
    queryFn: () => nlToCtApi.listTabs(),
  });

  // TanStack Query v5 removed onSuccess from useQuery — pick the default
  // selection in an effect once data lands.
  useEffect(() => {
    if (selectedId == null && tabsQ.data && tabsQ.data.tabs.length > 0) {
      setSelectedId(tabsQ.data.tabs[0].id);
    }
  }, [selectedId, tabsQ.data]);

  const effectiveId = useMemo(() => {
    if (selectedId != null) return selectedId;
    return tabsQ.data?.tabs[0]?.id ?? null;
  }, [selectedId, tabsQ.data]);

  const dataQ = useQuery({
    queryKey: ['nl-to-ct', 'data', effectiveId],
    queryFn: () => nlToCtApi.getData(effectiveId as number),
    enabled: effectiveId != null,
  });

  const [showLast, setShowLast] = useState(false);

  const prevQ = useQuery({
    queryKey: ['nl-to-ct', 'previous-week', effectiveId],
    queryFn: () => nlToCtApi.previousWeek(effectiveId as number),
    enabled: effectiveId != null && showLast,
    retry: false,
  });
  const prevPayload: TabPayload | null = prevQ.data ?? null;

  function handleCaptured(next: TabPayload) {
    qc.setQueryData(['nl-to-ct', 'data', next.tab.id], next);
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <h1 className="pageHeaderTitle" style={{ marginTop: 16 }}>NL to CT Breakdown</h1>
        <p style={{ marginTop: 4, color: '#6b7280', fontSize: 14 }}>
          Per-branch and per-slot tracking of new leads converting to confirmed trials. Capture each slot's Actual to lock the number for week-over-week comparison.
        </p>
      </div>

      {tabsQ.data && tabsQ.data.tabs.length === 0 && (
        <div style={{ background: '#fff4d6', padding: 12, borderRadius: 6, border: '1px solid #fde68a' }}>
          No weekly tabs registered yet. Go to <a href="/nl-to-ct/manage">Manage NL to CT Tabs</a> to add one.
        </div>
      )}

      {tabsQ.data && tabsQ.data.tabs.length > 0 && (
        <>
          <div style={{
            display: 'flex',
            gap: 20,
            alignItems: 'center',
            marginBottom: 20,
            flexWrap: 'wrap',
            padding: 12,
            background: '#f9fafb',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: '#374151' }}>
              Week:
              <select
                value={effectiveId ?? ''}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                style={{ padding: '6px 10px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6, background: 'white' }}
              >
                {tabsQ.data.tabs.map((t: NlToCtTab) => (
                  <option key={t.id} value={t.id}>{formatWeekDate(t.week_date)}</option>
                ))}
              </select>
            </label>

            <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #d1d5db', background: 'white' }}>
              {(['grid','cards','tiles'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? '#2563eb' : 'white',
                    color: view === v ? 'white' : '#374151',
                    border: 'none',
                    padding: '6px 14px',
                    borderRight: v !== 'tiles' ? '1px solid #d1d5db' : undefined,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    fontSize: 13,
                    fontWeight: 500,
                    transition: 'background 150ms',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showLast}
                onChange={(e) => setShowLast(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Show last week
              {showLast && prevQ.isError && (
                <span style={{ color: '#dc2626', fontSize: 12, marginLeft: 4, fontWeight: 400 }}>(no earlier week)</span>
              )}
            </label>
          </div>

          {dataQ.isLoading && <p style={{ color: '#6b7280' }}>Loading week data…</p>}
          {dataQ.error && <p style={{ color: '#dc2626' }}>Failed to load week data.</p>}
          {dataQ.data && (
            <>
              {dataQ.data.sheet_read_error && (
                <div style={{ background: '#fef2f2', color: '#991b1b', padding: 12, borderRadius: 6, marginBottom: 16, border: '1px solid #fecaca', fontSize: 13 }}>
                  Live sheet read failed — showing frozen captures only. <span style={{ color: '#6b7280' }}>({dataQ.data.sheet_read_error})</span>
                </div>
              )}
              {view === 'grid' && (
                <div style={{ overflowX: 'auto' }}>
                  <GridView payload={dataQ.data} prev={showLast ? prevPayload : null} onCaptureSlot={setCaptureSlot} />
                </div>
              )}
              {view === 'cards' && <CardsView payload={dataQ.data} prev={showLast ? prevPayload : null} />}
              {view === 'tiles' && <TilesView payload={dataQ.data} prev={showLast ? prevPayload : null} />}
            </>
          )}
        </>
      )}

      {captureSlot && effectiveId != null && dataQ.data && (
        <CaptureModal
          tabId={effectiveId}
          slot={captureSlot}
          payload={dataQ.data}
          onClose={() => setCaptureSlot(null)}
          onCaptured={handleCaptured}
        />
      )}
    </div>
  );
}
