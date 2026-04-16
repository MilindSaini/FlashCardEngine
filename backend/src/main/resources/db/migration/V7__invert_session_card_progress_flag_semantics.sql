DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = '${appSchema}'
          AND table_name = 'session_card_progress'
    ) THEN
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = '${appSchema}'
              AND table_name = 'session_card_progress'
              AND column_name = 'completed'
        ) THEN
            EXECUTE 'ALTER TABLE "${appSchema}".session_card_progress ALTER COLUMN completed SET DEFAULT TRUE';
            EXECUTE 'UPDATE "${appSchema}".session_card_progress SET completed = NOT completed';
        END IF;
    END IF;
END
$$;
