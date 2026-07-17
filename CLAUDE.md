# ragtime — Project Context for Claude

This is the **public frontend repo** of the RAGtime Platform: the React app (`app/` — hub + five
corpus spokes, deployed at https://ragtime.lawfaremedia.org/) plus the legacy single-file
`index.html`. The backend Worker, DB migrations, and deploy pipeline live in the **private**
`benjaminwittes/ragtime-worker` repo (split 2026-06-26); corpus ingest lives in the private
`benjaminwittes/ragtime-pipeline` repo. The full operating manual and durable project narrative
live in `benjaminwittes/ragtime-dev`.

## RAGtime Platform board (shared tracking)

Work in this repo rolls up to the owner-level GitHub Project **RAGtime Platform**. Full operating
manual: `benjaminwittes/ragtime-dev` → `CLAUDE.md`; operator contract: `docs/reference/
co-dev-protocol.md` there. **Start every session by calling the `rt-board` MCP tool `orient`** —
one call returns who you are, the board rollup, your tasks, suggested work, recent activity, a
drift headline, and the protocol. (`rt-board` is wired via this repo's `.mcp.json` and spawns
`rt mcp` on demand; if the tools aren't available, the `rt` CLI is the fallback — checked into
ragtime-dev, `bin/rt install` once per machine.)

- **Starting substantial work?** `claim(ref)` — assigns you and flips the item to Building in one
  call, returning the work packet (body, epic, branch hint, exact PR line). Note: `claim` refuses
  an item someone else already holds unless you pass `force: true` (which co-assigns and posts a
  takeover comment) — unlike `rt task claim`, which silently co-assigns. CLI fallback:
  `rt task claim <repo>#<n>` then `rt task status <repo>#<n> building`.
- **PR completes a board item?** Put `Closes #<n>` in the PR body — the merge closes the issue and
  the board auto-flips it to Shipped; no tool call at ship time. Advancing without finishing →
  `Part of #<n>`.
- **Shipped something feature-scale with no board item?** File it retroactively in one call:
  `add_task(workstream, title, size, status: "shipped", body: "<one paragraph + PR refs>")` — or
  `rt task add <ws> "<title>" --size <S|M|L> --status shipped`. Thirty seconds; keeps the shared
  picture honest.
- **Wondering what drifted, or whether the plumbing works?** `reconcile()` is the merged-PRs-vs-
  board report with suggested one-call fixes; `checkup()` checks gh scopes, board headroom, and
  stale clones.
- **Ending a multi-day push?** Leave a standup: `cd $(rt home)`, run `/standup` (or write
  `docs/standups/<date>-<slug>.md` there), branch + PR it.
- Scripting door, when Mission Control is running: `curl 127.0.0.1:1911/api/v1/...` — read-only
  JSON (`GET /api/v1` lists routes). Writes are MCP-tools or CLI only.
- Workstream slugs: `frontend` · `ingestion` · `search-ai` · `infra` · `legal` · `distribution` ·
  `partnership` · `funding`.
