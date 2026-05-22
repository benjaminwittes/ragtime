-- Migration: create_collections
-- Applied to production (Supabase project aikdbjprndgksibbvcfs) on 2026-05-22
-- via the Supabase migration tool under the name `create_collections`.
--
-- Purpose: a generalizable "issue-specific breakout" mechanism — named subsets
-- of cases, each membership carrying optional per-collection metadata. This is
-- the first concrete instance of the breakouts axis described in CLAUDE.md.
-- First use: the AI-liability litigation collection (Scott Anderson's tracker).
--
-- Design notes:
--   * collection_cases.cl_id is a FK to cases(cl_id) (bigint PK). A case must
--     exist in the corpus before it can be tagged into a collection, so the
--     ingest order is: resolve -> upsert into cases -> tag here. Cases that
--     can't be resolved to a CourtListener cl_id are tracked outside this table
--     (a review list), never silently as members.
--   * attributes (jsonb) carries per-collection metadata so each breakout can
--     attach its own field schema without new tables (e.g. Scott's AI-specific
--     columns: nature of AI harm, model name, claims asserted, etc.).
--   * RLS mirrors the corpus tables: public SELECT, no public write. Writes are
--     done via service-role / direct-DB connections that bypass RLS.

CREATE TABLE public.collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.collection_cases (
  collection_id uuid   NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  cl_id         bigint NOT NULL REFERENCES public.cases(cl_id)    ON DELETE CASCADE,
  attributes    jsonb  NOT NULL DEFAULT '{}'::jsonb,
  source        text,
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, cl_id)
);

CREATE INDEX collection_cases_cl_id_idx ON public.collection_cases (cl_id);

ALTER TABLE public.collections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.collections      FOR SELECT TO public USING (true);
CREATE POLICY "Public read access" ON public.collection_cases FOR SELECT TO public USING (true);

INSERT INTO public.collections (slug, name, description)
VALUES ('ai-liability', 'AI Liability Litigation',
        'Cases tracking AI-liability questions, integrated from Scott Anderson''s AI Litigation Tracker.')
ON CONFLICT (slug) DO NOTHING;
