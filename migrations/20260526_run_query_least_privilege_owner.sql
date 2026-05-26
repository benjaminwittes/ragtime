-- Migration: run_query_least_privilege_owner
-- Target: CORPUS Supabase project xsqdnuqyqyykkzuiqphr (holds public.run_query).
-- Status: NOT YET APPLIED. Reviewable-first — this touches the security boundary
-- on the LIVE corpus DB, so it must not be applied without Ben's explicit OK and
-- the pre-apply checklist at the bottom of this file.
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- public.run_query(text) is the SECURITY DEFINER RPC the Worker uses for EVERY
-- corpus read — facets, case detail, the manual filter, and the LLM-authored SQL
-- in the Ask/Analyze paths (worker/index.js corpusRunQuery). Until now its only
-- defense against a write slipping through was STRING INSPECTION:
--   1. require the text to start with "select"
--   2. reject a word-boundary keyword match (drop|delete|insert|update|alter|create)
--   3. EXECUTE 'SELECT json_agg(...) FROM (' || query_text || ') t'
-- That is a blocklist, not a parser. It cannot catch every write vector — e.g. a
-- SELECT that calls a volatile/writing function is not keyword-detectable — and a
-- blocklist is brittle by nature.
--
-- The robust fix is PRINCIPLE OF LEAST PRIVILEGE. A SECURITY DEFINER function
-- runs with the privileges of its OWNER. Today the owner is `postgres`, which can
-- write anything — so the string checks are the ONLY thing standing between an
-- injected INSERT/UPDATE/DELETE/DDL and the data. This migration creates a
-- NOLOGIN role `corpus_readonly` that holds SELECT and nothing else, and makes it
-- the owner of run_query. After this, any write that reaches EXECUTE fails on
-- PRIVILEGES regardless of what slipped past the string inspection. The keyword
-- blocklist stays, but demoted to belt-and-suspenders rather than the primary
-- defense.
--
-- ── RLS interaction (important) ──────────────────────────────────────────────
-- run_query currently executes as `postgres`. Because `postgres` owns the corpus
-- tables, it BYPASSES row-level security. Switching the owner to corpus_readonly
-- (which is NOT the tables' owner) means RLS policies would start applying to the
-- function's reads. The corpus tables carry permissive `FOR SELECT TO public
-- USING (true)` policies (see 20260522_create_collections.sql; the same public-
-- read pattern is used across the corpus), and corpus_readonly is a member of
-- PUBLIC, so SELECT still returns all rows. To preserve TODAY'S read semantics
-- exactly — independent of whether every corpus table has such a policy — we also
-- give corpus_readonly the BYPASSRLS attribute. BYPASSRLS is a READ-VISIBILITY
-- attribute ONLY: it confers no write ability, so the least-privilege guarantee
-- (no INSERT/UPDATE/DELETE/DDL) is unaffected. The grant is best-effort: if the
-- migration role cannot confer BYPASSRLS, reads still work via the public SELECT
-- policies — VERIFY THIS via the pre-apply checklist before applying.
--
-- ── search_path ─────────────────────────────────────────────────────────────
-- The function previously set no search_path, inheriting the caller's. An
-- unpinned SECURITY DEFINER function is a known footgun; we pin it to
-- `public, extensions`. pg_catalog is implicitly searched first (so built-ins
-- like json_agg/websearch_to_tsquery resolve safely), the corpus tables resolve
-- in public, and `extensions` is a harmless extra (silently ignored if absent).
--
-- ── ; handling ──────────────────────────────────────────────────────────────
-- The body now tolerates ONE optional trailing ';' (planner/LLM SQL sometimes
-- ends a statement) and then rejects any remaining ';'. This is an explicit
-- single-statement guard. (plpgsql `EXECUTE ... INTO` already refuses a multi-
-- statement string, and the new owner blocks any injected write anyway — so this
-- is defense-in-depth with a clearer error.) It is the same CLASS of string check
-- as the keyword screen and carries the same caveat: a legitimate ';' inside a
-- string literal would be rejected. None of the existing corpus query shapes
-- contain an embedded ';' (verified against facets/distinctViaIndex/cases/
-- entries/filter/AI-SQL/Ask-execute), and the planner prompt example that used to
-- emit '; -- comment' is being cleaned in the same PR (worker/index.js
-- buildPlanningSystem).
--
-- ── Body changes vs the previous migration ───────────────────────────────────
--   * trim + strip one trailing ';' into a local `q`; reject any remaining ';'.
--   * keyword screen expanded (truncate|grant|revoke|merge added) and run on `q`.
--   * wrap with a newline before ') t' so a trailing `-- line comment` in `q`
--     cannot comment out the closing paren of the subquery.
-- Everything else preserved: SECURITY DEFINER, statement_timeout, the
-- "must start with select" check, the json_agg subquery wrapping, RETURN COALESCE.

-- 1) The least-privilege owner role: read-everything, write-nothing, no login.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'corpus_readonly') THEN
    CREATE ROLE corpus_readonly NOLOGIN;
  END IF;
END$$;

GRANT USAGE ON SCHEMA public TO corpus_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO corpus_readonly;
-- Future corpus tables created by the migration role inherit SELECT. (New corpus
-- tables added by a different role need a one-line re-GRANT — see checklist.)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO corpus_readonly;

-- Preserve today's RLS-bypassing read semantics (read-visibility only, no write
-- ability). Best-effort: fall back to the public SELECT policies if not grantable.
DO $$
BEGIN
  ALTER ROLE corpus_readonly BYPASSRLS;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not set BYPASSRLS on corpus_readonly; relying on the corpus tables'' public SELECT policies for visibility.';
END$$;

-- 2) Let the migration role set corpus_readonly as the function owner. On PG16+
--    a CREATEROLE role that created corpus_readonly already has SET membership;
--    this explicit grant is a harmless safeguard. (Role ATTRIBUTES such as
--    BYPASSRLS are not inherited through membership, so this does not change the
--    migration role's own RLS behavior.)
DO $$
BEGIN
  EXECUTE format('GRANT corpus_readonly TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Membership grant of corpus_readonly to % skipped (%).', current_user, SQLERRM;
END$$;

-- 3) Replace the body (string checks demoted to belt-and-suspenders).
CREATE OR REPLACE FUNCTION public.run_query(query_text text)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET statement_timeout TO '60s'
  SET search_path TO public, extensions
AS $function$
DECLARE
  q text := trim(query_text);
  result json;
BEGIN
  -- Tolerate one optional trailing ';', then forbid any remaining one so only a
  -- single statement can ever reach EXECUTE.
  q := regexp_replace(q, ';\s*$', '');

  IF NOT (lower(q) LIKE 'select%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  IF strpos(q, ';') > 0 THEN
    RAISE EXCEPTION 'Only a single statement is allowed';
  END IF;

  -- Belt-and-suspenders keyword screen. The real guarantee is the owner role
  -- (corpus_readonly) holding SELECT and nothing else: an injected write fails on
  -- privileges regardless of what slips past this string match.
  IF lower(q) ~ '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|merge)\M' THEN
    RAISE EXCEPTION 'Only read-only queries are allowed';
  END IF;

  -- Newline before ') t' so a trailing line comment (-- ...) at the end of q
  -- cannot comment out the closing of the wrapping subquery.
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || q || E'\n) t'
  INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;

-- 4) Hand ownership to the least-privilege role. This is the load-bearing line:
--    a SECURITY DEFINER function executes with its owner's privileges.
ALTER FUNCTION public.run_query(text) OWNER TO corpus_readonly;

-- EXECUTE grants (who may CALL the RPC) are preserved across CREATE OR REPLACE and
-- ALTER OWNER, so the Worker's existing access is unchanged. Not re-granted here
-- to avoid depending on specific role names; verify callability post-apply.

-- ── Pre-apply checklist (run as the migration role on xsqdnuqyqyykkzuiqphr) ──
-- A) Inspect roles & RLS-bypass capability:
--      SELECT rolname, rolsuper, rolbypassrls, rolcreaterole
--      FROM pg_roles WHERE rolname IN ('postgres','service_role','anon','authenticated');
-- B) Confirm corpus tables have a permissive SELECT policy (the BYPASSRLS fallback):
--      SELECT relname, relrowsecurity FROM pg_class
--      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
--        AND relname IN ('cases','docket_entries','documents','collections','collection_cases');
--      SELECT schemaname, tablename, policyname, roles, cmd, qual
--      FROM pg_policies WHERE schemaname = 'public';
-- C) Apply this migration, then SMOKE-TEST every read shape via the run_query RPC
--    (these must each return rows / a result):
--      SELECT public.run_query($q$SELECT slug, name FROM collections ORDER BY name$q$);
--      SELECT public.run_query($q$SELECT v FROM (WITH RECURSIVE t AS ((SELECT court AS v FROM cases WHERE court IS NOT NULL AND court <> '' ORDER BY court LIMIT 1) UNION ALL SELECT (SELECT court FROM cases WHERE court > t.v AND court IS NOT NULL AND court <> '' ORDER BY court LIMIT 1) FROM t WHERE t.v IS NOT NULL) SELECT v FROM t WHERE v IS NOT NULL) z ORDER BY v$q$);
--      SELECT public.run_query($q$SELECT (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.cases'::regclass) AS case_count, (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.docket_entries'::regclass) AS entry_count, (SELECT MAX(last_synced_at)::date::text FROM cases) AS last_synced$q$);
--      SELECT public.run_query($q$SELECT cl_id, case_name, court, date_filed FROM cases ORDER BY date_filed DESC NULLS LAST LIMIT 5$q$);
--      SELECT public.run_query($q$SELECT cl_id FROM cases WHERE cl_id IN (SELECT DISTINCT cl_id FROM docket_entries WHERE fts @@ websearch_to_tsquery('english', 'immigration detention')) LIMIT 5$q$);
--    And confirm writes are now REJECTED ON PRIVILEGES (not just keywords) — a
--    text that dodges the blocklist must still fail:
--      SELECT public.run_query($q$SELECT pg_catalog.pg_sleep(0)$q$);                 -- ok (read)
--      SELECT public.run_query($q$SELECT * FROM cases) t; DROP TABLE cases; --$q$);  -- rejected (;)
--    (Optionally, temporarily create a SECURITY INVOKER test function that does an
--     INSERT and confirm run_query calling it fails with "permission denied".)
