import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { nlToCtApi, NlToCtTab } from '../api/nlToCt';
import { ApiError } from '../lib/api';

function formatWeekDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function NlToCtTabsPage() {
  const qc = useQueryClient();
  const [gid, setGid] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tabsQ = useQuery({
    queryKey: ['nl-to-ct', 'tabs'],
    queryFn: () => nlToCtApi.listTabs(),
  });

  const addM = useMutation({
    mutationFn: (newGid: string) => nlToCtApi.addTab(newGid),
    onSuccess: () => {
      setGid('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['nl-to-ct', 'tabs'] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to add tab.');
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => nlToCtApi.deleteTab(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nl-to-ct', 'tabs'] }),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = gid.trim();
    if (!trimmed) {
      setError('Please paste a gid.');
      return;
    }
    addM.mutate(trimmed);
  }

  function handleDelete(t: NlToCtTab) {
    const ok = window.confirm(
      `Delete week ${formatWeekDate(t.week_date)} (tab "${t.tab_name}") and all of its captures? This can't be undone.`
    );
    if (ok) deleteM.mutate(t.id);
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <h1 className="pageHeaderTitle" style={{ marginTop: 16 }}>Manage NL to CT Tabs</h1>
        <p style={{ color: 'var(--muted)', marginTop: 4 }}>
          Paste the gid (page id) of a new weekly tab in the source Google Sheet. The tab name must start with YYYYMMDD.
        </p>
      </div>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={gid}
          onChange={(e) => setGid(e.target.value)}
          placeholder="e.g. 360979780"
          style={{ flex: '1 1 240px', padding: '8px 10px', fontSize: 14 }}
          disabled={addM.isPending}
        />
        <button className="btn btnPrimary" type="submit" disabled={addM.isPending}>
          {addM.isPending ? 'Adding…' : 'Add tab'}
        </button>
      </form>
      {error && (
        <div style={{ background: '#fde2e2', color: '#8a1f1f', padding: '8px 12px', borderRadius: 4, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {tabsQ.isLoading && <p>Loading…</p>}
      {tabsQ.error && <p style={{ color: '#8a1f1f' }}>Failed to load tabs.</p>}
      {tabsQ.data && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: 8 }}>Week date</th>
              <th style={{ padding: 8 }}>Tab name</th>
              <th style={{ padding: 8 }}>gid</th>
              <th style={{ padding: 8 }}>Added</th>
              <th style={{ padding: 8, width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {tabsQ.data.tabs.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 16, color: 'var(--muted)' }}>No tabs registered yet.</td></tr>
            )}
            {tabsQ.data.tabs.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{formatWeekDate(t.week_date)}</td>
                <td style={{ padding: 8 }}>{t.tab_name}</td>
                <td style={{ padding: 8, fontFamily: 'monospace' }}>{t.gid}</td>
                <td style={{ padding: 8, color: 'var(--muted)' }}>{formatTimestamp(t.added_at)}</td>
                <td style={{ padding: 8 }}>
                  <button
                    className="btn btnGhost btnSmall"
                    onClick={() => handleDelete(t)}
                    disabled={deleteM.isPending}
                    title="Delete tab"
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
