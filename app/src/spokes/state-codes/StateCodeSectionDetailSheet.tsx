import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  type StateCodeHistoryEntry,
  type StateCodeSectionDetail,
  type StateCodeSectionDisplayRow,
  type StateCodeSectionRef,
  fetchStateCodeSection,
} from '@lawfare/ragtime-client'
import { StatusBadge, TemporaryTextChip } from './StateCodesResultsList'
import {
  citationFor,
  isInForce,
  memberLabel,
  rowCitation,
  statusExplanation,
  statusLabel,
} from './state-codes-format'

/** What the sheet is asked to show: a section by id or by number, with the
 *  list row when there is one (shown while the detail loads). */
export type StateCodeSectionTarget = {
  ref: StateCodeSectionRef
  row?: StateCodeSectionDisplayRow
}

/**
 * Side sheet showing one section: its status, the section its rule moved to,
 * the temporary-text marker, the date the law is reflected through, the
 * text, the enacting history and the notes.
 *
 * Modelled on CfrSectionDetailSheet (key-remount per section, fetch on
 * mount). The status band comes FIRST, above the text, for anything not in
 * force: a reader who opens a repealed section sees that before the words.
 * A recodified section's "now at § X" opens § X in this same sheet.
 *
 * No AI summary and no save buttons (no AI modes for this corpus; the save
 * targets need a registered corpus slug).
 */
