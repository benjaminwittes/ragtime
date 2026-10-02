import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { SaveToCollection } from '@/my-collections/SaveToCollection'
import {
  type BookContributor,
  type BookDisplayRow,
  type BookRecordResponse,
  type BooksFilterFields,
  fetchBooksRecord,
} from '@lawfare/ragtime-client'
import {
  displayAuthors,
  displayName,
  displayTitle,
  displayYear,
  googleBooksLink,
  handoffLadder,
  languageName,
  type Handoff,
} from './books-format'

/**
 * Side sheet for one catalogue record (`/corpus/books/record`).
 *
 * Top to bottom:
 *   - Title, the "catalogue record" badge, authors · year · publisher
 *   - Where to read it: the handoff ladder (P3) — LOC entry, free full text
 *     when likely public domain, a library — then Google Books under its own
 *     "Connected to RAGtime" heading, because it is a rights-limited index
 *     RAGtime connects to but does not hold (the same label the Explorer uses)
 *   - Contributors with their roles and LC name-authority links
 *   - Publication facts, subjects, series and identifiers
 *   - Contents / summary notes where the record has them, labelled as
 *     unsearchable (they have no index — a reader should not infer they could
 *     have found this book by them)
 *   - Provenance: which bulk file, which snapshot
 *
 * There is no text section and no Summarize action: we hold no text. An id
 * the catalogue does not have comes back `catalogue_absent`, and the Worker's
 * message — which says why that is not evidence the book does not exist — is
 * shown as-is.
 */
