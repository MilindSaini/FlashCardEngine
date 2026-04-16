DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = '${appSchema}'
          AND table_name = 'deck_concept_graph'
    ) THEN
        EXECUTE '
            CREATE TABLE "${appSchema}".deck_concept_graph (
                deck_id UUID PRIMARY KEY REFERENCES "${appSchema}".decks(id) ON DELETE CASCADE,
                graph_json TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        ';
    END IF;
END
$$;
