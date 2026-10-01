import type { DocsEntry } from '../types'

/**
 * Book catalogue spoke "How to use" entry.
 *
 * The disclosure that matters most here is the one no other spoke needs:
 * this corpus holds no text. Keep it first. The author-form and subject-drift
 * paragraphs are the two ways a reader gets a silent empty result; keep the
 * worked examples.
 */
export const aboutBooksEntry: DocsEntry = {
  slug: 'about-books',
  title: 'How to Use: Book catalogue',
  summary: 'The Library of Congress catalogue — what a catalogue record can tell you, and what it can’t.',
  scope: { kind: 'spoke', spokeSlug: 'books' },
  order: 9,
  content: `
**What's in it.** Catalogue records for {{books.records}} books from the Library
of Congress: who wrote or edited each one, the title, publisher, date, length,
language, and the subject headings the Library assigned. **We hold the
catalogue, not the books.** There is no text to search, read, quote or
summarise, so this spoke has no AI modes.

**It is a {{books.snapshot}} snapshot, and incomplete even for its own years.** The records
come from LC's *Books All* bulk file. Nothing catalogued after {{books.snapshot}} is here,
and the Library's live catalogue holds records for earlier books that this
snapshot does not. An empty result means "not in this catalogue", not "no
such book".

**Author names are exact, in catalogue form.** Type *Goldsmith, Jack*, not
*Jack Goldsmith*. A misspelling returns nothing rather than a different
author's books — on purpose, because a tolerant match would confidently
return the wrong person. If a name finds nothing, open any record by that
author from a title or subject search and click the name.

**Subject headings drift.** The Library's headings changed form over the
decades, so an exact heading can miss books a looser search finds. Use
*Subject heading contains* first; the exact-heading field is for when you
already know the form — clicking a heading on a record fills it in for you.

**Sparse fields say how sparse they are.** Audience is coded on {{books.audience_pct}} of
records, illustrations on {{books.illustrations_pct}} and page counts on {{books.page_count_pct}}. Each filter
shows its coverage, and a filter on a sparse field can only see the records
that carry it.

**Counts can be floors.** A broad filter matches more records than the
catalogue will count, and the count then reads *{{books.cap}}+*.

**Where to read the book.** Every record ends with where to go next: the
Library of Congress entry, free full text when the book is old enough to be
likely public domain, a library that holds it, and Google Books, listed as
*connected to RAGtime*: a source RAGtime can reach but does not hold, so it is
Google's index rather than ours.
`.trim(),
}
