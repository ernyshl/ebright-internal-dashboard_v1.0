interface Props {
  open: boolean;
  onClose: () => void;
  branch: string;
  weekRangeLabel: string;
  names: string;
  frozenCount: number;
}

function parseNames(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function FrozenStudentsModal({ open, onClose, branch, weekRangeLabel, names, frozenCount }: Props) {
  if (!open) return null;
  const list = parseNames(names);

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
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)' }}>
              ❄️ Frozen Students — {branch}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--textSecondary)', marginTop: 2 }}>
              Week of {weekRangeLabel} · {frozenCount} frozen ({list.length} named)
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
              <div style={{ fontWeight: 600 }}>No student names entered</div>
              <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
                Edit this record from History → add names in the "Frozen Students" textarea, one per line.
              </div>
            </div>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.92rem', lineHeight: 1.7 }}>
              {list.map((name, i) => (
                <li key={`${i}-${name}`} style={{ color: 'var(--text)' }}>{name}</li>
              ))}
            </ol>
          )}

          {list.length > 0 && list.length !== frozenCount && (
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 8,
              background: '#fffbeb', border: '1px solid #fcd34d',
              fontSize: '0.78rem', color: '#92400e',
            }}>
              ⚠ Daily counts show {frozenCount} frozen but {list.length} {list.length === 1 ? 'name was' : 'names were'} entered.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
