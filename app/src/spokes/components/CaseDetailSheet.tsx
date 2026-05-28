import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  type CaseDisplayRow,
  type DocketEntryRow,
  cleanEntryDescription,
  entryDeepLink,
  fetchCaseEntries,
} from '@/lib/worker-client'

/**
 * Case-detail panel. Slide-in sheet from the right that loads and shows the
 * full docket entries for one case. Replaces the legacy index.html's inline
 * case-detail expansion with a clean modal pattern.
 *
 * Per brief #6 Phase 2 (citation extractor / cross-corpus citations §7a):
 * the "Citations" section that surfaces "N USC sections / N CFR sections /
 * N OLC opinions cite this / are cited by" is gated on the extractor work
 * landing post-beta; this PR reserves the visual slot at the bottom of the
 * panel for that section but renders it empty (`status: 'not yet wired'`).
 */
export function CaseDetailSheet({
  case: theCase,
  open,
  onOpenChange,
}: {
  /** The case to show. `null` when no case is selected (sheet stays closed). */
  case: CaseDisplayRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // The default `sm:max-w-sm` (24rem) is too narrow for docket entries —
        // descriptions are paragraph-length. Roughly half the viewport on
        // desktop is a reasonable middle ground.
        className="!w-full !max-w-3xl flex h-full flex-col gap-0 p-0"
      >
        {theCase && <CaseDetailBody theCase={theCase} />}
      </SheetContent>
    </Sheet>
  )
}

function CaseDetailBody({ theCase }: { theCase: CaseDisplayRow }) {
  const [entries, setEntries] = useState<DocketEntryRow[] | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setEntries(undefined)
    setLoading(true)
    setError(undefined)
    void (async () => {
      try {
        const r = await fetchCaseEntries(theCase.cl_id)
        if (cancelled) return
        setEntries(r.entries)
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
  }, [theCase.cl_id])

  return (
    <>
      <SheetHeader className="border-b border-border p-5 pr-12">
        <SheetTitle className="font-serif text-xl leading-tight">
          {theCase.cl_url ? (
            <a
              href={theCase.cl_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {theCase.case_name ?? '(no name)'}
            </a>
          ) : (
            (theCase.case_name ?? '(no name)')
          )}
        </SheetTitle>
        <SheetDescription className="mt-2 text-xs">
          <CaseMetaGrid theCase={theCase} />
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="flex-1">
        <div className="p-5">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Docket entries
            {entries && (
              <span className="ml-2 font-mono normal-case text-muted-foreground/70">
                ({entries.length.toLocaleString()})
              </span>
            )}
          </h3>

          {loading && <p className="text-sm text-muted-foreground">Loading entries…</p>}
          {error && (
            <p className="text-sm text-destructive">
              Couldn't load docket entries: {error}
            </p>
          )}
          {entries && entries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No docket entries recorded for this case.
            </p>
          )}
          {entries && entries.length > 0 && (
            <ol className="space-y-3">
              {entries.map((e, i) => (
                <li
                  key={`${e.entry_number ?? '_'}-${i}`}
                  className="rounded-md border border-border bg-card p-3"
                >
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-mono text-muted-foreground">
                      #{e.entry_number ?? '—'} · {e.entry_date ?? '—'}
                    </span>
                    {theCase.cl_url && e.entry_number != null && (
                      <a
                        href={entryDeepLink(
                          theCase.cl_url,
                          e.entry_number,
                          theCase.court,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        view on CourtListener →
                      </a>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">
                    {cleanEntryDescription(e.description) || (
                      <span className="text-muted-foreground italic">
                        (no description)
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          )}

          {/* §7a placeholder — citation extractor is Phase 2 work; the
              visual slot is reserved here so PR 4g-or-later can drop the
              actual surfacing in without restructuring the panel. */}
          <section
            aria-label="Cross-corpus citations"
            data-citations-slot="reserved"
            className="mt-8 border-t border-border pt-4"
          >
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Citations
            </h3>
            <p className="text-xs text-muted-foreground">
              Cross-corpus citation surfacing (USC / CFR / OLC) ships when the
              citation extractor lands. See brief #6 §7a.
            </p>
          </section>
        </div>
      </ScrollArea>
    </>
  )
}

function CaseMetaGrid({ theCase }: { theCase: CaseDisplayRow }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <Meta label="Court" value={theCase.court?.toUpperCase()} mono />
      <Meta label="Docket" value={theCase.docket_number} mono />
      <Meta label="Judge" value={theCase.judge} />
      <Meta label="Filed" value={theCase.date_filed} mono />
      <Meta label="Terminated" value={theCase.date_terminated} mono />
      <Meta label="Cause" value={theCase.cause} />
      <Meta label="Nature of suit" value={theCase.nature_of_suit} />
      <Meta label="Entries" value={theCase.entry_count?.toLocaleString()} mono />
    </dl>
  )
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string
  value: string | number | null | undefined
  mono?: boolean
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono' : ''}>{value ?? '—'}</dd>
    </>
  )
}
