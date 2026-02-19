import { Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { RequireAuth } from './components/RequireAuth';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { ExecutiveSummaryPage } from './pages/ExecutiveSummaryPage';
import { MarketingPerformancePage } from './pages/MarketingPerformancePage';
import { LeadsBreakdownPage } from './pages/LeadsBreakdownPage';
import { UsersPage } from './pages/UsersPage';
import { LookerDashboardPage } from './pages/LookerDashboardPage';
import { FinanceDashboardPage } from './pages/FinanceDashboardPage';
import { DepartmentDashboardPage } from './pages/DepartmentDashboardPage';
import { DashboardHomePage } from './pages/DashboardHomePage';
import { LeadsCentrePage } from './pages/LeadsCentrePage';
import { PermissionsPage } from './pages/PermissionsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardHomePage />} />
          <Route path="/marketing-performance" element={<MarketingPerformancePage />} />
          <Route path="/branch-distribution" element={<LeadsBreakdownPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/permissions" element={<PermissionsPage />} />
          <Route path="/dashboard" element={<LookerDashboardPage />} />
          <Route path="/finance" element={<FinanceDashboardPage />} />
          <Route path="/department" element={<DepartmentDashboardPage />} />
          <Route path="/leads-centre" element={<LeadsCentrePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
