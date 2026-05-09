import { Navigate, Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import './App.css';
import { RequireAuth } from './components/RequireAuth';
import { RequirePermission } from './components/RequirePermission';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { MarketingPerformancePage } from './pages/MarketingPerformancePage';
import { LeadsBreakdownPage } from './pages/LeadsBreakdownPage';
import { UsersPage } from './pages/UsersPage';
import { ProfilePage } from './pages/ProfilePage';
import { LookerDashboardPage } from './pages/LookerDashboardPage';
import { DepartmentDashboardPage } from './pages/DepartmentDashboardPage';
import { DashboardHomePage } from './pages/DashboardHomePage';
import { LeadsCentrePage } from './pages/LeadsCentrePage';
import { PermissionsPage } from './pages/PermissionsPage';
import { AcademyDashboardPage } from './pages/AcademyDashboardPage';
import { HrRecruitmentFunnelPage } from './pages/HrRecruitmentFunnelPage';
import { EventDashboardPage } from './pages/EventDashboardPage';
import { EventEntryPage } from './pages/EventEntryPage';
import { ExecutiveSummaryPage } from './pages/ExecutiveSummaryPage';
import { BranchRankingPage } from './pages/BranchRankingPage';
import { AcademyBranchRevenueRenewalsPage } from './pages/AcademyBranchRevenueRenewalsPage';
import { TvPage } from './pages/TvPage';
import { DeviceManagerPage } from './pages/DeviceManagerPage';
import { LeadsDashboardPage } from './pages/LeadsDashboardPage';
import { LeadsGhlViewPage } from './pages/LeadsGhlViewPage';
import { PlatformBreakdownPage } from './pages/PlatformBreakdownPage';
import { GhlLeadsCentrePage } from './pages/GhlLeadsCentrePage';
import { GhlDashboardPage } from './pages/GhlDashboardPage';
import { TallyPage } from './pages/TallyPage';
import { HrOnbOfbDashboardPage } from './pages/HrOnbOfbDashboardPage';
import { HrStaffListPage } from './pages/HrStaffListPage';
import { FaDashboardPage } from './pages/FaDashboardPage';
import { FaDashboardTestingPage } from './pages/FaDashboardTestingPage';
import { PcmDashboardPage } from './pages/PcmDashboardPage';
import { HrMcPage } from './pages/HrMcPage';
import { EventMktDashboardPage } from './pages/EventMktDashboardPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { HrAttendancePage } from './pages/HrAttendancePage';
import { HrHiringPage } from './pages/HrHiringPage';
import { HrAnnualLeavePage } from './pages/HrAnnualLeavePage';
import { HrfsAttendancePage } from './pages/HrfsAttendancePage';
import { HrfsBranchStaffPage } from './pages/HrfsBranchStaffPage';
import { HrfsLeaveTransactionPage } from './pages/HrfsLeaveTransactionPage';
import { HrfsAttendanceDashboardPage } from './pages/HrfsAttendanceDashboardPage';
import { StAttendancePage } from './pages/StAttendancePage';
import { UiUxTestingPage } from './pages/UiUxTestingPage';
import { StudentDatabasePage } from './pages/StudentDatabasePage';
import { CoachBmPerformancePage } from './pages/CoachBmPerformancePage';
import { ArchivedStudentsPage } from './pages/ArchivedStudentsPage';
import { StudentAttendancePage } from './pages/StudentAttendancePage';
import { OkrAttendancePage } from './pages/OkrAttendancePage';
import { CtWithTimeSlotPage } from './pages/CtWithTimeSlotPage';
import { BranchPerformancePage } from './pages/BranchPerformancePage';
import FinanceRenewalByBranchPage from './pages/FinanceRenewalByBranchPage';
import { LeadsDashboardV2Page } from './pages/LeadsDashboardV2Page';
import { DayDistributionPage } from './pages/DayDistributionPage';
import { TimeSlotDistributionPage } from './pages/TimeSlotDistributionPage';
import { GhlIgnoredPayloadsPage } from './pages/GhlIgnoredPayloadsPage';
import { HrfsOverviewV2Page } from './pages/HrfsOverviewV2Page';
import { SalestrailPage } from './pages/SalestrailPage';
import { SalestrailBranchPage } from './pages/SalestrailBranchPage';


export default function App() {
  return (
    <Routes>
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/tv" element={<TvPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/fa-dashboard" element={<FaDashboardPage />} />
        <Route path="/fa-dashboard-testing" element={<FaDashboardTestingPage />} />
        <Route path="/pcm-dashboard" element={<PcmDashboardPage />} />
        <Route path="/okr-preview" element={<OkrAttendancePage />} />
        <Route element={<AppLayout />}>
          <Route index element={<DashboardHomePage />} />
          <Route path="/events" element={
            <RequirePermission dashboard="event_mkt"><EventDashboardPage /></RequirePermission>
          } />
          <Route path="/event-entry" element={
            <RequirePermission dashboard="event_mkt" roles={['super_admin', 'academy', 'marketing', 'od', 'rm']}><EventEntryPage /></RequirePermission>
          } />
          <Route path="/event-mkt-dashboard" element={
            <RequirePermission dashboard="event_mkt"><EventMktDashboardPage /></RequirePermission>
          } />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/leads-centre" element={
            <RequirePermission roles={['super_admin', 'ceo', 'marketing', 'od', 'rm', 'hr']}>
              <LeadsCentrePage />
            </RequirePermission>
          } />

          {/* Dashboard-permission-protected routes */}
          <Route path="/marketing-performance" element={
            <RequirePermission dashboard="marketing"><MarketingPerformancePage /></RequirePermission>
          } />
          <Route path="/branch-distribution" element={
            <RequirePermission dashboard="operations"><LeadsBreakdownPage /></RequirePermission>
          } />
          <Route path="/dashboard" element={
            <RequirePermission dashboard="operations"><LookerDashboardPage /></RequirePermission>
          } />
          <Route path="/academy/renewal-by-branch" element={
            <RequirePermission dashboard="academy"><FinanceRenewalByBranchPage /></RequirePermission>
          } />
          <Route path="/finance/renewal-by-branch" element={
            <Navigate to="/academy/renewal-by-branch" replace />
          } />
          <Route path="/academy/branch-revenue-renewals" element={
            <RequirePermission dashboard="academy"><AcademyBranchRevenueRenewalsPage /></RequirePermission>
          } />
          <Route path="/finance/branch-revenue-renewals" element={
            <Navigate to="/academy/branch-revenue-renewals" replace />
          } />
          <Route path="/department" element={
            <RequirePermission dashboard="department"><DepartmentDashboardPage /></RequirePermission>
          } />
          <Route path="/academy-dashboard" element={
            <RequirePermission dashboard="academy"><AcademyDashboardPage /></RequirePermission>
          } />
          <Route path="/hr-recruitment-funnel" element={
            <RequirePermission dashboards={['hr', 'hr_db']}><HrRecruitmentFunnelPage /></RequirePermission>
          } />
          <Route path="/hr-onb-ofb" element={
            <RequirePermission dashboard="hr"><HrOnbOfbDashboardPage /></RequirePermission>
          } />
          <Route path="/hr-staff-list" element={
            <RequirePermission dashboards={['hr_db', 'hr_crud']}><HrStaffListPage /></RequirePermission>
          } />
          <Route path="/hr-mc" element={
            <RequirePermission dashboard="hr_crud"><HrMcPage /></RequirePermission>
          } />
          <Route path="/hr-annual-leave" element={
            <RequirePermission dashboard="hr_crud"><HrAnnualLeavePage /></RequirePermission>
          } />
          <Route path="/hr-attendance" element={
            <RequirePermission dashboard="hr_db"><HrAttendancePage /></RequirePermission>
          } />
          <Route path="/hr-hiring" element={
            <RequirePermission dashboard="hr_db"><HrHiringPage /></RequirePermission>
          } />

          <Route path="/executive-summary" element={
            <RequirePermission roles={['super_admin', 'ceo']}><ExecutiveSummaryPage /></RequirePermission>
          } />
          <Route path="/branch-ranking" element={
            <RequirePermission dashboard="finance"><BranchRankingPage /></RequirePermission>
          } />

          {/* Admin */}
          <Route path="/users" element={
            <RequirePermission dashboard="admin"><UsersPage /></RequirePermission>
          } />
          <Route path="/permissions" element={
            <RequirePermission dashboard="admin"><PermissionsPage /></RequirePermission>
          } />
          <Route path="/admin/devices" element={
            <RequirePermission dashboard="admin"><DeviceManagerPage /></RequirePermission>
          } />
          <Route path="/admin/audit-log" element={
            <RequirePermission dashboard="admin"><AuditLogPage /></RequirePermission>
          } />
          <Route path="/admin/ghl-ignored" element={
            <RequirePermission dashboard="admin"><GhlIgnoredPayloadsPage /></RequirePermission>
          } />
          {/* Regional Manager */}
          <Route path="/leads-dashboard" element={
            <RequirePermission dashboard="rm_dashboard"><LeadsDashboardPage /></RequirePermission>
          } />
          <Route path="/leads-ghl-view" element={
            <RequirePermission dashboard="rm_dashboard"><LeadsGhlViewPage /></RequirePermission>
          } />
          {/* Marketing */}
          <Route path="/platform-breakdown" element={
            <RequirePermission dashboard="marketing"><PlatformBreakdownPage /></RequirePermission>
          } />
          {/* Testing */}
          <Route path="/ghl-lead-centre" element={
            <RequirePermission dashboard="operations_dept"><GhlLeadsCentrePage /></RequirePermission>
          } />
          <Route path="/ct-with-time-slot" element={
            <RequirePermission dashboard="operations_dept"><CtWithTimeSlotPage /></RequirePermission>
          } />
          <Route path="/ghl-dashboard" element={
            <RequirePermission dashboard="operations_dept"><GhlDashboardPage /></RequirePermission>
          } />
          <Route path="/tally" element={
            <RequirePermission dashboard="testing"><TallyPage /></RequirePermission>
          } />
          <Route path="/hrfs-attendance" element={
            <RequirePermission dashboard="hr_testing"><HrfsAttendancePage /></RequirePermission>
          } />
          <Route path="/hrfs-branch-staff" element={
            <RequirePermission dashboard="hr_testing"><HrfsBranchStaffPage /></RequirePermission>
          } />
          <Route path="/hrfs-leave-transactions" element={
            <RequirePermission dashboard="hr_testing"><HrfsLeaveTransactionPage /></RequirePermission>
          } />
          <Route path="/hrfs-attendance-dashboard" element={
            <RequirePermission dashboard="hr_testing"><HrfsAttendanceDashboardPage /></RequirePermission>
          } />
          <Route path="/hrfs-overview-v2" element={
            <RequirePermission dashboard="hr_testing"><HrfsOverviewV2Page /></RequirePermission>
          } />
          <Route path="/st-attendance" element={
            <RequirePermission dashboard="testing"><StAttendancePage /></RequirePermission>
          } />
          <Route path="/ui-ux-testing" element={
            <RequirePermission dashboard="testing"><UiUxTestingPage /></RequirePermission>
          } />
          <Route path="/branch-performance" element={
            <RequirePermission dashboard="testing"><BranchPerformancePage /></RequirePermission>
          } />
          <Route path="/salestrail" element={
            <RequirePermission dashboard="operations_dept"><SalestrailPage /></RequirePermission>
          } />
          <Route path="/salestrail/branch/:userId" element={
            <RequirePermission dashboard="operations_dept"><SalestrailBranchPage /></RequirePermission>
          } />
          <Route path="/leads-dashboard-v2" element={
            <RequirePermission dashboard="manjeet"><LeadsDashboardV2Page /></RequirePermission>
          } />
          <Route path="/day-distribution" element={
            <RequirePermission dashboard="manjeet"><DayDistributionPage /></RequirePermission>
          } />
          <Route path="/time-slot-distribution" element={
            <RequirePermission dashboard="manjeet"><TimeSlotDistributionPage /></RequirePermission>
          } />
          <Route path="/student-database" element={
            <RequirePermission dashboard="student_db"><StudentDatabasePage /></RequirePermission>
          } />
          <Route path="/archived-students" element={
            <RequirePermission dashboard="student_db"><ArchivedStudentsPage /></RequirePermission>
          } />
          <Route path="/student-attendance" element={
            <RequirePermission dashboard="student_db"><StudentAttendancePage /></RequirePermission>
          } />
          <Route path="/coach-bm-performance" element={
            <RequirePermission dashboard="student_db"><CoachBmPerformancePage /></RequirePermission>
          } />
          <Route path="/okr-attendance" element={
            <RequirePermission dashboards={["academy", "operations"]}><OkrAttendancePage /></RequirePermission>
          } />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/landing" replace />} />
    </Routes>
  );
}

