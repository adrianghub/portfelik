-- Move pg_net out of public schema (Supabase advisor 0014).
-- Idempotent: no-op when already in extensions (local CLI default).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'pg_net' AND n.nspname = 'public'
  ) THEN
    CREATE SCHEMA IF NOT EXISTS extensions;
    ALTER EXTENSION pg_net SET SCHEMA extensions;
  END IF;
END $$;
