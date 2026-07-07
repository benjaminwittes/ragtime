import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import {
  type CongressAmaPlan,
  type CongressAmaSynthesis,
  type CongressAnyDisplayRow,
  type CongressCollection,
  fetchCongressItemsByIds,
} from '@/lib/worker-client'
import { TruncationBanner } from '../components/TruncationBanner'
import { filterTruncationMarker } from '../components/truncation-marker'
import { CongressRowsTable } from './CongressResultsList'
import { collectionLabel, parseCitedId } from './congress-format'

/**
 * AMA result panel for the Congress spoke. Renders the narrative + plan
 * disclosure + candor notes + cited documents.
 *
 * Cited-id handling is congress-specific: the planner ranges over five
 * tables, so cited ids may come back collection-qualified ('bills:75567')
 * or bare. Parseable ids are grouped by collection and rendered with the
 * same per-collection table the manual filter uses (bare ids fall back to
 * the collection the AMA was scoped to); anything unparseable renders as
 * plain id chips rather than guessing.
 */
export function CongressAmaResult({
  synthesis,
  plan,
  loading,
  error,
  scopeCollection,
  onOpenDocument,
}: {
  synthesis: CongressAmaSynthesis | null
  plan: CongressAmaPlan | null
  loading: boolean
  error: string | undefined
  /** The collection the AMA scope was drawn from (bare-id fallback). */
  scopeCollection: CongressCollection | null
  onOpenDocument: (collection: CongressCollection, row: CongressAnyDisplayRow) => void
}) {
  if (loading && !synthesis) {
    return (
      <section className="border-b border-border bg-background px-6 py-8 text-sm text-muted-foreground">
        Working — see the session log above for progress.
      </section>
    )
  }
  if (error && !synthesis) {
    return (
      <section className="border-b border-border bg-background px-6 py-8">
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      </section>
    )
  }
  if (!synthesis) {
    return (
      <section className="border-b border-border bg-background px-6 py-8 text-sm text-muted-foreground">
        Ask a question to see a narrative synthesis here.
      </section>
    )
  }

  const normalCandor = filterTruncationMarker(synthesis.candor_notes)
  return (
    <section className="border-b border-border bg-background px-6 py-6">
      {plan && <PlanDisclosure plan={plan} />}
      <TruncationBanner notes={synthesis.candor_notes} />
      {normalCandor.length > 0 && <CandorNotes notes={normalCandor} />}
      <article className="mt-4 space-y-3 text-sm text-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={MARKDOWN_COMPONENTS}
        >
          {synthesis.answer_markdown}
        </ReactMarkdown>
      </article>
      {synthesis.document_ids && synthesis.document_ids.length > 0 && (
        <CitedDocuments
          key={synthesis.document_ids.join(',')}
          ids={synthesis.document_ids}
          scopeCollection={scopeCollection}
          onOpenDocument={onOpenDocument}
        />
      )}
    </section>
  )
}

const COLLECTION_ORDER: readonly CongressCollection[] = [
  'laws',
  'bills',
  'hearings',
  'record',
  'testimony',
]

/**
 * Cited-documents panel — groups the synthesis-returned ids by collection,
 * fetches each group's display rows, and renders the manual-filter tables.
 */
