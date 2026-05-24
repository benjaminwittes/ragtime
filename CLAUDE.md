# RAGtime — Project Context for Claude

RAGtime is a public research tool over Lawfare's federal-court litigation corpus. It is **the first instance** of a planned series of integrated, queryable databases of democracy-adjacent public information (OLC opinions, FBI/CIA FOIA releases, congressional documents, others). Owned by the Lawfare Institute.

## Current state at a glance

- **Production-live in Stripe live mode** as of 2026-05-16. Real cards charged. Three prepaid pricing tiers ($5, $20, $50).
- Architecture: **Cloudflare Worker backend + single-file HTML frontend + Supabase database (Postgres 17)**.
- Three modes side by side at sign-in: free local search, bring-your-own-API-key (Anthropic / OpenAI / Google), and paid (Lawfare-billed Anthropic + Stripe prepaid blocks).
- The live backend is the Cloudflare Worker `ragtimeproxy`. **As of 2026-05-21 its source is in this repo at `worker/`** (v3.2), deployed via `wrangler` through a GitHub Actions pipeline (`.github/workflows/deploy-worker.yml`): a push to `main` touching `worker/**` auto-deploys. The old `supabase/functions/ragtime-proxy/` Edge Function and the `cloudflare-alt/` fallback have been **deleted**.
- **`README.md` and `DEPLOY.md` were rewritten 2026-05-21** to describe the live architecture (Worker + Supabase + Stripe + the deploy pipeline). They are current.

The canonical project-state document (full architecture, secrets manifest, deploy mechanics, operational gotchas, productization priorities, cleanup carryover from the 2026-05-16 live flip) is `ragtime-handoff.md`, held by Ben outside this repo. Ask Ben if you need it.

## Workspace split — where edits happen

Both Claude environments run on the **same machine, "Mac2"** (the residential Mac that also hosts the running data-acquisition pipeline). Ben's "primary Mac" is a broadcast / video-meetings box, not a dev machine — so there is **no cross-machine isolation boundary** between the two environments.

- **Claude Code** owns **all source-code development** — the Cloudflare Worker (`worker/`, with `wrangler.toml` + the GitHub Actions deploy), infrastructure config, tests, documentation, the corpus-ingest code (in the private `ragtime-pipeline` repo), **and `index.html`** — on **feature branches + PRs** through CI. (Node + wrangler are installed on Mac2, so the Worker can be run/tested locally via `wrangler dev` + node before deploy.) Because it's on the same machine as the running pipeline, Code also drives the pipeline's deploys (`git pull && ./install.sh` from the private repo), launchd start/stop, and log inspection.
- **Claude Cowork** runs **non-code work only**: new-corpus *exploration* (chat-friendly source investigation — see "New-corpus ingestion" below) and the editorial-side scheduled tasks (status checks, queue-depth monitoring that read from Supabase). Cowork **no longer edits `index.html` or any source** — that consolidated into Code on **2026-05-24** to eliminate two-writers-on-one-file conflicts.
- **Caveat on pipeline monitoring:** Cowork's monitoring runs on Mac2 — the same machine as the pipeline it watches — so it is **not truly independent** (it dies with the box it monitors). Real liveness monitoring needs to live off-box; treat the current arrangement as a known gap, not a safety net.
- **Branching:** all changes (Worker, infra, docs, `index.html`) go through Code on feature branches → PRs → merge to `main`. No direct-to-`main` pushes for `index.html` anymore.

**History:** through 2026-05-21 the split was "Cowork owns/pushes `index.html`; Code owns the backend," framed as two separate Macs. It was consolidated 2026-05-24 — driven by the Phase-3 work that moved the corpus query logic *out* of `index.html` into the Worker (`/corpus/*` endpoints), which left `index.html` as genuine UI and made the two-writers split untenable. The "two physical Macs" framing was never a real isolation boundary.

