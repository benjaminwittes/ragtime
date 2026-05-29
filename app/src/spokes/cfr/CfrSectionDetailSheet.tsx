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
  type CfrSectionDetail,
  type CfrSectionDisplayRow,
  type CfrSectionSummary,
  fetchCfrSection,
  summarizeCfrSection,
} from '@/lib/worker-client'

/**
 * Side sheet showing one CFR section's full regulatory text + hierarchy +
 * currency. Opens on row click in the manual-filter results.
 *
 * Parallels USC's UscSectionDetailSheet — same key={row.id} remount
 * pattern, same fetch-on-mount, same overall layout. CFR differences:
 *   - Hierarchy chain is shorter (Title → Chapter → Part → Subpart → §X.Y)
 *     because regulations don't have USC's subtitle/subchapter levels
 *   - Currency band shows BOTH `up_to_date_as_of` (corpus-wide) AND
 *     `latest_amended_on` (this section was amended on this date)
 *   - "Reserved" warning replaces USC's positive-law badge — reserved
 *     sections are placeholders, so the panel surfaces that explicitly
 */
export function CfrSectionDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: CfrSectionDisplayRow | null
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
          <CfrSectionDetailBody key={row.id} row={row} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No section selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function CfrSectionDetailBody({ row }: { row: CfrSectionDisplayRow }) {
  const auth = useAuth()
  const paid = usePaid()
  const [detail, setDetail] = useState<CfrSectionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [summary, setSummary] = useState<CfrSectionSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchCfrSection(row.id)
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
      const s = await summarizeCfrSection(row.id, auth.auth)
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

  const citation = detail?.citation ?? row.citation ?? '—'
  const heading = detail?.heading ?? row.heading ?? '—'
  const isReserved = detail?.reserved ?? row.reserved ?? false

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex items-baseline gap-2">
          <SheetTitle className="font-mono text-base font-semibold">
            {citation}
          </SheetTitle>
          {isReserved && <ReservedBadge />}
        </div>
        <SheetDescription className="text-base font-medium text-foreground">
          {heading}
        </SheetDescription>
        {detail && <HierarchyChain detail={detail} />}
      </SheetHeader>
      <div className="flex-1 overflow-y-auto p-5">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading section…</p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {detail && (
          <div className="space-y-5">
            <CurrencyCaveat detail={detail} />

            <StatusGrid detail={detail} />

            {isReserved && (
              <aside
                className={cn(
                  'rounded-md border px-3 py-2 text-xs',
                  'border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
                )}
              >
                This section is marked <strong>reserved</strong> — a
                placeholder kept in the codification with no substantive
                regulatory content. Reserved entries persist to keep the
                CFR numbering scheme stable across amendments.
              </aside>
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
                Regulatory text
              </h3>
              {detail.text_content ? (
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-card p-4 font-sans text-sm leading-relaxed text-foreground">
                  {detail.text_content}
                </pre>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  (No text loaded for this section.)
                </p>
              )}
            </section>

            {detail.source && (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Source
                </h3>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {detail.source}
                </pre>
              </section>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * Title → Chapter → Part → Subpart → § identifier. CFR omits USC's
 * subtitle/subchapter rungs.
 */
function HierarchyChain({ detail }: { detail: CfrSectionDetail }) {
  const rungs: string[] = []
  if (detail.title_num != null) {
    rungs.push(
      `Title ${detail.title_num}${detail.title_name ? ` · ${prettyTitleName(detail.title_name)}` : ''}`,
    )
  }
  if (detail.chapter) rungs.push(`Chapter ${detail.chapter}`)
  if (detail.part) rungs.push(`Part ${detail.part}`)
  if (detail.subpart) rungs.push(`Subpart ${detail.subpart}`)
  if (detail.section_identifier) rungs.push(`§ ${detail.section_identifier}`)
  if (rungs.length === 0) return null
  return (
    <nav
      aria-label="Section hierarchy"
      className="flex flex-wrap items-center gap-1 pt-1 text-xs text-muted-foreground"
    >
      {rungs.map((r, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden>›</span>}
          <span className="font-mono">{r}</span>
        </span>
      ))}
    </nav>
  )
}

/**
 * CFR currency caveat — same audit-forward principle as USC's
 * release-point notice, but with the regulation-specific per-section
 * amendment date.
 */
function CurrencyCaveat({ detail }: { detail: CfrSectionDetail }) {
  if (!detail.up_to_date_as_of && !detail.latest_amended_on) return null
  return (
    <aside
      className={cn(
        'rounded-md border px-3 py-2 text-xs',
        'border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
      )}
    >
      {detail.up_to_date_as_of && (
        <p>
          Current as of{' '}
          <span className="font-mono">{detail.up_to_date_as_of}</span>;
          changes since are not reflected.
        </p>
      )}
      {detail.latest_amended_on && (
        <p className={detail.up_to_date_as_of ? 'mt-1' : undefined}>
          This section was last amended on{' '}
          <span className="font-mono">{detail.latest_amended_on}</span>.
        </p>
      )}
    </aside>
  )
}

function StatusGrid({ detail }: { detail: CfrSectionDetail }) {
  const entries: Array<[string, React.ReactNode]> = []
  if (detail.section_identifier) {
    entries.push([
      'Identifier',
      <span className="font-mono" key="id">{detail.section_identifier}</span>,
    ])
  }
  if (detail.text_length != null) {
    entries.push([
      'Length',
      <span className="font-mono" key="len">{detail.text_length.toLocaleString()} chars</span>,
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
 * AI summary block. Brief #4 §3 "plus" — read-a-section in plain English
 * with CFR-specific structured sections (What it does / To whom it applies /
 * Key terms / Cross-references / Currency).
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
  summary: CfrSectionSummary | null
  loading: boolean
  error: string | null
  onSummarize: () => void
}) {
  const buttonDisabled = !hasAuth || !hasText || loading
  const buttonHint = !hasAuth
    ? 'Configure AI access (header, top right) to enable.'
    : !hasText
      ? 'No text content to summarize (reserved or empty section).'
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
            Plain-English summary of the regulation. Uses your configured AI
            access; cost shows in your balance after.
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
              Section text was truncated before summarization. The summary
              reflects only the head of the section; later paragraphs
              weren&apos;t seen.
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

function ReservedBadge() {
  return (
    <span
      className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300"
      title="Reserved section — placeholder, no substantive regulation yet"
    >
      reserved
    </span>
  )
}

function prettyTitleName(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}
