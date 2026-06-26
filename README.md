# RAGtime

**A public research tool over Lawfare's federal-court litigation corpus — and a growing platform of queryable databases of democracy-adjacent public information.** Owned by the Lawfare Institute.

This repository holds the **frontend** (the React app users interact with). The backend — the Cloudflare Worker that authenticates requests, proxies LLM calls, runs the corpus queries, and handles billing — lives in a separate **private** repository (`ragtime-worker`). The frontend ships to browsers regardless, so it stays public; the backend carries the auth logic and the planner/synthesis prompts, so it's private during active development.

Live at **https://ragtime.lawfaremedia.org**.

## What it is

RAGtime is a hub-and-spoke research surface over several corpora of public records:

- **Federal litigation** — cases, docket entries, and documents (currently filed on/after Jan 20, 2025; the window expands over time).
- **FRUS** — the State Department's *Foreign Relations of the United States* documentary history.
- **OLC opinions** — Office of Legal Counsel opinions.
- **U.S. Code** and the **Code of Federal Regulations**.
- **Lawfare** — the publication's own archive (the platform's first commentary corpus).

A free cross-corpus keyword hub sits in front; each corpus has its own spoke with structured filtering, detail views, and natural-language "ask" modes.

## Three access modes

- **Local search** — no LLM, no account, no payment. Keyword + structured search of the public datasets.
- **Bring your own API key** — paste an Anthropic, OpenAI, or Google key; the backend proxies your calls and you pay your provider directly.
- **Sign in with Lawfare (paid)** — magic-link sign-in; Lawfare-paid Anthropic calls; prepay in $5 / $20 / $50 blocks via Stripe, debited per query at cost plus a small markup, with a per-query spend cap.

The two free modes are first-class; the paid mode is opt-in and is where Lawfare recovers hosting + model cost.

## Stack (frontend)

- **React + Vite + TypeScript**, Tailwind 4, shadcn/Radix — in `app/`.
- **GitHub Pages** serves the production build at the custom domain above.
- The frontend's only direct dependency on Supabase is **authentication** (passwordless magic-link). All corpus and AI queries go through the backend Worker.

(Database: two Supabase Postgres projects — a PII-free corpus project and a small billing/auth project — managed by the backend. Payments: Stripe. These are configured out-of-band and operated from the backend repo.)

## Repository layout

```
/
├── app/                       # the React frontend (Vite) — Pages serves this build
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── index.html                 # legacy single-file app, preserved at /legacy.html
├── robots.txt
└── .github/workflows/
    └── build-app.yml          # build + deploy the app to GitHub Pages
```

## Local development

```bash
cd app
npm install
npm run dev      # Vite dev server
npm run lint
npm run build    # production build (output in app/dist)
```

## Deploy

GitHub Pages deploys automatically: a push to `main` touching `app/**` (or `index.html`) runs `.github/workflows/build-app.yml`, which builds `app/` and publishes the artifact. The custom domain is pinned via `app/public/CNAME`.

## Contributing

Changes go through feature branches → pull requests → `main`. The backend (Worker source, DB migrations, infra) is maintained in the private `ragtime-worker` repository.
