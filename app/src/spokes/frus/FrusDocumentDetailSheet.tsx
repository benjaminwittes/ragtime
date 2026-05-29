import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { usePaid } from '@/auth/use-paid'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'
import {
  type FrusDocumentDetail,
  type FrusDocumentDisplayRow,
  type FrusDocumentSummary,
  type FrusPerson,
  fetchFrusDocument,
  summarizeFrusDocument,
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
  const auth = useAuth()
  const paid = usePaid()
  const [detail, setDetail] = useState<FrusDocumentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Summary state (brief #5 §3 "plus" — summarize this document). Resets
  // on the body's key change (row.id) so a new doc starts fresh.
  const [summary, setSummary] = useState<FrusDocumentSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

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

  async function handleSummarize() {
    if (!auth.auth) {
      setSummaryError('Configure AI access (header, top right) first.')
      return
    }
    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const s = await summarizeFrusDocument(row.id, auth.auth)
      if (typeof s._balance_cents === 'number') {
        paid.applyBalanceFromWorker(s._balance_cents)
      }
      setSummary(s)
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : String(e))
    } finally {
      setSummaryLoading(false)
    }
  }

  const title = detail?.title ?? row.title ?? '(no title)'
  const classification = detail?.classification ?? row.classification
  // PR 4v: surface the canonical source link prominently at the top of the
  // panel (previously buried at the bottom). The audit-link is available
  // from the row's `source_url` even before the detail fetch resolves, so
  // it renders immediately. Brief #1 §4b: every view that mentions a
  // document carries a one-click path to the canonical primary source.
  const sourceUrl = detail?.source_url ?? row.source_url

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {title}
          </SheetTitle>
          {classification && <ClassificationBadge value={classification} />}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this document on history.state.gov in a new tab"
              className="ml-auto inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
            >
              ↗ history.state.gov
            </a>
          )}
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

            <AiSummarySection
              hasAuth={auth.hasAuth}
              hasText={!!detail.text_content && detail.text_content.trim().length > 0}
              summary={summary}
              loading={summaryLoading}
              error={summaryError}
              onSummarize={handleSummarize}
            />

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

            {/* Source URL surfacing moved to the panel header (PR 4v) —
                the audit link now sits next to the title + classification
                badge instead of below the long document text. */}
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

/**
 * AI summary block. Brief #5 §3 "plus" — summarize this document.
 * BYOK-gated. When hasText is false the button is disabled with an
 * explanation (rare for FRUS, but possible when the corpus has a
 * metadata row without text_content).
 *
 * FRUS-specific structured headings the system prompt asks for:
 * Provenance / Setting / Substance / Key persons / Notable footnotes.
 */
function AiSummarySection({
  hasAuth,
  hasText,
  summary,
  loading,
  error,
  onSummarize,
}: {
  hasAuth: boolean
  hasText: boolean
  summary: FrusDocumentSummary | null
  loading: boolean
  error: string | null
  onSummarize: () => void
}) {
  const buttonDisabled = !hasAuth || !hasText || loading
  const buttonHint = !hasAuth
    ? 'Configure AI access (header, top right) to enable.'
    : !hasText
      ? 'No text content to summarize for this document.'
      : loading
        ? 'Summarizing…'
        : ''

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            AI summary
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
            Attribution-forward summary of the document. Uses your configured
            AI access; cost shows in your balance after.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onSummarize}
          disabled={buttonDisabled}
          title={buttonHint || undefined}
        >
          {loading ? 'Working…' : summary ? 'Re-summarize' : 'Summarize'}
        </Button>
      </div>
      {error && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {summary && (
        <div className="mt-3 space-y-3">
          {summary.was_truncated && (
            <aside
              className={cn(
                'rounded-md border px-3 py-2 text-xs',
                'border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
              )}
            >
              Document text was truncated before summarization. The few FRUS
              documents that exceed the cap (mostly long multi-paper compilations)
              have later sections that weren&apos;t seen.
            </aside>
          )}
          {summary.candor_notes.length > 0 && (
            <aside
              className={cn(
                'rounded-md border px-3 py-2 text-xs',
                'border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
              )}
            >
              <h4 className="text-[10px] font-medium uppercase tracking-wider opacity-80">
                Candor notes
              </h4>
              <ul className="mt-1 list-disc pl-5">
                {summary.candor_notes.map((n, i) => (
                  <li key={i} className="leading-relaxed">
                    {n}
                  </li>
                ))}
              </ul>
            </aside>
          )}
          <div className="space-y-2 text-sm text-foreground">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={SUMMARY_MARKDOWN_COMPONENTS}
            >
              {summary.summary_markdown}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </section>
  )
}

/** Compact markdown styling for the in-panel summary — mirrors OLC's. */
const SUMMARY_MARKDOWN_COMPONENTS = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="font-serif text-lg font-semibold mt-2 mb-1.5" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="font-serif text-base font-semibold mt-3 mb-1" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="font-serif text-sm font-semibold mt-2 mb-1" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="leading-relaxed text-foreground/90" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-5 space-y-0.5" {...props} />
  ),
  ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-5 space-y-0.5" {...props} />
  ),
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  blockquote: (props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-4 border-muted-foreground/30 pl-3 italic text-muted-foreground"
      {...props}
    />
  ),
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
