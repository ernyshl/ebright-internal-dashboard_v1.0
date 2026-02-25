import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

export function EventEntryPage() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    event_name: '',
    date_from: '',
    date_to: '',
    location: '',
    organizers: '',
  });
  const [editingId, setEditingId] = useState(null);

  // Fetch events
  const { data, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiFetch('/api/events'),
  });

  // Create event mutation
  const createMutation = useMutation({
    mutationFn: (newEvent) => apiFetch('/api/events', { method: 'POST', body: newEvent }),
    onSuccess: () => {
      queryClient.invalidateQueries(['events']);
      resetForm();
    },
  });

  // Update event mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, event }) => apiFetch(`/api/events/${id}`, { method: 'PUT', body: event }),
    onSuccess: () => {
      queryClient.invalidateQueries(['events']);
      resetForm();
    },
  });

  // Delete event mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => apiFetch(`/api/events/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries(['events']);
    },
  });

  const resetForm = () => {
    setFormData({
      event_name: '',
      date_from: '',
      date_to: '',
      location: '',
      organizers: '',
      remarks: ''
    });
    setEditingId(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, event: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (event) => {
    setFormData({
      event_name: event.event_name,
      date_from: event.date_from,
      date_to: event.date_to,
      location: event.location || '',
      organizers: event.organizers || '',
    });
    setEditingId(event.id);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this event?')) {
      deleteMutation.mutate(id);
    }
  };

  const events = data?.events || [];

  return (
    <div className="eventEntryPage" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <BackButton />
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: 'var(--text-color, #1f2937)' }}>📝 Event Entry</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '32px', alignItems: 'start' }}>
        {/* Events List Table */}
        <div style={{ 
          backgroundColor: 'var(--card-bg, white)', 
          borderRadius: '12px', 
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)', 
          overflow: 'hidden',
          border: '1px solid var(--border-color, #e5e7eb)'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color, #e5e7eb)', backgroundColor: 'var(--table-header-bg, #f9fafb)' }}>
            <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-color, #1f2937)' }}>Existing Events ({events.length})</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: 'var(--text-muted, #4b5563)' }}>Event Name</th>
                  <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: 'var(--text-muted, #4b5563)' }}>Dates</th>
                  <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: 'var(--text-muted, #4b5563)', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan="3" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
                ) : events.length === 0 ? (
                  <tr><td colSpan="3" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No events found</td></tr>
                ) : (
                  events.map(event => (
                    <tr key={event.id} style={{ borderBottom: '1px solid var(--border-color, #f3f4f6)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: '500', fontSize: '14px', color: 'var(--text-color, #1f2937)' }}>{event.event_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)' }}>📍 {event.location || 'N/A'}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-color, #4b5563)' }}>
                        {event.date_from} to {event.date_to}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button onClick={() => handleEdit(event)} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Edit</button>
                          <button onClick={() => handleDelete(event.id)} style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Entry Form */}
        <div style={{ 
          backgroundColor: 'var(--card-bg, white)', 
          padding: '24px', 
          borderRadius: '12px', 
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)', 
          position: 'sticky', 
          top: '24px',
          border: '1px solid var(--border-color, #e5e7eb)'
        }}>
          <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '20px', color: 'var(--text-color, #1f2937)' }}>{editingId ? 'Edit Event' : 'Add New Event'}</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600', color: 'var(--text-color, #1f2937)' }}>Event Name *</label>
              <input type="text" value={formData.event_name} onChange={(e) => setFormData({ ...formData, event_name: e.target.value })} required style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color, #d1d5db)', backgroundColor: 'var(--input-bg, white)', color: 'var(--text-color, black)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600', color: 'var(--text-color, #1f2937)' }}>From *</label>
                <input type="date" value={formData.date_from} onChange={(e) => setFormData({ ...formData, date_from: e.target.value })} required style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color, #d1d5db)', backgroundColor: 'var(--input-bg, white)', color: 'var(--text-color, black)' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600', color: 'var(--text-color, #1f2937)' }}>To *</label>
                <input type="date" value={formData.date_to} onChange={(e) => setFormData({ ...formData, date_to: e.target.value })} required style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color, #d1d5db)', backgroundColor: 'var(--input-bg, white)', color: 'var(--text-color, black)' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600', color: 'var(--text-color, #1f2937)' }}>Location</label>
              <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color, #d1d5db)', backgroundColor: 'var(--input-bg, white)', color: 'var(--text-color, black)' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600', color: 'var(--text-color, #1f2937)' }}>Organizers</label>
              <input type="text" value={formData.organizers} onChange={(e) => setFormData({ ...formData, organizers: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color, #d1d5db)', backgroundColor: 'var(--input-bg, white)', color: 'var(--text-color, black)' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} style={{ flex: 1, padding: '12px', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : (editingId ? 'Update Event' : 'Save Event')}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} style={{ padding: '12px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
