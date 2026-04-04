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
import { FinanceDashboardPage } from './pages/FinanceDashboardPage';
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
import { TvPage } from './pages/TvPage';
import { DeviceManagerPage } from './pages/DeviceManagerPage';
import { LeadsDashboardPage } from './pages/LeadsDashboardPage';
import { LeadsGhlViewPage } from './pages/LeadsGhlViewPage';
import { PlatformBreakdownPage } from './pages/PlatformBreakdownPage';

export default function App() {
  return (
    <Routes>
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/tv" element={<TvPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardHomePage />} />
          <Route path="/events" element={
            <RequirePermission dashboard="events"><EventDashboardPage /></RequirePermission>
          } />
          <Route path="/event-entry" element={
            <RequirePermission dashboard="events"><EventEntryPage /></RequirePermission>
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
          <Route path="/finance" element={
            <RequirePermission dashboard="finance"><FinanceDashboardPage /></RequirePermission>
          } />
          <Route path="/department" element={
            <RequirePermission dashboard="department"><DepartmentDashboardPage /></RequirePermission>
          } />
          <Route path="/academy-dashboard" element={
            <RequirePermission dashboard="academy"><AcademyDashboardPage /></RequirePermission>
          } />
          <Route path="/hr-recruitment-funnel" element={
            <RequirePermission dashboard="hr"><HrRecruitmentFunnelPage /></RequirePermission>
          } />

          <Route path="/executive-summary" element={
            <RequirePermission roles={['super_admin', 'ceo']}><ExecutiveSummaryPage /></RequirePermission>
          } />
          <Route path="/branch-ranking" element={
            <RequirePermission roles={['super_admin', 'ceo', 'finance', 'od', 'rm']}><BranchRankingPage /></RequirePermission>
          } />

          {/* Super admin only */}
          <Route path="/users" element={
            <RequirePermission roles={['super_admin']}><UsersPage /></RequirePermission>
          } />
          <Route path="/permissions" element={
            <RequirePermission roles={['super_admin']}><PermissionsPage /></RequirePermission>
          } />
          <Route path="/admin/devices" element={
            <RequirePermission roles={['super_admin']}><DeviceManagerPage /></RequirePermission>
          } />
          <Route path="/leads-dashboard" element={
            <RequirePermission roles={['super_admin', 'rm']}><LeadsDashboardPage /></RequirePermission>
          } />
          <Route path="/leads-ghl-view" element={
            <RequirePermission roles={['super_admin', 'rm']}><LeadsGhlViewPage /></RequirePermission>
          } />
          <Route path="/platform-breakdown" element={
            <RequirePermission roles={['super_admin']}><PlatformBreakdownPage /></RequirePermission>
          } />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/landing" replace />} />
    </Routes>
  );
}

