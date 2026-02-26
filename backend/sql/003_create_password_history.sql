-- Password history table for preventing password reuse
-- Run this migration to enable password history tracking

CREATE TABLE IF NOT EXISTS password_history (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups when checking password history
CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON password_history(user_id);

-- Optional: Create a trigger to automatically clean old password history
-- This keeps only the last 10 password entries per user
CREATE OR REPLACE FUNCTION clean_old_password_history()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM password_history
    WHERE user_id = NEW.user_id
    AND id NOT IN (
        SELECT id FROM password_history
        WHERE user_id = NEW.user_id
        ORDER BY created_at DESC
        LIMIT 10
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (for re-runnability)
DROP TRIGGER IF EXISTS trg_clean_password_history ON password_history;

CREATE TRIGGER trg_clean_password_history
    AFTER INSERT ON password_history
    FOR EACH ROW
    EXECUTE FUNCTION clean_old_password_history();