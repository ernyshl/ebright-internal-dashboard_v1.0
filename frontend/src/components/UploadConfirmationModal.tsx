import { useState } from 'react';
import type { PreviewResponse } from '../api/studentUpload';

type Props = {
  preview: PreviewResponse | null;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
};

type SectionKey = 'new' | 'restore' | 'guardianFill' | 'matched' | 'archive';

const SECTIONS: Array<{
  key: SectionKey;
  title: (n: number) => string;
  hint: string;
  color: string;
  bg: string;
}> = [
  { key: 'new',          title: n => `${n} student${n === 1 ? '' : 's'} will be added (new)`,                                   hint: 'Inserted as fresh records with empty progress.',                                            color: '#16a34a', bg: 'rgba(34,197,94,0.10)'   },
  { key: 'restore',      title: n => `${n} student${n === 1 ? '' : 's'} will be restored from Archive`,                         hint: 'Existing FA / PCM history will be preserved.',                                              color: '#2563eb', bg: 'rgba(59,130,246,0.10)'  },
  { key: 'guardianFill', title: n => `${n} student${n === 1 ? '' : 's'} will have guardian info filled`,                        hint: 'Only empty guardian_name / guardian_mobile fields. Grade, FA, PCM, etc. NOT touched.',      color: '#7c3aed', bg: 'rgba(124,58,237,0.10)'  },
  { key: 'matched',      title: n => `${n} student${n === 1 ? '' : 's'} will be skipped (already complete)`,                    hint: 'Name + guardian info already on file. No changes.',                                          color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
  { key: 'archive',      title: n => `${n} student${n === 1 ? '' : 's'} will be moved to Archive`,                              hint: 'These students are not in the new file. Their progress is kept.',                          color: '#d97706', bg: 'rgba(245,158,11,0.10)'  },
];

export default function UploadConfirmationModal({ preview, onConfirm, onCancel, isLoading }: Props) {
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ new: false, restore: false, guardianFill: false, matched: false, archive: false });

  if (!preview) return null;

  const summary = preview.summary;
  const matchedSkipCount = Math.max(0, summary.matched - summary.guardianFill);
  const counts: Record<SectionKey, number> = {
    new: summary.new,
    restore: summary.restore,
    guardianFill: summary.guardianFill,
    matched: matchedSkipCount,
    archive: summary.archive,
  };
  // Visible "matched" should exclude rows that fall into guardianFill so we don't double-count
  const matchedNamesVisible = preview.details.matchedNames.filter(
    n => !preview.details.guardianFillNames.includes(n)
  );
  const names: Record<SectionKey, string[]> = {
    new:          preview.details.newNames,
    restore:      preview.details.restoreNames,
    guardianFill: preview.details.guardianFillNames,
    matched:      matchedNamesVisible,
    archive:      preview.details.archiveNames,
  };

  function toggle(key: SectionKey) {
    if (counts[key] === 0) return;
    setOpen(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--panel)', borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Confirm Upload Changes</h2>
          <button onClick={onCancel} disabled={isLoading} style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--muted)', cursor: isLoading ? 'not-allowed' : 'pointer', lineHeight: 1, opacity: isLoading ? 0.4 : 1 }}>&times;</button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 4px' }}>
            Review the changes below. Nothing has been written yet.
          </p>

          {SECTIONS.map(s => {
            const n = counts[s.key];
            const isOpen = open[s.key];
            const isEmpty = n === 0;
            return (
              <div key={s.key} style={{ border: `1px solid ${s.color}33`, background: isEmpty ? 'var(--bg)' : s.bg, borderRadius: 10, overflow: 'hidden', opacity: isEmpty ? 0.55 : 1 }}>
                <button
                  onClick={() => toggle(s.key)}
                  disabled={isEmpty}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', cursor: isEmpty ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.title(n)}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{s.hint}</span>
                  </span>
                  {!isEmpty && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: s.color, whiteSpace: 'nowrap' }}>
                      {isOpen ? '▾ Hide' : '▸ Show'}
                    </span>
                  )}
                </button>
                {isOpen && !isEmpty && (
                  <div style={{ borderTop: `1px solid ${s.color}33`, padding: '8px 14px 12px', background: 'var(--panel)' }}>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
                      {names[s.key].map((name, i) => (
                        <li key={`${s.key}-${i}`}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={isLoading}
            style={{ fontSize: 13, padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1 }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={{ fontSize: 13, padding: '8px 22px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: isLoading ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: isLoading ? 0.7 : 1 }}
          >
            {isLoading ? 'Processing…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
