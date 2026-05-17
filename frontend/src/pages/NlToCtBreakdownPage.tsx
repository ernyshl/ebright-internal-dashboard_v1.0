import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { nlToCtApi, NlToCtTab, TabPayload, BranchData } from '../api/nlToCt';
import { BRANCHES, TIME_SLOTS, SLOTS_BY_DAY, SlotDef } from '../lib/nlToCtSchema';

type ViewMode = 'grid' | 'cards' | 'tiles';

function formatWeekDate(iso: string): string {
  const [y, m, d] = iso.split('-');
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
              <th style={{ textAlign: 'right', padding: 6 }}>Existing frozen</th>
              <th style={{ textAlign: 'right', padding: 6 }}>Current sheet</th>
            </tr>
          </thead>
          <tbody>
            {branches.map(b => (
              <tr key={b.code}>
                <td style={{ padding: 6 }}>{b.code}</td>
                <td style={{ padding: 6, textAlign: 'right', color: b.frozen !== null ? '#444' : '#aaa' }}>{b.frozen ?? '—'}</td>
                <td style={{ padding: 6, textAlign: 'right', fontWeight: b.frozen !== b.live ? 600 : 400 }}>{b.live ?? '—'}</td>
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
  onCaptureSlot: (slot: SlotDef) => void;
}
function GridView({ payload, onCaptureSlot }: GridViewProps) {
  const byCode = useMemo(() => {
    const m = new Map<string, BranchData>();
    for (const b of payload.branches) m.set(b.code, b);
    return m;
  }, [payload]);

  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 1200 }}>
      <thead>
        <tr>
          <th style={{ padding: 4, background: '#f5f5f5', border: '1px solid #ddd' }} rowSpan={3}>Branch</th>
          <th style={{ padding: 4, background: '#fffae0', border: '1px solid #ddd' }} rowSpan={3}>NL</th>
          <th style={{ padding: 4, background: '#ffe6c8', border: '1px solid #ddd' }} rowSpan={3}>CT @ 40%</th>
          {SLOTS_BY_DAY.map(group => (
            <th
              key={group.day}
              colSpan={group.slots.reduce((n, s) => n + (s.hasQaqc ? 3 : 2), 0)}
              style={{ padding: 4, background: '#e8eef9', border: '1px solid #ddd', textAlign: 'center' }}
            >
              {group.day === 'Wed' ? 'Wednesday' : group.day === 'Thu' ? 'Thursday' : 'Friday'}
            </th>
          ))}
        </tr>
        <tr>
          {TIME_SLOTS.map(slot => {
            const span = slot.hasQaqc ? 3 : 2;
            const anyFrozen = payload.branches.some(b => b.slots.find(s => s.slot_key === slot.key)?.actual_captured != null);
            return (
              <th
                key={slot.key}
                colSpan={span}
                style={{ padding: 4, background: '#e8eef9', border: '1px solid #ddd', textAlign: 'center' }}
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
          {TIME_SLOTS.flatMap(slot => {
            const cols = [
              <th key={`${slot.key}-g`} style={{ padding: 4, border: '1px solid #ddd' }}>Goal</th>,
              <th key={`${slot.key}-a`} style={{ padding: 4, border: '1px solid #ddd' }}>Actual</th>,
            ];
            if (slot.hasQaqc) cols.push(<th key={`${slot.key}-q`} style={{ padding: 4, border: '1px solid #ddd', background: '#d4f5d4' }}>QAQC</th>);
            return cols;
          })}
        </tr>
      </thead>
      <tbody>
        {BRANCHES.map(b => {
          const bd = byCode.get(b.code);
          return (
            <tr key={b.code}>
              <td style={{ padding: 4, border: '1px solid #ddd', fontWeight: 600 }}>{b.code}</td>
              <td style={{ padding: 4, border: '1px solid #ddd', background: '#fffae0', textAlign: 'right' }}>{bd?.nl ?? '—'}</td>
              <td style={{ padding: 4, border: '1px solid #ddd', background: '#ffe6c8', textAlign: 'right' }}>{bd?.ct ?? '—'}</td>
              {TIME_SLOTS.flatMap(slot => {
                const sd = bd?.slots.find(s => s.slot_key === slot.key);
                const goal = sd?.goal ?? null;
                const displayActual = sd?.actual_captured ?? sd?.actual_live ?? null;
                const tint = cellTint(goal, displayActual);
                const cells = [
                  <td key={`${b.code}-${slot.key}-g`} style={{ padding: 4, border: '1px solid #ddd', textAlign: 'right' }}>{goal ?? '—'}</td>,
                  <td key={`${b.code}-${slot.key}-a`} style={{ padding: 4, border: '1px solid #ddd', textAlign: 'right', background: tint, fontWeight: sd?.actual_captured != null ? 600 : 400 }}>
                    {displayActual ?? '—'}
                  </td>,
                ];
                if (slot.hasQaqc) {
                  cells.push(
                    <td key={`${b.code}-${slot.key}-q`} style={{ padding: 4, border: '1px solid #ddd', background: '#eafbeb', fontSize: 11 }}>
                      {sd?.qaqc ?? ''}
                    </td>
                  );
                }
                return cells;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
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

  function handleCaptured(next: TabPayload) {
    qc.setQueryData(['nl-to-ct', 'data', next.tab.id], next);
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <h1 className="pageHeaderTitle" style={{ marginTop: 16 }}>NL to CT Breakdown</h1>
      </div>

      {tabsQ.data && tabsQ.data.tabs.length === 0 && (
        <div style={{ background: '#fff4d6', padding: 12, borderRadius: 4 }}>
          No weekly tabs registered yet. Go to <a href="/nl-to-ct/manage">Manage NL to CT Tabs</a> to add one.
        </div>
      )}

      {tabsQ.data && tabsQ.data.tabs.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Week:
              <select
                value={effectiveId ?? ''}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                style={{ padding: '6px 8px', fontSize: 14 }}
              >
                {tabsQ.data.tabs.map((t: NlToCtTab) => (
                  <option key={t.id} value={t.id}>{formatWeekDate(t.week_date)}</option>
                ))}
              </select>
            </label>

            <div style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: '1px solid #ccc' }}>
              {(['grid','cards','tiles'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="btn btnSmall"
                  style={{
                    background: view === v ? '#2680eb' : 'white',
                    color: view === v ? 'white' : '#333',
                    border: 'none',
                    padding: '6px 12px',
                    borderRight: v !== 'tiles' ? '1px solid #ccc' : undefined,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {dataQ.isLoading && <p>Loading week data…</p>}
          {dataQ.error && <p style={{ color: '#8a1f1f' }}>Failed to load week data.</p>}
          {dataQ.data && (
            <>
              {dataQ.data.sheet_read_error && (
                <div style={{ background: '#fde2e2', color: '#8a1f1f', padding: 10, borderRadius: 4, marginBottom: 12 }}>
                  Live sheet read failed — showing frozen captures only. ({dataQ.data.sheet_read_error})
                </div>
              )}
              {view === 'grid' && (
                <div style={{ overflowX: 'auto' }}>
                  <GridView payload={dataQ.data} onCaptureSlot={setCaptureSlot} />
                </div>
              )}
              {view === 'cards' && <p style={{ color: 'var(--muted)' }}>Cards view coming in Task 12.</p>}
              {view === 'tiles' && <p style={{ color: 'var(--muted)' }}>Tiles view coming in Task 13.</p>}
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
