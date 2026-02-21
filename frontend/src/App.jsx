import { Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { RequireAuth } from './components/RequireAuth';
import { RequirePermission } from './components/RequirePermission';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { ExecutiveSummaryPage } from './pages/ExecutiveSummaryPage';
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardHomePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/leads-centre" element={
            <RequirePermission roles={['super_admin', 'ceo', 'marketing', 'od', 'rm']}>
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

          {/* Super admin only */}
          <Route path="/users" element={
            <RequirePermission roles={['super_admin']}><UsersPage /></RequirePermission>
          } />
          <Route path="/permissions" element={
            <RequirePermission roles={['super_admin']}><PermissionsPage /></RequirePermission>
          } />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

