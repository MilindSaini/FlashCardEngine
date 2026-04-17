DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = '${appSchema}'
          AND table_name = 'user_streak_stats'
    ) THEN
        EXECUTE '
            CREATE TABLE "${appSchema}".user_streak_stats (
                user_id UUID PRIMARY KEY REFERENCES "${appSchema}".users(id) ON DELETE CASCADE,
                current_streak_days INT NOT NULL DEFAULT 0,
                longest_streak_days INT NOT NULL DEFAULT 0,
                total_logins BIGINT NOT NULL DEFAULT 0,
                total_actions BIGINT NOT NULL DEFAULT 0,
                last_login_date DATE,
                last_activity_date DATE,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT chk_user_streak_non_negative
                    CHECK (current_streak_days >= 0 AND longest_streak_days >= 0 AND total_logins >= 0 AND total_actions >= 0)
            )
        ';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = '${appSchema}'
          AND indexname = 'idx_user_streak_stats_updated_at'
    ) THEN
        EXECUTE '
            CREATE INDEX idx_user_streak_stats_updated_at
            ON "${appSchema}".user_streak_stats (updated_at DESC)
        ';
    END IF;
END
$$;
