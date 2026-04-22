import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BRANCH_META, DAYS } from '../../lib/okr/constants';
import { calcMetrics, getRateColor, weekRange } from '../../lib/okr/utils';
import { USE_MOCK, MOCK_WEEK, MOCK_RECORDS } from '../../lib/okr/mock';
import { apiFetch } from '../../lib/api';
import { CompanyHealthBanner } from './CompanyHealthBanner';
import { AllBranchesGrid } from './AllBranchesGrid';
import { BranchDetailCard } from './BranchDetailCard';
import { RateBar } from './RateBar';

function toWednesday(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() - (d.getDay() - 3 + 7) % 7);
  return d.toISOString().slice(0, 10);
}
function thisWeekWed() {
  return toWednesday(new Date().toISOString().slice(0, 10));
}

/** Zero out every day except `activeDay` so existing components treat it as weekly data */
function toDayRecord(rec: any, activeDay: string) {
  const out = { ...rec };
  DAYS.forEach(({ key }) => {
    if (key !== activeDay) {
      out[`${key}_absent`]   = 0;
      out[`${key}_attended`] = 0;
      out[`${key}_frozen`]   = 0;
      out[`${key}_replaced`] = 0;
    }
  });
  return out;
}

export function DailyAttendanceView() {
  const [weekDate, setWeekDate]       = useState(USE_MOCK ? MOCK_WEEK : thisWeekWed());
  const [day, setDay]                 = useState('thu');
  const [selectedBranch, setSelectedBranch] = useState('');

  const { data } = useQuery({
    queryKey: ['okr-week', weekDate],
    queryFn: () => USE_MOCK
      ? { records: MOCK_RECORDS }
      : apiFetch(`/api/okr-attendance?week_date=${weekDate}&limit=100`),
    enabled: !!weekDate,
  });
  const weekRecords: any[] = data?.records ?? [];

  // Transform records so every component sees only the selected day's numbers
  const dayRecords = useMemo(
    () => weekRecords.map(r => toDayRecord(r, day)),
    [weekRecords, day]
  );

  const rankedRecords = useMemo(() =>
    dayRecords
      .map(r => ({ ...r, _m: calcMetrics(r) }))
      .sort((a, b) => b._m.attendanceRate - a._m.attendanceRate),
    [dayRecords]
  );

  const top5    = rankedRecords.slice(0, 5);
  const bottom5 = rankedRecords.slice(-5).reverse();

  const dashRecord  = selectedBranch ? dayRecords.find(r => r.branch === selectedBranch) ?? null : null;
  const dashMetrics = dashRecord ? calcMetrics(dashRecord) : null;

  const dayLabel = DAYS.find(d => d.key === day)?.label ?? day;

  return (
    <div>

      {/* ── Week + Day selectors ── */}
      <div className="okrDailyBulkControls" style={{ marginBottom: 20 }}>
        <div className="formGroup">
          <label>Week</label>
          <input type="date" value={weekDate}
            onChange={e => { setWeekDate(toWednesday(e.target.value)); setSelectedBranch(''); }} />
          {weekDate && <div className="okrWeekRangePill">{weekRange(weekDate)} (Wed)</div>}
        </div>
        <div className="formGroup">
          <label>View Day</label>
          <div className="okrDayTabs">
            {DAYS.map(d => (
              <button key={d.key} type="button"
                className={`okrDayTab${day === d.key ? ' okrDayTabActive' : ''}`}
                onClick={() => { setDay(d.key); setSelectedBranch(''); }}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Empty state ── */}
      {!weekDate ? (
        <div className="okrEmptyHero">
          <div className="okrEmptyIcon">📅</div>
          <h3>Select a week date above</h3>
          <p>Choose a week to view daily attendance</p>
        </div>
      ) : rankedRecords.length === 0 ? (
        <div className="okrEmptyHero">
          <div className="okrEmptyIcon">📭</div>
          <h3>No data for this week</h3>
          <p>Daily data is entered via the Data Entry tab</p>
        </div>
      ) : (
        <>
          {/* ── Company health banner ── */}
          <CompanyHealthBanner records={dayRecords} />

          {/* ── Top 5 / Bottom 5 ── */}
          <div className="okrRankCard">
            <div className="okrRankCardHeader">
              <div>
                <span className="okrRankCardTitle">Branch Rankings — {dayLabel}, Week of {weekDate}</span>
                <span className="okrRankBadge" style={{ marginLeft: 10 }}>{rankedRecords.length} branches</span>
              </div>
              <div className="okrRegionTabs">
                {/* intentionally no region filter in daily view to keep it simple */}
              </div>
            </div>
            <div className="okrRankGrid">
              <div className="okrRankHalf">
                <div className="okrRankHalfTitle okrRankTop"><span>🏆</span> Top 5 — Attendance Rate</div>
                {top5.map((r, i) => {
                  const meta = BRANCH_META[r.branch];
                  return (
                    <div key={r.id ?? r.branch}
                      className={`okrRankRow${selectedBranch === r.branch ? ' okrRankRowActive' : ''}`}
                      onClick={() => setSelectedBranch(r.branch)}>
                      <span className="okrRankPos okrRankPosTop">{i + 1}</span>
                      <div className="okrRankInfo">
                        <div className="okrRankBranchRow">
                          <span className="okrRankBranch">{r.branch}</span>
                          <span className="okrRankCode">{meta?.code}</span>
                          <span className={`okrRegionPill okrRegion${meta?.region}`}>R{meta?.region}</span>
                        </div>
                        <RateBar value={r._m.attendanceRate} />
                      </div>
                      <span className="okrRankPct" style={{ color: getRateColor(r._m.attendanceRate) }}>
                        {r._m.attendanceRate.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="okrRankDivider" />
              <div className="okrRankHalf">
                <div className="okrRankHalfTitle okrRankBot"><span>📉</span> Bottom 5 — Needs Attention</div>
                {bottom5.map((r, i) => {
                  const meta = BRANCH_META[r.branch];
                  return (
                    <div key={r.id ?? r.branch}
                      className={`okrRankRow${selectedBranch === r.branch ? ' okrRankRowActive' : ''}`}
                      onClick={() => setSelectedBranch(r.branch)}>
                      <span className="okrRankPos okrRankPosBot">{rankedRecords.length - bottom5.length + i + 1}</span>
                      <div className="okrRankInfo">
                        <div className="okrRankBranchRow">
                          <span className="okrRankBranch">{r.branch}</span>
                          <span className="okrRankCode">{meta?.code}</span>
                          <span className={`okrRegionPill okrRegion${meta?.region}`}>R{meta?.region}</span>
                        </div>
                        <RateBar value={r._m.attendanceRate} />
                      </div>
                      <span className="okrRankPct" style={{ color: getRateColor(r._m.attendanceRate) }}>
                        {r._m.attendanceRate.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── All branches / branch detail ── */}
          {!selectedBranch ? (
            <AllBranchesGrid records={rankedRecords} onSelect={setSelectedBranch} />
          ) : !dashRecord ? (
            <div className="okrEmptyHero okrEmptySmall">
              <div className="okrEmptyIcon">📭</div>
              <h3>No data for {selectedBranch}</h3>
            </div>
          ) : (
            <>
              <button className="okrBackToAll" onClick={() => setSelectedBranch('')}>← All Branches</button>
              <BranchDetailCard record={dashRecord} metrics={dashMetrics} trendWeeks={[]} />
            </>
          )}
        </>
      )}
    </div>
  );
}
