# RAGtime — Project Context for Claude

RAGtime is a public research tool over Lawfare's federal-court litigation corpus. It is **the first instance** of a planned series of integrated, queryable databases of democracy-adjacent public information (OLC opinions, FBI/CIA FOIA releases, congressional documents, others). Owned by the Lawfare Institute.

## Current state at a glance

- **Production-live in Stripe live mode** as of 2026-05-16. Real cards charged. Three prepaid pricing tiers ($5, $20, $50).
- Architecture: **Cloudflare Worker backend + single-file HTML frontend + Supabase database (Postgres 17)**.
- Three modes side by side at sign-in: free local search, bring-your-own-API-key (Anthropic / OpenAI / Google), and paid (Lawfare-billed Anthropic + Stripe prepaid blocks).
- **The `supabase/functions/ragtime-proxy/` directory in this repo is stale architecture from an earlier prototype.** The live backend is the Cloudflare Worker `ragtimeproxy`, not the Supabase Edge Function. The Worker source is `ragtime-worker-v3_1.js`, currently held outside this repo and not yet under source control — bringing it in is productization priority #1.
- **The repo's `README.md` and `DEPLOY.md` describe the older Edge Function design and are stale.** They will be rewritten as productization progresses.

The canonical project-state document (full architecture, secrets manifest, deploy mechanics, operational gotchas, productization priorities, cleanup carryover from the 2026-05-16 live flip) is `ragtime-handoff.md`, held by Ben outside this repo. Ask Ben if you need it.

## Workspace split — where edits happen

Two Claude environments currently work on this codebase, and they touch disjoint files to avoid merge conflicts:

- **Claude Cowork (Ben's primary computer)** owns iteration on **`index.html` only**, and only UI / copy / feature-tweak changes (visual, layout, text, small interaction tweaks). Cowork commits and pushes `index.html` directly to GitHub. Cowork does **not** edit billing, auth, quota logic, the Worker, or anything backend.
- **Claude Code (Ben's secondary Mac)** owns **everything else in the repo**: Cloudflare Worker source (to be pulled in), infrastructure config (`wrangler.toml`, GitHub Actions, deploy scripts), tests, documentation, the eventual modular split of the frontend, and any productization-driven fixes that need to touch `index.html` (e.g., removing the now-stale "test mode" buy-up modal text).
- **If Claude Code edits `index.html`**, it is flagged to Ben so Cowork pulls before its next prototype-iteration session.

This split will be revisited when frontend restructure into modules begins (productization priority #7). At that point `index.html` stops being the single source of truth and prototype iteration migrates into the Code workflow.

## Strategic frame for productization

RAGtime is intended to grow into a platform, not stay a one-off tool. Two modularity axes the architecture must support from day one:

- **Across data domains** — new corpora (OLC opinions, FBI/CIA FOIA releases, congressional materials, etc.) plug in without re-architecting.
- **Across issue-specific breakouts** — research projects that subset an existing corpus, add supplementary materials not in the main corpus, and layer on special functionality. **Live example:** an AI-liability case collection in collaboration with another Lawfare colleague.

The current litigation corpus's time window (post-Jan 20, 2025) is arbitrary; it will be expanded backward over time.

Maintenance ownership after productization: in-house Lawfare team or the existing Lawfare web contractor (Sitefinity / .NET shop). That biases recommendations toward mainstream JavaScript and boring, well-documented infrastructure. Exotic stack choices are a maintenance liability.

## Risk posture, in priority order

1. **User data protection** — top concern.
2. **Financial integrity** — billing must be tight; no financial spill.
3. **Data accuracy** — important, with a deliberate exception: overinclusion in the underlying corpus is *valuable* (reflects the mission of being a more-complete-than-alternatives resource).
4. **Hallucinations** — lower concern, because RAGtime is a research-enabling tool. Researchers consume the output and do their own work; nothing is published as Lawfare-branded analysis directly.

## Secrets — do not commit

None of the credential values for `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, etc. belong in this repo. They live as Cloudflare Worker bindings, managed via the Cloudflare dashboard or scoped REST API tokens. The handoff document's "Cloudflare Worker — environment manifest" section is authoritative for what bindings exist and what each one is for.

Note: the `index.html` deliberately contains some quasi-public values (`SB_KEY` is the Supabase **Publishable Key**, not a secret; `ACCESS_CODE` is the soft outer-gate password; `DEMO_PASSWORD` is the client-side indicator only). These are *not* security violations — the real auth boundaries are server-side. But before adding any new "constant" to the frontend, confirm with Ben whether it belongs there.

## Repo conventions (in progress)

These will be filled in as productization sets them up:

- **Branching model:** TBD. Currently all commits go directly to `main` (which auto-deploys via GitHub Pages). Productization will introduce a feature-branch + PR flow with branch protection.
- **Commit attribution:** TBD.
- **CI:** none yet.
- **Tests:** none yet. Zero automated tests across the system today.
- **Worker deploy:** currently manual (Cloudflare dashboard paste-and-save). A `wrangler`-based pipeline is productization priority #1.
- **Frontend deploy:** GitHub Pages from `main`, serves `index.html` at `https://benjaminwittes.github.io/ragtime/`.

## Who's working in this codebase

- **Ben Wittes** — owner and product lead. Works with Claude in both environments above. Has no developer background; collaborates by surfacing strategic decisions and letting Claude execute the technical work, with explanations.
- **Matteo Carraba** — joining to work on a self-improving-dataset feature (deriving headnotes and classifications from user query patterns). Will contribute via GitHub PRs. Details to be filled in as the work spins up.
- **Future Lawfare in-house team or web contractor** — maintenance post-launch.
