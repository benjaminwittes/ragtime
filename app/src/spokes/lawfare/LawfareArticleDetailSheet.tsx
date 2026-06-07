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
  type LawfareArticleDetail,
  type LawfareArticleDisplayRow,
  type LawfareArticleSummary,
  fetchLawfareArticle,
  summarizeLawfareArticle,
} from '@/lib/worker-client'

/**
 * Side sheet that reads one Lawfare piece in full — an ARTICLE READER.
 * Opens on card click in the manual-filter results (and from AMA citations).
 *
 * Layout (top to bottom):
 *   - Title + content-type badge inline, plus a prominent "Read on Lawfare ↗"
 *     button to the canonical lawfaremedia.org URL (commentary lives on the
 *     publisher's site; we link out prominently).
 *   - Byline / date / series metadata line
 *   - Dek (the standfirst), when present
 *   - Topic chips
 *   - AI "Summarize" action (attribution-forward summary of one piece)
 *   - Body — body_html rendered when present, else body_text as paragraphs
 */
export function LawfareArticleDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: LawfareArticleDisplayRow | null
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
          <LawfareArticleDetailBody key={row.id} row={row} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No piece selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function LawfareArticleDetailBody({ row }: { row: LawfareArticleDisplayRow }) {
  const auth = useAuth()
  const paid = usePaid()
  const [detail, setDetail] = useState<LawfareArticleDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Per-article summary state. Lives at the body level so it resets when the
  // sheet's key (row.id) changes; opening a different piece starts fresh.
  const [summary, setSummary] = useState<LawfareArticleSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchLawfareArticle(row.id)
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
      const s = await summarizeLawfareArticle(row.id, auth.auth)
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
  const contentType = detail?.content_type ?? row.content_type
  const canonicalUrl = detail?.canonical_url ?? row.canonical_url
  const authorNames = detail?.author_names ?? row.author_names
  const topicNames = detail?.topic_names ?? row.topic_names
  const dek = detail?.dek ?? row.dek
  const hasBody = !!detail && !!detail.body_text && detail.body_text.trim().length > 0

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {title}
          </SheetTitle>
          {contentType && <ContentTypeBadge value={contentType} />}
          {canonicalUrl && (
            <a
              href={canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Read this piece on Lawfare in a new tab"
              className="ml-auto inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
            >
              Read on Lawfare ↗
            </a>
          )}
        </div>
        <SheetDescription className="text-xs text-muted-foreground">
          <MetadataLine
            authorNames={authorNames}
            publishedDate={detail?.published_date ?? row.published_date}
            publishedRaw={detail?.published_raw ?? null}
            series={detail?.series ?? row.series}
          />
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto p-5">
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
            {dek && (
              <p className="border-l-4 border-muted-foreground/30 pl-3 text-sm italic leading-relaxed text-muted-foreground">
                {dek}
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
              {/* SECURITY: body_html is SCRAPED markup, not trusted — rendering
                  it via dangerouslySetInnerHTML is an XSS vector on our origin.
                  We render the clean extracted body_text as paragraphs instead;
                  full-fidelity formatting is one click away via "Read on Lawfare".
                  (If we later want rich bodies, sanitize via DOMPurify first.) */}
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
                  (No body text loaded — read the full piece on Lawfare via the
                  link above.)
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
 * fields that exist render. Falls back to the human-readable published_raw
 * string when an ISO date isn't available.
 */
function MetadataLine({
  authorNames,
  publishedDate,
  publishedRaw,
  series,
}: {
  authorNames: readonly string[]
  publishedDate: string | null
  publishedRaw: string | null
  series: string | null
}) {
  const parts: string[] = []
  if (authorNames && authorNames.length > 0) {
    parts.push(`By ${authorNames.join(', ')}`)
  }
  if (publishedDate) parts.push(publishedDate)
  else if (publishedRaw) parts.push(publishedRaw)
  if (series) parts.push(series)
  if (parts.length === 0) return <span>Lawfare</span>
  return <span>{parts.join(' · ')}</span>
}

/**
 * AI summary block — "Summarize this piece." BYOK-gated. When the piece has
 * no recoverable body text the button is disabled with an explanation.
 *
 * The summary is attribution-forward: it describes what the author argues,
 * not whether the argument is right (commentary, not adjudication).
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
  summary: LawfareArticleSummary | null
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
            <DocsHint slug="lawfare-article-summary" label="how AI summary works" />
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
              The piece was truncated before summarization (the cap is well
              above most pieces; the few that exceed it have later sections that
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

/** Compact markdown styling for the in-panel summary — tighter spacing than
 *  the AMA result block since the side sheet is narrow. */
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

function ContentTypeBadge({ value }: { value: string }) {
  const label =
    value === 'article'
      ? 'Article'
      : value === 'podcast'
        ? 'Podcast'
        : value === 'newsletter'
          ? 'Newsletter'
          : value
  const accent =
    value === 'podcast'
      ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
      : value === 'newsletter'
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
