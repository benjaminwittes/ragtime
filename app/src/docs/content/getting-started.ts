import type { DocsEntry } from '../types'

/**
 * Global "Start Here" orientation entry. The one-minute explanation of what
 * RAGtime is and the three things you can do on any corpus. Ordered first
 * among the global topics.
 */
export const gettingStartedEntry: DocsEntry = {
  slug: 'getting-started',
  title: 'Start Here: What Is RAGtime?',
  summary: 'The one-minute orientation — what this tool is and the three things you can do with it.',
  scope: { kind: 'global' },
  order: 1,
  content: `
RAGtime is a research tool over public records — eight primary-source
corpora (federal court litigation, the U.S. Code, the Code of Federal
Regulations, Justice Department legal opinions (OLC), presidential
documents with their amendment/revocation graph, the Federal Register,
congressional materials from public laws to hearing transcripts, and the
documentary history of U.S. foreign relations (FRUS)) plus Lawfare's own
published analysis (articles, podcasts, and newsletters) — nine corpora
today, with more planned. Each is made searchable in one place and, where
you want it, readable and analyzable with AI. (Lawfare is the one
commentary corpus: there you're searching what Lawfare's authors have
argued, not a primary source — see *Primary Sources, Not Commentary*.)

The shape of the tool is a **hub and spokes.**

**The Hub** (the landing page) is the cross-everything entry point: one
keyword search across all corpora at once. Use it when you don't yet know
which corpus holds your answer.

**Each spoke** is a corpus's own workspace, with the structured filters,
the canonical document view, and the AI modes that fit that corpus.

**Three things you can do on any corpus:**

- **Find** — locate specific documents by keyword or structured filters.
  These are local searches of the database. They are free. They don't
  involve AI.
- **Filter** — narrow a field down to a working set by date, court,
  agency, classification, and so on. Again, local searches of the RAGtime
  database. Free.
- **Ask / analyze** — put an AI of your choice on the set: ask it to
  synthesize an answer, to read each document against a question, or to
  produce an analytical write-up. Every AI output cites the underlying
  sources. These are not free — each call to the AI costs money, and the
  system gives you an estimate of the cost before you run it.

**A note on what's free.** Searching and structured filtering on the local
database are free on every corpus. The AI features run on either your own
API key or a Lawfare-billed prepaid balance — see Access & cost. This
billing exists only to recoup Lawfare's cost of running the system: we
charge $1.35 for every $1.00 of actual API usage on our key. This markup
covers expenses associated with the search functions. It is not designed
to generate revenue for Lawfare.
`.trim(),
}
