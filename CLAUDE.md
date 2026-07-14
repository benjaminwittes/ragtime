# Project memory — RAGtime

## Corpus roadmap notes

- **CourtListener (CL) replication access — AGREED, incoming (noted 2026-07-14).**
  Reached an understanding with Michael Lissner (Free Law Project / CourtListener)
  on all points; a contract to formalize it is expected soon. This resolves the
  outstanding pipeline issues and unlocks a **massive expansion of the
  courts/litigation corpus** (beyond the current "filed on/after Jan 20, 2025"
  window documented in `README.md`).
  - Ingest/replication work lives in the **private `ragtime-worker`** repo, not
    this frontend repo.
  - Frontend follow-ups to anticipate once the corpus grows: update the
    corpus-scope copy in `README.md`, and revisit the litigation spoke
    (`app/src/spokes/litigation/`) for anything tuned to the current narrow
    date range / court coverage (e.g. `court-names.ts`, filter ranges).
