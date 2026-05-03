import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

const SHEET_BASE_ID = '1UytP05QWxQDHogYBZBXPcgFqPDAl6MbtzTcir3vbB2w';

function fmtDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const parseRow = (line) => {
    const values = []; let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    values.push(cur.trim());
    return values;
  };
  // Find the header row (the one containing "CONFIRMATION")
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (lines[i].toUpperCase().includes('CONFIRMATION')) { headerIdx = i; break; }
  }
  const headers = parseRow(lines[headerIdx]).map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(headerIdx + 1).map(line => {
    const vals = parseRow(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
    return row;
  });
}

async function fetchConfirmedCount(gids) {
  if (!gids || gids.length === 0) return 0;
  let total = 0;
  for (const gid of gids) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_BASE_ID}/export?format=csv&gid=${gid.trim()}`;
      const res = await fetch(url);
      const text = await res.text();
      const rows = parseCSV(text);
      const count = rows.filter(r => (r['CONFIRMATION'] || '').toLowerCase() === 'yes').length;
      total += count;
    } catch { /* skip failed sheets */ }
  }
  return total;
}

const EMPTY_VENUE = { venue_name: '', date_from: '', date_to: '', sheet_gids: '', actual_count: 0, sort_order: 0 };

export function EventMktDashboardPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_VENUE });
  const [confirmed, setConfirmed] = useState({});
  const [loadingConfirmed, setLoadingConfirmed] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['eventMktVenues'],
    queryFn: () => apiFetch('/api/event-mkt/venues'),
    staleTime: 2 * 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['eventMktVenues'] });
  const createMutation = useMutation({ mutationFn: (body: any) => apiFetch('/api/event-mkt/venues', { method: 'POST', body }), onSuccess: () => { invalidate(); setShowForm(false); setForm({ ...EMPTY_VENUE }); } });
  const updateMutation = useMutation({ mutationFn: ({ id, body }: { id: any; body: any }) => apiFetch(`/api/event-mkt/venues/${id}`, { method: 'PUT', body }), onSuccess: () => { invalidate(); setShowForm(false); setEditingId(null); setForm({ ...EMPTY_VENUE }); } });
  const deleteMutation = useMutation({ mutationFn: (id: any) => apiFetch(`/api/event-mkt/venues/${id}`, { method: 'DELETE' }), onSuccess: () => invalidate() });

  const venues = data?.venues || [];

  // Fetch confirmed counts from GSheet
  useEffect(() => {
    if (venues.length === 0) return;
    let cancelled = false;
    setLoadingConfirmed(true);
    Promise.all(
      venues.map(async (v) => {
        const gids = v.sheet_gids ? v.sheet_gids.split(',').map(g => g.trim()).filter(Boolean) : [];
        const count = await fetchConfirmedCount(gids);
        return [v.id, count];
      })
    ).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(([id, count]) => { map[id] = count; });
      setConfirmed(map);
      setLoadingConfirmed(false);
    });
    return () => { cancelled = true; };
  }, [venues]);

  const handleEdit = (v) => {
    setEditingId(v.id);
    setForm({
      venue_name: v.venue_name || '',
      date_from: v.date_from ? v.date_from.split('T')[0] : '',
      date_to: v.date_to ? v.date_to.split('T')[0] : '',
      sheet_gids: v.sheet_gids || '',
      actual_count: v.actual_count || 0,
      sort_order: v.sort_order || 0,
    });
    setShowForm(true);
  };

  const handleAdd = () => { setEditingId(null); setForm({ ...EMPTY_VENUE }); setShowForm(true); };
  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) updateMutation.mutate({ id: editingId, body: form });
    else createMutation.mutate(form);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Event MKT Dashboard</h1>
          <p className="headerSubtitle">FA Event Confirmation Tracker</p>
        </div>
        <button className="btn btnPrimary btnSmall" onClick={handleAdd} style={{ marginLeft: 'auto' }}>+ Add Venue</button>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{editingId ? 'Edit Venue' : 'Add New Venue'}</h3>
            <button className="btn btnGhost btnSmall" onClick={() => { setShowForm(false); setEditingId(null); }}>✕ Cancel</button>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label className="field"><div className="label">Venue Name</div><input className="input" value={form.venue_name} onChange={e => setForm({ ...form, venue_name: e.target.value })} required placeholder="e.g. Location 1" /></label>
            <label className="field"><div className="label">Date From</div><input className="input" type="date" value={form.date_from} onChange={e => setForm({ ...form, date_from: e.target.value })} /></label>
            <label className="field"><div className="label">Date To</div><input className="input" type="date" value={form.date_to} onChange={e => setForm({ ...form, date_to: e.target.value })} /></label>
            <label className="field"><div className="label">Sheet GIDs (comma-separated)</div><input className="input" value={form.sheet_gids} onChange={e => setForm({ ...form, sheet_gids: e.target.value })} placeholder="e.g. 883092122,473415667" /></label>
            <label className="field"><div className="label">Actual Count</div><input className="input" type="number" value={form.actual_count} onChange={e => setForm({ ...form, actual_count: e.target.value })} min="0" /></label>
            <label className="field"><div className="label">Sort Order</div><input className="input" type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} min="0" /></label>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button className="btn btnPrimary" type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : (editingId ? 'Save' : 'Add Venue')}</button>
            </div>
            {(createMutation.isError || updateMutation.isError) && <div style={{ gridColumn: '1 / -1', color: 'var(--brand)', fontSize: 12 }}>{createMutation.error?.data?.error || updateMutation.error?.data?.error || 'Failed'}</div>}
          </form>
        </div>
      )}

      {/* Main Table */}
      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}><div className="loadingDots"><span /><span /><span /></div></div>
      ) : venues.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No venues added yet. Click "+ Add Venue" to start.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead>
              <tr>
                <th style={{ minWidth: 100, position: 'sticky', left: 0, background: 'var(--panel)', zIndex: 2 }}></th>
                {venues.map(v => (
                  <th key={v.id} style={{ textAlign: 'center', minWidth: 140 }}>
                    <div>{v.venue_name}</div>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 4 }}>
                      <button className="btn btnSmall btnGhost" onClick={() => handleEdit(v)} style={{ fontSize: 10, padding: '2px 6px' }}>Edit</button>
                      <button className="btn btnSmall btnDanger" onClick={() => { if (confirm(`Delete "${v.venue_name}"?`)) deleteMutation.mutate(v.id); }} style={{ fontSize: 10, padding: '2px 6px' }}>Del</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Row 1: Date */}
              <tr>
                <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--panel)', zIndex: 1 }}>Date</td>
                {venues.map(v => (
                  <td key={v.id} style={{ textAlign: 'center', fontSize: 12 }}>
                    {v.date_from && v.date_to
                      ? `${fmtDateShort(v.date_from)} - ${fmtDateShort(v.date_to)}`
                      : v.date_from ? fmtDateShort(v.date_from)
                      : '—'}
                  </td>
                ))}
              </tr>
              {/* Row 2: Confirmed (from GSheet) */}
              <tr style={{ background: 'var(--successLight)' }}>
                <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--successLight)', zIndex: 1 }}>Confirmed</td>
                {venues.map(v => (
                  <td key={v.id} style={{ textAlign: 'center', fontWeight: 600, fontSize: 16 }}>
                    {loadingConfirmed ? '...' : (confirmed[v.id] !== undefined ? confirmed[v.id] : '—')}
                  </td>
                ))}
              </tr>
              {/* Row 3: Actual (manual) */}
              <tr style={{ background: 'var(--infoLight)' }}>
                <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--infoLight)', zIndex: 1 }}>Actual</td>
                {venues.map(v => (
                  <td key={v.id} style={{ textAlign: 'center', fontWeight: 600, fontSize: 16 }}>
                    {v.actual_count || 0}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
        <strong>How it works:</strong><br />
        1. Add a venue column with name, date range, and GSheet GIDs (comma-separated for multi-day events).<br />
        2. "Confirmed" auto-pulls from GSheet column G (CONFIRMATION = "Yes") across all linked sheets.<br />
        3. "Actual" is manually entered via Edit.<br />
        4. To add more venue columns, click "+ Add Venue".
      </div>
    </div>
  );
}
