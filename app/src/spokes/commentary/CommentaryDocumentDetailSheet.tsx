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
import { DocsHint } from '@/docs/DocsHint'
import { usePaid } from '@/auth/use-paid'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'
import {
  type CommentaryDisplayRow,
  type CommentaryDocumentDetail,
  type CommentaryDocumentSummary,
  type CommentaryPublication,
  fetchCommentaryDocument,
  summarizeCommentaryDocument,
} from '@/lib/worker-client'

/** Seed for a "more like this" pivot — carries publication because commentary
 *  MLT is per-publication (the Worker keys it 'commentary:<publication>'). */
export type CommentaryMltSeed = {
  publication: CommentaryPublication
  id: number
  title: string | null
}

/**
 * Side sheet that reads one Commentary piece in full — a piece READER. Opens on
 * card click in the manual-filter results (and from AMA citations / semantic /
 * more-like-this results).
 *
 * Layout (top to bottom):
 *   - Title + publication badge + content-type badge, plus a prominent "Read at
 *     source ↗" button to the canonical URL (commentary lives on the
 *     publisher's site; we link out prominently — the link-back rule).
 *   - Byline / date / series metadata line
 *   - Subtitle (the standfirst), when present
 *   - Topic chips (Lawfare only)
 *   - AI "Summarize" action (attribution-forward summary of one piece)
 *   - Body — body_text rendered as paragraphs (defensive: Executive Functions
 *     has no body_html; Lawfare's body_html is scraped markup we don't trust —
 *     see the SECURITY note below).
 */
