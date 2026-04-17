import { useState } from 'react';
import { DAYS } from '../../lib/okr/constants';
import { n, weekRange, getRateColor, formatPct } from '../../lib/okr/utils';
import { RateBar } from './RateBar';
import { DailyAttendanceChart } from './DailyAttendanceChart';
import { FourWeekChart } from './FourWeekChart';

const WEEK_LABELS = ['3 Weeks', '2 Weeks', 'Last Week', 'This Week'];

export function BranchDetailCard({ record: r, metrics: m, trendWeeks }) {
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(3);

  // Resolve the record/metrics to display based on selected week toggle
  const displayRecord  = trendWeeks?.[selectedWeekIdx]?.record  || r;
  const displayMetrics = trendWeeks?.[selectedWeekIdx]?.metrics || m;

  // Use display values for the card (fall back to props if trendWeeks not available)
  const rec = displayRecord  || r;
  const met = displayMetrics || m;

  if (!rec || !met) return null;

  const kpis = [
    { label: 'Total Attendance',  value: met.totalAttendance,                       color: 'var(--info)' },
    { label: 'Attendance Rate',   value: formatPct(met.attendanceRate, 2),           color: getRateColor(met.attendanceRate) },
    { label: 'Rate w/ Freeze',    value: formatPct(met.attendanceRateWithFreeze, 2), color: getRateColor(met.attendanceRateWithFreeze) },
    { label: 'Active Students',   value: rec.active_students ?? '—',                 color: 'var(--text)' },
    { label: 'Outstanding Inv.',  value: formatPct(rec.outstanding_invoice_pct, 2),  color: parseFloat(rec.outstanding_invoice_pct) <= 25 ? 'var(--success)' : 'var(--brand)', unit: 'Target 20–25%' },
  ];

  return (
    <div className="okrDetailCard">
      <div className="okrDetailHeader">
        <div className="okrDetailHeaderLeft">
          <div className="okrDetailBranchIcon">🏢</div>
          <div>
            <h2 className="okrDetailBranch">{rec.branch}</h2>
            <span className="okrDetailWeek">Week of {weekRange(rec.week_date?.slice(0, 10))}</span>
          </div>
        </div>
        <div className="okrDetailHeaderRight">
          <div className="okrDetailBigRate">
            <span className="okrDetailBigRateNum" style={{ color: getRateColor(met.attendanceRate) }}>
              {met.attendanceRate.toFixed(1)}%
            </span>
            <span className="okrDetailBigRateLabel">Attendance Rate</span>
          </div>
        </div>
      </div>

      <div className="okrKpiRow">
        {kpis.map(k => (
          <div className="okrKpi" key={k.label}>
            <span className="okrKpiLabel">{k.label}</span>
            <span className="okrKpiValue" style={{ color: k.color }}>{k.value}</span>
            {k.unit && <span className="okrKpiUnit">{k.unit}</span>}
          </div>
        ))}
      </div>

      <div className="okrDetailBody">
        {/* Daily breakdown */}
        <div className="okrDetailSection okrDetailSectionWide">
          <div className="okrDetailSectionTitle">📆 Daily Attendance</div>

          {/* Week selector toggles */}
          {trendWeeks && trendWeeks.length > 0 && (
            <div className="okrWeekToggleRow">
              {WEEK_LABELS.map((label, i) => (
                <button
                  key={label}
                  className={`okrWeekToggleBtn${selectedWeekIdx === i ? ' okrWeekToggleBtnActive' : ''}`}
                  onClick={() => setSelectedWeekIdx(i)}
                  disabled={!trendWeeks[i]?.record}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="okrDailyLayout">
            <div className="okrDayBreakTable">
              <div className="okrDayBreakHead">
                <span>Day</span><span>Absent</span><span>Attended</span><span>Frozen</span><span>Replaced</span>
              </div>
              {DAYS.map(d => (
                <div className="okrDayBreakRow" key={d.key}>
                  <span className="okrDayBreakDay">{d.label}</span>
                  <span className="okrDayBreakAbsent">{rec[`${d.key}_absent`]}</span>
                  <span className="okrDayBreakAttend">{rec[`${d.key}_attended`]}</span>
                  <span className="okrDayBreakFrozen">{rec[`${d.key}_frozen`]}</span>
                  <span className="okrDayBreakReplace">{rec[`${d.key}_replaced`]}</span>
                </div>
              ))}
              <div className="okrDayBreakTotals">
                <span>Total</span>
                <span>{met.totalAbsent}</span>
                <span>{met.totalAttended}</span>
                <span>{met.totalFrozen}</span>
                <span>{met.totalReplaced}</span>
              </div>
            </div>
            <DailyAttendanceChart record={rec} />
          </div>
        </div>

        {/* 4-Week Trend Chart */}
        {trendWeeks && trendWeeks.length > 0 && (
          <div className="okrDetailSection okrDetailSectionWide">
            <div className="okrDetailSectionTitle">📊 4-Week Attendance Trend</div>
            <FourWeekChart trendWeeks={trendWeeks} />
          </div>
        )}

        {/* Attendance rates */}
        <div className="okrDetailSection">
          <div className="okrDetailSectionTitle">📈 Attendance Rate</div>
          <div className="okrRateVisual">
            <div className="okrRateVisualItem">
              <div className="okrRateVisualLabel">Standard Rate</div>
              <div className="okrRateVisualValue" style={{ color: getRateColor(met.attendanceRate) }}>{met.attendanceRate.toFixed(2)}%</div>
              <RateBar value={met.attendanceRate} />
              <div className="okrRateFormula">attended ÷ (attended + absent)</div>
            </div>
            <div className="okrRateVisualItem">
              <div className="okrRateVisualLabel">Rate WITH FREEZE</div>
              <div className="okrRateVisualValue" style={{ color: getRateColor(met.attendanceRateWithFreeze) }}>{met.attendanceRateWithFreeze.toFixed(2)}%</div>
              <RateBar value={met.attendanceRateWithFreeze} />
              <div className="okrRateFormula">(Sat attended + Sun attended) ÷ Total Attendance</div>
            </div>
          </div>
        </div>

        {/* Discrepancy */}
        <div className="okrDetailSection">
          <div className="okrDetailSectionTitle">⚠️ Discrepancy</div>
          <div className="okrInfoList">
            <div className="okrInfoRow"><span>Discrepancy</span><strong>{met.discrepancy}</strong></div>
            <div className="okrInfoRow okrInfoRowSub"><span>1a) Not Enrolled</span><span>{rec.not_enrolled}</span></div>
            <div className="okrInfoRow okrInfoRowSub"><span>1b) Outstanding Invoice</span><span>{rec.outstanding_invoice_disc}</span></div>
            <div className="okrInfoRow okrInfoRowSub"><span>1c) Expired Package</span><span>{rec.expired_package}</span></div>
            <div className="okrInfoRow okrInfoRowSub"><span>1d) Newly Enrolled</span><span>{rec.newly_enrolled}</span></div>
            <div className="okrInfoRow okrInfoRowBold"><span>Total Discrepancy</span><strong>{met.totalDisc}</strong></div>
            <div className="okrInfoRow okrInfoRowBold">
              <span>Remaining</span>
              <strong style={{ color: met.remainingDisc === 0 ? 'var(--success)' : 'var(--brand)' }}>{met.remainingDisc}</strong>
            </div>
          </div>
        </div>

        {/* Parent-Coach */}
        <div className="okrDetailSection">
          <div className="okrDetailSectionTitle">🤝 Parent-Coach Meetup</div>
          <div className="okrMeetupWrap">
            <div className="okrMeetupStat">
              <span className="okrMeetupNum">{rec.pc_meetup_invited ?? 0}</span>
              <span className="okrMeetupLabel">Invited</span>
            </div>
            <div className="okrMeetupArrow">→</div>
            <div className="okrMeetupStat">
              <span className="okrMeetupNum" style={{ color: 'var(--success)' }}>{rec.pc_meetup_showup ?? 0}</span>
              <span className="okrMeetupLabel">Showed Up</span>
            </div>
            {n(rec.pc_meetup_invited) > 0 && (
              <>
                <div className="okrMeetupArrow">=</div>
                <div className="okrMeetupStat">
                  <span className="okrMeetupNum" style={{ color: 'var(--info)' }}>
                    {((n(rec.pc_meetup_showup) / n(rec.pc_meetup_invited)) * 100).toFixed(0)}%
                  </span>
                  <span className="okrMeetupLabel">Show-up Rate</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Outstanding Invoices */}
        <div className="okrDetailSection">
          <div className="okrDetailSectionTitle">💰 Outstanding Invoices (AOne)</div>
          <div className="okrInvoiceWrap">
            <div className="okrInvoiceTarget">Target: 20–25%</div>
            <div className="okrInvoicePct" style={{ color: parseFloat(rec.outstanding_invoice_pct) <= 25 ? 'var(--success)' : 'var(--brand)' }}>
              {formatPct(rec.outstanding_invoice_pct, 2)}
            </div>
            <RateBar value={parseFloat(rec.outstanding_invoice_pct || 0)} max={50} />
            <div className="okrInfoList" style={{ marginTop: 12 }}>
              <div className="okrInfoRow"><span>Partially Paid + Unpaid</span><strong>{rec.partially_paid_unpaid}</strong></div>
              <div className="okrInfoRow"><span>Active Students</span><strong>{rec.active_students}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
