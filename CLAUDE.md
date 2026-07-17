# ragtime — Project Context for Claude

This is the **public frontend repo** of the RAGtime Platform: the React app (`app/` — hub + five
corpus spokes, deployed at https://ragtime.lawfaremedia.org/) plus the legacy single-file
`index.html`. The backend Worker, DB migrations, and deploy pipeline live in the **private**
`benjaminwittes/ragtime-worker` repo (split 2026-06-26); corpus ingest lives in the private
`benjaminwittes/ragtime-pipeline` repo. The full operating manual and durable project narrative
live in `benjaminwittes/ragtime-dev`.

## Maintainer coordination

Maintainers track work across the RAGtime repos on a shared project board, coordinated from
`benjaminwittes/ragtime-dev`. If the `rt-board` MCP server is available in your session (wired
via this repo's `.mcp.json`; it requires the maintainers' `rt` CLI on PATH), **start by calling
its `orient` tool** — it returns the board picture and the working protocol, and PRs that
complete a board item say `Closes #<n>` in the body. Without it, this is a normal public repo:
changes go through feature branches → PRs → `main`.
