import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

export function EventDashboardPage() {
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
  const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const completedEvents = events.filter(event => {
    const dateTo = parseLocalDate(event.date_to);
    return dateTo < today && dateTo >= firstDayLastMonth;
  });

  const SECTION_STYLES = {
    upcoming: { headerBg: 'var(--eventHeaderUpcoming, #1e3a8a)', badgeBg: '#3b82f6' },
    ongoing:  { headerBg: 'var(--eventHeaderOngoing, #7f1d1d)',  badgeBg: '#ef4444' },
    completed:{ headerBg: 'var(--eventHeaderDone, #064e3b)',     badgeBg: '#10b981' },
  };

  const EventSection = ({ title, events: sectionEvents, styleKey, icon }) => {
    const { headerBg, badgeBg } = SECTION_STYLES[styleKey];
    return (
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          backgroundColor: headerBg,
          color: 'white',
          padding: '10px 16px',
          borderRadius: '8px',
          fontSize: '18px',
          fontWeight: '700',
          textAlign: 'center',
          marginBottom: '16px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}>
          {title}
        </div>
        <div
          className="eventScrollContainer"
          style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '620px', overflowY: 'auto', paddingRight: '6px' }}
        >
          {sectionEvents.length === 0 ? (
            <div style={{
              fontSize: '13px',
              color: 'var(--textSecondary)',
              textAlign: 'center',
              padding: '20px',
              backgroundColor: 'var(--card)',
              borderRadius: '8px',
              border: '1px dashed var(--border)',
            }}>
              No {title.toLowerCase()} events
            </div>
          ) : (
            sectionEvents.map(event => (
              <div
                key={event.id}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--card)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  transition: 'transform 0.2s, border-color 0.2s',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      fontSize: '10px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      backgroundColor: badgeBg,
                      color: 'white',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                    }}>
                      {icon}
                    </span>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>{event.event_name}</h3>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--textSecondary)', fontWeight: '500' }}>
                    {new Date(event.date_from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {event.date_from !== event.date_to && ` – ${new Date(event.date_to).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                  <div style={{ color: 'var(--textSecondary)' }}>
                    <span style={{ marginRight: '6px' }}>📍</span>
                    <span style={{ color: 'var(--text)' }}>{event.location || 'N/A'}</span>
                  </div>
                  <div style={{ color: 'var(--textSecondary)' }}>
                    <span style={{ marginRight: '6px' }}>👤</span>
                    <span style={{ color: 'var(--text)' }}>{event.organizers || 'N/A'}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

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
        <div style={{ textAlign: 'center', padding: '100px', fontSize: '18px', color: 'var(--textSecondary)' }}>
          Loading Dashboard Data...
        </div>
      ) : (
        <div
          className="eventDashboardGrid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(1, 1fr)',
            gap: '16px',
            backgroundColor: 'var(--bg)',
            padding: '16px',
            borderRadius: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            border: '1px solid var(--border)',
          }}
        >
          <EventSection title="Upcoming"  styleKey="upcoming"  events={upcomingEvents}  icon="Soon" />
          <EventSection title="Ongoing"   styleKey="ongoing"   events={ongoingEvents}   icon="Live" />
          <EventSection title="Completed" styleKey="completed" events={completedEvents} icon="Done" />
        </div>
      )}
    </div>
  );
}
