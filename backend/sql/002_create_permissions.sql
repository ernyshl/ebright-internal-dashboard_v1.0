-- User permissions table for dashboard access control
-- Run this on your PostgreSQL database after the users table

CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dashboard VARCHAR(50) NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, dashboard)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);

-- Default permissions for each role (can be customized by super admin)
COMMENT ON TABLE user_permissions IS 'Stores which dashboards each user can access. NULL means use role-based default.';
COMMENT ON COLUMN user_permissions.dashboard IS 'Dashboard identifier: marketing, leads, finance, operations, department, users';
COMMENT ON COLUMN user_permissions.can_view IS 'true = can view, false = cannot view, NULL in dashboard column means use role default';
