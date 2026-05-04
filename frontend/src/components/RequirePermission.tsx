import { Navigate } from 'react-router-dom';
import { getUser } from '../lib/auth';
import { usePermissions, canAccess } from '../lib/permissions';

/**
 * Protects a route based on dashboard permissions or role.
 * - `dashboard`  — single permission key the user must have
 * - `dashboards` — array of keys; access granted if user has ANY of them
 *                   (used for routes shared between cards, e.g. /hr-staff-list
 *                   appears in both 'hr_db' and 'hr_crud' cards)
 * - `roles`      — checks if the user has one of the specified roles
 * Super admins bypass all permission checks.
 */
export function RequirePermission({ dashboard, dashboards, roles, children }: { dashboard?: string; dashboards?: string[]; roles?: string[]; children: any }) {
    const user = getUser();
    const { permissions, isLoading } = usePermissions();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Super admins bypass all permission checks
    if (user.role === 'super_admin') return children;

    // Role-based check (e.g. users page is super_admin only)
    if (roles && roles.length > 0) {
        if (!roles.includes(user.role)) {
            return <Navigate to="/" replace />;
        }
    }

    // Dashboard permission check (single or any-of)
    const keys = dashboards && dashboards.length > 0 ? dashboards : (dashboard ? [dashboard] : []);
    if (keys.length > 0) {
        if (isLoading) {
            return (
                <div className="dashboardPage">
                    <div className="dashboardContent">
                        <div className="loadingState">
                            <div className="spinner"></div>
                            <p>Checking permissions...</p>
                        </div>
                    </div>
                </div>
            );
        }

        const allowed = keys.some(k => canAccess(k, permissions));
        if (!allowed) {
            return <Navigate to="/" replace />;
        }
    }

    return children;
}
