import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { nlToCtApi, NlToCtTab, TabPayload, BranchData } from '../api/nlToCt';
import { BRANCHES, TIME_SLOTS, SLOTS_BY_DAY, SlotDef } from '../lib/nlToCtSchema';

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
      <div style={{ background: 'var(--panel)', padding: 20, borderRadius: 6, maxWidth: 560, width: '90%', maxHeight: '85vh', overflow: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>Capture {slot.day} {slot.time}</h2>
        {anyFrozen && (
          <div style={{ background: 'var(--warningLight)', padding: 10, borderRadius: 4, marginBottom: 12 }}>
            ⚠ Some branches already have a frozen value for this slot. Confirming will overwrite them.
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--borderLight)' }}>
              <th style={{ textAlign: 'left', padding: 6 }}>Branch</th>
              <th style={{ textAlign: 'center', padding: 6 }}>Existing frozen</th>
              <th style={{ textAlign: 'center', padding: 6 }}>Current sheet</th>
            </tr>
          </thead>
          <tbody>
            {branches.map(b => (
              <tr key={b.code}>
                <td style={{ padding: 6 }}>{b.code}</td>
                <td style={{ padding: 6, textAlign: 'center', color: b.frozen !== null ? 'var(--textSecondary)' : 'var(--muted)' }}>{b.frozen ?? '—'}</td>
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
        {captureM.error && <p style={{ color: 'var(--brand)', marginTop: 8 }}>Capture failed.</p>}
      </div>
    </div>
  );
}

// ─── Cell colouring (grid view) ───────────────────────────────────────
function cellTint(goal: number | null, actual: number | null): string | undefined {
  if (actual == null || goal == null) return undefined;
  if (actual === 0)   return 'var(--brandLight)';     // red (theme-aware)
  if (actual >= goal) return 'var(--successLight)';   // green
  return 'var(--warningLight)';                       // yellow
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
          <th style={{ padding: '6px 10px', background: 'var(--borderLight)', border: '1px solid var(--border)' }} rowSpan={3}>Branch</th>
          <th style={{ padding: '6px 10px', background: 'var(--warningLight)', border: '1px solid var(--border)' }} rowSpan={3}>NL</th>
          <th style={{ padding: '6px 10px', background: 'var(--warningLight)', border: '1px solid var(--border)' }} rowSpan={3}>CT @ 40%</th>
          {SLOTS_BY_DAY.map(group => (
            <th
              key={group.day}
              colSpan={group.slots.length * 2}
              style={{ padding: '6px 10px', background: 'var(--infoLight)', border: '1px solid var(--border)', textAlign: 'center' }}
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
                style={{ padding: '6px 10px', background: 'var(--infoLight)', border: '1px solid var(--border)', textAlign: 'center' }}
              >
                {slot.time}{' '}
                <button
                  className="btn btnSmall"
                  style={{ marginLeft: 6, background: anyFrozen ? 'var(--warning)' : 'var(--success)', color: '#ffffff', border: 'none', padding: '2px 6px', borderRadius: 3, cursor: 'pointer' }}
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
            <th key={`${slot.key}-g`} style={{ padding: '4px 8px', border: '1px solid var(--border)' }}>Goal</th>,
            <th key={`${slot.key}-a`} style={{ padding: '4px 8px', border: '1px solid var(--border)' }}>Actual</th>,
          ])}
        </tr>
      </thead>
      <tbody>
        {/* Totals row — bold, grey, centered */}
        <tr style={{ background: 'var(--border)', fontWeight: 700 }}>
          <td style={{ padding: '6px 10px', border: '1px solid var(--border)', textAlign: 'center' }}>Total</td>
          <td style={{ padding: '6px 10px', border: '1px solid var(--border)', textAlign: 'center' }}>{totals.nl}</td>
          <td style={{ padding: '6px 10px', border: '1px solid var(--border)', textAlign: 'center' }}>{totals.ct}</td>
          {TIME_SLOTS.flatMap(slot => {
            const g = totals.slotGoals[slot.key];
            const a = totals.slotActuals[slot.key];
            return [
              <td key={`total-${slot.key}-g`} style={{ padding: '6px 10px', border: '1px solid var(--border)', textAlign: 'center' }}>{g}</td>,
              <td key={`total-${slot.key}-a`} style={{ padding: '6px 10px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div>{a}</div>
                {prev && (() => {
                  const prevA = totals.slotPrevActuals[slot.key];
                  const delta = a - prevA;
                  return (
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontWeight: 500 }}>
                      prev {prevA}{' '}
                      <span style={{ color: delta >= 0 ? 'var(--success)' : 'var(--brand)' }}>
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
              <td style={{ padding: '4px 8px', border: '1px solid var(--border)', fontWeight: 600 }}>{b.code}</td>
              <td style={{ padding: '4px 8px', border: '1px solid var(--border)', background: 'var(--warningLight)', textAlign: 'center' }}>{bd?.nl ?? '—'}</td>
              <td style={{ padding: '4px 8px', border: '1px solid var(--border)', background: 'var(--warningLight)', textAlign: 'center' }}>{bd?.ct ?? '—'}</td>
              {TIME_SLOTS.flatMap(slot => {
                const sd = bd?.slots.find(s => s.slot_key === slot.key);
                const goal = sd?.goal ?? null;
                const displayActual = sd?.actual_captured ?? sd?.actual_live ?? null;
                const tint = cellTint(goal, displayActual);
                return [
                  <td key={`${b.code}-${slot.key}-g`} style={{ padding: '4px 8px', border: '1px solid var(--border)', textAlign: 'center' }}>{goal ?? '—'}</td>,
                  <td key={`${b.code}-${slot.key}-a`} style={{ padding: '4px 8px', border: '1px solid var(--border)', textAlign: 'center', background: tint, fontWeight: sd?.actual_captured != null ? 600 : 400 }}>
                    <div>{displayActual ?? '—'}</div>
                    {prev && (() => {
                      const psd = prevByCode.get(b.code)?.slots.find(s => s.slot_key === slot.key);
                      const prevA = psd?.actual_captured ?? psd?.actual_live ?? null;
                      const delta = displayActual != null && prevA != null ? displayActual - prevA : null;
                      return (
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                          prev {prevA ?? '—'}{' '}
                          {delta != null && (
                            <span style={{ color: delta >= 0 ? 'var(--success)' : 'var(--brand)' }}>
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
  // Shared tone palette with the Tiles view for visual consistency.
  function tone(pct: number) {
    if (pct >= 100) return { accent: 'var(--success)', soft: 'var(--successLight)' };
    if (pct >= 70)  return { accent: 'var(--warning)', soft: 'var(--warningLight)' };
    return { accent: 'var(--brand)', soft: 'var(--brandLight)' };
  }
  function rowTint(goal: number | null, actual: number | null): string {
    if (actual == null || goal == null) return 'var(--borderLight)';
    if (actual === 0) return 'var(--brandLight)';
    if (actual >= goal) return 'var(--successLight)';
    return 'var(--warningLight)';
  }
  const dayName = (d: 'Wed' | 'Thu' | 'Fri') => d === 'Wed' ? 'Wed' : d === 'Thu' ? 'Thu' : 'Fri';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
      {payload.branches.map(b => {
        const prevB = prev?.branches.find(x => x.code === b.code);

        // Per-slot rows + branch-level rollup.
        let goalSum = 0;
        let actualSum = 0;
        const rows = TIME_SLOTS.map((s, idx) => {
          const sd = b.slots.find(x => x.slot_key === s.key);
          const psd = prevB?.slots.find(x => x.slot_key === s.key);
          const goal = sd?.goal ?? null;
          const actual = sd?.actual_captured ?? sd?.actual_live ?? null;
          const prevA = psd ? (psd.actual_captured ?? psd.actual_live ?? null) : null;
          goalSum   += goal ?? 0;
          actualSum += actual ?? 0;
          const prevIsDifferentDay = idx === 0 || TIME_SLOTS[idx - 1].day !== s.day;
          return { slot: s, goal, actual, prevA, showDay: prevIsDifferentDay };
        });
        const pct = goalSum > 0 ? Math.round((actualSum / goalSum) * 100) : 0;
        const t = tone(pct);

        return (
          <div
            key={b.code}
            style={{
              background: 'var(--panel)',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header: branch + overall % */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 14px',
              borderBottom: '1px solid #f3f4f6',
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>{b.code}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                  NL {b.nl ?? '—'} · CT {b.ct ?? '—'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: t.accent, lineHeight: 1 }}>{pct}%</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {actualSum}<span style={{ color: 'var(--muted)' }}> / {goalSum}</span>
                </span>
              </div>
            </div>

            {/* Per-slot rows */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rows.map(r => {
                const delta = r.actual != null && r.prevA != null ? r.actual - r.prevA : null;
                return (
                  <div
                    key={r.slot.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 60px 1fr auto',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 14px',
                      background: rowTint(r.goal, r.actual),
                      borderTop: r.showDay ? '1px solid #f3f4f6' : 'none',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 600, color: r.showDay ? 'var(--textSecondary)' : 'transparent' }}>
                      {dayName(r.slot.day)}
                    </span>
                    <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.slot.time}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--text)' }}>
                      {r.actual ?? '—'}<span style={{ color: 'var(--muted)', fontWeight: 400 }}> / {r.goal ?? '—'}</span>
                    </span>
                    {prev && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: delta == null ? 'var(--muted)' : delta >= 0 ? 'var(--success)' : 'var(--brand)',
                        fontVariantNumeric: 'tabular-nums',
                        minWidth: 32,
                        textAlign: 'right',
                      }}>
                        {delta == null ? '—' : `${delta >= 0 ? '▲' : '▼'}${Math.abs(delta)}`}
                      </span>
                    )}
                  </div>
                );
              })}
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
    if (pct >= 100) return { accent: 'var(--success)', soft: 'var(--successLight)' };
    if (pct >= 70)  return { accent: 'var(--warning)', soft: 'var(--warningLight)' };
    return { accent: 'var(--brand)', soft: 'var(--brandLight)' };
  }
  function branchTint(goal: number | null, actual: number | null): string {
    if (actual == null || goal == null) return 'var(--borderLight)';
    if (actual === 0) return 'var(--brandLight)';
    if (actual >= goal) return 'var(--successLight)';
    return 'var(--warningLight)';
  }

  const dayName = (d: 'Wed' | 'Thu' | 'Fri') => d === 'Wed' ? 'Wednesday' : d === 'Thu' ? 'Thursday' : 'Friday';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {SLOTS_BY_DAY.map(group => (
        <div key={group.day}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: 16, fontWeight: 700, color: 'var(--text)', borderBottom: '2px solid #e5e7eb', paddingBottom: 6 }}>
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
                    background: 'var(--panel)',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: 12,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                >
                  {/* Slot summary, left */}
                  <div style={{ width: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 16, borderRight: '1px solid #f3f4f6' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--textSecondary)' }}>{slot.time}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, color: t.accent, lineHeight: 1 }}>{pct}%</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {actualSum}<span style={{ color: 'var(--muted)' }}> / {goalSum}</span>
                    </div>
                    {prev && (
                      <div style={{ fontSize: 11, color: delta >= 0 ? 'var(--success)' : 'var(--brand)', marginTop: 4, fontWeight: 600 }}>
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
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--textSecondary)', letterSpacing: 0.3 }}>{b.code}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                          {b.actual ?? '—'}
                        </div>
                        {b.goal != null && (
                          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
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
        <p style={{ marginTop: 4, color: 'var(--muted)', fontSize: 14 }}>
          Per-branch and per-slot tracking of new leads converting to confirmed trials. Capture each slot's Actual to lock the number for week-over-week comparison.
        </p>
      </div>

      {tabsQ.data && tabsQ.data.tabs.length === 0 && (
        <div style={{ background: 'var(--warningLight)', padding: 12, borderRadius: 6, border: '1px solid var(--warning)' }}>
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
            background: 'var(--bg)',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: 'var(--textSecondary)' }}>
              Week:
              <select
                value={effectiveId ?? ''}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                style={{ padding: '6px 10px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel)' }}
              >
                {tabsQ.data.tabs.map((t: NlToCtTab) => (
                  <option key={t.id} value={t.id}>{formatWeekDate(t.week_date)}</option>
                ))}
              </select>
            </label>

            <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--panel)' }}>
              {(['grid','cards','tiles'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? 'var(--info)' : 'var(--panel)',
                    color: view === v ? '#ffffff' : 'var(--textSecondary)',
                    border: 'none',
                    padding: '6px 14px',
                    borderRight: v !== 'tiles' ? '1px solid var(--border)' : undefined,
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', fontSize: 13, fontWeight: 500, color: 'var(--textSecondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showLast}
                onChange={(e) => setShowLast(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Show last week
              {showLast && prevQ.isError && (
                <span style={{ color: 'var(--brand)', fontSize: 12, marginLeft: 4, fontWeight: 400 }}>(no earlier week)</span>
              )}
            </label>
          </div>

          {dataQ.isLoading && <p style={{ color: 'var(--muted)' }}>Loading week data…</p>}
          {dataQ.error && <p style={{ color: 'var(--brand)' }}>Failed to load week data.</p>}
          {dataQ.data && (
            <>
              {dataQ.data.sheet_read_error && (
                <div style={{ background: 'var(--brandLight)', color: 'var(--brand)', padding: 12, borderRadius: 6, marginBottom: 16, border: '1px solid var(--border)', fontSize: 13 }}>
                  Live sheet read failed — showing frozen captures only. <span style={{ color: 'var(--muted)' }}>({dataQ.data.sheet_read_error})</span>
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