export function BooksRecordDetailSheet({
  recordId,
  row,
  open,
  onOpenChange,
  onFilter,
}: {
  /** The record to fetch. A deep link has only this. */
  recordId: number | null
  /** The display row, when opened from a result — renders the header before the fetch lands. */
  row: BookDisplayRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pivot the workspace to a filter (an author's other books, a subject heading). */
  onFilter?: (fields: BooksFilterFields) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!w-full !max-w-2xl flex h-full flex-col gap-0 p-0">
        {recordId != null ? (
          <RecordBody key={recordId} recordId={recordId} row={row} onFilter={onFilter} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No record selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function RecordBody({
  recordId,
  row,
  onFilter,
}: {
  recordId: number
  row: BookDisplayRow | null
  onFilter?: (fields: BooksFilterFields) => void
}) {
  const [resp, setResp] = useState<BookRecordResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetchBooksRecord({ id: recordId })
        if (!cancelled) setResp(r)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [recordId])

  const rec = resp?.record ?? null
  const head = rec ?? row
  const title = head ? displayTitle(head) : `Record ${recordId}`
  const authors = head ? displayAuthors(head) : []
  const year = head ? displayYear(head) : null
  const publisher = head?.publisher?.trim().replace(/[\s,;:]+$/, '') || null

  const ladder = rec
    ? handoffLadder(rec, { locPermalink: resp?.loc_permalink, likelyPublicDomain: resp?.likely_public_domain })
    : []
  const google = rec ? googleBooksLink(rec) : null

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-lawfare-line bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">{title}</SheetTitle>
          <SaveToCollection corpus="books" docId={recordId} title={title} />
          <span
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
            title="A Library of Congress catalogue record. RAGtime holds the record, not the book’s text."
          >
            Catalogue record
          </span>
          {resp?.likely_public_domain && (
            <span
              className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
              title="Published early enough that it is likely in the US public domain — a date heuristic, not a legal determination."
            >
              Likely public domain
            </span>
          )}
        </div>
        <SheetDescription className="text-xs text-muted-foreground">
          {[authors.join('; ') || null, year, publisher].filter(Boolean).join(' · ') || '—'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {loading && <p className="text-sm text-muted-foreground">Loading record…</p>}
        {error && (
          <p className="border-l-2 border-destructive bg-destructive/10 py-2 pl-3 pr-3 text-sm text-destructive">{error}</p>
        )}

        {rec && (
          <>
            <section>
              <SectionHeading>Where to read it</SectionHeading>
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                We hold the catalogue, not the book. These are the places that have more.
              </p>
              <HandoffList items={ladder} />
              {google && (
                <>
                  <h4 className="mt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Connected to RAGtime
                  </h4>
                  <HandoffList items={[google]} />
                </>
              )}
            </section>

            {rec.contributors && rec.contributors.length > 0 && (
              <section>
                <SectionHeading>Contributors</SectionHeading>
                <ul className="mt-2 space-y-1 text-sm">
                  {rec.contributors.map((c, i) => (
                    <ContributorLine key={`${c.name}-${i}`} c={c} onFilter={onFilter} />
                  ))}
                </ul>
              </section>
            )}

            <section>
              <SectionHeading>Publication</SectionHeading>
              <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                <Fact label="Published" value={rec.pub_date} />
                <Fact label="Publisher" value={rec.publisher} />
                <Fact label="Edition" value={rec.edition} />
                <Fact label="Extent" value={rec.extent} />
                <Fact label="Pages" value={rec.page_count != null ? String(rec.page_count) : null} />
                <Fact label="Illustrations" value={rec.illustrations} />
                <Fact label="Language" value={languageName(rec.language)} />
                <Fact
                  label="Other languages"
                  value={(rec.languages ?? []).filter((l) => l !== rec.language).map((l) => languageName(l)).join(', ') || null}
                />
                <Fact label="Translated from" value={languageName(rec.original_language)} />
                <Fact label="Audience" value={resp?.audience_label ?? null} />
              </dl>
            </section>

            {rec.subject_strings && rec.subject_strings.length > 0 && (
              <section>
                <SectionHeading>Subjects</SectionHeading>
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  Library of Congress subject headings. What the Library catalogues this book as being about — not a
                  judgment of the book.
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {rec.subject_strings.map((s) => (
                    <li key={s}>
                      {onFilter ? (
                        <button
                          type="button"
                          onClick={() => onFilter({ subjectExact: s })}
                          className="rounded border border-lawfare-line px-2 py-0.5 text-left text-xs text-foreground hover:bg-muted/60"
                          title="Find other records with exactly this heading"
                        >
                          {s}
                        </button>
                      ) : (
                        <span className="rounded border border-lawfare-line px-2 py-0.5 text-xs">{s}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <SectionHeading>Identifiers</SectionHeading>
              <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                <Fact label="Uniform title" value={rec.uniform_title} />
                <Fact label="Series" value={(rec.series ?? []).join('; ') || null} />
                <Fact label="LC class" value={rec.classification} mono />
                <Fact label="LCCN" value={rec.lccn_normalized ?? rec.lccn} mono />
                <Fact label="ISBN" value={(rec.isbn ?? []).join(' · ') || null} mono />
                <Fact label="OCLC" value={rec.oclc_number} mono />
              </dl>
            </section>

            {(rec.contents || rec.summary) && (
              <section>
                <SectionHeading>Notes on the record</SectionHeading>
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  The cataloguer’s notes, held on a small share of records. They can be read here but are not searchable
                  — no filter can find a book by them.
                </p>
                {rec.summary && <Note label="Summary" text={rec.summary} />}
                {rec.contents && <Note label="Contents" text={rec.contents} />}
              </section>
            )}

            <section>
              <SectionHeading>Provenance</SectionHeading>
              <p className="mt-1 text-xs text-muted-foreground">
                Parsed from the Library of Congress <em>Books All</em> bulk MARC
                {rec.source_vintage ? `, ${rec.source_vintage} snapshot` : ''}
                {rec.source_file ? ` (${rec.source_file})` : ''}. The snapshot is incomplete even within its own years,
                so a book missing here may still be in the Library’s live catalogue.
              </p>
            </section>
          </>
        )}
      </div>
    </>
  )
}

function ContributorLine({ c, onFilter }: { c: BookContributor; onFilter?: (f: BooksFilterFields) => void }) {
  const name = displayName(c.name)
  const roles = (c.roles ?? []).filter(Boolean)
  const what = roles.length ? roles.join(', ') : c.primary ? 'main entry' : 'added entry'
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      {onFilter && c.kind !== 'meeting' ? (
        <button
          type="button"
          onClick={() => onFilter({ author: name })}
          className="text-primary hover:underline"
          title="Other records with this name"
        >
          {name}
        </button>
      ) : (
        <span>{name}</span>
      )}
      <span className="text-xs text-muted-foreground">{what}</span>
      {c.authority && /^https?:\/\//.test(c.authority) && (
        <a
          href={c.authority}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
          title="The Library of Congress name authority record"
        >
          LC authority ↗
        </a>
      )}
    </li>
  )
}

function HandoffList({ items }: { items: readonly Handoff[] }) {
  if (items.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">No outside link can be built from this record.</p>
  }
  return (
    <ul className="mt-2 space-y-2">
      {items.map((h) => (
        <li key={h.key} className="text-sm">
          <a href={h.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {h.label} ↗
          </a>
          <span className="block text-[11px] leading-snug text-muted-foreground">{h.note}</span>
        </li>
      ))}
    </ul>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>
}

function Fact({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value || !value.trim()) return null
  return (
    <>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-xs' : ''}>{value}</dd>
    </>
  )
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
    </div>
  )
}
