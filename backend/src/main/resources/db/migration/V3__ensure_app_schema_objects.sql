CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS "${appSchema}";

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'card_type'
          AND n.nspname = '${appSchema}'
    ) THEN
        EXECUTE 'CREATE TYPE "${appSchema}".card_type AS ENUM (''QA'', ''DEFINITION'', ''RELATION'', ''EDGE_CASE'', ''EXAMPLE'')';
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "${appSchema}".users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "${appSchema}".decks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "${appSchema}".users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    last_reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "${appSchema}".cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id UUID NOT NULL REFERENCES "${appSchema}".decks(id) ON DELETE CASCADE,
    type "${appSchema}".card_type NOT NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    embedding vector(256),
    search_vector tsvector,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "${appSchema}".card_sm2_state (
    card_id UUID PRIMARY KEY REFERENCES "${appSchema}".cards(id) ON DELETE CASCADE,
    easiness_factor DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    interval_days INT NOT NULL DEFAULT 1,
    repetition_count INT NOT NULL DEFAULT 0,
    next_review_date DATE NOT NULL DEFAULT CURRENT_DATE,
    average_grade DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "${appSchema}".review_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES "${appSchema}".cards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "${appSchema}".users(id) ON DELETE CASCADE,
    grade INT NOT NULL CHECK (grade BETWEEN 0 AND 5),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "${appSchema}".session_state (
    user_id UUID NOT NULL REFERENCES "${appSchema}".users(id) ON DELETE CASCADE,
    deck_id UUID NOT NULL REFERENCES "${appSchema}".decks(id) ON DELETE CASCADE,
    current_card_index INT NOT NULL DEFAULT 0,
    last_accessed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, deck_id)
);

CREATE INDEX IF NOT EXISTS idx_decks_user_id ON "${appSchema}".decks(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_deck_id ON "${appSchema}".cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_sm2_next_review ON "${appSchema}".card_sm2_state(next_review_date);
CREATE INDEX IF NOT EXISTS idx_review_history_user_card ON "${appSchema}".review_history(user_id, card_id);
CREATE INDEX IF NOT EXISTS idx_cards_search_vector ON "${appSchema}".cards USING GIN(search_vector);

CREATE INDEX IF NOT EXISTS idx_cards_embedding ON "${appSchema}".cards USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE OR REPLACE FUNCTION "${appSchema}".cards_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', coalesce(NEW.front, '') || ' ' || coalesce(NEW.back, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cards_search_vector_update ON "${appSchema}".cards;

CREATE TRIGGER trg_cards_search_vector_update
BEFORE INSERT OR UPDATE ON "${appSchema}".cards
FOR EACH ROW
EXECUTE FUNCTION "${appSchema}".cards_search_vector_update();