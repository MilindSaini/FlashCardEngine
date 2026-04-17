DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = '${appSchema}'
          AND table_name = 'ingestion_jobs'
    ) THEN
        EXECUTE '
            CREATE TABLE "${appSchema}".ingestion_jobs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES "${appSchema}".users(id) ON DELETE CASCADE,
                deck_id UUID NOT NULL REFERENCES "${appSchema}".decks(id) ON DELETE CASCADE,
                file_key TEXT NOT NULL,
                status VARCHAR(16) NOT NULL,
                stage VARCHAR(120) NOT NULL DEFAULT ''queued'',
                total_chunks INT NOT NULL DEFAULT 0,
                processed_chunks INT NOT NULL DEFAULT 0,
                cards_created INT NOT NULL DEFAULT 0,
                skipped_low_quality_cards INT NOT NULL DEFAULT 0,
                skipped_duplicates INT NOT NULL DEFAULT 0,
                error_message TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                started_at TIMESTAMPTZ,
                finished_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT chk_ingestion_jobs_status
                    CHECK (status IN (''QUEUED'', ''PROCESSING'', ''COMPLETED'', ''FAILED'')),
                CONSTRAINT chk_ingestion_jobs_non_negative
                    CHECK (
                        total_chunks >= 0
                        AND processed_chunks >= 0
                        AND cards_created >= 0
                        AND skipped_low_quality_cards >= 0
                        AND skipped_duplicates >= 0
                    )
            )
        ';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = '${appSchema}'
          AND indexname = 'idx_ingestion_jobs_user_created_at'
    ) THEN
        EXECUTE '
            CREATE INDEX idx_ingestion_jobs_user_created_at
            ON "${appSchema}".ingestion_jobs (user_id, created_at DESC)
        ';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = '${appSchema}'
          AND indexname = 'idx_ingestion_jobs_deck_created_at'
    ) THEN
        EXECUTE '
            CREATE INDEX idx_ingestion_jobs_deck_created_at
            ON "${appSchema}".ingestion_jobs (deck_id, created_at DESC)
        ';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = '${appSchema}'
          AND indexname = 'idx_ingestion_jobs_status'
    ) THEN
        EXECUTE '
            CREATE INDEX idx_ingestion_jobs_status
            ON "${appSchema}".ingestion_jobs (status)
        ';
    END IF;
END
$$;