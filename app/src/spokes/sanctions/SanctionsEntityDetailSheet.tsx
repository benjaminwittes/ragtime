import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  type SanctionsEntityDetail,
  type SanctionsEntityDisplayRow,
  fetchSanctionsEntity,
} from '@/lib/worker-client'
import { ProgramChips } from './SanctionsEntityResultsList'
import {
  entityTypeLabel,
  listTypeLabel,
  ofacSearchUrl,
} from './sanctions-format'

/**
 * Side sheet showing one sanctions-list entry: the full entity card.
 *
 * Layout (top to bottom):
 *   - Primary name + type/list badges, ↗ OFAC Sanctions List Search (the
 *     authoritative per-entity page, linked from every card)
 *   - Programs + executive orders
 *   - Aliases (alias-aware search means the hit may have come through one)
 *   - Addresses / identity documents / relationships (OFAC's structured
 *     data, rendered defensively) + remarks
 *   - The screening note (worker-composed, with the live data-as-of)
 *
 * The one date shown is framed as what it is: the date OFAC published the
 * LIST DATA THIS COPY HOLDS — a copy-freshness stamp, never "listed on".
 * Designation dates live in the Federal Register tab.
 */
export function SanctionsEntityDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: SanctionsEntityDisplayRow | null
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
          <SanctionsEntityDetailBody key={row.id} row={row} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No entry selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function SanctionsEntityDetailBody({
  row,
}: {
  row: SanctionsEntityDisplayRow
}) {
  const [detail, setDetail] = useState<SanctionsEntityDetail | null>(null)
  const [screeningNote, setScreeningNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchSanctionsEntity({ id: row.id })
        if (cancelled) return
        setDetail(d.entity)
        setScreeningNote(d.screening_note)
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

  const name = detail?.primary_name ?? row.primary_name ?? '(unnamed)'
  const ofacUrl = ofacSearchUrl(detail?.ofac_uid ?? row.ofac_uid)

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {name}
          </SheetTitle>
          <TypeBadge label={entityTypeLabel(detail?.entity_type ?? row.entity_type)} />
          <TypeBadge label={listTypeLabel(detail?.list_type ?? row.list_type)} />
          {ofacUrl && (
            <span className="ml-auto">
              <a
                href={ofacUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="OFAC's official per-entity page — the authoritative record"
                className="inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                ↗ OFAC Sanctions List Search
              </a>
            </span>
          )}
        </div>
        <SheetDescription className="text-xs text-muted-foreground">
          {(detail?.ofac_uid ?? row.ofac_uid)
            ? `OFAC UID ${detail?.ofac_uid ?? row.ofac_uid}`
            : `Entry ${row.id}`}
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto p-5">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading entry…</p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {detail && (
          <div className="space-y-5">
            <section>
              <SectionHeading>Listed under</SectionHeading>
              <div className="mt-1.5 space-y-1.5">
                <ProgramChips programs={detail.programs} max={12} />
                {detail.eo_numbers && detail.eo_numbers.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Executive orders:{' '}
                    {detail.eo_numbers.map((n) => `EO ${n}`).join(', ')}
                  </p>
                )}
                {detail.list_names && detail.list_names.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Lists: {detail.list_names.join(' · ')}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground/80">
                  This snapshot carries no designation dates — for when and
                  how a listing happened, see the designation notice in the
                  Federal Register tab.
                </p>
              </div>
            </section>

            {detail.aliases && detail.aliases.length > 0 && (
              <section>
                <SectionHeading>
                  Aliases ({detail.aliases.length.toLocaleString()})
                </SectionHeading>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {detail.aliases.map((a, i) => (
                    <li
                      key={i}
                      className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-foreground"
                    >
                      {a}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <JsonbSection title="Addresses" value={detail.addresses} />
            <JsonbSection
              title="Identity documents"
              value={detail.identity_documents}
            />
            <JsonbSection
              title="Relationships to other listed entries"
              value={detail.relationships}
            />

            {detail.remarks && (
              <section>
                <SectionHeading>OFAC remarks</SectionHeading>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {detail.remarks}
                </p>
              </section>
            )}

            <section>
              <SectionHeading>About this copy</SectionHeading>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {screeningNote ??
                  'This is a research copy of OFAC’s lists; OFAC’s official Sanctions List Search is the authoritative source.'}
                {detail.publish_date &&
                  ` This entry rides on OFAC’s list publication of ${detail.publish_date} — that is when our list data was published, not when this entry was designated.`}
              </p>
            </section>
          </div>
        )}
      </div>
    </>
  )
}

function TypeBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

/**
 * Defensive renderer for OFAC's structured jsonb (addresses, identity
 * documents, relationships). The shapes come from the Sanctions List
 * Service; each item renders its primitive fields as "key: value" lines,
 * with a raw fallback for anything unexpected — never a crash, never a
 * silently dropped field.
 */
function JsonbSection({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null
  const items = Array.isArray(value) ? value : [value]
  if (items.length === 0) return null
  return (
    <section>
      <SectionHeading>
        {title} ({items.length.toLocaleString()})
      </SectionHeading>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground"
          >
            <JsonbItem item={item} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function JsonbItem({ item }: { item: unknown }) {
  if (item == null) return null
  if (typeof item !== 'object' || Array.isArray(item)) {
    return <span>{String(item)}</span>
  }
  const entries = Object.entries(item as Record<string, unknown>).filter(
    ([, v]) => v != null && v !== '' && (typeof v !== 'object' || Array.isArray(v)),
  )
  if (entries.length === 0) {
    return (
      <pre className="overflow-x-auto font-mono text-[10px] text-muted-foreground">
        {JSON.stringify(item, null, 1)}
      </pre>
    )
  }
  return (
    <dl className="space-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {k.replace(/_/g, ' ')}:
          </dt>
          <dd className="min-w-0 break-words">
            {Array.isArray(v) ? v.map((x) => String(x)).join(', ') : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
