import type { DocsEntry } from '../types'

/** Litigation spoke: Filter plus the four AI modes, and the stack. */
export const litigationModesEntry: DocsEntry = {
  slug: 'litigation-modes',
  title: 'The Five Modes and the Stack',
  summary: 'Filter, AI-writes-SQL, Read, Analyze, and Ask (AMA) — and how operations stack on a working set.',
  scope: { kind: 'spoke', spokeSlug: 'litigation' },
  order: 10,
  content: `
Five ways to work a set of cases. The first is free; the four AI modes need
an API key or a positive balance.

**Filter manually (free).** Full-text keyword, case name, courts, judge, case
type, cause/NOS, date range, collection. Results are readable and exportable.

**AI writes SQL.** Describe the query you want in plain language; the model
writes the SQL, shows it to you, and runs it, so you audit the query and not
just the rows.

**AI reads each case.** The AI reads every case in the set against a yes/no
criterion and keeps or drops each one, with a reason — "which of these
actually involves X", "cases where motions to do Z are granted". It narrows
by reading rather than matching, which makes it expensive on large sets.

**AI analyzes.** An analytical write-up over the set, with optional per-case
annotations (rank, score, label). It describes the set rather than narrowing
it — rank by severity of the conduct alleged, summarize, or read through a
lens — and returns a report plus the dataset it rests on, which it may
reorder in light of its findings.

**Ask Me Anything (AMA).** An agentic mode for large sets: it plans a search,
retrieves, and writes a cited answer to a question in your own words. Unlike
Analyze, it reaches across wide bodies of litigation rather than working the
cases already in front of you.

**The stack.** Every query, local or AI, creates an operation on the working
dataset, and each step runs on what the last one produced. You can work with
the current dataset, return to an earlier step, or reset. **Resetting, or
moving back a level, deletes the work that came after it**, so download the
reports and datasets you want to keep.

**Dual output, always.** Every analytical answer arrives with the cases
behind it, and every result clicks through to the docket and the documents
inside it.
`.trim(),
}
