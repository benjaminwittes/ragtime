# RAGtime — Project Context for Claude

RAGtime is a public research tool over Lawfare's federal-court litigation corpus. It is **the first instance** of a planned series of integrated, queryable databases of democracy-adjacent public information (OLC opinions, FBI/CIA FOIA releases, congressional documents, others). Owned by the Lawfare Institute.

## Current state at a glance

- **Production-live in Stripe live mode** as of 2026-05-16. Real cards charged. Three prepaid pricing tiers ($5, $20, $50).
- Architecture: **Cloudflare Worker backend + single-file HTML frontend + two Supabase projects (Postgres 17)** — a PII-free **CORPUS** project (`xsqdnuqyqyykkzuiqphr`: all research corpora + the corpus query path) and a small **APP** project (`aikdbjprndgksibbvcfs`: billing, auth, PII; the Worker's billing paths use it). Split 2026-05-23 (the "DB plane split") after a bulk corpus load hit the single project's disk wall and briefly flipped it read-only. The APP project still holds a *frozen* copy of the corpus tables (to be dropped in Phase 4).
- **Five corpora loaded in the corpus project. Live production at GitHub Pages (`index.html`) still surfaces only litigation; the React rebuild at `app/` surfaces all five (as of PRs 4q–4u, 2026-05-29) but the production `/` cutover hasn't happened yet — the rebuild Vite-dev-serves locally and CI-builds clean.** Loaded corpora: federal **litigation** (`cases`/`docket_entries`/`documents`, post-1/20/2025 floor — 1.09M cases / 6.75M docket entries) + **FRUS** (State Dept documentary history, `frus_documents` + `frus_volumes`, 1620→1991 — 314K documents / 694 volumes, ingested 2026-05-23) + **OLC** opinions (`olc_opinions` — DOJ archive 1,439 + Knight FOIA net-new 706 = 2,145, ingested 2026-05-24) + **USC** (`usc_sections` — all 53 titles, 60,416 sections, release point 119-93) + **CFR** (`cfr_sections` — all 49 titles, 227,554 sections, current as of 2026-05-21). Ingest code is in the private `ragtime-pipeline` repo (`ingest/<corpus>/`). Worker `/corpus/<slug>/*` endpoints exist for all five (filter + detail + AMA plan/execute/summarize). **Content roadmap:** launch beta with all 5 currently-loaded corpora as spokes (calibrated-parity to each incumbent — see the Phase I plan memory) + Lawfare-as-corpus when API access lands; post-launch acquisition follows the locked queue (see the post-launch acquisition queue memory; Sprint 1 = presidential documents + DOJ press releases preservation, then Congressional, CRS, GAO, Federal Court Rules). FBI/declassified deferred to later sprints.
- **Corpus queries run server-side in the Worker (Phase 3, 2026-05-24).** Search/filter and all AI features (Ask/AMA, AI-writes-SQL, Read, Analyze) + the manual filter call the Worker's `/corpus/*` endpoints, which query the corpus project. `index.html` holds **no SQL** — the old client-side `run_query` (an arbitrary-SQL-from-the-browser surface) is gone; the frontend's Supabase client is now **auth-only**. This realigned the codebase so `index.html` is genuinely UI and the corpus/query logic is the Worker's.
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

**New-corpus ingestion (presidential docs, DOJ press-release preservation, congressional, etc.).** Every new corpus has two phases: *exploration* (sample documents, schema brainstorming, "what does this source look like") and *implementation* (actual ingest code that writes to Supabase). Exploration belongs in Cowork — chat-friendly investigation, no code commits — and Cowork's scouts land at `~/Library/Mobile Documents/com~apple~CloudDocs/Documents/Claude/Projects/Litigation Tracking/<corpus>-corpus-scout.md`. **Implementation belongs here in the repo, including one-shot backfills, not only continuous pipelines.** Reasons: reproducibility (re-running after schema migrations or source-format changes), reusability (today's backfill becomes tomorrow's ongoing watcher), and platform coherence (shared schema conventions across corpora so the Worker and frontend don't special-case each one). **Order of operations:** smaller/simpler corpora first, to exercise and refine cross-corpus patterns before harder ones inherit them — **all five launch corpora (litigation, FRUS, OLC, USC, CFR) loaded as of 2026-05-26.** New-corpus acquisition is now *deferred to post-launch* per the locked acquisition queue (see the post-launch acquisition queue memory). (Note: the original "one `ingest/<corpus>/` subdir in this repo" plan is under the same public/private reasoning as the pipeline — scraping/acquisition code likely belongs in a private repo, not the public `benjaminwittes/ragtime`. Decide per corpus with Ben.)

