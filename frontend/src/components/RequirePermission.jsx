import { Navigate } from 'react-router-dom';
import { getUser } from '../lib/auth';
import { usePermissions, canAccess } from '../lib/permissions';

/**
 * Protects a route based on dashboard permissions or role.
 * - `dashboard` — checks the user's dashboard permission (e.g. 'marketing', 'finance')
 * - `roles` — checks if the user has one of the specified roles (e.g. ['super_admin'])
 * Super admins bypass all permission checks.
 */
export function RequirePermission({ dashboard, roles, children }) {
    const user = getUser();
    const { permissions, isLoading } = usePermissions();

    // Super admin bypasses all
    if (user?.role === 'super_admin') return children;

    // Role-based check (e.g. users page is super_admin only)
    if (roles && roles.length > 0) {
        if (!user || !roles.includes(user.role)) {
            return <Navigate to="/" replace />;
        }
    }

    // Dashboard permission check
    if (dashboard) {
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

        if (!canAccess(dashboard, permissions)) {
            return <Navigate to="/" replace />;
        }
    }

    return children;
}
