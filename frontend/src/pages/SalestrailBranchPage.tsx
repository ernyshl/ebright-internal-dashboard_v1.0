import { useQuery } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

function fmtDuration(secs: number): string {
  if (!secs) return '0s';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface CallRow {
  call_id: string;
  call_date: string;
  call_time: string;
  duration: string;
  answered: boolean;
  inbound: boolean;
  number: string;
  formatted_number: string;
  phonebook_name: string | null;
  recording_uri: string | null;
  rec_type: string | null;
  source_detail: string | null;
}

export function SalestrailBranchPage() {
  const { userId } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  const periodQuery = searchParams.get('period') || 'date_from=&date_to=';
  const branchName = searchParams.get('name') || 'Branch';

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function handlePlay(callId: string) {
    if (playingId === callId) {
      setPlayingId(null);
      return;
    }
    if (audioUrls[callId]) {
      setPlayingId(callId);
      return;
    }
    setLoadingId(callId);
    try {
      const data = await apiFetch(`/api/salestrail/recording-url/${callId}`);
      setAudioUrls(prev => ({ ...prev, [callId]: data.url }));
      setPlayingId(callId);
    } catch {
      alert('Failed to load recording.');
    } finally {
      setLoadingId(null);
    }
  }

  const q = useQuery({
    queryKey: ['salestrail', 'calls', userId, periodQuery],
    queryFn: () => apiFetch(`/api/salestrail/calls?user_id=${userId}&${periodQuery}`),
    enabled: !!userId,
  });

  const calls: CallRow[] = q.data?.calls || [];
  const answered = calls.filter(c => c.answered).length;
  const missed = calls.filter(c => !c.answered).length;
  const outbound = calls.filter(c => !c.inbound).length;
  const inbound = calls.filter(c => c.inbound).length;
  const withRecording = calls.filter(c => c.recording_uri).length;
  const totalDuration = calls.reduce((s, c) => s + parseInt(c.duration || '0'), 0);

  return (
    <div className="leadsBreakdownPage">
      <div className="pageHeader">
        <div className="backButtonContainer">
          <BackButton to="/salestrail" label="Back to Ranking" />
        </div>
        <div className="pageHeaderTitle">📞 {branchName}</div>
        <div className="pageHeaderSub">Call recordings &amp; details</div>
        <div className="refreshButtonContainer">
          <button className="btn btnSmall" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="card">
          <div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading calls…</div>
        </div>
      ) : q.isError ? (
        <div className="errorText">Failed to load call data.</div>
      ) : (
        <>
          {/* Summary */}
          <div className="summaryStats" style={{ marginBottom: 24 }}>
            <div className="statCard" style={{ '--stat-color': '#3b82f6' } as React.CSSProperties}>
              <div className="statCardIcon">📞</div>
              <div className="statCardContent">
                <div className="statCardValue">{calls.length}</div>
                <div className="statCardTitle">Total Calls</div>
              </div>
            </div>
            <div className="statCard" style={{ '--stat-color': '#10b981' } as React.CSSProperties}>
              <div className="statCardIcon">✅</div>
              <div className="statCardContent">
                <div className="statCardValue">{answered}</div>
                <div className="statCardTitle">Answered</div>
              </div>
            </div>
            <div className="statCard" style={{ '--stat-color': '#ef4444' } as React.CSSProperties}>
              <div className="statCardIcon">❌</div>
              <div className="statCardContent">
                <div className="statCardValue">{missed}</div>
                <div className="statCardTitle">Missed</div>
              </div>
            </div>
            <div className="statCard" style={{ '--stat-color': '#f59e0b' } as React.CSSProperties}>
              <div className="statCardIcon">📤</div>
              <div className="statCardContent">
                <div className="statCardValue">{outbound}</div>
                <div className="statCardTitle">Outbound</div>
              </div>
            </div>
            <div className="statCard" style={{ '--stat-color': '#6366f1' } as React.CSSProperties}>
              <div className="statCardIcon">📥</div>
              <div className="statCardContent">
                <div className="statCardValue">{inbound}</div>
                <div className="statCardTitle">Inbound</div>
              </div>
            </div>
            <div className="statCard" style={{ '--stat-color': '#8b5cf6' } as React.CSSProperties}>
              <div className="statCardIcon">🎙️</div>
              <div className="statCardContent">
                <div className="statCardValue">{withRecording}</div>
                <div className="statCardTitle">With Recording</div>
              </div>
            </div>
            <div className="statCard" style={{ '--stat-color': '#0ea5e9' } as React.CSSProperties}>
              <div className="statCardIcon">⏱️</div>
              <div className="statCardContent">
                <div className="statCardValue">{fmtDuration(totalDuration)}</div>
                <div className="statCardTitle">Total Talk Time</div>
              </div>
            </div>
          </div>

          {calls.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
              No calls for this period.
            </div>
          ) : (
            <div className="section">
              <div className="branchTableWrap">
                <table className="branchTable">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Number</th>
                      <th className="textCenter">Direction</th>
                      <th className="textCenter">Status</th>
                      <th className="textRight">Duration</th>
                      <th className="textCenter">Recording</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((call) => {
                      const dur = parseInt(call.duration || '0');
                      const displayNumber = call.phonebook_name || call.formatted_number || call.number || '—';
                      const isPlaying = playingId === call.call_id;

                      return (
                        <>
                          <tr key={call.call_id}>
                            <td style={{ fontSize: 13 }}>{call.call_date}</td>
                            <td style={{ fontSize: 13, color: 'var(--muted)' }}>{call.call_time?.slice(0, 5)}</td>
                            <td style={{ fontSize: 13 }}>{displayNumber}</td>
                            <td className="textCenter">
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                                background: call.inbound ? '#dbeafe' : '#fef3c7',
                                color: call.inbound ? '#1d4ed8' : '#92400e',
                              }}>
                                {call.inbound ? '← IN' : '→ OUT'}
                              </span>
                            </td>
                            <td className="textCenter">
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                                background: call.answered ? '#d1fae5' : '#fee2e2',
                                color: call.answered ? '#065f46' : '#991b1b',
                              }}>
                                {call.answered ? 'Answered' : 'Missed'}
                              </span>
                            </td>
                            <td className="textRight" style={{ fontSize: 13, color: 'var(--muted)' }}>
                              {dur > 0 ? fmtDuration(dur) : '—'}
                            </td>
                            <td className="textCenter">
                              {call.recording_uri ? (
                                <button
                                  className="btn btnSmall"
                                  style={{
                                    fontSize: 11, padding: '3px 10px',
                                    background: isPlaying ? '#6366f1' : undefined,
                                    color: isPlaying ? '#fff' : undefined,
                                    opacity: loadingId === call.call_id ? 0.6 : 1,
                                  }}
                                  disabled={loadingId === call.call_id}
                                  onClick={() => handlePlay(call.call_id)}
                                >
                                  {loadingId === call.call_id ? '…' : isPlaying ? '⏸ Close' : '▶ Play'}
                                </button>
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                              )}
                            </td>
                          </tr>
                          {isPlaying && audioUrls[call.call_id] && (
                            <tr key={`${call.call_id}-player`}>
                              <td colSpan={7} style={{ padding: '8px 16px', background: 'var(--surface-muted, #f8fafc)' }}>
                                <audio
                                  ref={audioRef}
                                  controls
                                  autoPlay
                                  style={{ width: '100%', height: 36 }}
                                  src={audioUrls[call.call_id]}
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
