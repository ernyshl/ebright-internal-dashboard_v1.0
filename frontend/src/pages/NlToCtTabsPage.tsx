import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { nlToCtApi, NlToCtTab } from '../api/nlToCt';
import { ApiError } from '../lib/api';

function formatWeekDate(iso: string): string {
  // Be defensive against legacy timestamps like '2026-05-12T16:00:00.000Z'.
  const datePart = (iso || '').split('T')[0];
  const [y, m, d] = datePart.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function NlToCtTabsPage() {
  const qc = useQueryClient();
  const [gid, setGid] = useState('');
  const [tabName, setTabName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tabsQ = useQuery({
    queryKey: ['nl-to-ct', 'tabs'],
    queryFn: () => nlToCtApi.listTabs(),
  });

  const addM = useMutation({
    mutationFn: ({ gid: newGid, tabName: newName }: { gid: string; tabName: string }) =>
      nlToCtApi.addTab(newGid, newName),
    onSuccess: () => {
      setGid('');
      setTabName('');
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
    const trimmedGid = gid.trim();
    const trimmedName = tabName.trim();
    if (!trimmedGid) {
      setError('Please paste a gid.');
      return;
    }
    if (!trimmedName) {
      setError('Please enter the tab name (e.g. "20260513 Target").');
      return;
    }
    addM.mutate({ gid: trimmedGid, tabName: trimmedName });
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
          Paste the gid (page id) of a weekly tab and type the tab name exactly as it appears in the Google Sheet (must start with YYYYMMDD, e.g. "20260513 Target").
        </p>
      </div>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={gid}
          onChange={(e) => setGid(e.target.value)}
          placeholder="gid (e.g. 360979780)"
          style={{ flex: '1 1 200px', padding: '8px 10px', fontSize: 14 }}
          disabled={addM.isPending}
        />
        <input
          type="text"
          value={tabName}
          onChange={(e) => setTabName(e.target.value)}
          placeholder='Tab name (e.g. "20260513 Target")'
          style={{ flex: '2 1 260px', padding: '8px 10px', fontSize: 14 }}
          disabled={addM.isPending}
        />
        <button className="btn btnPrimary" type="submit" disabled={addM.isPending}>
          {addM.isPending ? 'Adding…' : 'Add tab'}
        </button>
      </form>
      {error && (
        <div style={{ background: 'var(--brandLight)', color: 'var(--brand)', padding: '8px 12px', borderRadius: 4, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {tabsQ.isLoading && <p>Loading…</p>}
      {tabsQ.error && <p style={{ color: 'var(--brand)' }}>Failed to load tabs.</p>}
      {tabsQ.data && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
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
              <tr key={t.id} style={{ borderBottom: '1px solid var(--borderLight)' }}>
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
