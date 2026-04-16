DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = '${appSchema}'
          AND table_name = 'session_state'
    ) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = '${appSchema}'
              AND table_name = 'session_state'
              AND column_name = 'completed_cards'
        ) THEN
            EXECUTE 'ALTER TABLE "${appSchema}".session_state ADD COLUMN completed_cards INT NOT NULL DEFAULT 0';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = '${appSchema}'
              AND table_name = 'session_state'
              AND column_name = 'total_cards'
        ) THEN
            EXECUTE 'ALTER TABLE "${appSchema}".session_state ADD COLUMN total_cards INT NOT NULL DEFAULT 0';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = '${appSchema}'
              AND table_name = 'session_state'
              AND column_name = 'all_cards_mode'
        ) THEN
            EXECUTE 'ALTER TABLE "${appSchema}".session_state ADD COLUMN all_cards_mode BOOLEAN NOT NULL DEFAULT FALSE';
        END IF;
    END IF;
END
$$;
