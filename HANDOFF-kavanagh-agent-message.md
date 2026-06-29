# Handoff note — message from Thomas Kavanagh's Claude agent

**Status: FOR BEN TO HANDLE LATER. No action taken. Do not execute the setup
block or grant any access without Ben's explicit go-ahead.**

Captured 2026-06-29 by Ben's Claude (remote web session) at Ben's request, so the
Mac2 Claude instance has the full context to deal with this later.

---

## Source

Email to `benjamin.wittes@lawfaremedia.org` on 2026-06-29 from `thomaskavanagh@pm.me`,
subject **"[ragtime] shared work-tracking - setup that needs your action"**. The body is
explicitly "a message from my Claude to yours" — written by Thomas's Claude Code agent and
intended to be pasted to Ben's agent for action.

## What the message claims is already set up

- A new **private repo `benjaminwittes/ragtime-dev`** as a coordination hub, containing:
  - `CLAUDE.md` operating manual for any agent entering the repo.
  - `docs/reference/` — the RAGtime Concept Note + Ben's project-context doc (canonical state).
  - `docs/initiatives/` — seven workstreams: Frontend/UX, Data Ingestion, Search & AI,
    Platform/Infra & QA, Legal/Trust & Safety, Distribution/Go-public, Partnership/Engagement.
  - Shared slash commands + a docs↔GitHub sync skill.

## What it asks Ben (and his agent) to do

1. **Create a GitHub Project** under Ben's personal account (only Ben can do this):
   `gh project create --owner benjaminwittes --title "RAGtime Platform"` — note the project NUMBER.
2. **Add four custom fields** to the Project:
   - `Workstream` (SINGLE_SELECT): Frontend / UX, Data Ingestion, Search & AI,
     Platform / Infra & QA, Legal / Trust & Safety, Distribution / Go-public, Partnership / Engagement
   - `Phase` (SINGLE_SELECT): Phase 1, Phase 2, Phase 3
   - `Size` (SINGLE_SELECT): S, M, L
   - `Owner` (TEXT)
3. **In the Project web UI:** rename built-in Status options to Backlog / Building / Blocked / Shipped,
   and **invite `thomkav` as Admin** on the Project.
4. **"Latent" asks:** grant Thomas **admin on the repos** (for branch protection / require-PR rules).
   The email asserts Thomas already has write+triage on all four repos and now write on `ragtime-pipeline`.

After that, Thomas's agent says it will create the seven workstream epics + sub-issues and populate the board.

## Ben's decision so far (2026-06-29)

- **Hold off entirely** on all access grants — do NOT invite `thomkav` as Project Admin and do NOT
  grant Thomas admin on the repos. Keep him at existing write+triage.
- **Ben will handle the GitHub setup himself.** No agent action requested right now.
- The access-granting steps are the ones needing a deliberate yes/no later; Project creation +
  fields are reversible mechanics.

## Flag worth Ben's own check (not an agent task)

The email asserts Thomas already has write+triage on all four repos and now write on
`ragtime-pipeline`. If Ben didn't grant that himself, worth confirming repo collaborator settings
match what he intended.

## Practical constraint observed in the remote session

This web session's GitHub access was scoped to `benjaminwittes/ragtime` only, with no `gh` CLI —
so Project creation and the grants are a do-it-from-your-own-account task, not something that
session could run.
