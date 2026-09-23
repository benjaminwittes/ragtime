import type { DocsEntry } from '../types'

/** Presidential Documents AI-synthesis mode. */
export const presidentialNarrativeSynthesisEntry: DocsEntry = {
  slug: 'presidential-narrative-synthesis',
  title: 'AI Synthesis: Presidential Documents',
  summary: 'Status and lineage questions, reversal counts and trends, with their caveats.',
  scope: { kind: 'spoke', spokeSlug: 'presidential' },
  order: 10,
  content: `
**How it works.** Ask in plain language. The system plans SQL over the
documents *and* the parsed amendment/revocation graph, shows you the plan and
its estimated cost, runs it on your approval, and cites documents by their
citation (Executive Order 13526, Memorandum of March 18, 2025).

**What this spoke is built for.** *Status and lineage* — "Is EO 12333 still
in effect? What amended it?" — answered from the disposition graph, which
records explicit dispositions only. *Reversal counts*, with the relationship
types it counted stated. *Counts and trends*, always carrying the coverage
caveat (EOs from 1940, other types from 1994) and noting the modern
substitution of lower-profile memoranda for executive orders. And *narrative
sweeps*, ordered along the graph's supersedes and revokes spine.

**What it won't do.** It describes what documents order and what authority
they claim, never whether that is wise or lawful. When a document
conspicuously fails to define a term or omits an expected provision, the
answer says so: absence in the canonical text is itself the answer.
`.trim(),
}
