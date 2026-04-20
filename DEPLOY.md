# Deploying RAGtime

This document walks through standing the tool up from scratch on a new Supabase project. The current production instance (project `aikdbjprndgksibbvcfs`, `lawfare-litigation`) already has everything below applied — this is for reproducibility.

## Prerequisites

- A Supabase project with these tables already loaded: `cases`, `docket_entries`, `documents`. (These are populated by the separate ingestion pipeline that scrapes CourtListener.)
- An Anthropic API key.
- The Supabase anon key and project URL handy.

## 1. Create the quota infrastructure

Run this migration in the Supabase SQL editor (or via `execute_sql`):

```sql
-- Per-password daily quota + per-IP per-minute rate-limit counters.
CREATE TABLE IF NOT EXISTS public.ragtime_quota (
  key         TEXT        PRIMARY KEY,
  count       INTEGER     NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ragtime_quota_expires
  ON public.ragtime_quota (expires_at);

ALTER TABLE public.ragtime_quota ENABLE ROW LEVEL SECURITY;

-- Atomic counter increment. Returns the post-increment count.
CREATE OR REPLACE FUNCTION public.ragtime_quota_incr(
  p_key TEXT,
  p_expires TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE new_count INTEGER;
BEGIN
  INSERT INTO public.ragtime_quota (key, count, expires_at)
  VALUES (p_key, 1, p_expires)
  ON CONFLICT (key) DO UPDATE
    SET count = public.ragtime_quota.count + 1
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.ragtime_quota_cleanup()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE deleted_rows INTEGER;
BEGIN
  DELETE FROM public.ragtime_quota WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ragtime_quota_incr(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ragtime_quota_incr(TEXT, TIMESTAMPTZ) TO service_role;

REVOKE EXECUTE ON FUNCTION public.ragtime_quota_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ragtime_quota_cleanup() TO service_role;
```

## 2. Store the Anthropic API key in Vault

Run once, replacing the key with yours:

```sql
SELECT vault.create_secret(
  'sk-ant-api03-YOUR-KEY-HERE',
  'ragtime_anthropic_api_key',
  'Anthropic API key for RAGtime demo proxy'
);
```

Then add an RPC wrapper so the edge function can read it cleanly:

```sql
CREATE OR REPLACE FUNCTION public.ragtime_get_anthropic_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE k TEXT;
BEGIN
  SELECT decrypted_secret INTO k
  FROM vault.decrypted_secrets
  WHERE name = 'ragtime_anthropic_api_key'
  LIMIT 1;
  RETURN k;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ragtime_get_anthropic_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ragtime_get_anthropic_key() TO service_role;
```

To rotate the key later, run:

```sql
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'ragtime_anthropic_api_key'),
  'sk-ant-api03-NEW-KEY-HERE'
);
```

## 3. Deploy the edge function

Upload `supabase/functions/ragtime-proxy/index.ts` with `verify_jwt` disabled. The function implements its own authentication (demo password or BYO key) plus rate limiting, so JWT verification is not needed — and in fact would prevent the static HTML from calling the function at all.

Via the Supabase CLI:

```bash
supabase functions deploy ragtime-proxy --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

Or via the Supabase dashboard or MCP tooling — pass `verify_jwt: false` in either case.

The deployed URL will be:

```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/ragtime-proxy
```

## 4. Configure the frontend

In `index.html`, update these constants near the top of the `<script>` block:

```javascript
var SB_URL = "https://YOUR_PROJECT_REF.supabase.co";
var SB_KEY = "YOUR_SUPABASE_ANON_KEY";
var ACCESS_CODE = "your-gate-password";
var WORKER_URL = "https://YOUR_PROJECT_REF.supabase.co/functions/v1/ragtime-proxy";
var DEMO_PASSWORD = "your-demo-password";
```

The demo password is ONLY used client-side to light up the "demo access unlocked" indicator. The actual check happens server-side in the edge function with a constant-time comparison. If you want to override the default `"Lawfareskunkworks"` on the server, set an env var on the edge function:

```bash
supabase secrets set RAGTIME_DEMO_PASSWORD=your-new-password --project-ref YOUR_PROJECT_REF
```

Redeploy the function to pick it up.

## 5. Test

Open `index.html` locally, unlock the gate, enter the demo password — you should see "✓ Demo access unlocked." Ask Claude a trivial question. If Pass 1 → Pass 2 → response round-trip succeeds, you're live.

## 6. Host it

Simplest: GitHub Pages. In your repo settings, set Pages source to main branch, root directory. The URL will be `https://YOUR-USER.github.io/YOUR-REPO/`. Add that URL as an allowed origin if your edge function ever enforces stricter CORS (currently it allows `*`).

## Monitoring

Edge function logs: Supabase dashboard → Edge Functions → `ragtime-proxy` → Logs. Look for `console.error` output on failures.

Quota snapshots:

```sql
-- Current daily demo usage
SELECT * FROM ragtime_quota WHERE key LIKE 'demo:%' ORDER BY expires_at DESC;

-- Active per-IP rate-limit windows
SELECT * FROM ragtime_quota WHERE key LIKE 'ip:%' ORDER BY expires_at DESC LIMIT 20;

-- Manual cleanup (runs opportunistically inside the function, but you can force it)
SELECT ragtime_quota_cleanup();
```

## Rotating the demo password

1. Update `DEMO_PASSWORD` constant in `index.html` and redeploy the frontend.
2. Either:
   - Set `RAGTIME_DEMO_PASSWORD` env var on the edge function (takes effect on next cold start), OR
   - Redeploy the edge function with a new default hardcoded.
3. Give users the new password.

## Cloudflare Workers alternative

`cloudflare-alt/` contains a Cloudflare Workers version of the proxy with matching behavior (constant-time password check, KV-based rate limiting, forwarding to Anthropic). Not currently deployed. Use it as a fallback if Supabase Edge Functions ever become insufficient or if you want to isolate the proxy's failure domain from the database.
