# RAGtime

**A Federal Litigation Research Tool from Lawfare**

An interactive research tool for federal court cases filed since January 20, 2025. Browse and filter cases directly, or ask natural-language questions that Claude answers by writing SQL against the docket database and analyzing the results.

## What it does

- **Browse and filter** — full-text search across docket descriptions, plus filters for court, judge, case type, cause, date range, and party name.
- **Ask Claude** — a two-pass workflow where Claude generates SQL for your question, runs it against the database, then analyzes the results. Returns prose analysis + a clickable list of matched cases.
- **Iterate** — a scope bar lets you narrow Claude's next question to your current filter or to the cases from your previous Claude query, so you can drill down without starting over.
- **Direct mode** — for analytical questions on an already-narrowed scope, skip Pass 1 entirely and analyze every case in scope directly.
- **Graduated depth** — Pass 2 context scales automatically with scope size: broad queries get metadata; narrow queries get full docket entries; very narrow queries get full OCR text of attached documents.

## Stack

- **Frontend** — single static HTML file. No build step. Hosted on GitHub Pages (or anywhere).
- **Database** — PostgreSQL on Supabase. Three main tables: `cases`, `docket_entries`, `documents`.
- **Claude proxy** — Supabase Edge Function (`ragtime-proxy`), Deno runtime. Handles demo-password authentication, daily quota tracking (500/day), per-IP rate limiting (10/min), and forwards to the Anthropic API.
- **Secret storage** — Anthropic API key lives in Supabase Vault (encrypted at rest via pgsodium), retrieved by the edge function via an RPC.
- **Alternative proxy** — a Cloudflare Workers version (`cloudflare-alt/`) is kept in the repo for reference and as a fallback deployment path. Currently unused.

## Access

Two password layers:

1. **Access gate** — `lawfare2025`. Keeps casual visitors out.
2. **Claude authentication** — either the shared demo password (quota-limited) or your own Anthropic API key (no quota, billed to you).

Both passwords are present in client source. Quotas and rate limits are the real security boundary.

## Layout

```
/
├── index.html                          # the explorer — GitHub Pages serves this
├── robots.txt                          # disallow all crawlers (incl. AI)
├── README.md                           # this file
├── DEPLOY.md                           # how to stand it up from scratch
├── supabase/
│   └── functions/
│       └── ragtime-proxy/
│           └── index.ts                # deployed edge function source
└── cloudflare-alt/                     # alternative hosting for the proxy
    ├── ragtime-worker.js
    └── wrangler.toml
```

## Configuration knobs in `index.html`

Near the top of the `<script>` block:

- `WORKER_URL` — URL of the deployed Supabase Edge Function.
- `DEMO_PASSWORD` — client-side copy used only to light up the "demo unlocked" indicator. The real check is server-side in constant time.
- `ACCESS_CODE` — the outer gate password.
- `CLAUDE_MODEL` — model id used for both passes.
- `PAGE_SIZE` — rows per page in the main results table.

## What's in the handoff memo (not in this repo)

Everything in `/supabase/functions/ragtime-proxy/index.ts` is the current live code. The companion Postgres schema (tables `ragtime_quota`, RPC functions `ragtime_quota_incr`, `ragtime_quota_cleanup`, `ragtime_get_anthropic_key`) was applied as migrations on Supabase — see DEPLOY.md for the SQL.

## Status

v5. Under active development for Lawfare Institute research staff.
