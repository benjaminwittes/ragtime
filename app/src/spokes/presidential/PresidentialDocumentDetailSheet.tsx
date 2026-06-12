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
  type PresidentialDispositionIn,
  type PresidentialDispositionOut,
  type PresidentialDocumentDetail,
  type PresidentialDocumentDisplayRow,
  type PresidentialDocumentSummary,
  fetchPresidentialDocument,
  summarizePresidentialDocument,
} from '@/lib/worker-client'
import { TextQualityBadge } from './PresidentialResultsList'

/**
 * Side sheet showing one presidential document: full text + metadata +
 * the parsed disposition trail in BOTH directions (brief #11 §3 — the raw
 * OFR cross-reference data rendered prominently; it's the field
 * researchers can't get inline anywhere else).
 *
 * Layout (top to bottom):
 *   - Display citation + type + text badge, ↗ federalregister.gov
 *   - Signed / published / president / FR citation metadata line
 *   - Status & lineage — inbound edges ("what later documents did to this
 *     one"), the "is it still in effect" trail, phrased honestly
 *   - Effect on prior instruments — outbound edges
 *   - Agencies
 *   - AI summary action (BYOK-gated; disabled on finding-aid rows)
 *   - Full document text, or the finding-aid explanation
 */
export function PresidentialDocumentDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: PresidentialDocumentDisplayRow | null
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
          <PresidentialDocumentDetailBody key={row.id} row={row} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No document selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function PresidentialDocumentDetailBody({
  row,
}: {
  row: PresidentialDocumentDisplayRow
}) {
  const auth = useAuth()
  const paid = usePaid()
  const [detail, setDetail] = useState<PresidentialDocumentDetail | null>(null)
  const [dispOut, setDispOut] = useState<PresidentialDispositionOut[]>([])
  const [dispIn, setDispIn] = useState<PresidentialDispositionIn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [summary, setSummary] = useState<PresidentialDocumentSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchPresidentialDocument(row.id)
        if (cancelled) return
        setDetail(d.document)
        setDispOut(d.dispositions_out)
        setDispIn(d.dispositions_in)
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
      const s = await summarizePresidentialDocument(row.id, auth.auth)
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

  const citation = detail?.display_citation ?? row.display_citation ?? '(no citation)'
  const title = detail?.title ?? row.title
  const frUrl = detail?.html_url ?? row.html_url ?? detail?.pdf_url ?? row.pdf_url
  const isFindingAid =
    (detail?.text_quality ?? row.text_quality) === 'metadata_only'

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {citation}
          </SheetTitle>
          <TextQualityBadge value={detail?.text_quality ?? row.text_quality} />
          {frUrl && (
            <a
              href={frUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this document on federalregister.gov in a new tab"
              className="ml-auto inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
            >
              ↗ federalregister.gov
            </a>
          )}
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
            <StatusLineageSection dispIn={dispIn} />
            <EffectOnPriorSection dispOut={dispOut} />

            {detail.agencies && detail.agencies.length > 0 && (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Agencies
                </h3>
                <p className="mt-1 text-xs text-foreground/90">
                  {detail.agencies.join(' · ')}
                </p>
              </section>
            )}

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
                <>
                  {detail.text_quality === 'juris_backfill' && (
                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                      Text recovered from DOJ&rsquo;s retired JURIS
                      legal-research database (typed, not OCR). The official
                      rendition lives at the Federal Register link above.
                    </p>
                  )}
                  <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-card p-4 font-sans text-sm leading-relaxed text-foreground">
                    {detail.body_text}
                  </pre>
                </>
              ) : isFindingAid ? (
                <aside
                  className={cn(
                    'mt-2 rounded-md border px-3 py-2 text-xs',
                    'border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
                  )}
                >
                  This is a <strong>finding-aid entry</strong>: the Federal
                  Register has not digitized this document&rsquo;s text (the
                  digitization floor for executive orders is currently 1948).
                  The corpus records that it exists, when it was signed, and
                  what later documents did to it; the original lives at the
                  Federal Register / NARA links above. Historical text
                  backfill is in progress.
                </aside>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  (No text loaded for this document.)
                </p>
              )}
            </section>

            {detail.disposition_notes && (
              <details className="rounded-md border border-border bg-muted/30">
                <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/60">
                  Raw OFR disposition notes
                </summary>
                <pre className="whitespace-pre-wrap break-words border-t border-border p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
                  {detail.disposition_notes}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function MetadataLine({ detail }: { detail: PresidentialDocumentDetail }) {
  const parts: string[] = []
  if (detail.signing_date) parts.push(`Signed ${detail.signing_date}`)
  if (detail.publication_date && detail.publication_date !== detail.signing_date)
    parts.push(`published ${detail.publication_date}`)
  if (detail.president_name) parts.push(`by ${detail.president_name}`)
  if (detail.fr_citation) parts.push(detail.fr_citation)
  if (parts.length === 0) return null
  return <span>{parts.join(' · ')}</span>
}

/**
 * Inbound disposition edges — what later documents did to this one. The
 * "is it still in effect" trail. Phrasing rule (brief #11 §5): when no
 * revocation/supersession is recorded, say "no recorded revocation" —
 * the graph captures explicit OFR-noted dispositions only, so absence of
 * an edge is not proof of active status.
 */
function StatusLineageSection({
  dispIn,
}: {
  dispIn: readonly PresidentialDispositionIn[]
}) {
  const dispositive = dispIn.filter((d) => d.relationship !== 'see')
  const revoked = dispositive.some((d) =>
    ['revoked_by', 'superseded_by'].includes(d.relationship),
  )
  const touched = dispositive.length > 0
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Status &amp; lineage
      </h3>
      <p
        className={cn(
          'mt-1.5 rounded-md border px-3 py-2 text-xs leading-relaxed',
          revoked
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : 'border-border bg-muted/30 text-foreground/90',
        )}
      >
        {revoked
          ? 'Recorded as revoked or superseded (see the trail below).'
          : touched
            ? 'No recorded full revocation — but later documents have modified it (see below). Absence of a recorded disposition is not proof of active status.'
            : 'No recorded revocation, supersession, or amendment in the OFR disposition data. Note: the data records explicit dispositions only — this is not proof the document remains in effect.'}
      </p>
      {dispositive.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {dispositive.map((d, i) => (
            <li key={i} className="leading-relaxed">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {prettyRelationship(d.relationship)}
              </span>{' '}
              <span className="font-medium text-foreground">
                {d.source_citation ?? '(unresolved document)'}
              </span>
              {d.source_signing_date && (
                <span className="text-muted-foreground"> ({d.source_signing_date}</span>
              )}
              {d.source_president && (
                <span className="text-muted-foreground">, {d.source_president}</span>
              )}
              {d.source_signing_date && <span className="text-muted-foreground">)</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Outbound disposition edges — what this document did to prior instruments. */
function EffectOnPriorSection({
  dispOut,
}: {
  dispOut: readonly PresidentialDispositionOut[]
}) {
  const dispositive = dispOut.filter((d) => d.relationship !== 'see')
  const related = dispOut.filter((d) => d.relationship === 'see')
  if (dispOut.length === 0) return null
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Effect on prior instruments
      </h3>
      {dispositive.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs">
          {dispositive.map((d, i) => (
            <li key={i} className="leading-relaxed">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {prettyRelationship(d.relationship)}
              </span>{' '}
              <span className="font-medium text-foreground">
                {d.target_citation ?? d.target_raw}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          No recorded effect on prior instruments.
        </p>
      )}
      {related.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
            Related (&ldquo;see&rdquo;) references ({related.length})
          </summary>
          <ul className="mt-1 space-y-0.5 pl-1 text-xs text-muted-foreground">
            {related.map((d, i) => (
              <li key={i}>{d.target_citation ?? d.target_raw}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

/** 'revoked_by' → 'Revoked by', 'supersedes_in_part' → 'Supersedes in part'. */
function prettyRelationship(rel: string): string {
  const s = rel.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
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
  summary: PresidentialDocumentSummary | null
  loading: boolean
  error: string | null
  onSummarize: () => void
}) {
  const buttonDisabled = !hasAuth || !hasText || loading
  const buttonHint = !hasAuth
    ? 'Configure AI access (header, top right) to enable.'
    : !hasText
      ? 'Finding-aid entry — no text in the corpus to summarize.'
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
              slug="presidential-document-summary"
              label="how AI summary works"
            />
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
            What it does, authority invoked, who it tasks, and its lineage
            status. Uses your configured AI access; cost shows in your
            balance after.
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