**Pipeline-repo decision (revised 2026-05-21).** The 2026-05-17 plan was to consolidate the pipeline *into this repo*. That was revised once it was clear `benjaminwittes/ragtime` is **public** (GitHub Pages serves it) — scraping infrastructure shouldn't be public. The pipeline source now lives in a **separate private repo, `benjaminwittes/ragtime-pipeline`** (migrated 2026-05-21, secret-scrubbed: `.env`/venvs/logs excluded). The spirit of the original decision is intact: source under version control, deployed via `git pull && ./install.sh`. The pipeline still *runs* on Mac2 — CourtListener throttles cloud IPs aggressively, which is exactly what killed the earlier cloud rewrite `lawfare-rag-sync` (now archived; it revives as a template if/when the Free Law Project data partnership removes the throttling constraint). The live fleet is 7 launchd agents (`api-0`..`api-4`, `pass2-0`, `litigation-sync`); litigation-sync is already re-pointed to deploy from the private repo, the api fleet flips on its next code change.

**New-corpus ingestion (OLC, FBI FOIA Vault, congressional, etc.).** Every new corpus has two phases: *exploration* (sample documents, schema brainstorming, "what does this source look like") and *implementation* (actual ingest code that writes to Supabase). Exploration belongs in Cowork — chat-friendly investigation, no code commits. **Implementation belongs here in the repo, including one-shot backfills, not only continuous pipelines.** Reasons: reproducibility (re-running after schema migrations or source-format changes), reusability (today's backfill becomes tomorrow's ongoing watcher), and platform coherence (shared schema conventions across corpora so the Worker and frontend don't special-case each one). **Order of operations:** smaller/simpler corpora first, to exercise and refine cross-corpus patterns before harder ones inherit them — **FRUS + OLC both done (2026-05-24: OLC = DOJ archive + Knight FOIA net-new); FBI/declassified deferred.** (Note: the original "one `ingest/<corpus>/` subdir in this repo" plan is now under the same public/private reasoning as the pipeline — scraping/acquisition code likely belongs in a private repo, not the public `benjaminwittes/ragtime`. Decide per corpus with Ben.)

The code/Cowork consolidation above already happened (2026-05-24). What remains is the **frontend restructure into modules** (productization priority #7) — a separate, later project; `index.html` is already maintained in the Code/PR workflow, so that restructure is now a refactor, not a workflow change.

## Strategic frame for productization

RAGtime is intended to grow into a platform, not stay a one-off tool. Two modularity axes the architecture must support from day one:

- **Across data domains** — new corpora (OLC opinions, FBI/CIA FOIA releases, congressional materials, etc.) plug in without re-architecting.
- **Across issue-specific breakouts** — research projects that subset an existing corpus, add supplementary materials not in the main corpus, and layer on special functionality. **Live example, now in active implementation (Claude Code):** Scott Anderson's 520-case AI-liability collection — the first such breakout. Needs a generalizable `collections` schema, ingest that bypasses the corpus date floor for designated cases, and priority document acquisition. Editorial input (which cases) comes from Ben/Scott; all implementation runs in Code.

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

- **Branching model:** ALL code — Worker, infra, docs, **and `index.html`** — goes through Claude Code on feature branches + PRs (consolidated 2026-05-24; Cowork no longer pushes anything). Branch protection not yet enforced.
- **Commit attribution:** "Benjamin Wittes (via Claude Code)" author + a `Co-Authored-By: Claude` trailer.
- **CI:** the Worker deploy workflow (`.github/workflows/deploy-worker.yml`) runs `wrangler deploy --dry-run` on PRs touching `worker/**` and a real deploy on push to `main`. No test suite in CI yet.
- **Tests:** none yet. Zero automated tests across the system today.
- **Worker deploy:** `wrangler` via GitHub Actions — push to `main` touching `worker/**` auto-deploys; manual dry-run/real runs via `workflow_dispatch`. (Replaced dashboard paste-and-save; was productization priority #1, now done.)
- **Frontend deploy:** GitHub Pages from `main`, serves `index.html` at `https://benjaminwittes.github.io/ragtime/`.
- **Pipeline deploy:** separate private repo `benjaminwittes/ragtime-pipeline`; deploy via `git pull && ./install.sh` on Mac2.

## Who's working in this codebase

- **Ben Wittes** — owner and product lead. Works with Claude in both environments above. Has no developer background; collaborates by surfacing strategic decisions and letting Claude execute the technical work, with explanations.
- **Matteo Carraba** — joining to work on a self-improving-dataset feature (deriving headnotes and classifications from user query patterns). Will contribute via GitHub PRs. Details to be filled in as the work spins up.
- **Future Lawfare in-house team or web contractor** — maintenance post-launch.
