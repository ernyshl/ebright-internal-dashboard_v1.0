import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { BRANCH_META } from '../../lib/okr/constants';
import { calcMetrics, getRateColor, weekRange, prevWeekDate, toWednesday } from '../../lib/okr/utils';
import { BranchDetailCard } from './BranchDetailCard';

interface Props {
  branch: string;
  week: string;
  onBack: () => void;
  onPickBranch: (branch: string) => void;
  onPickWeek: (week: string) => void;
}

/**
 * In-page branch detail panel rendered inside the OKR Table tab.
 *
 * Layout: sticky sidebar listing every branch ranked by attendance rate
 * (click any to switch — one click, no scrolling) + main `BranchDetailCard`
 * pane showing the same week's metrics, daily breakdown, 4-week trend,
 * and frozen/replaced/absent/attended popups.
 */
export function OkrBranchDetailPanel({ branch, week, onBack, onPickBranch, onPickWeek }: Props) {
  const week1Date = useMemo(() => prevWeekDate(week, 1), [week]);
  const week2Date = useMemo(() => prevWeekDate(week, 2), [week]);
  const week3Date = useMemo(() => prevWeekDate(week, 3), [week]);

  const { data: weekData } = useQuery({
    queryKey: ['okr-week', week],
    queryFn: () => apiFetch(`/api/okr-attendance?week_date=${week}&limit=100`),
    enabled: !!week,
  });
  const { data: w1 } = useQuery({ queryKey: ['okr-week', week1Date], queryFn: () => apiFetch(`/api/okr-attendance?week_date=${week1Date}&limit=100`), enabled: !!week1Date });
  const { data: w2 } = useQuery({ queryKey: ['okr-week', week2Date], queryFn: () => apiFetch(`/api/okr-attendance?week_date=${week2Date}&limit=100`), enabled: !!week2Date });
  const { data: w3 } = useQuery({ queryKey: ['okr-week', week3Date], queryFn: () => apiFetch(`/api/okr-attendance?week_date=${week3Date}&limit=100`), enabled: !!week3Date });

  const { data: dashData, isLoading } = useQuery({
    queryKey: ['okr-dash', branch, week],
    queryFn: () => apiFetch(`/api/okr-attendance?branch=${encodeURIComponent(branch)}&week_date=${week}&limit=1`),
    enabled: !!branch && !!week,
  });

  const dashRecord = dashData?.records?.[0] ?? null;
  const dashMetrics = dashRecord ? calcMetrics(dashRecord) : null;

  const trendRec1 = (w1?.records ?? []).find((r: any) => r.branch === branch) ?? null;
  const trendRec2 = (w2?.records ?? []).find((r: any) => r.branch === branch) ?? null;
  const trendRec3 = (w3?.records ?? []).find((r: any) => r.branch === branch) ?? null;
  const trendWeeks = [
    { date: week3Date, record: trendRec3, metrics: trendRec3 ? calcMetrics(trendRec3) : null },
    { date: week2Date, record: trendRec2, metrics: trendRec2 ? calcMetrics(trendRec2) : null },
    { date: week1Date, record: trendRec1, metrics: trendRec1 ? calcMetrics(trendRec1) : null },
    { date: week,      record: dashRecord, metrics: dashMetrics },
  ];

  const sidebarRows = useMemo(() => {
    const records: any[] = weekData?.records ?? [];
    return records
      .map(r => {
        const m = calcMetrics(r);
        const meta = BRANCH_META[r.branch] ?? {};
        return {
          branch: r.branch,
          code: meta.code ?? r.branch.slice(0, 4),
          region: meta.region ?? '?',
          num: meta.num ?? 99,
          rate: m.attendanceRate,
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [weekData]);

  return (
    <div>
      {/* Breadcrumb / back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '6px 14px', borderRadius: 8, border: '1.5px solid var(--border)',
            background: '#fff', color: 'var(--text)', fontWeight: 700,
            fontSize: '0.82rem', cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
        >
          ← Back to Table
        </button>
        <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
          {branch} · Week of {weekRange(week)}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Week:</span>
          <input
            type="date"
            value={week}
            onChange={e => onPickWeek(toWednesday(e.target.value))}
            style={{ padding: '5px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '0.85rem', fontWeight: 600 }}
          />
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) 1fr', gap: 16, alignItems: 'start' }}>

        {/* Sidebar */}
        <aside style={{
          background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12,
          padding: '12px 10px', position: 'sticky', top: 12,
          maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            fontSize: '0.7rem', fontWeight: 800, color: 'var(--textSecondary)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            padding: '4px 6px 8px', borderBottom: '1px solid var(--border)', marginBottom: 6,
          }}>
            All Branches · Click to switch
          </div>
          {sidebarRows.length === 0 ? (
            <div style={{ padding: 12, fontSize: '0.8rem', color: 'var(--textSecondary)' }}>
              No data this week
            </div>
          ) : sidebarRows.map((r, i) => {
            const active = r.branch === branch;
            return (
              <button
                key={r.branch}
                type="button"
                onClick={() => onPickBranch(r.branch)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  width: '100%', textAlign: 'left',
                  padding: '7px 8px', borderRadius: 8,
                  border: '1.5px solid', borderColor: active ? '#6366f1' : 'transparent',
                  background: active ? '#eef2ff' : 'transparent',
                  cursor: 'pointer', marginBottom: 2, transition: 'all 0.12s',
                }}
                onMouseEnter={e => !active && (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 22, height: 20, borderRadius: 5, padding: '0 5px',
                  background: i < 3 ? 'linear-gradient(135deg,#fbbf24,#f59e0b)' : '#f1f5f9',
                  color: i < 3 ? '#7c2d12' : 'var(--textSecondary)',
                  fontSize: '0.65rem', fontWeight: 800,
                }}>
                  #{i + 1}
                </span>
                <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: active ? 800 : 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.branch}
                </span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: getRateColor(r.rate), fontVariantNumeric: 'tabular-nums' }}>
                  {r.rate.toFixed(1)}%
                </span>
              </button>
            );
          })}
        </aside>

        {/* Main detail */}
        <main>
          {isLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--textSecondary)' }}>Loading…</div>
          ) : !dashRecord ? (
            <div className="okrEmptyHero okrEmptySmall">
              <div className="okrEmptyIcon">📭</div>
              <h3>No data for {branch}</h3>
              <p>Try a different week or pick another branch from the sidebar.</p>
            </div>
          ) : (
            <BranchDetailCard
              key={`${branch}-${week}`}
              record={dashRecord}
              metrics={dashMetrics}
              trendWeeks={trendWeeks}
            />
          )}
        </main>
      </div>
    </div>
  );
}
