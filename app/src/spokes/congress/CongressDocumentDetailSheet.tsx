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
  type CongressAnyDisplayRow,
  type CongressBillDetail,
  type CongressCollection,
  type CongressDetailMap,
  type CongressDocumentSummary,
  type CongressHearingDetail,
  type CongressLawDetail,
  type CongressRecordDetail,
  type CongressTestimonyDetail,
  fetchCongressDocument,
  runCongressSummarizeDocument,
} from '@/lib/worker-client'
import { BecameLawChip, QuietBadge } from './CongressResultsList'
import {
  billCitation,
  ordinal,
  prettyGranuleClass,
} from './congress-format'

/**
 * Side sheet showing one Congress document — body shaped per collection
 * (brief #13):
 *   laws      — PL number + Stat. cite + provenance + citable-as chips + text
 *   bills     — sponsor + actions timeline + became-law chip + CRS summary + text
 *   hearings  — committee/member roster + witnesses + transcript + the
 *               "Explore turns" button pre-filtering the Who-said-what pane
 *   record    — granule class + speaking members + bill refs + text
 *   testimony — witness/committee/date + ↗ PDF + statement text
 * Every collection gets the auth-gated AI summary block.
 */
export function CongressDocumentDetailSheet({
  collection,
  row,
  open,
  onOpenChange,
  onMoreLikeThis,
  onExploreTurns,
}: {
  collection: CongressCollection
  row: CongressAnyDisplayRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pivot to "more like this document" (briefs §3). Omitted = button hidden. */
  onMoreLikeThis?: (seed: { id: number; title: string | null }) => void
  /** Hearings only: jump to the Who-said-what pane scoped to this hearing. */
  onExploreTurns?: (hearing: { sourceKey: string; title: string | null }) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-full !max-w-2xl flex h-full flex-col gap-0 p-0"
      >
        {row ? (
          <CongressDetailBody
            key={`${collection}:${row.id}`}
            collection={collection}
            row={row}
            onMoreLikeThis={onMoreLikeThis}
            onExploreTurns={onExploreTurns}
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

function CongressDetailBody({
  collection,
  row,
  onMoreLikeThis,
  onExploreTurns,
}: {
  collection: CongressCollection
  row: CongressAnyDisplayRow
  onMoreLikeThis?: (seed: { id: number; title: string | null }) => void
  onExploreTurns?: (hearing: { sourceKey: string; title: string | null }) => void
}) {
  const auth = useAuth()
  const paid = usePaid()
  const [detail, setDetail] = useState<
    CongressDetailMap[CongressCollection] | null
  >(null)
  const [turnStats, setTurnStats] = useState<{
    turns: number
    attributed: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [summary, setSummary] = useState<CongressDocumentSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchCongressDocument(collection, row.id)
        if (cancelled) return
        setDetail(d.document)
        if (d.has_turns && typeof d.turns_count === 'number') {
          setTurnStats({
            turns: d.turns_count,
            attributed: d.attributed_turns_count ?? 0,
          })
        }
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
  }, [collection, row.id])

  async function handleSummarize() {
    if (!auth.auth) {
      setSummaryError('Configure AI access (header, top right) first.')
      return
    }
    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const s = await runCongressSummarizeDocument(collection, row.id, auth.auth)
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

  const header = headerFor(collection, row, detail)
  const bodyText = detail && 'body_text' in detail ? detail.body_text : null

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {header.citation}
          </SheetTitle>
          {header.badges}
        </div>
        {header.title && (
          <p className="text-sm leading-snug text-foreground/90">
            {header.title}
          </p>
        )}
        {header.metaLine && (
          <SheetDescription className="text-xs text-muted-foreground">
            {header.metaLine}
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
                onMoreLikeThis({ id: row.id, title: header.title ?? null })
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
            {collection === 'laws' && (
              <LawSections detail={detail as CongressLawDetail} />
            )}
            {collection === 'bills' && (
              <BillSections detail={detail as CongressBillDetail} />
            )}
            {collection === 'hearings' && (
              <HearingSections
                detail={detail as CongressHearingDetail}
                turnStats={turnStats}
                onExploreTurns={onExploreTurns}
              />
            )}
            {collection === 'record' && (
              <RecordSections detail={detail as CongressRecordDetail} />
            )}
            {collection === 'testimony' && (
              <TestimonySections detail={detail as CongressTestimonyDetail} />
            )}

            <AiSummarySection
              hasAuth={auth.hasAuth}
              hasText={!!bodyText && bodyText.trim().length > 0}
              summary={summary}
              loading={summaryLoading}
              error={summaryError}
              onSummarize={handleSummarize}
            />

            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {collection === 'hearings' ? 'Transcript' : 'Document text'}
              </h3>
              {bodyText ? (
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-card p-4 font-sans text-sm leading-relaxed text-foreground">
                  {bodyText}
                </pre>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  (No text loaded for this document
                  {collection === 'bills'
                    ? ' — bill text begins with the 113th Congress; earlier bills are metadata-only'
                    : ''}
                  .)
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  )
}

/** Header line per collection — citation + badges + meta line. */
function headerFor(
  collection: CongressCollection,
  row: CongressAnyDisplayRow,
  detail: CongressDetailMap[CongressCollection] | null,
): {
  citation: string
  title: string | null
  badges: React.ReactNode
  metaLine: string | null
} {
  switch (collection) {
    case 'laws': {
      const d = (detail ?? row) as CongressLawDetail
      return {
        citation: d.pl_number ?? `Law ${row.id}`,
        title: (d.title ?? '').replace(/^Public Law [\d–-]+:\s*/, '') || null,
        badges: (
          <>
            <QuietBadge value={d.law_kind} />
            {d.provenance && (
              <span
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
                title="Which GPO collection supplied the text"
              >
                via {d.provenance}
              </span>
            )}
          </>
        ),
        metaLine: [
          d.statute_citation,
          d.approved_date ? `approved ${d.approved_date}` : null,
          d.congress != null ? `${ordinal(d.congress)} Congress` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    }
    case 'bills': {
      const d = (detail ?? row) as CongressBillDetail
      return {
        citation: billCitation(d),
        title: d.title ?? null,
        badges: d.became_law === true ? <BecameLawChip /> : null,
        metaLine: [
          d.origin_chamber,
          d.policy_area,
          d.introduced_date ? `introduced ${d.introduced_date}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    }
    case 'hearings': {
      const d = (detail ?? row) as CongressHearingDetail
      return {
        citation: d.source_key ?? `Hearing ${row.id}`,
        title: d.title ?? null,
        badges: <QuietBadge value={d.chamber} />,
        metaLine: [
          d.held_date ? `held ${d.held_date}` : null,
          d.congress != null ? `${ordinal(d.congress)} Congress` : null,
          d.committee_names?.join(' · '),
        ]
          .filter(Boolean)
          .join(' · '),
      }
    }
    case 'record': {
      const d = (detail ?? row) as CongressRecordDetail
      return {
        citation: d.source_key ?? `Granule ${row.id}`,
        title: d.title ?? null,
        badges: <QuietBadge value={prettyGranuleClass(d.granule_class)} />,
        metaLine: d.record_date ?? null,
      }
    }
    case 'testimony': {
      const d = (detail ?? row) as CongressTestimonyDetail
      return {
        citation: d.witness ?? d.source_key ?? `Statement ${row.id}`,
        title: null,
        badges: (
          <>
            <QuietBadge value={d.doc_type} />
            {d.url && (
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                title="Opens in a new tab"
                className="ml-auto inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                ↗ PDF
              </a>
            )}
          </>
        ),
        metaLine: [
          d.committee_code ? `Committee ${d.committee_code}` : null,
          d.statement_date,
          d.congress != null ? `${ordinal(d.congress)} Congress` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    }
  }
}

function LawSections({ detail }: { detail: CongressLawDetail }) {
  const cites = detail.citable_as ?? []
  if (cites.length === 0) return null
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Citable as
      </h3>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {cites.map((c, i) => (
          <span
            key={i}
            className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary"
          >
            {c}
          </span>
        ))}
      </div>
    </section>
  )
}

function BillSections({ detail }: { detail: CongressBillDetail }) {
  const actions = detail.actions ?? []
  return (
    <>
      {detail.sponsor_names && detail.sponsor_names.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sponsor
            {detail.cosponsor_count != null && detail.cosponsor_count > 0
              ? ` (+${detail.cosponsor_count.toLocaleString()} cosponsors)`
              : ''}
          </h3>
          <p className="mt-1 text-sm text-foreground/90">
            {detail.sponsor_names.join(' · ')}
          </p>
        </section>
      )}
      {detail.committee_names && detail.committee_names.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Committees
          </h3>
          <p className="mt-1 text-xs text-foreground/90">
            {detail.committee_names.join(' · ')}
          </p>
        </section>
      )}
      {detail.summary && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            CRS summary
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">
            {decodeEntities(detail.summary)}
          </p>
        </section>
      )}
      {actions.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Actions timeline
          </h3>
          <ol className="mt-1.5 space-y-1.5 border-l-2 border-border pl-4">
            {actions.map((a, i) => (
              <li key={i} className="text-xs leading-snug">
                <span className="font-mono text-muted-foreground">
                  {a.actionDate ?? '—'}
                </span>{' '}
                <span className="text-foreground/90">{a.text ?? ''}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {detail.law_refs && detail.law_refs.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Became
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {detail.law_refs.map((l, i) => (
              <span
                key={i}
                className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
              >
                {l}
              </span>
            ))}
          </div>
        </section>
      )}
      {detail.subjects && detail.subjects.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Subjects
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {detail.subjects.join(' · ')}
          </p>
        </section>
      )}
    </>
  )
}

function HearingSections({
  detail,
  turnStats,
  onExploreTurns,
}: {
  detail: CongressHearingDetail
  turnStats: { turns: number; attributed: number } | null
  onExploreTurns?: (hearing: { sourceKey: string; title: string | null }) => void
}) {
  const witnesses = detail.witnesses ?? []
  const members = detail.members ?? []
  return (
    <>
      {turnStats && onExploreTurns && detail.source_key && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-primary/50 bg-primary/[0.03] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {turnStats.turns.toLocaleString()} speaker turns in this hearing
            </p>
            <p className="text-xs text-muted-foreground">
              {turnStats.attributed.toLocaleString()} attributed — browse who
              said what, question by answer.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              onExploreTurns({
                sourceKey: detail.source_key!,
                title: detail.title,
              })
            }
          >
            Explore turns
          </Button>
        </section>
      )}
      {witnesses.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Witnesses
          </h3>
          <ul className="mt-1 space-y-0.5 text-sm text-foreground/90">
            {witnesses.map((w, i) => {
              const display = w.display ?? w.name ?? '—'
              // Source-data quirk: affiliation sometimes carries a fragment
              // of the name ('Abbate, Paul' + affiliation 'Paul') — skip it
              // when the display line already contains it.
              const affiliation =
                w.affiliation && !display.includes(w.affiliation)
                  ? w.affiliation
                  : null
              return (
                <li key={i}>
                  {display}
                  {affiliation && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      — {affiliation}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {members.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Member roster ({members.length})
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/90">
            {members
              .map(
                (m) =>
                  `${m.name ?? '—'}${m.party || m.state ? ` (${[m.party, m.state].filter(Boolean).join('-')})` : ''}`,
              )
              .join(' · ')}
          </p>
        </section>
      )}
    </>
  )
}

function RecordSections({ detail }: { detail: CongressRecordDetail }) {
  const members = detail.member_names ?? []
  const shown = members.slice(0, 30)
  const billRefs = [...new Set(detail.bill_refs ?? [])]
  return (
    <>
      {billRefs.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bills referenced
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {billRefs.map((b, i) => (
              <span
                key={i}
                className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary"
              >
                {b}
              </span>
            ))}
          </div>
        </section>
      )}
      {members.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Speaking members ({members.length.toLocaleString()})
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/90">
            {shown.join(' · ')}
            {members.length > shown.length &&
              ` … +${(members.length - shown.length).toLocaleString()} more`}
          </p>
        </section>
      )}
    </>
  )
}

function TestimonySections({ detail }: { detail: CongressTestimonyDetail }) {
  if (!detail.source_key) return null
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Source key
      </h3>
      <p className="mt-1 font-mono text-xs text-foreground/90">
        {detail.source_key}
      </p>
    </section>
  )
}

/** Minimal HTML-entity cleanup for CRS summaries ('&nbsp;', '&amp;'…). */
function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
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
  summary: CongressDocumentSummary | null
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
            What it does, who it involves, and where it stands. Uses your
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
