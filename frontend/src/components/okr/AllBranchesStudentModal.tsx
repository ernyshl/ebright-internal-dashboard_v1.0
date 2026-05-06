import { BRANCH_META } from '../../lib/okr/constants';
import { n } from '../../lib/okr/utils';

type Status = 'frozen' | 'replaced' | 'absent' | 'attended';

interface Props {
  open: boolean;
  onClose: () => void;
  status: Status;
  weekRangeLabel: string;
  weekRecords: any[];
}

const STATUS_META: Record<Status, {
  icon: string;
  label: string;
  titleColor: string;
  field: string;
  countFields: string[];
}> = {
  frozen:   { icon: '❄️', label: 'Frozen Students',   titleColor: '#1e40af', field: 'frozen_student_names',
              countFields: ['wed_frozen','thu_frozen','fri_frozen','sat_frozen','sun_frozen'] },
  replaced: { icon: '🔁', label: 'Replaced Students', titleColor: '#92400e', field: 'replaced_student_names',
              countFields: ['wed_replaced','thu_replaced','fri_replaced','sat_replaced','sun_replaced'] },
  absent:   { icon: '⛔', label: 'Absent Students',   titleColor: '#991b1b', field: 'absent_student_names',
              countFields: ['wed_absent','thu_absent','fri_absent','sat_absent','sun_absent'] },
  attended: { icon: '✅', label: 'Attended Students', titleColor: '#15803d', field: 'attended_student_names',
              countFields: ['wed_attended','thu_attended','fri_attended','sat_attended','sun_attended'] },
};

function parseNames(raw: string): string[] {
  if (!raw) return [];
  return raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

export function AllBranchesStudentModal({ open, onClose, status, weekRangeLabel, weekRecords }: Props) {
  if (!open) return null;
  const meta = STATUS_META[status];

  // Build per-branch entries: { branch, code, region, names[], expectedCount }
  // Sort by fixed branch num so Online=01, ST=02, ... reads consistently with everything else.
  const entries = weekRecords
    .map(r => {
      const names = parseNames(r[meta.field] ?? '');
      const expectedCount = meta.countFields.reduce((s, f) => s + n(r[f]), 0);
      const m = BRANCH_META[r.branch] ?? {};
      return {
        branch: r.branch,
        code: m.code ?? r.branch.slice(0, 4),
        region: m.region ?? '?',
        num: m.num ?? 99,
        names,
        expectedCount,
      };
    })
    .filter(e => e.names.length > 0 || e.expectedCount > 0)
    .sort((a, b) => a.num - b.num);

  const grandTotalNames = entries.reduce((s, e) => s + e.names.length, 0);
  const grandTotalCount = entries.reduce((s, e) => s + e.expectedCount, 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: 'min(680px, 100%)',
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(15,23,42,0.25)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1.5px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: meta.titleColor }}>
              {meta.icon} All Branches — {meta.label}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--textSecondary)', marginTop: 2 }}>
              Week of {weekRangeLabel} · {grandTotalCount} {status} ({grandTotalNames} named) across {entries.length} {entries.length === 1 ? 'branch' : 'branches'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none', background: '#f1f5f9', color: 'var(--text)',
              width: 32, height: 32, borderRadius: 8, fontSize: '1rem',
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1 }}>
          {entries.length === 0 ? (
            <div style={{
              padding: '36px 12px', textAlign: 'center',
              color: 'var(--textSecondary)', fontSize: '0.9rem',
            }}>
              <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>📭</div>
              <div style={{ fontWeight: 600 }}>No {status} students this week</div>
            </div>
          ) : entries.map(e => (
            <div key={e.branch} style={{
              marginBottom: 14, paddingBottom: 12,
              borderBottom: '1.5px dashed var(--border)',
            }}>
              {/* Branch header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 26, height: 22, borderRadius: 6, padding: '0 6px',
                  background: '#f1f5f9', color: 'var(--textSecondary)',
                  fontSize: '0.7rem', fontWeight: 800,
                }}>
                  {String(e.num).padStart(2, '0')}
                </span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{e.branch}</span>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--textSecondary)', background: '#f8fafc', padding: '1px 7px', borderRadius: 4 }}>
                  {e.code}
                </span>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#5b21b6', background: '#ede9fe', padding: '1px 7px', borderRadius: 4 }}>
                  R{e.region}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--textSecondary)', fontWeight: 600 }}>
                  {e.expectedCount} {status}
                  {e.names.length !== e.expectedCount && e.names.length > 0 && ` · ${e.names.length} named`}
                </span>
              </div>

              {/* Names */}
              {e.names.length === 0 ? (
                <div style={{
                  fontSize: '0.78rem', color: '#92400e',
                  background: '#fffbeb', border: '1px solid #fcd34d',
                  borderRadius: 6, padding: '6px 10px',
                }}>
                  ⚠ {e.expectedCount} {status} but no names entered yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {e.names.map((name, i) => (
                    <div
                      key={`${i}-${name}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '4px 4px',
                        fontSize: '0.88rem',
                      }}
                    >
                      <span style={{
                        minWidth: 24, textAlign: 'right',
                        color: 'var(--textSecondary)', fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem',
                      }}>
                        {i + 1}.
                      </span>
                      <span style={{ color: 'var(--text)' }}>{name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
