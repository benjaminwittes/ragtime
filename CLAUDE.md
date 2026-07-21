# ragtime — Project Context for Claude

This is the **public frontend repo** of the RAGtime Platform: the React app (`app/` — hub +
per-corpus spoke surfaces, deployed at https://ragtime.lawfaremedia.org/) plus the legacy
single-file `index.html` (preserved at `/legacy.html`). The backend Worker, DB migrations, and
deploy pipeline live in the **private** `benjaminwittes/ragtime-worker` repo (split 2026-06-26);
corpus ingest lives in the private `benjaminwittes/ragtime-pipeline` repo. The full operating
manual and durable project narrative live in `benjaminwittes/ragtime-dev`.

## Maintainer coordination

Maintainers track work across the RAGtime repos on a shared project board, coordinated from
`benjaminwittes/ragtime-dev`. If the `rt-board` MCP server is available in your session (wired
via this repo's `.mcp.json`; it requires the maintainers' `rt` CLI on PATH), **start by calling
its `orient` tool** — it returns the board picture and the working protocol, and PRs that
complete a board item say `Closes #<n>` in the body (`Part of #<n>` when advancing without
finishing). Project state (architecture, corpora, deploy targets) is read through the same
tools — don't restate it in this repo's files. Without it, this is a normal public repo:
changes go through feature branches → PRs → `main`.
