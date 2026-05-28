# RAGtime — React app (rebuild target)

This directory is the **React/Vite/TypeScript rebuild** of RAGtime's frontend, which currently ships as a single-file `index.html` at the repo root. The rebuild is scoped in `CLAUDE.md` (Phase I beta plan, "UI rebuild" workstream) and detailed across the per-surface query-design briefs (1–7) in iCloud.

**Status as of PR 3:** scaffold + design system + capability descriptor (TypeScript contract for every corpus spoke). Vite + React 19 + TypeScript + ESLint + Tailwind 4 + shadcn/ui + Lawfare brand tokens + `CorpusSpoke` types and a stub litigation spoke that type-checks against them. Still deploying nothing — the production site at https://benjaminwittes.github.io/ragtime/ is served from the legacy single-file `index.html` at the repo root. Production cutover happens at the END of the foundation work, not now.

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
- **Tailwind 4** — utility-first CSS (via `@tailwindcss/vite` plugin)
- **shadcn/ui** (Nova preset, Radix primitives) — base component library; added components live in `src/components/ui/`. Add more via `npx shadcn@latest add <component>`.
- **lucide-react** — icon library (ships with shadcn Nova preset)
- **ESLint 10** — linting

## Lawfare brand tokens

Brand foundation defined in `src/index.css`. shadcn semantic tokens (`--primary`, `--ring`, etc.) are overridden with Lawfare values in the `:root` block; Lawfare-specific extras (palette, typography) live in `@theme` blocks above.

- Teal accent palette: `#006A72` (primary), `#008A94` (light), `#00535A` (dark), `#E6F0F1` (background tint). Available as `bg-lawfare-teal`, `bg-lawfare-teal-bg`, etc.
- Typography: serif (EB Garamond) for headings, sans (Lato) for body. Both loaded via Google Fonts in `index.html`. Use `font-serif` / `font-sans` Tailwind classes.
- The default shadcn `Button` and `Input` already use `--primary` / `--ring` → Lawfare teal flows through automatically.

## Path aliases

`@/` resolves to `src/`. Configured in `vite.config.ts` (Vite's resolver) and `tsconfig.json` / `tsconfig.app.json` (TypeScript's resolver). Use `@/components/ui/button`, `@/lib/utils`, etc.

## Spoke architecture

Every corpus surface ("spoke") implements `CorpusSpoke` from `src/spokes/types.ts`. The descriptor declares title / status / disclosure / holdings / query modes / facets / scopes / "more like this" hooks / default search depth — driven into UI by a generic renderer (lands in PR 5 with the litigation port).

- Type contract: `src/spokes/types.ts`
- Design rationale + field-to-brief mapping: `src/spokes/SPEC.md`
- Stub litigation spoke (declarative; no UI yet): `src/spokes/litigation/`
- Registry: `src/spokes/registry.ts`
- Stack / page / pivot types (with stash-and-pivot semantics per the 2026-05-27 "more like this" hook decision): `src/stack/types.ts`

## Planned PR sequence

- ✅ PR 1 — Scaffold (Vite + React + TS + CI, no deploy)
- ✅ PR 2 — Design system (Tailwind 4 + shadcn + Lawfare brand tokens)
- ✅ PR 3 — Capability descriptor (TS types, stub litigation spoke, stack types with pivot support)
- PR 4 — Docs registry (floating documentation infrastructure per brief #6 decision 9b)
- PR 5 — Litigation spoke port (the first concrete corpus surface, per brief #6; generic spoke renderer lands here too)
- PR 6+ — Other spokes (OLC, USC, CFR, FRUS), collections architecture (per brief #7), "more like this" implementation post-beta

## Why a separate package.json?

The repo's existing root `package.json` is for the Cloudflare Worker's vitest test suite (the worker source lives in `worker/`). The React app is independent of the worker; co-locating its dependencies in the root would mix two different runtime targets (browser app vs. Cloudflare Worker). Keeping `app/package.json` separate keeps the dependency graphs clean and lets each project pin its own versions.
