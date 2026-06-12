import type { DocsEntry } from '../types'

/**
 * Presidential Documents AI-synthesis mode entry — how the plan/execute
 * AMA works on this spoke, and the candor disciplines specific to it.
 */
export const presidentialNarrativeSynthesisEntry: DocsEntry = {
  slug: 'presidential-narrative-synthesis',
  title: 'AI Synthesis: Presidential Documents',
  summary:
    'How Ask-Me-Anything works here — status and lineage questions, reversal counts, trends, and the caveats that ride along.',
  scope: { kind: 'spoke', spokeSlug: 'presidential' },
  order: 10,
  content: `
**How it works.** Ask a question in plain language. The system plans SQL
queries over the documents *and* the parsed amendment/revocation graph,
shows you the plan and its estimated cost, runs it on your approval, and
synthesizes an answer that cites documents by their citation (Executive
Order 13526, Memorandum of March 18, 2025). Cited documents render as a
clickable list below the answer.

**Question shapes this spoke is built for:**

- **Status / lineage** — "Is EO 12333 still in effect? What amended it?"
  Answered from the disposition graph, with the standing caveat that the
  graph records explicit dispositions only.
- **Reversal counts** — "How many of Obama's executive orders did Trump
  revoke or supersede?" The answer states which relationship types it
  counted.
- **Counts and trends** — "Is the number of executive orders per president
  rising or falling?" Always carries the coverage caveat (EOs from 1940,
  other types from 1994) and notes the substitution of lower-profile
  memoranda for executive orders in recent practice.
- **Narrative sweeps** — "Trace presidential action on classified
  information." Combines concept search with the graph's
  supersedes/revokes spine to order the lineage.

**What it won't do.** It describes what documents order and claim as
authority; it never offers a view on their wisdom or legality. And if a
document conspicuously does *not* define a term or contain an expected
provision, the answer says so plainly — absence in the canonical text is
itself the answer.
`.trim(),
}
