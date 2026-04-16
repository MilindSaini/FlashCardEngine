DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = '${appSchema}'
          AND table_name = 'users'
    ) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = '${appSchema}'
              AND table_name = 'users'
              AND column_name = 'role'
        ) THEN
            EXECUTE 'ALTER TABLE "${appSchema}".users ADD COLUMN role VARCHAR(32)';
        END IF;

        EXECUTE 'UPDATE "${appSchema}".users SET role = ''USER'' WHERE role IS NULL';
        EXECUTE 'ALTER TABLE "${appSchema}".users ALTER COLUMN role SET DEFAULT ''USER''';
        EXECUTE 'ALTER TABLE "${appSchema}".users ALTER COLUMN role SET NOT NULL';
    END IF;
END
$$;