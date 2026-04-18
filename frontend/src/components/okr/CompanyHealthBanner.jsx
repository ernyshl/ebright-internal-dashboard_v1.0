import { useMemo } from 'react';
import { n, calcMetrics } from '../../lib/okr/utils';

export function CompanyHealthBanner({ records }) {
  // Compute company-wide health data
  const healthData = useMemo(() => {
    if (!records || records.length === 0) {
      return {
        totalActiveStudents: 0,
        totalExpectedAttendance: 0,
        calculatedGlobalAttendance: 0,
        dailyBreakdown: { wed: 0, thu: 0, fri: 0, sat: 0, sun: 0, replaced: 0, frozen: 0 },
        branchErrors: [],
        isMatching: false,
      };
    }

    // Sum all active students across all branches
    const totalActiveStudents = records.reduce((sum, r) => sum + n(r.active_students), 0);

    // Sum all total_onl_attendance (expected attendance from form)
    const totalExpectedAttendance = records.reduce((sum, r) => sum + n(r.total_onl_attendance), 0);

    // Calculate global attendance breakdown
    const dailyBreakdown = {
      wed: 0,
      thu: 0,
      fri: 0,
      sat: 0,
      sun: 0,
      replaced: 0,
      frozen: 0,
    };

    records.forEach(r => {
      dailyBreakdown.wed += n(r.wed_attended) + n(r.wed_absent);
      dailyBreakdown.thu += n(r.thu_attended) + n(r.thu_absent);
      dailyBreakdown.fri += n(r.fri_attended) + n(r.fri_absent);
      dailyBreakdown.sat += n(r.sat_attended) + n(r.sat_absent);
      dailyBreakdown.sun += n(r.sun_attended) + n(r.sun_absent);
      dailyBreakdown.replaced += n(r.wed_replaced) + n(r.thu_replaced) + n(r.fri_replaced) + n(r.sat_replaced) + n(r.sun_replaced);
      dailyBreakdown.frozen += n(r.wed_frozen) + n(r.thu_frozen) + n(r.fri_frozen) + n(r.sat_frozen) + n(r.sun_frozen);
    });

    const calculatedGlobalAttendance = Object.values(dailyBreakdown).reduce((s, v) => s + v, 0);

    // Identify problematic branches
    const branchErrors = [];
    records.forEach(r => {
      const metrics = calcMetrics(r);
      const branchTotal = metrics.totalAttendance; // This is the total for the branch
      const expected = n(r.total_onl_attendance);
      
      // Check if branch's daily sum matches its recorded total
      const branchDailySum = 
        n(r.wed_attended) + n(r.wed_absent) + n(r.wed_frozen) + n(r.wed_replaced) +
        n(r.thu_attended) + n(r.thu_absent) + n(r.thu_frozen) + n(r.thu_replaced) +
        n(r.fri_attended) + n(r.fri_absent) + n(r.fri_frozen) + n(r.fri_replaced) +
        n(r.sat_attended) + n(r.sat_absent) + n(r.sat_frozen) + n(r.sat_replaced) +
        n(r.sun_attended) + n(r.sun_absent) + n(r.sun_frozen) + n(r.sun_replaced);

      if (branchDailySum !== expected && expected > 0) {
        branchErrors.push({
          branch: r.branch,
          expected,
          calculated: branchDailySum,
          discrepancy: Math.abs(expected - branchDailySum),
        });
      }
    });

    const isMatching = totalExpectedAttendance === calculatedGlobalAttendance;

    return {
      totalActiveStudents,
      totalExpectedAttendance,
      calculatedGlobalAttendance,
      dailyBreakdown,
      branchErrors,
      isMatching,
    };
  }, [records]);

  if (!records || records.length === 0) {
    return null;
  }

  const { isMatching, totalActiveStudents, totalExpectedAttendance, calculatedGlobalAttendance, dailyBreakdown, branchErrors } = healthData;

  return (
    <div className={`companyHealthBanner${isMatching ? ' companyHealthMatch' : ' companyHealthMismatch'}`}>
      <div className="companyHealthContent">
        <div className="companyHealthHeader">
          <h3 className="companyHealthTitle">🏢 COMPANY HEALTH OVERVIEW</h3>
          <span className={`companyHealthStatus${isMatching ? ' companyHealthStatusOk' : ' companyHealthStatusError'}`}>
            {isMatching ? '✅ DATA VALIDATED' : '⚠️ DATA MISMATCH DETECTED'}
          </span>
        </div>

        <div className="companyHealthMain">
          <div className="companyHealthMainText">
            <span>Total Active Students: <strong>{totalActiveStudents}</strong></span>
            <span>Total Student Attendance: <strong>{totalExpectedAttendance}</strong></span>
            <span>Total Weekly Attendance: <strong>{calculatedGlobalAttendance}</strong></span>
          </div>
        </div>

        <div className="companyHealthSubtext">
          Wed: <strong>{dailyBreakdown.wed}</strong> | Thu: <strong>{dailyBreakdown.thu}</strong> | Fri: <strong>{dailyBreakdown.fri}</strong> | Sat: <strong>{dailyBreakdown.sat}</strong> | Sun: <strong>{dailyBreakdown.sun}</strong> | Replaced: <strong>{dailyBreakdown.replaced}</strong> | Frozen: <strong>{dailyBreakdown.frozen}</strong>
        </div>

        {!isMatching && branchErrors.length > 0 && (
          <div className="companyHealthWarning">
            <div className="companyHealthWarningTitle">⚠️ Action Required</div>
            <div className="companyHealthWarningBranches">
              {branchErrors.slice(0, 3).map(err => (
                <div key={err.branch} className="companyHealthWarningItem">
                  <span className="companyHealthBranchName">{err.branch}</span>
                  <span className="companyHealthBranchDisc">Expected: {err.expected} | Calculated: {err.calculated} | Diff: {err.discrepancy}</span>
                </div>
              ))}
              {branchErrors.length > 3 && (
                <div className="companyHealthWarningItem">
                  <span className="companyHealthBranchName">+ {branchErrors.length - 3} more branches</span>
                </div>
              )}
            </div>
          </div>
        )}

        {!isMatching && branchErrors.length === 0 && (
          <div className="companyHealthWarning">
            <div className="companyHealthWarningTitle">⚠️ Data Mismatch</div>
            <span>Total Expected vs Calculated discrepancy detected. Please review all branch entries.</span>
          </div>
        )}

        {isMatching && (
          <div className="companyHealthSuccessMsg">
            All branch entries are perfectly synced and tallied.
          </div>
        )}
      </div>
    </div>
  );
}
