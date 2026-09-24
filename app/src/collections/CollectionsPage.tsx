import { useEffect, useMemo, useState } from 'react'
import {
  type CollectionCaseRow,
  type CollectionCasesPage,
  type CollectionRef,
  fetchCollectionCases,
  fetchCollections,
  links,
} from '@lawfare/ragtime-client'

import { AppLink } from '@/components/AppLink'
import { BackToHubLink } from '@/spokes/components/BackToHubLink'

import { attributeColumns } from './attribute-columns'

/**
 * Curated litigation collections.
 *
 *   `/collections`         → every collection, with its size
 *   `/collections/<slug>`  → one collection's cases, in curation order
 *
 * A collection is a named list of dockets the project keeps, with curated
 * attributes per case (the columns of the tracker it came from). The Worker
 * holds the list; each case's docket data is read live from CourtListener.
 * So this page shows both: the docket columns, then the collection's own.
 *
 * Searching *within* a collection is the litigation spoke's job — its filter
 * takes a collection — so the page hands off there rather than growing a
 * second filter form.
 */

const LITIGATION = 'litigation'

/** Curated columns shown before the rest fold into a note under the table.
 *  Generous on purpose: a tracker's most-filled columns tend to restate the
 *  docket (name, number, court, date), and the ones worth reading are the
 *  sparser ones after them. The table scrolls sideways. */
const MAX_ATTRIBUTE_COLUMNS = 12

export function CollectionsIndex() {
  const [collections, setCollections] = useState<CollectionRef[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCollections()
      .then((c) => { if (!cancelled) setCollections(c) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <BackToHubLink />
        <h1 className="mt-4 font-serif text-3xl font-bold">Litigation collections</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Curated lists of federal dockets. Each case is read live from CourtListener.
        </p>
        {error && <p className="mt-6 text-sm text-destructive">Could not load collections: {error}</p>}
        {!collections && !error && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
        {collections && collections.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">No collections yet.</p>
        )}
        <ul className="mt-6 space-y-5">
          {(collections ?? []).map((c) => (
            <li key={c.slug} className="border-b border-border pb-5">
              <AppLink to={`/collections/${c.slug}`} className="font-serif text-xl font-semibold text-primary hover:underline">
                {c.name}
              </AppLink>
              {c.case_count != null && (
                <span className="ml-2 text-sm text-muted-foreground">
                  {c.case_count.toLocaleString('en-US')} cases
                </span>
              )}
              {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

function cellText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

export function CollectionPage({ slug }: { slug: string }) {
  const [collection, setCollection] = useState<CollectionRef | null>(null)
  const [rows, setRows] = useState<CollectionCaseRow[]>([])
  const [missing, setMissing] = useState<number[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(0)
  // The first page loads on mount (App keys this page by slug, so a new slug
  // is a new mount); `loadingMore` covers the pages after it.
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function apply(page: CollectionCasesPage, append: boolean) {
    setCollection(page.collection)
    setRows((prev) => (append ? [...prev, ...page.rows] : page.rows))
    setMissing((prev) => (append ? [...prev, ...page.missing] : page.missing))
    setTotal(page.total)
    setNextOffset(page.next_offset)
  }

  useEffect(() => {
    let cancelled = false
    fetchCollectionCases(slug, { offset: 0 })
      .then((page) => { if (!cancelled) apply(page, false) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [slug])

  async function loadMore(offset: number) {
    setLoadingMore(true)
    setError(null)
    try {
      apply(await fetchCollectionCases(slug, { offset }), true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingMore(false)
    }
  }

  const loading = loadingMore || (total == null && error == null)
  const columns = useMemo(() => attributeColumns(rows), [rows])
  const shown = columns.slice(0, MAX_ATTRIBUTE_COLUMNS)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <AppLink to="/collections" className="text-sm text-muted-foreground hover:text-foreground">
          <span aria-hidden>←</span> All collections
        </AppLink>
        <h1 className="mt-4 font-serif text-3xl font-bold">{collection?.name ?? slug}</h1>
        {collection?.description && (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{collection.description}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          {total != null && (
            <span className="text-muted-foreground">
              {rows.length.toLocaleString('en-US')} of {total.toLocaleString('en-US')} cases loaded
            </span>
          )}
          <AppLink
            to={links.workspace({ slug: LITIGATION, facets: { collection: slug } })}
            className="text-primary hover:underline"
          >
            Search inside this collection →
          </AppLink>
        </div>
        {error && <p className="mt-6 text-sm text-destructive">Could not load this collection: {error}</p>}

        {rows.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Case</th>
                  <th className="py-2 pr-4">Court</th>
                  <th className="py-2 pr-4">Docket</th>
                  <th className="py-2 pr-4">Filed</th>
                  {shown.map((k) => (
                    <th key={k} className="py-2 pr-4">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cl_id} className="border-b border-border align-top">
                    <td className="py-2 pr-4">
                      <AppLink to={links.document({ slug: LITIGATION, id: r.cl_id })} className="text-primary hover:underline">
                        {r.case_name ?? `Docket ${r.cl_id}`}
                      </AppLink>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.court ?? ''}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.docket_number ?? ''}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.date_filed ?? ''}</td>
                    {shown.map((k) => (
                      <td key={k} className="py-2 pr-4">{cellText(r.attributes?.[k])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {columns.length > shown.length && (
          <p className="mt-2 text-xs text-muted-foreground">
            Also recorded for some cases: {columns.slice(shown.length).join(', ')}.
          </p>
        )}
        {missing.length > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            {missing.length} member{missing.length === 1 ? '' : 's'} not returned by CourtListener
            (sealed or removed): {missing.join(', ')}.
          </p>
        )}
        <div className="mt-6">
          {loading && <span className="text-sm text-muted-foreground">Loading…</span>}
          {!loading && nextOffset != null && rows.length > 0 && (
            <button
              type="button"
              onClick={() => void loadMore(nextOffset)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Load more
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
