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
  type OlcOpinionDetail,
  type OlcOpinionDisplayRow,
  type OlcOpinionSummary,
  fetchOlcOpinion,
  summarizeOlcOpinion,
} from '@/lib/worker-client'

/**
 * Side sheet showing one OLC opinion's full text + metadata + provenance.
 * Opens on row click in the manual-filter results.
 *
 * Layout (top to bottom):
 *   - Title + source badge inline
 *   - Issued / Author / Recipient / President metadata grid (only rendered
 *     for fields that exist — many records have null author or president)
 *   - Citation rung if volume + page are available (e.g. "37 Op. O.L.C. 1")
 *   - Summary (when present) + summary_source attribution
 *   - Provenance — DOJ-published vs Knight FOIA, with outbound links to
 *     the original DOJ source URL and the Knight FOIA source URL when
 *     available. Surfaces the dual-provenance story per brief #2.
 *   - Full opinion text — preserved whitespace
 *   - OCR-quality warning when degraded
 */
export function OlcOpinionDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: OlcOpinionDisplayRow | null
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
          <OlcOpinionDetailBody key={row.id} row={row} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No opinion selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function OlcOpinionDetailBody({ row }: { row: OlcOpinionDisplayRow }) {
  const auth = useAuth()
  const paid = usePaid()
  const [detail, setDetail] = useState<OlcOpinionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Per-opinion summary state (brief #2 §3 "plus" — summarize this opinion).
  // Lives at the body level so it resets when the sheet's key (row.id)
  // changes; users opening a different opinion start fresh.
  const [summary, setSummary] = useState<OlcOpinionSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchOlcOpinion(row.id)
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
      const s = await summarizeOlcOpinion(row.id, auth.auth)
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
  const source = detail?.source ?? row.source
  // PR 4v: surface the canonical source link prominently. DOJ canonical
  // URL wins; falls back to Knight FOIA URL when DOJ is null. Available
  // from the row before the detail fetch resolves.
  const sourceUrl = detail?.source_url_doj ?? row.source_url_doj ?? detail?.source_url_knight ?? row.source_url_knight
  const sourceUrlLabel =
    (detail?.source_url_doj ?? row.source_url_doj) ? '↗ justice.gov' : '↗ Knight FOIA'

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {title}
          </SheetTitle>
          {source && <SourceBadge value={source} />}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the canonical source for this opinion in a new tab"
              className="ml-auto inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
            >
              {sourceUrlLabel}
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
          <p className="text-sm text-muted-foreground">Loading opinion…</p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {detail && (
          <div className="space-y-5">
            {detail.ocr_quality === 'degraded' && (
              <aside
                className={cn(
                  'rounded-md border px-3 py-2 text-xs',
                  'border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
                )}
              >
                OCR quality is <strong>degraded</strong> for this opinion —
                the underlying scan was hard to parse. Treat character-level
                accuracy with caution; the canonical PDF lives at the source
                URL below.
              </aside>
            )}

            {detail.ocr_quality === 'normalized' && (
              <aside
                className={cn(
                  'rounded-md border px-3 py-2 text-xs',
                  'border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
                )}
              >
                Text is <strong>LLM-normalized</strong> from a degraded
                scan. The original OCR was hard to parse; an LLM pass
                cleaned obvious errors. Verify quotations against the
                source PDF before relying on them.
              </aside>
            )}

            <StatusGrid detail={detail} />

            {detail.summary && (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Summary
                  {detail.summary_source && (
                    <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
                      from {detail.summary_source}
                    </span>
                  )}
                </h3>
                <p className="mt-2 rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground/90">
                  {detail.summary}
                </p>
              </section>
            )}

            <ProvenanceSection detail={detail} />

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
                Opinion text
              </h3>
              {detail.text_content ? (
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-card p-4 font-sans text-sm leading-relaxed text-foreground">
                  {detail.text_content}
                </pre>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  (No text loaded for this opinion.)
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  )
}

/**
 * One-line metadata strip below the title: Issued · Author · Recipient ·
 * President · Citation. Only the fields that exist render — many records
 * have null author / null president.
 */
function MetadataLine({ detail }: { detail: OlcOpinionDetail }) {
  const parts: string[] = []
  if (detail.date_issued) parts.push(`Issued ${detail.date_issued}`)
  if (detail.author) parts.push(`by ${detail.author}`)
  if (detail.recipient) parts.push(`to ${detail.recipient}`)
  if (detail.president) parts.push(`under ${detail.president}`)
  if (detail.volume && detail.page) {
    parts.push(`${detail.volume} Op. O.L.C. ${detail.page}`)
  }
  if (parts.length === 0) return null
  return <span>{parts.join(' · ')}</span>
}

function StatusGrid({ detail }: { detail: OlcOpinionDetail }) {
  const entries: Array<[string, React.ReactNode]> = []
  if (detail.page_count != null) {
    entries.push([
      'Pages',
      <span className="font-mono" key="pc">{detail.page_count.toLocaleString()}</span>,
    ])
  }
  if (detail.text_length != null) {
    entries.push([
      'Length',
      <span className="font-mono" key="tl">{detail.text_length.toLocaleString()} chars</span>,
    ])
  }
  if (detail.ocr_quality) {
    entries.push([
      'OCR',
      <span className="font-mono" key="ocr">{detail.ocr_quality}</span>,
    ])
  }
  if (detail.release_date) {
    entries.push([
      'Released',
      <span className="font-mono" key="rd">{detail.release_date}</span>,
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

function ProvenanceSection({ detail }: { detail: OlcOpinionDetail }) {
  if (
    !detail.source_url_doj &&
    !detail.source_url_knight &&
    !detail.doj_dl_path &&
    !detail.knight_doc_id
  ) {
    return null
  }
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Provenance
      </h3>
      <ul className="mt-2 space-y-1 text-xs">
        {detail.source_url_doj && (
          <li>
            <span className="text-muted-foreground">DOJ source:</span>{' '}
            <a
              href={detail.source_url_doj}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {detail.source_url_doj}
            </a>
          </li>
        )}
        {detail.source_url_knight && (
          <li>
            <span className="text-muted-foreground">Knight FOIA:</span>{' '}
            <a
              href={detail.source_url_knight}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {detail.source_url_knight}
            </a>
          </li>
        )}
        {detail.doj_dl_path && (
          <li>
            <span className="text-muted-foreground">DOJ path:</span>{' '}
            <span className="font-mono text-foreground">{detail.doj_dl_path}</span>
          </li>
        )}
        {detail.knight_doc_id && (
          <li>
            <span className="text-muted-foreground">Knight doc ID:</span>{' '}
            <span className="font-mono text-foreground">{detail.knight_doc_id}</span>
          </li>
        )}
      </ul>
    </section>
  )
}

/**
 * AI summary block. Brief #2 §3 "plus" — read/summarize a specific opinion.
 * BYOK-gated. When hasText is false the button is disabled with an
 * explanation (Knight FOIA opinions with zero-text OCR can't be summarized).
 *
 * Result rendering: markdown summary with the OLC structured-section
 * headings the system prompt asks for. Candor notes call out OCR
 * degradation or truncation when relevant.
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
  summary: OlcOpinionSummary | null
  loading: boolean
  error: string | null
  onSummarize: () => void
}) {
  const buttonDisabled = !hasAuth || !hasText || loading
  const buttonHint = !hasAuth
    ? 'Configure AI access (header, top right) to enable.'
    : !hasText
      ? 'No text content to summarize for this opinion.'
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
            Attribution-forward summary of the opinion. Uses your configured
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
              Opinion text was truncated before summarization (the cap is
              well above most opinions; the few that exceed it have later
              sections that weren&apos;t seen).
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

/** Compact markdown styling for the in-panel summary — tighter spacing
 *  than the AMA result block since the side sheet is narrow. */
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

function SourceBadge({ value }: { value: string }) {
  const isKnight = value === 'knight-foia'
  return (
    <span
      className={
        isKnight
          ? 'rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300'
          : 'rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground'
      }
      title={
        isKnight
          ? 'Knight FOIA — DOJ never published, obtained via FOIA disclosure'
          : 'DOJ published — canonical archive'
      }
    >
      {value === 'doj-published'
        ? 'DOJ'
        : value === 'knight-foia'
          ? 'Knight FOIA'
          : value}
    </span>
  )
}
