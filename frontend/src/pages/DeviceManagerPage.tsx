import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';
import { TV_VIEWS } from '../lib/tvViews';

const TV_URL_BASE = window.location.origin;

function copyToClipboard(text, setCopied) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  });
}

function DeviceRow({ device, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.device_name);
  const [viewKey, setViewKey] = useState(device.view_key);
  const [copied, setCopied] = useState(false);
  const tvUrl = `${TV_URL_BASE}/tv?key=${device.api_key}`;

  const handleSave = () => {
    onUpdate(device.id, { device_name: name, view_key: viewKey });
    setEditing(false);
  };

  const viewLabel = TV_VIEWS.find(v => v.key === device.view_key)?.label || device.view_key;
  const lastSeen = device.last_seen
    ? new Date(device.last_seen).toLocaleString()
    : 'Never';

  return (
    <tr className={`deviceRow${!device.is_active ? ' deviceInactive' : ''}`}>
      <td className="deviceNameCell">
        {editing ? (
          <input
            className="filterInput"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: '140px' }}
          />
        ) : (
          <span>{device.device_name}</span>
        )}
      </td>
      <td className="deviceViewCell">
        {editing ? (
          <select
            className="filterSelect"
            value={viewKey}
            onChange={e => setViewKey(e.target.value)}
          >
            {TV_VIEWS.map(v => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
        ) : (
          <span className="deviceViewBadge">{viewLabel}</span>
        )}
      </td>
      <td className="deviceStatusCell">
        <span
          className={`deviceStatusDot ${device.is_active ? 'active' : 'inactive'}`}
          onClick={() => onUpdate(device.id, { is_active: !device.is_active })}
          title={device.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
        />
        {device.is_active ? 'Active' : 'Inactive'}
      </td>
      <td className="deviceLastSeenCell" title={lastSeen}>{lastSeen}</td>
      <td className="deviceUrlCell">
        <div className="deviceUrlRow">
          <span className="deviceUrlText">{tvUrl}</span>
          <button
            className="btn btnSmall btnGhost"
            onClick={() => copyToClipboard(tvUrl, setCopied)}
            title="Copy TV URL"
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>
      </td>
      <td className="deviceActionsCell">
        {editing ? (
          <>
            <button className="btn btnSmall btnPrimary" onClick={handleSave}>Save</button>
            <button className="btn btnSmall btnGhost" onClick={() => { setEditing(false); setName(device.device_name); setViewKey(device.view_key); }}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn btnSmall btnGhost" onClick={() => setEditing(true)}>Edit</button>
            <button className="btn btnSmall btnDanger" onClick={() => onDelete(device.id, device.device_name)}>Delete</button>
          </>
        )}
      </td>
    </tr>
  );
}

export function DeviceManagerPage() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newView, setNewView] = useState(TV_VIEWS[0].key);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['devices'],
    queryFn: () => apiFetch('/api/devices'),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/api/devices', { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); setNewName(''); showToast('✅ Device created'); },
    onError: (err: any) => showToast(`⚠️ ${err.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: any; body: any }) => apiFetch(`/api/devices/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); showToast('✅ Saved'); },
    onError: (err: any) => showToast(`⚠️ ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: any) => apiFetch(`/api/devices/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); showToast('🗑️ Deleted'); },
    onError: (err: any) => showToast(`⚠️ ${err.message}`),
  });

  const handleCreate = () => {
    if (!newName.trim()) return showToast('⚠️ Device name required');
    createMutation.mutate({ device_name: newName.trim(), view_key: newView });
  };

  const handleDelete = (id, name) => {
    if (!window.confirm(`Delete "${name}"? The TV will stop working.`)) return;
    deleteMutation.mutate(id);
  };

  const devices = data?.devices || [];

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">📺 TV Device Manager</h1>
          <p className="headerSubtitle">{devices.length} device{devices.length !== 1 ? 's' : ''} registered</p>
        </div>
      </div>

      {toast && <div className="brRankToast">{toast}</div>}

      {/* Add new device */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>Add New TV Device</h3>
        <div className="brRankFilters" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="brRankFilterGroup">
            <label className="brRankLabel">Device Name</label>
            <input
              className="filterInput"
              placeholder="e.g. TV Branch Ranking"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{ minWidth: 200 }}
            />
          </div>
          <div className="brRankFilterGroup">
            <label className="brRankLabel">View</label>
            <select className="filterSelect" value={newView} onChange={e => setNewView(e.target.value)}>
              {TV_VIEWS.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </div>
          <button
            className="btn btnPrimary"
            onClick={handleCreate}
            disabled={createMutation.isPending}
            style={{ alignSelf: 'flex-end' }}
          >
            {createMutation.isPending ? 'Creating…' : '+ Add Device'}
          </button>
        </div>
      </div>

      {/* Device table */}
      {isLoading ? (
        <div className="card"><div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div></div>
      ) : isError ? (
        <div className="errorText">Failed to load devices.</div>
      ) : devices.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
          No TV devices yet. Add one above.
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="dataTable" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Device Name</th>
                <th>View</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th>TV URL (paste in browser)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <DeviceRow
                  key={d.id}
                  device={d}
                  onUpdate={(id, body) => updateMutation.mutate({ id, body })}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        <strong>How it works:</strong><br />
        1. Add a device above and choose which view it should display.<br />
        2. Copy the TV URL and open it in the browser on the TV.<br />
        3. The TV authenticates automatically using the key in the URL — no login needed.<br />
        4. To change the view remotely, click Edit and change the view. The TV will pick up the new view on next reload (auto-reloads at 3 AM daily).
      </div>
    </div>
  );
}
