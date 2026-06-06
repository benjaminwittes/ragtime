-- Migration: run_query_heavy_and_explain_cost
-- Target: CORPUS Supabase project xsqdnuqyqyykkzuiqphr.
-- Status: APPLIED to prod 2026-06-06 (via execute_sql; the restricted migration
-- role lacks CREATE on public, so applied as postgres). Verified: both functions
-- owned by corpus_readonly; statement_timeout 90s / 15s; EXECUTE granted to
-- service_role + authenticated ONLY (no anon, no PUBLIC); explain_cost returns a
-- usable Total Cost on the reported heavy query (~157K wrapped).
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- Two new RPCs supporting the "broad AI search" hardening package (the AI-writes-
-- SQL / AMA timeout fix). Both mirror public.run_query's hardening EXACTLY (see
-- 20260526_run_query_least_privilege_owner.sql): SECURITY DEFINER owned by the
-- least-privilege corpus_readonly role, the same SELECT-only / single-statement /
-- keyword belt-and-suspenders guard, pinned search_path. The owner is load-
-- bearing: a SECURITY DEFINER function executes as its OWNER, so the EXECUTEd
-- SELECT runs with corpus_readonly's USAGE+SELECT and nothing else — an injected
-- write fails on privileges regardless of the string checks.
--
--   public.run_query_heavy(text) — identical to run_query but statement_timeout
--     90s (vs 60s). Used ONLY for the authed "run anyway" path after the Worker's
--     pre-flight EXPLAIN guard flags a query as expensive. The 60s ceiling stays
--     the default on every fast path (run_query); only a deliberate, guard-
--     flagged, authed, rate-limited query gets the 90s budget.
--
--   public.explain_cost(text) — validates SELECT-only then runs
--     EXPLAIN (FORMAT JSON) on the query and returns the plan JSON. EXPLAIN
--     without ANALYZE PLANS but never EXECUTES, so it is cheap (tens of ms) and
--     side-effect-free. The Worker reads the root node's "Total Cost" to decide
--     whether to offer the run-anyway path. 15s timeout (planning only).
--
-- ── Grants (DELIBERATELY narrower than run_query) ────────────────────────────
-- run_query is granted to PUBLIC/anon/authenticated/service_role. These two are
-- NOT: the 90s budget must not be an anonymous DoS amplifier via the public
-- publishable (anon) key, and the cost guard is an internal Worker concern. Note
-- the Supabase footgun: ALTER DEFAULT PRIVILEGES auto-grants EXECUTE to anon on
-- new functions, so an explicit REVOKE FROM anon is required AFTER create — a bare
-- REVOKE FROM PUBLIC does not remove it.
--
-- ── Ownership / CREATE-on-public quirk ───────────────────────────────────────
-- Same as run_query: ALTER FUNCTION ... OWNER TO corpus_readonly requires the
-- target to have CREATE on public (which it normally lacks). Grant CREATE
-- temporarily, ALTER, REVOKE — ownership persists; corpus_readonly's standing
-- perm set stays USAGE+SELECT only.

GRANT CREATE ON SCHEMA public TO corpus_readonly;

-- 90s heavy-path sibling of run_query.
CREATE OR REPLACE FUNCTION public.run_query_heavy(query_text text)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET statement_timeout TO '90s'
  SET search_path TO public, extensions
AS $function$
DECLARE
  q text := trim(query_text);
  result json;
BEGIN
  q := regexp_replace(q, ';\s*$', '');
  IF NOT (lower(q) LIKE 'select%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  IF strpos(q, ';') > 0 THEN
    RAISE EXCEPTION 'Only a single statement is allowed';
  END IF;
  IF lower(q) ~ '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|merge)\M' THEN
    RAISE EXCEPTION 'Only read-only queries are allowed';
  END IF;
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || q || E'\n) t'
  INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$function$;
ALTER FUNCTION public.run_query_heavy(text) OWNER TO corpus_readonly;
REVOKE ALL ON FUNCTION public.run_query_heavy(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_query_heavy(text) FROM anon;  -- default-privileges footgun
GRANT EXECUTE ON FUNCTION public.run_query_heavy(text) TO service_role, authenticated;

-- Pre-flight cost guard: plan-only, returns EXPLAIN (FORMAT JSON).
CREATE OR REPLACE FUNCTION public.explain_cost(query_text text)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET statement_timeout TO '15s'
  SET search_path TO public, extensions
AS $function$
DECLARE
  q text := trim(query_text);
  result json;
BEGIN
  q := regexp_replace(q, ';\s*$', '');
  IF NOT (lower(q) LIKE 'select%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  IF strpos(q, ';') > 0 THEN
    RAISE EXCEPTION 'Only a single statement is allowed';
  END IF;
  IF lower(q) ~ '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|merge)\M' THEN
    RAISE EXCEPTION 'Only read-only queries are allowed';
  END IF;
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || q INTO result;
  RETURN result;
END;
$function$;
ALTER FUNCTION public.explain_cost(text) OWNER TO corpus_readonly;
REVOKE ALL ON FUNCTION public.explain_cost(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.explain_cost(text) FROM anon;  -- default-privileges footgun
GRANT EXECUTE ON FUNCTION public.explain_cost(text) TO service_role, authenticated;

REVOKE CREATE ON SCHEMA public FROM corpus_readonly;