export function StateCodeSectionDetailSheet({
  target,
  open,
  onOpenChange,
  onOpenSection,
}: {
  target: StateCodeSectionTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Open another section (the recodified-to link). */
  onOpenSection: (target: StateCodeSectionTarget) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-full !max-w-2xl flex h-full flex-col gap-0 p-0"
      >
        {target ? (
          <StateCodeSectionDetailBody
            key={JSON.stringify(target.ref)}
            target={target}
            onOpenSection={onOpenSection}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No section selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function StateCodeSectionDetailBody({
  target,
  onOpenSection,
}: {
  target: StateCodeSectionTarget
  onOpenSection: (target: StateCodeSectionTarget) => void
}) {
  const [detail, setDetail] = useState<StateCodeSectionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchStateCodeSection(target.ref)
        if (!cancelled) setDetail(d)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [target.ref])

  return (
    <StateCodeSectionView
      target={target}
      detail={detail}
      loading={loading}
      error={error}
      onOpenSection={onOpenSection}
    />
  )
}

/**
 * What the sheet shows, as a pure function of the target, the Worker's reply
 * and the load state — kept separate so the flags are tested by rendering it
 * (StateCodeSectionDetailSheet.test.tsx).
 */
export function StateCodeSectionView({
  target,
  detail,
  loading,
  error,
  onOpenSection,
}: {
  target: StateCodeSectionTarget
  detail: StateCodeSectionDetail | null
  loading: boolean
  error: string | null
  onOpenSection?: (target: StateCodeSectionTarget) => void
}) {
  const member = detail?.member ?? target.row?.member ?? target.ref.member
  const shown: Partial<StateCodeSectionDisplayRow> | null = detail ?? target.row ?? null
  const citation = shown
    ? rowCitation({ ...shown, member })
    : 'section_identifier' in target.ref
      ? citationFor(member, target.ref.section_identifier)
      : `Section ${target.ref.id}`

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-lawfare-line bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-mono text-base font-semibold leading-snug">
            {citation}
          </SheetTitle>
          {shown && !isInForce(shown) && (shown.status != null || detail) && (
            <StatusBadge row={shown} />
          )}
          {shown?.has_temporary_text && <TemporaryTextChip />}
        </div>
        {shown?.heading && (
          <p className="font-serif text-sm leading-snug text-foreground">{shown.heading}</p>
        )}
        <SheetDescription className="text-xs text-muted-foreground">
          {[
            memberLabel(member),
            shown?.codified_date ? `Law reflected through ${shown.codified_date}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </SheetDescription>
        {detail && <HierarchyChain detail={detail} />}
      </SheetHeader>
      <div className="flex-1 overflow-y-auto p-5">
        {error ? (
          <p className="border-l-2 border-destructive bg-destructive/10 py-2 pl-3 pr-3 text-sm text-destructive">
            The section could not be loaded: {error}
          </p>
        ) : loading || !detail ? (
          <div className="space-y-4">
            {shown && <StatusBand row={shown} member={member} onOpenSection={onOpenSection} />}
            <p className="text-sm text-muted-foreground">Loading section…</p>
          </div>
        ) : (
          <div className="space-y-5">
            <StatusBand row={detail} member={member} sourceReason={detail.source_reason} onOpenSection={onOpenSection} />
            {detail.has_temporary_text && <TemporaryBand />}
            <CurrencyNote detail={detail} />

            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Section text
              </h3>
              {detail.text_content ? (
                <pre className="mt-2 whitespace-pre-wrap break-words border-t border-lawfare-line pt-4 font-sans text-sm leading-relaxed text-foreground">
                  {detail.text_content}
                </pre>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  (This section has no operative text in the code.)
                </p>
              )}
            </section>

            <HistorySection history={detail.history} sourceCredit={detail.source_credit} />

            {detail.notes && (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Notes
                </h3>
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  The code’s own editorial notes, cross references and prior
                  codifications.
                </p>
                <pre className="mt-2 whitespace-pre-wrap break-words border-t border-lawfare-line pt-3 font-sans text-xs leading-relaxed text-muted-foreground">
                  {detail.notes}
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
 * The not-in-force band, and the section the rule moved to. Shown for every
 * status but exactly 'in_force'; a section that names a replacement shows it
 * whatever its status.
 */
function StatusBand({
  row,
  member,
  sourceReason,
  onOpenSection,
}: {
  row: Partial<StateCodeSectionDisplayRow>
  member: string
  sourceReason?: string | null
  onOpenSection?: (target: StateCodeSectionTarget) => void
}) {
  const inForce = isInForce(row)
  // While only a list row is on screen, an absent status means "not sent",
  // not "unknown"; the band waits for the detail rather than guessing.
  if (inForce && !row.recodified_to) return null
  if (!inForce && row.status == null && !row.recodified_to) return null
  const moved = row.recodified_to
  return (
    <aside
      data-testid="status-band"
      className={cn(
        'border-l-2 py-2 pl-3 pr-3 text-sm',
        'border-amber-400 bg-amber-500/10 text-amber-900 dark:text-amber-200',
      )}
    >
      {!inForce && (
        <p>
          <strong>{statusLabel(row.status)}.</strong> {statusExplanation(row)}
        </p>
      )}
      {!inForce && sourceReason && sourceReason.trim().toLowerCase() !== statusLabel(row.status).toLowerCase() && (
        <p className="mt-1 text-xs">
          The code’s own words: “{sourceReason}”.
        </p>
      )}
      {moved && (
        <p className={inForce ? undefined : 'mt-2'}>
          Its rule now sits at{' '}
          {onOpenSection ? (
            <button
              type="button"
              onClick={() =>
                onOpenSection({ ref: { member, section_identifier: moved } })
              }
              className="font-mono font-medium underline underline-offset-2 hover:no-underline"
            >
              {citationFor(member, moved)}
            </button>
          ) : (
            <span className="font-mono font-medium">{citationFor(member, moved)}</span>
          )}
          .
        </p>
      )}
    </aside>
  )
}

function TemporaryBand() {
  return (
    <aside
      data-testid="temporary-band"
      className="border-l-2 border-sky-400 bg-sky-500/10 py-2 pl-3 pr-3 text-sm text-sky-900 dark:text-sky-200"
    >
      <strong>Temporary text.</strong> The current text of this section
      includes emergency or temporary legislation, which may expire. The code
      keeps the permanent text separately (D.C. Code Title 99), which RAGtime
      does not load.
    </aside>
  )
}

function CurrencyNote({ detail }: { detail: StateCodeSectionDetail }) {
  if (!detail.codified_date && !detail.build_date) return null
  return (
    <p className="text-xs text-muted-foreground">
      {detail.codified_date ? (
        <>
          Law reflected through <span className="font-mono">{detail.codified_date}</span>:
          changes after that date are not in this text.
        </>
      ) : null}
      {detail.build_date ? (
        <>
          {detail.codified_date ? ' ' : ''}From the codification built{' '}
          <span className="font-mono">{detail.build_date}</span>.
        </>
      ) : null}
    </p>
  )
}

/**
 * The enacting history, one line per change with the date it took effect in
 * law (the one date the query design keeps). The credit line is shown when
 * the history holds nothing structured.
 */
function HistorySection({
  history,
  sourceCredit,
}: {
  history: StateCodeHistoryEntry[] | null
  sourceCredit: string | null
}) {
  const entries = history ?? []
  if (entries.length === 0 && !sourceCredit) return null
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        History
      </h3>
      {entries.length > 0 ? (
        <ol className="mt-2 border-t border-lawfare-line">
          {entries.map((h, i) => (
            <li key={i} className="border-b border-lawfare-line py-2 text-xs">
              <p className="text-foreground">
                {h.doc && <span className="font-medium">{h.doc}</span>}
                {h.path && <span className="ml-1.5 font-mono text-muted-foreground">{h.path}</span>}
                {h.eff && (
                  <span className="ml-1.5 text-muted-foreground">
                    · effective <span className="font-mono">{h.eff}</span>
                  </span>
                )}
                {h.app && h.app !== h.eff && (
                  <span className="ml-1.5 text-muted-foreground">
                    · applicable <span className="font-mono">{h.app}</span>
                  </span>
                )}
              </p>
              {h.text && h.text !== h.doc && (
                <p className="mt-0.5 text-muted-foreground">{h.text}</p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <pre className="mt-2 whitespace-pre-wrap break-words border-t border-lawfare-line pt-3 font-sans text-xs leading-relaxed text-muted-foreground">
          {sourceCredit}
        </pre>
      )}
    </section>
  )
}

/** Title › Chapter › Subchapter › Part › §, names exactly as the code writes them. */
function HierarchyChain({ detail }: { detail: StateCodeSectionDetail }) {
  const rungs: string[] = []
  if (detail.title_num != null) {
    rungs.push(`Title ${detail.title_num}${detail.title_name ? `. ${detail.title_name}` : ''}`)
  }
  if (detail.chapter) rungs.push(detail.chapter)
  if (detail.subchapter) rungs.push(detail.subchapter)
  if (detail.part) rungs.push(detail.part)
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
          <span>{r}</span>
        </span>
      ))}
    </nav>
  )
}
