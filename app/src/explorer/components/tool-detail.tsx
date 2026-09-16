import { links, type ExplorerToolDetail } from '@lawfare/ragtime-client'

import { AppLink } from '@/components/AppLink'
import { plural } from '../model/format.ts'

/**
 * The structured `detail` a tool result carries (design item 5), rendered per tool
 * family — and the worker's own `summary` standing behind it when it cannot be.
 *
 * `Detail` reads fields off a shape the worker sent, and every branch of it trusts that
 * shape. That trust is misplaced by design rather than by accident: the stream parser
 * deliberately tolerates a worker that is ahead of this build — it skips event names it
 * does not know, because the contract allows additive deviation — so a `detail.kind` this
 * build has never heard of is a thing that is *expected* to arrive one day. It landed in
 * the `default:` branch, which reads `chars`, and a detail with no `chars` took the whole
 * page down the moment the trail was opened: a white screen for a line of prose.
 *
 * So this component calls `Detail` rather than mounting it, inside a try. `Detail` is a
 * pure leaf with no hooks, so calling it runs its body here, inside this component's own
 * render, where a throw can be caught; mounted as `<Detail />` the body would run in
 * React's render instead and the throw would escape to the nearest boundary — of which
 * there is none, hence the white screen. The fallback is `summary`, which the contract
 * says is always there and which `Trail`'s no-detail branch already renders, so an
 * unreadable detail costs the reader the structure of one line and none of its meaning.
 *
 * Its own file rather than `Trail.tsx`'s so that fast refresh keeps working on the trail
 * while it is being looked at (`react-refresh/only-export-components`).
 */
export function ToolDetail({ detail, summary, corpus }: { detail: ExplorerToolDetail; summary: string; corpus?: string }) {
  try {
    return Detail({ detail, corpus })
  } catch {
    return <span className="detail">{summary}</span>
  }
}

function Detail({ detail, corpus }: { detail: ExplorerToolDetail; corpus?: string }) {
  switch (detail.kind) {
    case 'search': {
      const hits = detail.hits.filter((h) => h.count > 0)
      const misses = detail.hits.filter((h) => h.count === 0).map((h) => h.corpus)
      if (!hits.length) return <span>no results{misses.length ? ' in ' + misses.join(', ') : ''}</span>
      return (
        <span className="detail">
          {hits.map((h) => (
            <span key={h.corpus} className="hit">
              <b>
                {h.corpus} {h.count.toLocaleString('en-US')}
              </b>
              {h.top.length > 0 && (
                <span className="hit-top">
                  {h.top.map((t, i) => (
                    <span key={i}>
                      {i > 0 && '; '}
                      {t.id !== null ? (
                        <AppLink to={links.document({ slug: h.corpus, id: t.id })}>
                          {t.title ?? String(t.id)}
                        </AppLink>
                      ) : (
                        t.title
                      )}
                    </span>
                  ))}
                </span>
              )}
            </span>
          ))}
          {misses.length > 0 && <span className="hit-miss">none in {misses.join(', ')}</span>}
        </span>
      )
    }
    case 'documents': {
      const slug = detail.corpus ?? corpus ?? null
      return (
        <span className="detail">
          {detail.mode === 'full' ? 'read ' : 'looked up '}
          {plural(detail.count, 'document')}:{' '}
          {detail.documents.map((d, i) => (
            <span key={i}>
              {i > 0 && '; '}
              {d.error ? (
                <span className="hit-miss">
                  {String(d.id)} — {d.error}
                </span>
              ) : slug && d.id !== null ? (
                <AppLink to={links.document({ slug, id: d.id })}>
                  {d.title ?? String(d.id)}
                </AppLink>
              ) : (
                (d.title ?? String(d.id))
              )}
              {d.chars !== undefined && d.chars > 0 && <span className="hit-chars"> {(d.chars / 1000).toFixed(d.chars < 10000 ? 1 : 0)}k chars</span>}
            </span>
          ))}
        </span>
      )
    }
    case 'facets':
      return (
        <span className="detail">
          {plural(detail.field_count, 'filterable field')}
          {detail.fields.length > 0 && <span className="hit-top"> {detail.fields.join(', ')}</span>}
          {detail.document_count !== null && ' · ' + detail.document_count.toLocaleString('en-US') + ' documents'}
        </span>
      )
    case 'plan':
      return (
        <span className="detail">
          plan: {detail.queries === 1 ? '1 query' : detail.queries + ' queries'}, about {detail.estimated_cost_cents}¢ to run
        </span>
      )
    case 'answer':
      return (
        <span className="detail">
          {detail.chars.toLocaleString('en-US')} characters, {plural(detail.citations, 'citation')}
          {detail.candor > 0 && ', ' + plural(detail.candor, 'candor note')}
        </span>
      )
    default:
      return <span className="detail">{detail.chars.toLocaleString('en-US')} characters</span>
  }
}