function CitedDocuments({
  ids,
  scopeCollection,
  onOpenDocument,
}: {
  ids: readonly (string | number)[]
  scopeCollection: CongressCollection | null
  onOpenDocument: (collection: CongressCollection, row: CongressAnyDisplayRow) => void
}) {
  const [groups, setGroups] = useState<
    Partial<Record<CongressCollection, CongressAnyDisplayRow[]>> | null
  >(null)
  const [unparsed, setUnparsed] = useState<(string | number)[]>([])
  const [rowsError, setRowsError] = useState<string | null>(null)
  const rowsLoading = groups === null && rowsError === null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const byCollection = new Map<CongressCollection, number[]>()
      const leftovers: (string | number)[] = []
      for (const raw of ids) {
        const parsed = parseCitedId(raw, scopeCollection)
        if (parsed) {
          const list = byCollection.get(parsed.collection) ?? []
          list.push(parsed.id)
          byCollection.set(parsed.collection, list)
        } else {
          leftovers.push(raw)
        }
      }
      try {
        const fetched: Partial<
          Record<CongressCollection, CongressAnyDisplayRow[]>
        > = {}
        await Promise.all(
          [...byCollection.entries()].map(async ([collection, idList]) => {
            const rows = await fetchCongressItemsByIds(collection, idList)
            fetched[collection] = rows
          }),
        )
        if (cancelled) return
        setGroups(fetched)
        setUnparsed(leftovers)
      } catch (e) {
        if (cancelled) return
        setRowsError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ids, scopeCollection])

  return (
    <section className="mt-6 border-t border-border pt-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Cited documents ({ids.length.toLocaleString()})
      </h3>
      {rowsLoading && (
        <p className="text-xs text-muted-foreground">Loading cited documents…</p>
      )}
      {rowsError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Couldn&apos;t load cited documents: {rowsError}
        </p>
      )}
      {groups &&
        COLLECTION_ORDER.map((collection) => {
          const rows = groups[collection]
          if (!rows || rows.length === 0) return null
          return (
            <div key={collection} className="mb-4">
              <h4 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {collectionLabel(collection)} ({rows.length.toLocaleString()})
              </h4>
              <CongressRowsTable
                collection={collection}
                rows={rows}
                onOpenDocument={(row) => onOpenDocument(collection, row)}
              />
            </div>
          )
        })}
      {groups && unparsed.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Also cited (couldn&apos;t resolve to a collection):{' '}
          <span className="font-mono">{unparsed.join(', ')}</span>
        </p>
      )}
      {groups &&
        unparsed.length === 0 &&
        COLLECTION_ORDER.every((c) => !groups[c] || groups[c]!.length === 0) && (
          <p className="text-xs text-muted-foreground">
            (No matching documents found for the cited ids.)
          </p>
        )}
    </section>
  )
}

function PlanDisclosure({ plan }: { plan: CongressAmaPlan }) {
  const [open, setOpen] = useState(false)
  const queryCount = plan.queries.length
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="mb-3 rounded-md border border-border bg-card"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/40">
        Plan ({plan.output_mode} · {queryCount} quer{queryCount === 1 ? 'y' : 'ies'})
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3 text-xs text-foreground/90">
        <p className="leading-relaxed">{plan.approach_summary || '(no plan summary)'}</p>
        {plan.queries.length > 0 && (
          <ol className="space-y-2 list-decimal pl-5">
            {plan.queries.map((q, i) => (
              <li key={i} className="leading-snug">
                <span className="font-medium">{q.label}</span>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded border border-border bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                  {q.sql}
                </pre>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  )
}

function CandorNotes({ notes }: { notes: readonly string[] }) {
  return (
    <aside
      className={cn(
        'mb-3 rounded-md border px-3 py-2 text-xs',
        'border-amber-400/50 bg-amber-500/10 text-amber-900 dark:text-amber-200',
      )}
    >
      <h3 className="text-[10px] font-medium uppercase tracking-wider opacity-80">
        Candor notes
      </h3>
      <ul className="mt-1 list-disc pl-5">
        {notes.map((n, i) => (
          <li key={i} className="leading-relaxed">
            {n}
          </li>
        ))}
      </ul>
    </aside>
  )
}

/** Same markdown register as the other spokes' AMA panels. */
const MARKDOWN_COMPONENTS = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="font-serif text-2xl font-semibold mt-2 mb-3" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className="font-serif text-xl font-semibold mt-5 mb-2 border-b border-border pb-1"
      {...props}
    />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="font-serif text-base font-semibold mt-4 mb-1.5" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="leading-relaxed text-foreground" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-primary hover:underline" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-6 space-y-1" {...props} />
  ),
  ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-6 space-y-1" {...props} />
  ),
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  blockquote: (props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground"
      {...props}
    />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]"
      {...props}
    />
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <table className="my-3 w-full border-collapse text-xs" {...props} />
  ),
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th
      className="border border-border bg-muted/40 px-2 py-1 text-left font-medium"
      {...props}
    />
  ),
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="border border-border px-2 py-1 align-top" {...props} />
  ),
}
