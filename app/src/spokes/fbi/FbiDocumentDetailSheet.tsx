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
  type FbiDocumentDetail,
  type FbiDocumentDisplayRow,
  type FbiDocumentSummary,
  fetchFbiDocument,
  runFbiSummarizeDocument,
} from '@/lib/worker-client'
import { OcrQualityBadge } from './FbiResultsList'
import {
  fbiCollectionLabel,
  formatWaybackDate,
  isWaybackRecovered,
} from './fbi-format'

/**
 * Side sheet showing one FBI Records document: full OCR text + metadata.
 *
 * Layout (top to bottom):
 *   - Title + OCR badge + recovered badge, ↗ vault.fbi.gov / PDF
 *   - Collection / part / pages metadata line
 *   - Provenance section — for wayback-recovered documents, the visible
 *     badge block: removed from the Vault, Wayback capture date, and a link
 *     to the original Vault URL the capture preserved (locked decision #1)
 *   - AI summary action (auth-gated, mirrors FR)
 *   - Full OCR text (scrollable)
 *
 * Deliberately NO dates block — doc_date is NULL corpus-wide. The only
 * timestamps shown are provenance facts (Wayback capture, our fetch) and
 * they are labeled as such, never as document dates.
 */
export function FbiDocumentDetailSheet({
  row,
  open,
  onOpenChange,
  onMoreLikeThis,
}: {
  row: FbiDocumentDisplayRow | null
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
          <FbiDocumentDetailBody
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

function FbiDocumentDetailBody({
  row,
  onMoreLikeThis,
}: {
  row: FbiDocumentDisplayRow
  onMoreLikeThis?: (seed: { id: number; title: string | null }) => void
}) {
  const auth = useAuth()
  const paid = usePaid()
  const [detail, setDetail] = useState<FbiDocumentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [summary, setSummary] = useState<FbiDocumentSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchFbiDocument(row.id)
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
      const s = await runFbiSummarizeDocument(row.id, auth.auth)
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
  const sourceUrl = detail?.source_url ?? row.source_url
  const pdfUrl = detail?.pdf_url ?? row.pdf_url
  const provRow = detail ?? row

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {title}
          </SheetTitle>
          <OcrQualityBadge value={detail?.ocr_quality ?? row.ocr_quality} />
          {isWaybackRecovered(provRow.provenance) && (
            <span
              className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300"
              title="This document was removed from the Vault; our copy comes from a Wayback Machine capture."
            >
              Removed from the Vault
            </span>
          )}
          <span className="ml-auto flex items-baseline gap-2">
            {sourceUrl && <ExternalChip href={sourceUrl} label="↗ vault.fbi.gov" />}
            {pdfUrl && <ExternalChip href={pdfUrl} label="↗ PDF" />}
          </span>
        </div>
        <SheetDescription className="text-xs text-muted-foreground">
          <MetadataLine row={row} detail={detail} />
        </SheetDescription>
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
            <ProvenanceSection detail={detail} />

            {detail.cover_letter_url && (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  FOIA cover letter
                </h3>
                <p className="mt-1 text-xs">
                  <a
                    href={detail.cover_letter_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Open the release cover letter ↗
                  </a>
                </p>
              </section>
            )}

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
                Document text (OCR)
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                Machine-recognized from a scan
                {detail.ocr_quality ? ` (quality: ${detail.ocr_quality})` : ''} —
                wording may contain recognition errors; the PDF above is the
                original.
              </p>
              {detail.text_content ? (
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-card p-4 font-sans text-sm leading-relaxed text-foreground">
                  {detail.text_content}
                </pre>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  (No OCR text in the corpus for this document — the original
                  scan lives at the PDF link above.)
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

/** Collection · part · pages. No dates — the corpus has none. */
function MetadataLine({
  row,
  detail,
}: {
  row: FbiDocumentDisplayRow
  detail: FbiDocumentDetail | null
}) {
  const parts: string[] = []
  const collection = detail ? fbiCollectionLabel(detail) : fbiCollectionLabel(row)
  if (collection) parts.push(collection)
  const part = detail?.part_label ?? row.part_label
  if (part) parts.push(part)
  const pages = detail?.page_count ?? row.page_count
  if (pages != null) parts.push(`${pages.toLocaleString()} pages`)
  if (parts.length === 0) return null
  return <span>{parts.join(' · ')}</span>
}

/**
 * The provenance block (locked decision #1 — the badge's full form). For
 * wayback-recovered documents: removed from the Vault, the capture date, and
 * the original Vault URL. For live documents: one quiet line. Our own fetch
 * timestamp is labeled a preservation fact — this corpus has no document
 * dates, and nothing here should read as one.
 */
function ProvenanceSection({ detail }: { detail: FbiDocumentDetail }) {
  const recovered = isWaybackRecovered(detail.provenance)
  const captured = formatWaybackDate(detail.wayback_timestamp)
  const fetched = formatWaybackDate(detail.fetched_at)
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Provenance
      </h3>
      {recovered ? (
        <div className="mt-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          <p>
            <span className="font-semibold">Removed from the Vault.</span> This
            document was on the FBI&rsquo;s FOIA reading room and has since been
            taken down. Our copy reflects the Vault as the Wayback Machine
            captured it{captured ? ` on ${captured}` : ''}.
          </p>
          {detail.original_url && (
            <p className="mt-1">
              Original Vault URL:{' '}
              <a
                href={detail.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all underline underline-offset-2 hover:opacity-80"
              >
                {detail.original_url}
              </a>
            </p>
          )}
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Live on the Vault when preserved
          {fetched ? ` (fetched ${fetched})` : ''}. The Vault publishes these
          scans without document dates.
        </p>
      )}
    </section>
  )
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
  summary: FbiDocumentSummary | null
  loading: boolean
  error: string | null
  onSummarize: () => void
}) {
  const buttonDisabled = !hasAuth || !hasText || loading
  const buttonHint = !hasAuth
    ? 'Configure AI access (header, top right) to enable.'
    : !hasText
      ? 'No OCR text in the corpus to summarize — read the PDF instead.'
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
            What the file is, what the pages cover, and visible redactions or
            gaps. Uses your configured AI access; cost shows in your balance
            after.
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
