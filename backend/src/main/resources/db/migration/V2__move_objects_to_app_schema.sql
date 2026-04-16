DO $$
DECLARE
    target_schema text := '${appSchema}';
BEGIN
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', target_schema);

    IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'card_type'
          AND n.nspname = 'public'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'card_type'
          AND n.nspname = target_schema
    ) THEN
        EXECUTE format('ALTER TYPE public.card_type SET SCHEMA %I', target_schema);
    END IF;

    IF to_regclass('public.users') IS NOT NULL
       AND to_regclass(format('%I.%I', target_schema, 'users')) IS NULL THEN
        EXECUTE format('ALTER TABLE public.users SET SCHEMA %I', target_schema);
    END IF;

    IF to_regclass('public.decks') IS NOT NULL
       AND to_regclass(format('%I.%I', target_schema, 'decks')) IS NULL THEN
        EXECUTE format('ALTER TABLE public.decks SET SCHEMA %I', target_schema);
    END IF;

    IF to_regclass('public.cards') IS NOT NULL
       AND to_regclass(format('%I.%I', target_schema, 'cards')) IS NULL THEN
        EXECUTE format('ALTER TABLE public.cards SET SCHEMA %I', target_schema);
    END IF;

    IF to_regclass('public.card_sm2_state') IS NOT NULL
       AND to_regclass(format('%I.%I', target_schema, 'card_sm2_state')) IS NULL THEN
        EXECUTE format('ALTER TABLE public.card_sm2_state SET SCHEMA %I', target_schema);
    END IF;

    IF to_regclass('public.review_history') IS NOT NULL
       AND to_regclass(format('%I.%I', target_schema, 'review_history')) IS NULL THEN
        EXECUTE format('ALTER TABLE public.review_history SET SCHEMA %I', target_schema);
    END IF;

    IF to_regclass('public.session_state') IS NOT NULL
       AND to_regclass(format('%I.%I', target_schema, 'session_state')) IS NULL THEN
        EXECUTE format('ALTER TABLE public.session_state SET SCHEMA %I', target_schema);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'cards_search_vector_update'
          AND n.nspname = 'public'
          AND pg_get_function_identity_arguments(p.oid) = ''
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'cards_search_vector_update'
          AND n.nspname = target_schema
          AND pg_get_function_identity_arguments(p.oid) = ''
    ) THEN
        EXECUTE format('ALTER FUNCTION public.cards_search_vector_update() SET SCHEMA %I', target_schema);
    END IF;
END
$$;