export function CommentaryDocumentDetailSheet({
  row,
  open,
  onOpenChange,
  onMoreLikeThis,
}: {
  row: CommentaryDisplayRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pivot to "more like this piece". Omitted = button hidden. */
  onMoreLikeThis?: (seed: CommentaryMltSeed) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-full !max-w-2xl flex h-full flex-col gap-0 p-0"
      >
        {row ? (
          <CommentaryDocumentDetailBody
            key={`${row.publication}:${row.id}`}
            row={row}
            onMoreLikeThis={onMoreLikeThis}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No piece selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function CommentaryDocumentDetailBody({
  row,
  onMoreLikeThis,
}: {
  row: CommentaryDisplayRow
  onMoreLikeThis?: (seed: CommentaryMltSeed) => void
}) {
  const auth = useAuth()
  const paid = usePaid()
  const [detail, setDetail] = useState<CommentaryDocumentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Per-piece summary state. Lives at the body level so it resets when the
  // sheet's key (publication:id) changes; opening a different piece starts fresh.
  const [summary, setSummary] = useState<CommentaryDocumentSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchCommentaryDocument(row.publication, row.id)
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
  }, [row.publication, row.id])

  async function handleSummarize() {
    if (!auth.auth) {
      setSummaryError('Configure AI access (header, top right) first.')
      return
    }
    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const s = await summarizeCommentaryDocument(
        row.publication,
        row.id,
        auth.auth,
      )
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

  const title = detail?.title ?? row.title ?? '(untitled)'
  const publication = detail?.publication ?? row.publication
  const postType = detail?.post_type ?? row.post_type
  const sourceUrl = detail?.source_url ?? row.source_url
  const authors = detail?.authors ?? row.authors ?? []
  const topicNames = detail?.topic_names ?? row.topic_names ?? []
  const series = detail?.series ?? row.series
  const subtitle = detail?.subtitle ?? row.subtitle
  const hasBody =
    !!detail && !!detail.body_text && detail.body_text.trim().length > 0

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <PublicationBadge value={publication} />
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {title}
          </SheetTitle>
          {postType && <PostTypeBadge value={postType} />}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Read this piece at its source in a new tab"
              className="ml-auto inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
            >
              Read at source ↗
            </a>
          )}
        </div>
        <SheetDescription className="text-xs text-muted-foreground">
          <MetadataLine
            authors={authors}
            publishedDate={detail?.published_date ?? row.published_date}
            series={series ?? null}
          />
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
                  ? 'Find pieces similar to this one'
                  : 'Configure AI access (header, top right) to enable.'
              }
              onClick={() =>
                onMoreLikeThis({
                  publication: row.publication,
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
          <p className="text-sm text-muted-foreground">Loading piece…</p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {detail && (
          <div className="space-y-5">
            {subtitle && (
              <p className="border-l-4 border-muted-foreground/30 pl-3 text-sm italic leading-relaxed text-muted-foreground">
                {subtitle}
              </p>
            )}

            {topicNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topicNames.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <AiSummarySection
              hasAuth={auth.hasAuth}
              hasText={!!hasBody}
              summary={summary}
              loading={summaryLoading}
              error={summaryError}
              onSummarize={handleSummarize}
            />

            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Full text
              </h3>
              {/* SECURITY: Lawfare's body_html is SCRAPED markup, not trusted —
                  rendering it via dangerouslySetInnerHTML is an XSS vector on
                  our origin, and Executive Functions has no body_html at all.
                  We render the clean extracted body_text as paragraphs for both
                  publications; full-fidelity formatting is one click away via
                  "Read at source". (To render rich bodies later, sanitize via
                  DOMPurify first.) */}
              {detail.body_text ? (
                <div className="mt-2 space-y-3 rounded-md border border-border bg-card p-4 text-sm leading-relaxed text-foreground">
                  {detail.body_text
                    .split(/\n\s*\n/)
                    .map((para) => para.trim())
                    .filter(Boolean)
                    .map((para, i) => (
                      <p key={i} className="whitespace-pre-wrap break-words">
                        {para}
                      </p>
                    ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  (No body text loaded — read the full piece at its source via
                  the link above.)
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
 * One-line metadata strip below the title: byline · date · series. Only the
 * fields that exist render.
 */
function MetadataLine({
  authors,
  publishedDate,
  series,
}: {
  authors: readonly string[]
  publishedDate: string | null
  series: string | null
}) {
  const parts: string[] = []
  if (authors && authors.length > 0) parts.push(`By ${authors.join(', ')}`)
  if (publishedDate) parts.push(publishedDate)
  if (series) parts.push(series)
  if (parts.length === 0) return <span>Commentary</span>
  return <span>{parts.join(' · ')}</span>
}

/**
 * AI summary block — "Summarize this piece." BYOK-gated. When the piece has no
 * recoverable body text the button is disabled with an explanation.
 *
 * The summary is attribution-forward: it describes what the author argues, not
 * whether the argument is right (commentary, not adjudication).
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
  summary: CommentaryDocumentSummary | null
  loading: boolean
  error: string | null
  onSummarize: () => void
}) {
  const buttonDisabled = !hasAuth || !hasText || loading
  const buttonHint = !hasAuth
    ? 'Configure AI access (header, top right) to enable.'
    : !hasText
      ? 'No body text to summarize for this piece.'
      : loading
        ? 'Summarizing…'
        : ''

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            AI summary
            <DocsHint
              slug="commentary-document-summary"
              label="how AI summary works"
            />
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
            Attribution-forward summary of what this piece argues. Uses your
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
              The piece was truncated before summarization (the cap is well above
              most pieces; the few that exceed it have later sections that
              weren&apos;t seen).
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

/** Compact markdown styling for the in-panel summary — tighter spacing than the
 *  AMA result block since the side sheet is narrow. */
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

function PublicationBadge({ value }: { value: string }) {
  const label = value === 'lawfare' ? 'Lawfare' : 'Executive Functions'
  const accent =
    value === 'lawfare'
      ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${accent}`}
      title={`Publication: ${label}`}
    >
      {label}
    </span>
  )
}

function PostTypeBadge({ value }: { value: string }) {
  const label = value.charAt(0).toUpperCase() + value.slice(1)
  const accent =
    value === 'podcast'
      ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
      : value === 'newsletter' || value === 'roundup'
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : 'bg-muted text-muted-foreground'
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${accent}`}
      title={`Content type: ${label}`}
    >
      {label}
    </span>
  )
}
