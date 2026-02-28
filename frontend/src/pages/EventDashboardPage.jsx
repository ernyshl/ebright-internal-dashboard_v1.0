import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

export function EventDashboardPage() {
  // Fetch events
  const { data, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiFetch('/api/events'),
  });

  const events = data?.events || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper to parse YYYY-MM-DD string as local date
  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const upcomingEvents = events.filter(event => parseLocalDate(event.date_from) > today);
  const ongoingEvents = events.filter(event => {
    const from = parseLocalDate(event.date_from);
    const to = parseLocalDate(event.date_to);
    return from <= today && to >= today;
  });
  const completedEvents = events.filter(event => parseLocalDate(event.date_to) < today);

  const EventSection = ({ title, events, color, icon, headerColor }) => (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ 
        backgroundColor: headerColor || '#1f2937', 
        color: 'white', 
        padding: '10px 16px', 
        borderRadius: '8px', 
        fontSize: '18px', 
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: '16px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        textTransform: 'uppercase',
        letterSpacing: '1px'
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {events.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#9ca3af', textAlign: 'center', padding: '20px', backgroundColor: '#111827', borderRadius: '8px', border: '1px dashed #374151' }}>
            No {title.toLowerCase()} events
          </div>
        ) : (
          events.map(event => (
            <div 
              key={event.id} 
              style={{ 
                padding: '16px',
                borderRadius: '10px',
                backgroundColor: '#1f2937',
                color: '#e5e7eb',
                border: '1px solid #374151',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                transition: 'transform 0.2s, border-color 0.2s'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ 
                    fontSize: '10px', 
                    padding: '3px 8px', 
                    borderRadius: '4px', 
                    backgroundColor: color, 
                    color: 'white',
                    fontWeight: 'bold',
                    textTransform: 'uppercase'
                  }}>
                    {icon}
                  </span>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>{event.event_name}</h3>
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '500' }}>
                  {new Date(event.date_from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {event.date_from !== event.date_to && ` – ${new Date(event.date_to).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                <div style={{ color: '#9ca3af' }}>
                  <span style={{ marginRight: '6px' }}>📍</span>
                  <span style={{ color: '#d1d5db' }}>{event.location || 'N/A'}</span>
                </div>
                <div style={{ color: '#9ca3af' }}>
                  <span style={{ marginRight: '6px' }}>👤</span>
                  <span style={{ color: '#d1d5db' }}>{event.organizers || 'N/A'}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="eventDashboardPage" style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto' }}>
      <div className="pageHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Event Dashboard</h1>
          <p className="pageHeaderSub">Upcoming, ongoing and completed events</p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '100px', fontSize: '18px', color: 'var(--text-muted, #6b7280)' }}>Loading Dashboard Data...</div>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(1, 1fr)',
          gap: '16px',
          backgroundColor: 'var(--dashboard-bg, #0f172a)',
          padding: '16px',
          borderRadius: '16px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          border: '1px solid var(--border-color, transparent)'
        }}
        className="eventDashboardGrid"
        >
          <EventSection title="Upcoming" events={upcomingEvents} color="#3b82f6" icon="Soon" headerColor="#1e3a8a" />
          <EventSection title="Ongoing" events={ongoingEvents} color="#ef4444" icon="Live" headerColor="#7f1d1d" />
          <EventSection title="Completed" events={completedEvents} color="#10b981" icon="Done" headerColor="#064e3b" />
        </div>
      )}
      
      <style>{`
        @media (min-width: 640px) {
          .eventDashboardGrid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: '20px' !important;
            padding: '20px' !important;
          }
        }
        @media (min-width: 1024px) {
          .eventDashboardGrid {
            grid-template-columns: repeat(3, 1fr) !important;
            gap: '24px' !important;
            padding: '32px' !important;
          }
        }
      `}</style>
    </div>
  );
}
