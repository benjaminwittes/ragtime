import type { DocsEntry } from '../types'

/**
 * Litigation spoke "The modes and the stack" entry — Filter (free) + the two
 * AI modes (Read, Analyze), how each differs, and how operations stack on a
 * working set (with the reset warning). AI-writes-SQL and AMA ran over the
 * hosted mirror and were retired when litigation moved to CourtListener's
 * API (federate-api).
 */
export const litigationModesEntry: DocsEntry = {
  slug: 'litigation-modes',
  title: 'The Modes and the Stack',
  summary: 'Filter, Read, and Analyze — and how operations stack on a working set.',
  scope: { kind: 'spoke', spokeSlug: 'litigation' },
  order: 10,
  content: `
The litigation surface gives you three ways to work a set of cases. The
first is free; the two AI modes require an API key or a positive balance
(see Access & cost).

**Filter manually (free)** — the structured form includes full-text keyword
search, case name, courts, judge, case type, cause/NOS, and date range. The
search runs live on CourtListener and returns the newest 100 matching cases,
with the total count; "Load more cases" fetches the next 100. Manual
searches produce a result page you can read and export.

**AI reads each case** — the AI reads each case in the set against a yes/no
criterion you give it and keeps or drops each one, with a reason. Good for
questions like "which of these actually involves X," "show only cases where
Y," or "cases in which motions to do Z are granted." It excludes from the
active dataset (the "stack") any case that doesn't meet a natural-language
criterion. This is a narrowing function that has the AI read carefully —
not a keyword search. Because the AI reads every available item for each
case in the stack, it can get expensive on large sets.

**AI analyzes** — the AI produces an analytical write-up over the set, with
optional per-case annotations (rank, score, label). It does not narrow the
set the way "AI reads each case" does; it describes it. It can rank a
dataset by a criterion ("rank these cases in order of the severity of the
conduct alleged"), summarize it ("summarize these cases"), or analyze it
through a lens ("which of these cases show the influence of the Supreme
Court's Loper Bright decision?"). It returns a written report plus the
dataset it rests on, which it may reorder in light of the question and its
findings. Use it for an analytical roadmap to the dataset in front of you.

Analyze reads up to 150 cases at a time. Narrow the set first if it is
larger.

**Retired modes.** "AI writes SQL" and "Ask Me Anything" ran database
queries over a copy of the dockets that RAGtime hosted. The corpus is now
searched live on CourtListener, which has no database for a model to query,
so those two modes are no longer offered here.

**The stack.** Each query, whether local or AI-based, creates an operation
that changes the working dataset: filtering to a field, having the AI winnow
the current data, having the AI analyze the survivors. Each step operates on
the page the last one produced — the cases loaded on it, not every case
that matched. The stack is visible above the current
dataset, step by step. You can work with the current dataset, return to an
earlier step, or reset the stack entirely to start a new session. **Warning:**
resetting the stack, or moving to an earlier level in it, deletes the work
that took place after that level. You are responsible for retaining reports
and datasets you wish to preserve — all of which are downloadable.

**Dual output, always.** Every analytical answer comes with the responsive
cases behind it, and every result clicks through to the docket and, through
it, to the specific documents within it — so the answer is always
auditable, never a black box.
`.trim(),
}
