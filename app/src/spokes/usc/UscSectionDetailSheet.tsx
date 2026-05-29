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
  type UscSectionDetail,
  type UscSectionDisplayRow,
  fetchUscSection,
} from '@/lib/worker-client'

/**
 * Side sheet showing one USC section's full statutory text + hierarchy +
 * provenance. Opens on row click in the manual-filter results.
 *
 * Anchors on the row's `id` — the calling component passes the row, the
 * sheet fetches the full `text_content` (omitted from the list endpoint
 * to keep tables cheap) plus the rest of the hierarchy chain on mount.
 *
 * Layout (top to bottom):
 *   - Citation + heading
 *   - Hierarchy chain breadcrumb (Title → Subtitle → Chapter → Subchapter
 *     → Part → Section)
 *   - Status row (positive-law badge, release point caveat, status,
 *     character count)
 *   - Statutory text (preserved whitespace, monospace for plumbing-style
 *     subsection enumeration without imposing typography on the rest)
 *   - Provenance (source_credit, notes)
 *
 * The release-point caveat per brief #3 §5 is rendered prominently so
 * users don't mistake "as of [point]" for "current law." Positive-law
 * status surfaces inline next to the citation for the same reason —
 * non-positive titles are restatements of the binding statute, not the
 * binding statute itself.
 *
 * Key prop pattern: callers should pass `key={row.id}` when remounting
 * for a new section so the fetch fires fresh; alternatively the sheet
 * watches the row.id and re-fetches on change.
 */
export function UscSectionDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: UscSectionDisplayRow | null
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
          <UscSectionDetailBody key={row.id} row={row} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No section selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function UscSectionDetailBody({ row }: { row: UscSectionDisplayRow }) {
  const [detail, setDetail] = useState<UscSectionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchUscSection(row.id)
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

  // Use the list row as a fallback header while the detail loads — the
  // user sees the citation + heading immediately instead of a spinner.
  const citation = detail?.citation ?? row.citation ?? '—'
  const heading = detail?.heading ?? row.heading ?? '—'
  const isPositiveLaw = detail?.is_positive_law ?? row.is_positive_law ?? false
  const status = detail?.status ?? row.status

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex items-baseline gap-2">
          <SheetTitle className="font-mono text-base font-semibold">
            {citation}
          </SheetTitle>
          {isPositiveLaw && <PositiveLawBadge />}
        </div>
        <SheetDescription className="text-base font-medium text-foreground">
          {heading}
        </SheetDescription>
        {detail && (
          <HierarchyChain detail={detail} />
        )}
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
            <ReleasePointCaveat
              releasePoint={detail.release_point}
              isPositiveLaw={isPositiveLaw}
            />

            <StatusGrid detail={detail} status={status} />

            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Statutory text
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

            {detail.source_credit && (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Source credit
                </h3>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {detail.source_credit}
                </pre>
              </section>
            )}

            {detail.notes && (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Notes
                </h3>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
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
 * Breadcrumb-style hierarchy chain: Title → Subtitle → Chapter →
 * Subchapter → Part → Section. Only renders the rungs that exist (many
 * sections sit directly under a title with no intermediate level).
 */
function HierarchyChain({ detail }: { detail: UscSectionDetail }) {
  const rungs: string[] = []
  if (detail.title_num != null) {
    rungs.push(
      `Title ${detail.title_num}${detail.title_name ? ` · ${prettyTitleName(detail.title_name)}` : ''}`,
    )
  }
  if (detail.subtitle) rungs.push(`Subtitle ${detail.subtitle}`)
  if (detail.chapter) rungs.push(`Chapter ${detail.chapter}`)
  if (detail.subchapter) rungs.push(`Subchapter ${detail.subchapter}`)
  if (detail.part) rungs.push(`Part ${detail.part}`)
  if (detail.section_num) rungs.push(`§ ${detail.section_num}`)
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
 * Per brief #3 §5 the release-point caveat is mandatory on every section
 * view — "as of [point]; changes since not reflected". For non-positive
 * titles the panel ALSO warns that the codified text is a restatement,
 * not the binding statute, with a pointer to the source-credit chain
 * below.
 */
function ReleasePointCaveat({
  releasePoint,
  isPositiveLaw,
}: {
  releasePoint: string | null
  isPositiveLaw: boolean
}) {
  if (!releasePoint && isPositiveLaw) return null
  return (
    <aside
      className={cn(
        'rounded-md border px-3 py-2 text-xs',
        'border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
      )}
    >
      {releasePoint && (
        <p>
          Current as of release{' '}
          <span className="font-mono">{releasePoint}</span>; changes since
          are not reflected.
        </p>
      )}
      {!isPositiveLaw && (
        <p className={releasePoint ? 'mt-1' : undefined}>
          This title is not positive law — the codified text is an
          organized restatement of the underlying Statutes at Large. The
          binding text may differ in edge cases; consult the source-credit
          chain below.
        </p>
      )}
    </aside>
  )
}

function StatusGrid({
  detail,
  status,
}: {
  detail: UscSectionDetail
  status: string | null | undefined
}) {
  const entries: Array<[string, React.ReactNode]> = []
  if (status) entries.push(['Status', <span className="font-mono" key="s">{status}</span>])
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

function PositiveLawBadge() {
  return (
    <span
      className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary"
      title="Positive law title — the codified text is itself the binding statute"
    >
      positive law
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