**Strategic briefs (NEW artifact type, Code-authored).** Distinct from Cowork's acquisition scouts: when a loaded corpus (or a cross-cutting primitive like collections) needs a UI surface, Code authors a strategic brief covering imagined questions, facets, query modes, parity check vs. the incumbent, output/tone, dependencies. Briefs are stored alongside Cowork's scouts at `~/Library/Mobile Documents/com~apple~CloudDocs/Documents/Claude/Projects/Litigation Tracking/query-design-N-<surface>.md` (the iCloud folder is a shared cross-device workspace, not Cowork-exclusive). Working method: Code drafts in conversation with Ben (Ben enriches the imagined-questions section), brief closes, then implementation begins. **Seven briefs as of 2026-05-28:** (1) general AMA hub, (2) OLC, (3) USC, (4) CFR, (5) FRUS, (6) litigation [retrospective + §7 React-port modifications added 2026-05-28], (7) collections architecture [§0 fully locked 2026-05-28]. Per-collection briefs (#7a AI-liability, #7b Democracy Litigation) live under #7; #7a awaits Scott Anderson's async input.

The code/Cowork consolidation above already happened (2026-05-24). What remains is the **UI rebuild** (productization priority #7, scope substantially expanded 2026-05-25 from "modular refactor" to "modular refactor + Lawfare-branded redesign + multi-corpus surfacing"). **Locked decisions (2026-05-25/26, in the Phase I plan memory):** stack = React + Vite + TypeScript + shadcn/Radix; architecture = hub-and-spoke (free keyword AMA hub across all corpora + per-corpus spoke surfaces, each with its own query design); launches with **all 5 loaded corpora as spokes at *calibrated parity*** (each surface ≥ its incumbent, calibration per-corpus — e.g. CourtListener for litigation, eCFR.gov for CFR, history.state.gov for FRUS); cross-cutting principles = parity floor, auditability, free-tier metadata floor (structured filtering free, not paywalled), no commentary/supplementation ever, and (new 2026-05-28) **no query-architecture buttons in the UI — free-form input; the system recognizes query shapes internally**. **Working method = per-corpus query-design briefs first, then implementation.**

**React foundation — MERGED to `main` 2026-05-28** (PRs #32 → #34 → #35 → #36 → #33). Stack in order:
- PR #32: Vite + React + TypeScript scaffold at `app/`
- PR #34: design system (Tailwind 4 + shadcn + Lawfare brand tokens)
- PR #35: per-corpus capability descriptor abstraction
- PR #36: docs-registry infrastructure (the in-app documentation pattern — `data-doc-id` attributes on components + a registry of {short, long, example}, persists across surfaces via a toggle; planned as the home for content that used to live in the welcome card and for the per-corpus query-design content)
- PR #33: CLAUDE.md state refresh

**React rebuild progression (PRs 4a–4u, all merged to `main`):**
- **Foundation + chassis (PR 4a–4k):** docs-registry infra, litigation spoke port (chassis + 5 modes + case detail), stack runtime, hub + multi-spoke routing scaffold, paid-tier auth + Stripe top-up.
- **Spoke v1 alphas (PR 4l–4p, 2026-05-28):** USC, CFR, OLC, FRUS spokes ported as manual-filter + detail (no AI yet).
- **AI-modes sweep (PR 4q–4t, 2026-05-29):** every non-litigation spoke gained `claude_ama` + a per-document/section Summarize action.
  - 4q OLC: narrative synthesis (paradigmatic) + summarize-opinion.
  - 4r FRUS: asymmetric three-flagship (narrative/coverage/retrieval routed via planner's `output_mode`) + summarize-document.
  - 4s USC: three co-equal flagships (Legality/Authority/Topical) + summarize-section. Authority flagship surfaces a cross-corpus-deferral candor note.
  - 4t CFR: three co-equal flagships (Compliance/Authority/Framework) + summarize-section. Per-section currency + reserved-placeholder exclusion baked in.
- **Hub free tier (PR 4u, 2026-05-29):** replaced the "coming soon" placeholder with real cross-corpus keyword search — `POST /corpus/hub/keyword` runs five parallel FTS queries (one per corpus) and surfaces grouped-by-corpus results. No LLM; brief #1 §4b explicitly grouped-not-merged because per-corpus relevance scores aren't comparable.

**State as of 2026-05-29:** all five corpora have AI surfaces in the React rebuild; the hub has a real working cross-corpus entry point. The docs registry is seeded with 9 entries (1 global hub + 8 spoke-scoped). The pattern across all five AMA endpoints is identical: `/corpus/<slug>/{plan,execute,summarize-*}`, scope cap of 25K ids inlined into the executor's substitute-scoped helper, parsers + scope normalizers exported for unit tests.

**Still NOT swapped in production:** the live site at GitHub Pages still serves the legacy `index.html`. The React app at `app/` is built clean and Vite-dev-serves locally (`http://localhost:5173`), but the production `/` cutover hasn't happened — when it does, GitHub Pages needs to serve `app/dist/` (built via `vite build`) instead of `index.html`. The Worker endpoints all live and serve both clients fine.

**Deferred from the rebuild (Phase 2-ish, not started):**
- **pgvector + semantic retrieval.** Brief #1 Phase 2; would unlock (a) the hub's paid AI synthesis layer (cross-corpus cited answer over the keyword result set) and (b) better recall on concept/principle queries in USC/CFR/OLC. The infrastructure decision (which embedding model) is also deferred.
- **Cross-corpus joins.** USC↔CFR via eCFR's `authorities` data (cleanest, structured), USC/CFR↔litigation + USC/CFR↔OLC via regex citation extraction. Needs pipeline-side ingest work + Worker surfacing + UI ("12 cases cite this section" links). The USC/CFR AMAs already surface this as a candor-note limitation when the question would benefit.
- **Definitional layer.** Parsed `usc_definitions` + `cfr_definitions` tables with `scope_note`. ETL pass over `text_content`. CFR's is more load-bearing (reg defs are typically per-subpart, not per-chapter).
- **Curated scopes library.** USC + CFR. Hand-curated rule packages (UCMJ, HIPAA Privacy Rule, Reg Z, FAR, NEPA, etc.) + subject-matter buckets. Editorial content; Ben/editors curate.
- **Agency-as-top-level-browse for CFR.** ~50 agencies auto-derived from `(title, chapter)`; the brief #4 §2 navigation primitive parallel to title-num.
- **Spoke navigation parity:** USC + CFR hierarchical browse (title→chapter→part→section). Currently only filter-based; brief calls for Cornell-LII-style nav (minus the commentary).
- **Hub click-through into spoke detail sheets** (currently the hub keyword card only opens the workspace; clicking a specific result still requires re-clicking in the spoke).
- **`?q=…` prefill carryover** so "Open workspace" from the hub lands with the FTS field populated.
- **Production `/` cutover** (React app replaces `index.html`).
- **Lawfare-branded redesign** (the 2026-05-25 "blend" direction). The current React UI is functional but lacks the editorial Lawfare identity layer.

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
- **CI:** the Worker deploy workflow (`.github/workflows/deploy-worker.yml`) runs `wrangler deploy --dry-run` on PRs touching `worker/**` and a real deploy on push to `main`. **As of PR #19 (2026-05-25) a `test` job runs vitest before deploy** — `deploy` now `needs: test`, so the Worker can't deploy with a failing money-path test.
- **Tests:** vitest at repo root + `worker/index.test.js` covers the money path (computeCostCents pricing, lookupAnthropicRates, Stripe verifyStripeSignature real-HMAC, webhookHandler credit/idempotent-replay/chargeback/forged-sig, betaGate). Added 2026-05-25 (PR #19) — the first automated tests in the project. **As of 2026-05-29 the suite is at 228 passing tests**: the money-path block plus per-corpus AMA validator blocks (OLC/FRUS/USC/CFR — scope normalizers, plan/synthesis/summary parsers, planning-user-message builders, summarize-user-message builders, scope-cap guards) and the hub keyword query builders (per-corpus SQL shape, escape contract, CFR-reserved exclusion). The frontend and the pipeline are still untested.
- **Worker deploy:** `wrangler` via GitHub Actions — push to `main` touching `worker/**` auto-deploys; manual dry-run/real runs via `workflow_dispatch`. (Replaced dashboard paste-and-save; was productization priority #1, now done.)
- **Frontend deploy:** GitHub Pages from `main`, serves `index.html` at `https://benjaminwittes.github.io/ragtime/`.
- **Pipeline deploy:** separate private repo `benjaminwittes/ragtime-pipeline`; deploy via `git pull && ./install.sh` on Mac2.

## Who's working in this codebase

- **Ben Wittes** — owner and product lead. Works with Claude in both environments above. Has no developer background; collaborates by surfacing strategic decisions and letting Claude execute the technical work, with explanations.
- **Scott R. Anderson** — in-house Lawfare counsel AND substantive collaborator. Two hats, same person: (1) **counsel** for privacy policy / ToS / data-handling review (Workstream G in the Phase I plan); (2) **substantive contributor** of the AI liability litigation dataset (the first collections-as-spoke — see brief #7 architecture + #7a per-collection brief, AWAITS Scott's imagined-questions input) AND a separately-ingested historical diplomatic records corpus (candidate for a future post-launch corpus on the diplomatic-records side). His Claude instance is a peer; route corpus-design and collection-design conversations through him directly.
- **Matteo Carraba** — joining to work on a self-improving-dataset feature (deriving headnotes and classifications from user query patterns). Will contribute via GitHub PRs. Details to be filled in as the work spins up.
- **Future Lawfare in-house team or web contractor** — maintenance post-launch.
