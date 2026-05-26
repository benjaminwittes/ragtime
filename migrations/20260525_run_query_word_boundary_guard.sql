-- Migration: run_query_word_boundary_guard
-- Target: CORPUS Supabase project xsqdnuqyqyykkzuiqphr (holds public.run_query).
-- Status: NOT YET APPLIED — pending Ben's OK (alters a security boundary on the
--   live corpus DB). Update this header with the applied-date once applied.
--
-- Purpose: fix a false-positive in run_query's read-only guard.
--
-- run_query is the SELECT-only RPC the Worker uses for every corpus read (facets,
-- case detail, and the LLM-authored SQL in the Ask/Analyze paths). Its guard
-- rejected any query whose text *contained* one of the DML/DDL keywords as a
-- bare SUBSTRING:
--
--     IF lower(query_text) LIKE '%create%' OR ... '%update%' ... THEN
--       RAISE EXCEPTION 'Only read-only queries are allowed';
--
-- The two most common timestamp column names in Postgres trip this: `created_at`
-- contains "create", `updated_at` contains "update". So a perfectly read-only
-- `SELECT max(created_at) ...` was rejected. This is what the off-box liveness
-- monitor hit every 30 min (its probe selected documents.created_at), and it
-- silently breaks legitimate corpus queries too — e.g. an LLM ordering by
-- created_at, or a docket search whose term contains one of these words.
--
-- Fix: match the keywords as whole WORDS via the POSIX word-boundary anchors
-- \m (start of word) and \M (end of word), instead of as arbitrary substrings.
-- In Postgres regex the underscore is a word character, so "created_at" /
-- "updated_at" are single word tokens and `\mcreate\M` / `\mupdate\M` no longer
-- match inside them. Bare statements (`CREATE TABLE`, `DROP ...`, an injected
-- `; drop table ...` after a subquery) still match and are still blocked.
--
-- This is strictly LOOSENING relative to the old guard: every string the regex
-- blocks also contained the substring the old guard blocked, so nothing that
-- worked before stops working — it only un-blocks the false positives.
-- Verified on xsqdnuqyqyykkzuiqphr against created_at / updated_at / "creator" /
-- "updated complaint" (allowed) and CREATE/DROP/INSERT/UPDATE/ALTER + injected
-- DROP (blocked).
--
-- Everything else is preserved verbatim: SECURITY DEFINER, statement_timeout,
-- the "must start with select" check, and the json_agg subquery wrapping.
--
-- Residual (unchanged from before, documented not fixed here): a search term
-- that is EXACTLY one of these keywords as a standalone word (e.g. ILIKE
-- '%create%') is still blocked, and the substring/keyword approach is not a
-- real parser. Deeper hardening (least-privilege definer role; reject embedded
-- statement separators) is tracked separately — see PR discussion.

CREATE OR REPLACE FUNCTION public.run_query(query_text text)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET statement_timeout TO '60s'
AS $function$
DECLARE
  result json;
BEGIN
  IF NOT (lower(trim(query_text)) LIKE 'select%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  IF lower(query_text) ~ '\m(drop|delete|insert|update|alter|create)\M' THEN
    RAISE EXCEPTION 'Only read-only queries are allowed';
  END IF;
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || query_text || ') t'
  INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$function$;
