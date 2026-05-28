# RAGtime — React app (rebuild target)

This directory is the **React/Vite/TypeScript rebuild** of RAGtime's frontend, which currently ships as a single-file `index.html` at the repo root. The rebuild is scoped in `CLAUDE.md` (Phase I beta plan, "UI rebuild" workstream) and detailed across the per-surface query-design briefs (1–7) in iCloud.

**Status as of PR 1:** scaffold only. Vite + React 19 + TypeScript + ESLint, deploying nothing yet. The production site at https://benjaminwittes.github.io/ragtime/ is still served from the legacy single-file `index.html` at the repo root. Production cutover happens at the END of the foundation work, not in this PR.

## Develop locally

```bash
cd app
npm install
npm run dev
```

Vite dev server defaults to http://localhost:5173/ with HMR.

## Build

```bash
cd app
npm run build       # tsc -b && vite build → dist/
npm run preview     # serves the built dist/ locally on http://localhost:4173/
```

## Lint + typecheck

```bash
cd app
npm run lint        # ESLint
npm run build       # tsc -b runs the typechecker as part of the build
```

## CI

`.github/workflows/build-app.yml` runs on PR + push to `main` touching `app/**`. It runs `npm ci`, `npm run lint`, and `npm run build` to validate the app compiles cleanly. No deploy step yet — that lands in a later PR alongside the GH Pages cutover plan.

## Stack

- **Vite 8** — build tooling
- **React 19** — UI runtime
- **TypeScript** — strict mode (default Vite config)
- **ESLint 10** — linting

Later PRs add:
- PR 2 — Design system (shadcn/Radix base components, Lawfare branding tokens, EB Garamond + Lato typography)
- PR 3 — Per-corpus capability descriptor abstraction
- PR 4 — Docs registry (floating documentation infrastructure per brief #6 decision 9b)
- PR 5 — Litigation spoke port (the first concrete corpus surface, per brief #6)
- PR 6+ — Other spokes (OLC, USC, CFR, FRUS), collections architecture (per brief #7), "more like this" architecture hooks

## Why a separate package.json?

The repo's existing root `package.json` is for the Cloudflare Worker's vitest test suite (the worker source lives in `worker/`). The React app is independent of the worker; co-locating its dependencies in the root would mix two different runtime targets (browser app vs. Cloudflare Worker). Keeping `app/package.json` separate keeps the dependency graphs clean and lets each project pin its own versions.
