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
  type CfrSectionDetail,
  type CfrSectionDisplayRow,
  fetchCfrSection,
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
  const [detail, setDetail] = useState<CfrSectionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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
