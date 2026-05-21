# RAGtime

**A Federal Litigation Research Tool from Lawfare**

An interactive research tool over Lawfare's federal-court litigation corpus (cases filed since January 20, 2025; the time window will expand over time). Browse and filter cases directly, or ask natural-language questions that Claude answers by writing SQL against the docket database and analyzing the results.

## Three modes

RAGtime offers three modes side by side on the sign-in screen:

- **Local search** — no LLM, no account, no payment. Fast keyword + structured search of the public dataset.
- **Bring your own API key** — paste an Anthropic, OpenAI, or Google key; the Worker proxies your LLM calls and you pay your provider directly. (The proxy exists to handle CORS and normalize across providers.)
- **Sign in with Lawfare (paid)** — magic-link sign-in; Lawfare-paid Anthropic calls; prepay in $5 / $20 / $50 blocks via Stripe, debited per query at API cost × a small markup, with a per-query spend cap.

The two free modes are first-class; the paid mode is opt-in and is where Lawfare recovers hosting + Anthropic cost.

## What it does

- **Browse and filter** — full-text search across docket descriptions, plus filters for court, judge, case type, cause, date range, and party.
- **Ask Claude** — a two-pass workflow: Claude generates SQL for your question, runs it, then analyzes the results. Returns prose analysis plus a clickable list of matched cases.
- **Iterate** — a scope bar narrows Claude's next question to your current filter or to your previous query's results, so you can drill down without starting over.
- **Graduated depth** — Pass 2 context scales with scope size: broad queries get metadata; narrow queries get full docket entries; very narrow queries get full document text.

## Stack

- **Frontend** — single static HTML file (`index.html`). No build step. Served via GitHub Pages.
- **Backend** — a Cloudflare Worker (`ragtimeproxy`, source in `worker/`). Handles authentication, per-IP and demo-quota rate limiting, multi-provider LLM proxying, Stripe checkout + webhooks, and per-query balance accounting.
- **Database & Auth** — Supabase (PostgreSQL 17). Hosts the litigation corpus (`cases`, `docket_entries`, `documents`) alongside the RAGtime billing tables (`accounts`, `ledger`, `processed_stripe_events`), plus Supabase Auth for passwordless magic-link sign-in.
- **Payments** — Stripe (live mode), prepaid one-time charges.

## Repository layout

```
/
├── index.html                  # the frontend — GitHub Pages serves this
├── worker/
│   ├── index.js                # Cloudflare Worker source (deployed via CI)
│   └── wrangler.toml           # Worker config — bindings only, no secrets
├── .github/workflows/
│   └── deploy-worker.yml        # wrangler deploy pipeline
├── robots.txt                  # disallow all crawlers (incl. AI)
├── README.md                   # this file
└── DEPLOY.md                   # deploy, secrets, and operations
```

## Deploying

See [DEPLOY.md](DEPLOY.md). In short: the frontend auto-publishes from `main` via GitHub Pages; the Worker auto-deploys from `main` via GitHub Actions running `wrangler deploy`.

## Related, not in this repo

The data-acquisition pipeline that ingests CourtListener into the Supabase corpus runs on a residential Mac (CourtListener throttles cloud IPs). Its source is being migrated into this repo under `pipeline/`; until then it lives outside. The deep operational reference (architecture, environment manifest, Stripe/Supabase configuration, operational gotchas) is the project handoff document, also held outside this repo.

## Status

Production-live in Stripe live mode. Under active productization toward a public beta.
