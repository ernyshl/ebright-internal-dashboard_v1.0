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
    remarks: '',
  });
  const [editingId, setEditingId] = useState(null);

  // Fetch events
  const { data, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiFetch('/api/events'),
    staleTime: 0,
    refetchOnMount: true,
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
    onError: (error) => {
      alert(error.data?.error || 'Failed to delete event');
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
      remarks: event.remarks || '',
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
    <div className="eventEntryPage" style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <BackButton />
        <h1 className="pageHeaderTitle">Event Entry</h1>
      </div>

      <div className="eventEntryGrid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', alignItems: 'start' }}>
        {/* Events List Table */}
        <div style={{ 
          backgroundColor: 'var(--card-bg, white)', 
          borderRadius: '12px', 
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)', 
          overflow: 'hidden',
          border: '1px solid var(--border-color, #e5e7eb)'
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color, #e5e7eb)', backgroundColor: 'var(--table-header-bg, #f9fafb)' }}>
            <h2 style={{ margin: 0, fontSize: '16px', color: 'var(--text-color, #1f2937)' }}>Existing Events ({events.length})</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted, #4b5563)' }}>Event Name</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted, #4b5563)' }}>Dates</th>
                  <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted, #4b5563)', textAlign: 'center' }}>Actions</th>
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
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: '500', fontSize: '14px', color: 'var(--text-color, #1f2937)' }}>{event.event_name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>📍 {event.location || 'N/A'}</div>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-color, #4b5563)' }}>
                        {event.date_from} to {event.date_to}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button onClick={() => handleEdit(event)} style={{ padding: '5px 10px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                          <button onClick={() => handleDelete(event.id)} style={{ padding: '5px 10px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>Delete</button>
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
          padding: '16px', 
          borderRadius: '12px', 
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)', 
          position: 'sticky', 
          top: '16px',
          border: '1px solid var(--border-color, #e5e7eb)'
        }}>
          <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', color: 'var(--text-color, #1f2937)' }}>{editingId ? 'Edit Event' : 'Add New Event'}</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-color, #1f2937)' }}>Event Name *</label>
              <input type="text" value={formData.event_name} onChange={(e) => setFormData({ ...formData, event_name: e.target.value })} required style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color, #d1d5db)', backgroundColor: 'var(--input-bg, white)', color: 'var(--text-color, black)', fontSize: '14px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-color, #1f2937)' }}>From *</label>
                <input type="date" value={formData.date_from} onChange={(e) => setFormData({ ...formData, date_from: e.target.value })} required style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color, #d1d5db)', backgroundColor: 'var(--input-bg, white)', color: 'var(--text-color, black)', fontSize: '14px' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-color, #1f2937)' }}>To *</label>
                <input type="date" value={formData.date_to} onChange={(e) => setFormData({ ...formData, date_to: e.target.value })} required style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color, #d1d5db)', backgroundColor: 'var(--input-bg, white)', color: 'var(--text-color, black)', fontSize: '14px' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-color, #1f2937)' }}>Location</label>
              <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color, #d1d5db)', backgroundColor: 'var(--input-bg, white)', color: 'var(--text-color, black)', fontSize: '14px' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-color, #1f2937)' }}>Organizers</label>
              <input type="text" value={formData.organizers} onChange={(e) => setFormData({ ...formData, organizers: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color, #d1d5db)', backgroundColor: 'var(--input-bg, white)', color: 'var(--text-color, black)', fontSize: '14px' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-color, #1f2937)' }}>Remarks</label>
              <textarea value={formData.remarks || ''} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} rows={3} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color, #d1d5db)', backgroundColor: 'var(--input-bg, white)', color: 'var(--text-color, black)', fontSize: '14px', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} style={{ flex: 1, padding: '10px', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : (editingId ? 'Update Event' : 'Save Event')}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} style={{ padding: '10px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>Cancel</button>
              )}
            </div>
          </form>
        </div>
      </div>
      
      <style>{`
        @media (min-width: 768px) {
          .eventEntryGrid {
            grid-template-columns: 1fr 350px !important;
            gap: '24px' !important;
          }
        }
        @media (min-width: 1024px) {
          .eventEntryGrid {
            grid-template-columns: 1fr 400px !important;
            gap: '32px' !important;
          }
          .eventEntryPage {
            padding: '24px' !important;
          }
        }
      `}</style>
    </div>
  );
}
