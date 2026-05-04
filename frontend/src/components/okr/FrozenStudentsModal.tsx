type Status = 'frozen' | 'replaced' | 'absent' | 'attended';

interface Props {
  open: boolean;
  onClose: () => void;
  status: Status;
  branch: string;
  weekRangeLabel: string;
  names: string;
  expectedCount: number;
}

const STATUS_META: Record<Status, { icon: string; label: string; titleColor: string }> = {
  frozen:   { icon: '❄️', label: 'Frozen Students',   titleColor: '#1e40af' },
  replaced: { icon: '🔁', label: 'Replaced Students', titleColor: '#92400e' },
  absent:   { icon: '⛔', label: 'Absent Students',   titleColor: '#991b1b' },
  attended: { icon: '✅', label: 'Attended Students', titleColor: '#15803d' },
};

function parseNames(raw: string): string[] {
  if (!raw) return [];
  return raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

export function FrozenStudentsModal({ open, onClose, status, branch, weekRangeLabel, names, expectedCount }: Props) {
  if (!open) return null;
  const list = parseNames(names);
  const meta = STATUS_META[status];

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
          background: '#fff', borderRadius: 14, width: 'min(560px, 100%)',
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
              {meta.icon} {meta.label} — {branch}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--textSecondary)', marginTop: 2 }}>
              Week of {weekRangeLabel} · {expectedCount} {status} ({list.length} named)
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
          {list.length === 0 ? (
            <div style={{
              padding: '28px 12px', textAlign: 'center',
              color: 'var(--textSecondary)', fontSize: '0.88rem',
            }}>
              <div style={{ fontSize: '1.6rem', marginBottom: 6 }}>📭</div>
              <div style={{ fontWeight: 600 }}>No student names recorded</div>
              <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
                Edit the record from History → paste your roster (Name TAB status) into the "Student Roster" box. Names get auto-categorised on save.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {list.map((name, i) => (
                <div
                  key={`${i}-${name}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 4px',
                    borderBottom: i === list.length - 1 ? 'none' : '1px solid #f1f5f9',
                    fontSize: '0.92rem',
                  }}
                >
                  <span style={{
                    minWidth: 28, textAlign: 'right',
                    color: 'var(--textSecondary)', fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {i + 1}.
                  </span>
                  <span style={{ color: 'var(--text)' }}>{name}</span>
                </div>
              ))}
            </div>
          )}

          {list.length > 0 && list.length !== expectedCount && (
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 8,
              background: '#fffbeb', border: '1px solid #fcd34d',
              fontSize: '0.78rem', color: '#92400e',
            }}>
              ⚠ Daily counts show {expectedCount} {status} but {list.length} {list.length === 1 ? 'name was' : 'names were'} entered.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
