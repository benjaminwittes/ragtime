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
  type FrCfrReference,
  type FrDocumentDetail,
  type FrDocumentDisplayRow,
  type FrDocumentSummary,
  fetchFrDocument,
  runFrSummarizeDocument,
} from '@/lib/worker-client'
import { DocTypeBadge } from './FrResultsList'
import { isTodayOrLater } from './fr-format'

/**
 * Side sheet showing one Federal Register document: full text + metadata.
 *
 * Layout (top to bottom):
 *   - FR citation + type badge, ↗ federalregister.gov / PDF
 *   - Title + document number / agencies metadata line
 *   - Dates block — publication / effective / comments close, with the
 *     operative facts (future effective date, open comment window) bolded
 *   - Abstract, EO-citation chips ("EO 14024"), CFR references ("31 CFR 594")
 *   - AI summary action (auth-gated, mirrors presidential)
 *   - Full document text (scrollable)
 */
export function FrDocumentDetailSheet({
  row,
  open,
  onOpenChange,
  onMoreLikeThis,
}: {
  row: FrDocumentDisplayRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pivot to "more like this document" (briefs §3). Omitted = button hidden. */
  onMoreLikeThis?: (seed: { id: number; title: string | null }) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-full !max-w-2xl flex h-full flex-col gap-0 p-0"
      >
        {row ? (
          <FrDocumentDetailBody
            key={row.id}
            row={row}
            onMoreLikeThis={onMoreLikeThis}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No document selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function FrDocumentDetailBody({
  row,
  onMoreLikeThis,
}: {
  row: FrDocumentDisplayRow
  onMoreLikeThis?: (seed: { id: number; title: string | null }) => void
}) {
  const auth = useAuth()
  const paid = usePaid()
  const [detail, setDetail] = useState<FrDocumentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [summary, setSummary] = useState<FrDocumentSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchFrDocument(row.id)
        if (cancelled) return
        setDetail(d.document)
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
      const s = await runFrSummarizeDocument(row.id, auth.auth)
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

  const citation = detail?.fr_citation ?? row.fr_citation ?? '(no citation)'
  const title = detail?.title ?? row.title
  const htmlUrl = detail?.html_url ?? row.html_url
  const pdfUrl = detail?.pdf_url ?? row.pdf_url

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {citation}
          </SheetTitle>
          <DocTypeBadge value={detail?.doc_type ?? row.doc_type} />
          {(detail?.significant ?? row.significant) === true && (
            <span
              className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300"
              title="Designated a significant regulatory action under EO 12866"
            >
              Significant
            </span>
          )}
          <span className="ml-auto flex items-baseline gap-2">
            {htmlUrl && (
              <ExternalChip href={htmlUrl} label="↗ federalregister.gov" />
            )}
            {pdfUrl && <ExternalChip href={pdfUrl} label="↗ PDF" />}
          </span>
        </div>
        {title && (
          <p className="text-sm leading-snug text-foreground/90">{title}</p>
        )}
        {detail && (
          <SheetDescription className="text-xs text-muted-foreground">
            <MetadataLine detail={detail} />
          </SheetDescription>
        )}
      </SheetHeader>
      <div className="flex-1 overflow-y-auto p-5">
        {onMoreLikeThis && (
          <div className="mb-4 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!auth.hasAuth}
              title={
                auth.hasAuth
                  ? 'Find documents similar to this one'
                  : 'Configure AI access (header, top right) to enable.'
              }
              onClick={() =>
                onMoreLikeThis({
                  id: row.id,
                  title: detail?.title ?? row.title ?? null,
                })
              }
            >
              More like this
            </Button>
          </div>
        )}
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
            <DatesSection detail={detail} />

            {detail.abstract && (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Abstract
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                  {detail.abstract}
                </p>
              </section>
            )}

            {detail.agency_names && detail.agency_names.length > 0 && (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Agencies
                </h3>
                <p className="mt-1 text-xs text-foreground/90">
                  {detail.agency_names.join(' · ')}
                </p>
              </section>
            )}

            <ReferencesSection detail={detail} />

            <AiSummarySection
              hasAuth={auth.hasAuth}
              hasText={!!detail.body_text && detail.body_text.trim().length > 0}
              summary={summary}
              loading={summaryLoading}
              error={summaryError}
              onSummarize={handleSummarize}
            />

            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Document text
              </h3>
              {detail.body_text ? (
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-card p-4 font-sans text-sm leading-relaxed text-foreground">
                  {detail.body_text}
                </pre>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  (No text loaded for this document — the canonical rendition
                  lives at the federalregister.gov link above.)
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  )
}

function ExternalChip({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Opens in a new tab"
      className="inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
    >
      {label}
    </a>
  )
}

function MetadataLine({ detail }: { detail: FrDocumentDetail }) {
  const parts: string[] = []
  if (detail.document_number) parts.push(`FR Doc. ${detail.document_number}`)
  if (detail.action) parts.push(detail.action.replace(/\.\s*$/, ''))
  if (detail.regulation_id_numbers && detail.regulation_id_numbers.length > 0)
    parts.push(`RIN ${detail.regulation_id_numbers.join(', ')}`)
  if (parts.length === 0) return null
  return <span>{parts.join(' · ')}</span>
}

/**
 * The dates block — publication / effective / comments close. The operative
 * facts get visual weight: an open comment window and a still-future
 * effective date render bold with a highlight; past dates render quietly.
 */
function DatesSection({ detail }: { detail: FrDocumentDetail }) {
  const commentOpen = isTodayOrLater(detail.comments_close_on)
  const effectiveFuture = isTodayOrLater(detail.effective_on)
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Dates
      </h3>
      <dl className="mt-1.5 space-y-1 text-xs">
        <DateRow label="Published" value={detail.publication_date} />
        <DateRow
          label="Effective"
          value={detail.effective_on}
          operative={effectiveFuture}
          operativeNote="not yet in effect"
        />
        <DateRow
          label="Comments close"
          value={detail.comments_close_on}
          operative={commentOpen}
          operativeNote="window still open"
        />
      </dl>
      {!detail.effective_on && !detail.comments_close_on && detail.dates_text && (
        <p className="mt-1.5 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {detail.dates_text}
        </p>
      )}
    </section>
  )
}

function DateRow({
  label,
  value,
  operative,
  operativeNote,
}: {
  label: string
  value: string | null
  operative?: boolean
  operativeNote?: string
}) {
  if (!value) return null
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-mono',
          operative
            ? 'font-bold text-emerald-700 dark:text-emerald-300'
            : 'text-foreground/90',
        )}
      >
        {value}
        {operative && operativeNote && (
          <span className="ml-2 font-sans text-[10px] font-medium uppercase tracking-wider">
            {operativeNote}
          </span>
        )}
      </dd>
    </div>
  )
}

/** EO-citation chips + CFR-reference list + topics. */
function ReferencesSection({ detail }: { detail: FrDocumentDetail }) {
  const eos = detail.eo_citations ?? []
  const cfrs = detail.cfr_references ?? []
  const topics = detail.topics ?? []
  if (eos.length === 0 && cfrs.length === 0 && topics.length === 0) return null
  return (
    <section className="space-y-3">
      {eos.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Executive orders cited
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {eos.map((eo, i) => (
              <span
                key={i}
                className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary"
              >
                EO {eo}
              </span>
            ))}
          </div>
        </div>
      )}
      {cfrs.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            CFR references
          </h3>
          <p className="mt-1 font-mono text-xs text-foreground/90">
            {cfrs.map(formatCfrReference).join(' · ')}
          </p>
        </div>
      )}
      {topics.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Topics
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {topics.join(' · ')}
          </p>
        </div>
      )}
    </section>
  )
}

/** {title: 31, part: '594'} → '31 CFR 594'. */
function formatCfrReference(ref: FrCfrReference): string {
  const title = ref.title != null ? String(ref.title) : '?'
  if (ref.part) return `${title} CFR ${ref.part}`
  if (ref.chapter) return `${title} CFR ch. ${ref.chapter}`
  return `${title} CFR`
}

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
  summary: FrDocumentSummary | null
  loading: boolean
  error: string | null
  onSummarize: () => void
}) {
  const buttonDisabled = !hasAuth || !hasText || loading
  const buttonHint = !hasAuth
    ? 'Configure AI access (header, top right) to enable.'
    : !hasText
      ? 'No text in the corpus to summarize.'
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
            What it does, who it affects, and the operative dates. Uses your
            configured AI access; cost shows in your balance after.
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
              Document text was truncated before summarization (the cap is
              well above most documents; later sections weren&apos;t seen).
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

/** Compact markdown styling for the in-panel summary. */
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
