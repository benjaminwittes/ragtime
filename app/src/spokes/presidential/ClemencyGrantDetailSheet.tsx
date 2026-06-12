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
  type ClemencyGrantDetail,
  type ClemencyGrantDisplayRow,
  fetchClemencyGrant,
} from '@/lib/worker-client'
import {
  ClemencyTypeBadge,
  ProvenanceBadge,
} from './ClemencyResultsList'

/**
 * Side sheet for one clemency grant: the grant itself + the warrant text
 * (our value-add over both Pardonpedia and DOJ OPA) + the aux layers
 * (financial relief, reoffense, news) + a prominent provenance disclosure.
 */
export function ClemencyGrantDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: ClemencyGrantDisplayRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!w-full !max-w-2xl flex h-full flex-col gap-0 p-0">
        {row ? (
          <ClemencyGrantBody key={row.pardon_id} row={row} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No grant selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function ClemencyGrantBody({ row }: { row: ClemencyGrantDisplayRow }) {
  const [detail, setDetail] = useState<ClemencyGrantDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchClemencyGrant(row.pardon_id)
        if (!cancelled) setDetail(d)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [row.pardon_id])

  const d = detail
  const wiki = (d?.provenance ?? row.provenance) === 'wikipedia_derived'

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {d?.person_name ?? row.person_name ?? '(unnamed recipient)'}
          </SheetTitle>
          <ClemencyTypeBadge value={d?.clemency_type ?? row.clemency_type} />
          <ProvenanceBadge value={d?.provenance ?? row.provenance} />
        </div>
        <SheetDescription className="text-xs text-muted-foreground">
          {[
            d?.grant_date ?? row.grant_date ? `Granted ${d?.grant_date ?? row.grant_date}` : null,
            d?.president_name ?? row.president_name ? `by ${d?.president_name ?? row.president_name}` : null,
            d?.district ?? row.district,
          ].filter(Boolean).join(' · ')}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto p-5">
        {loading && <p className="text-sm text-muted-foreground">Loading grant…</p>}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        {d && (
          <div className="space-y-5">
            {wiki && (
              <aside className={cn('rounded-md border px-3 py-2 text-xs', 'border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-200')}>
                This recipient&rsquo;s name is <strong>Wikipedia-derived</strong>.
                DOJ recorded this clemency as a class (e.g. the January 6
                blanket pardon), not by individual name; the name here comes
                from Wikipedia, not a DOJ warrant.
              </aside>
            )}

            <Facts d={d} />

            {(d.offense || d.sentenced) && (
              <Section title="Offense & sentence">
                {d.offense && <p className="text-sm text-foreground/90">{d.offense}</p>}
                {d.sentenced && <p className="mt-1 text-xs text-muted-foreground">Sentenced: {d.sentenced}</p>}
              </Section>
            )}

            {(d.has_reoffended || d.forgiven_amount != null || d.news_count > 0) && (
              <Section title="Notable">
                <ul className="space-y-1 text-xs">
                  {d.has_reoffended && <li className="text-destructive">Documented offense after the grant.</li>}
                  {d.forgiven_amount != null && <li>Financial obligations forgiven: ${d.forgiven_amount.toLocaleString()}</li>}
                  {d.news_count > 0 && <li>{d.news_count} linked news {d.news_count === 1 ? 'story' : 'stories'} (see source data).</li>}
                </ul>
              </Section>
            )}

            {d.wikipedia_summary_extract && (
              <Section title={`About${d.wikipedia_name ? ` — ${d.wikipedia_name}` : ''}`}>
                <p className="text-sm leading-relaxed text-foreground/90">{d.wikipedia_summary_extract}</p>
                {d.wikipedia_article_url && (
                  <a href={d.wikipedia_article_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary hover:underline">↗ Wikipedia</a>
                )}
              </Section>
            )}

            <Section title="Clemency warrant">
              {d.warrant_text ? (
                <pre className="mt-1 whitespace-pre-wrap break-words rounded-md border border-border bg-card p-4 font-sans text-sm leading-relaxed text-foreground">{d.warrant_text}</pre>
              ) : d.warrant_url ? (
                <p className="text-xs text-muted-foreground">
                  Warrant text not yet extracted for this grant.{' '}
                  <a href={d.warrant_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">↗ View the warrant PDF</a>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No warrant document on record (common for blanket-pardon class members and older grants).</p>
              )}
            </Section>

            <p className="border-t border-border pt-3 text-[11px] text-muted-foreground/80">
              Source: Pardonpedia (CC BY 4.0){d.source_url ? <> · <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">original record ↗</a></> : null}
            </p>
          </div>
        )}
      </div>
    </>
  )
}

function Facts({ d }: { d: ClemencyGrantDetail }) {
  const rows: Array<[string, React.ReactNode]> = []
  if (d.office_held) rows.push(['Office held', d.office_held])
  if (d.relationship) rows.push(['Relationship', d.relationship])
  if (d.president_term) rows.push(['President', d.president_term])
  if (rows.length === 0) return null
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="uppercase tracking-wide text-muted-foreground">{k}</dt>
          <dd className="text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  )
}
