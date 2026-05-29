import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  type FrusDocumentDetail,
  type FrusDocumentDisplayRow,
  type FrusPerson,
  fetchFrusDocument,
} from '@/lib/worker-client'

/**
 * Side sheet showing one FRUS document's full text + provenance.
 *
 * Layout:
 *   - Title + classification badge inline
 *   - Metadata strip: Date · Volume · Sub-series · Place
 *   - Volume context (rolls up the joined frus_volumes row)
 *   - Source note (the FRUS "Source: …" line — important provenance)
 *   - Persons mentioned (parsed jsonb; rendered as a short list)
 *   - Document text — preserved whitespace
 *   - Source URL (history.state.gov) when available
 */
export function FrusDocumentDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: FrusDocumentDisplayRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-full !max-w-2xl flex h-full flex-col gap-0 p-0"
      >
        {row ? (
          <FrusDocumentDetailBody key={row.id} row={row} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No document selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function FrusDocumentDetailBody({ row }: { row: FrusDocumentDisplayRow }) {
  const [detail, setDetail] = useState<FrusDocumentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchFrusDocument(row.id)
        if (cancelled) return
        setDetail(d)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [row.id])

  const title = detail?.title ?? row.title ?? '(no title)'
  const classification = detail?.classification ?? row.classification

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {title}
          </SheetTitle>
          {classification && <ClassificationBadge value={classification} />}
        </div>
        {detail && (
          <SheetDescription className="text-xs text-muted-foreground">
            <MetadataLine detail={detail} />
          </SheetDescription>
        )}
      </SheetHeader>
      <div className="flex-1 overflow-y-auto p-5">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading document…</p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {detail && (
          <div className="space-y-5">
            <StatusGrid detail={detail} />

            {detail.volume_title && (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Volume context
                </h3>
                <p className="mt-1 text-sm text-foreground/90">
                  {detail.volume_title}
                </p>
                {(detail.volume_content_date_min ||
                  detail.volume_content_date_max) && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {(detail.volume_content_date_min ?? '').slice(0, 10)} —{' '}
                    {(detail.volume_content_date_max ?? '').slice(0, 10)}
                  </p>
                )}
              </section>
            )}

            {detail.source_note && (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Source note
                </h3>
                <p className="mt-2 rounded-md border border-border bg-muted/30 p-3 text-xs italic leading-relaxed text-foreground/90">
                  {detail.source_note}
                </p>
              </section>
            )}

            <PersonsSection persons={detail.persons} />

            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Document text
              </h3>
              {detail.text_content ? (
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-card p-4 font-sans text-sm leading-relaxed text-foreground">
                  {detail.text_content}
                </pre>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  (No text loaded for this document.)
                </p>
              )}
            </section>

            {detail.source_url && (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Source URL
                </h3>
                <a
                  href={detail.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-primary hover:underline"
                >
                  {detail.source_url}
                </a>
              </section>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function MetadataLine({ detail }: { detail: FrusDocumentDetail }) {
  const parts: string[] = []
  if (detail.doc_date) parts.push(`Dated ${detail.doc_date}`)
  if (detail.volume_id) parts.push(`Vol. ${detail.volume_id}`)
  if (detail.sub_series) parts.push(detail.sub_series)
  if (detail.place_name) parts.push(detail.place_name)
  if (detail.doc_number) parts.push(`Doc ${detail.doc_number}`)
  if (parts.length === 0) return null
  return <span>{parts.join(' · ')}</span>
}

function StatusGrid({ detail }: { detail: FrusDocumentDetail }) {
  const entries: Array<[string, React.ReactNode]> = []
  if (detail.text_length != null) {
    entries.push([
      'Length',
      <span className="font-mono" key="tl">{detail.text_length.toLocaleString()} chars</span>,
    ])
  }
  if (detail.element_id) {
    entries.push([
      'Element',
      <span className="font-mono" key="el">{detail.element_id}</span>,
    ])
  }
  if (detail.doc_datetime_min && detail.doc_datetime_max && detail.doc_datetime_min !== detail.doc_datetime_max) {
    entries.push([
      'Date range',
      <span className="font-mono" key="dr">
        {detail.doc_datetime_min.slice(0, 10)} → {detail.doc_datetime_max.slice(0, 10)}
      </span>,
    ])
  }
  if (entries.length === 0) return null
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground uppercase tracking-wide">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Persons jsonb is best-effort — the FRUS XML schema varies by volume, so
 * we render canonical fields when present and fall back to a compact
 * dump for unfamiliar shapes. Limit to 20 to avoid swamping the panel
 * with long person lists (some documents list dozens of attendees).
 */
function PersonsSection({ persons }: { persons: FrusPerson[] | null }) {
  if (!persons || persons.length === 0) return null
  const visible = persons.slice(0, 20)
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Persons mentioned
        {persons.length > visible.length && (
          <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
            (first {visible.length} of {persons.length})
          </span>
        )}
      </h3>
      <ul className="mt-2 space-y-1 text-xs">
        {visible.map((p, i) => (
          <li key={p.id ?? i} className="text-foreground/90">
            <span className="font-medium">{p.name ?? '(unnamed)'}</span>
            {p.role && (
              <span className="text-muted-foreground"> — {p.role}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ClassificationBadge({ value }: { value: string }) {
  const isSecret = /secret/i.test(value)
  return (
    <span
      className={
        isSecret
          ? 'rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-destructive'
          : 'rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground'
      }
      title={value}
    >
      {value}
    </span>
  )
}
