DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = '${appSchema}'
          AND table_name = 'session_card_progress'
    ) THEN
        EXECUTE '
            CREATE TABLE "${appSchema}".session_card_progress (
                user_id UUID NOT NULL REFERENCES "${appSchema}".users(id) ON DELETE CASCADE,
                deck_id UUID NOT NULL REFERENCES "${appSchema}".decks(id) ON DELETE CASCADE,
                card_id UUID NOT NULL REFERENCES "${appSchema}".cards(id) ON DELETE CASCADE,
                completed BOOLEAN NOT NULL DEFAULT FALSE,
                completed_at TIMESTAMPTZ,
                last_accessed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (user_id, deck_id, card_id)
            )
        ';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = '${appSchema}'
          AND indexname = 'idx_session_card_progress_user_deck_completed'
    ) THEN
        EXECUTE '
            CREATE INDEX idx_session_card_progress_user_deck_completed
            ON "${appSchema}".session_card_progress (user_id, deck_id, completed)
        ';
    END IF;
END
$$;
