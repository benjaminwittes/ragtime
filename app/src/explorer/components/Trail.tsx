import { links, type ExplorerToolDetail } from '@lawfare/ragtime-client'

import { toHref } from '@/lib/routing'
import { cents, plural, seconds, toolLabel } from '../model/format.ts'
import { workspaceHandoffs } from '../model/sources.ts'
import { TERMINAL_TOOLS, lastCost, roundCosts, type TrailCall, type Turn } from '../model/turn.ts'

/**
 * The trail (design item 4): tool calls with their summary, time and cost,
 * and workspace handoffs. Document handoffs are the sources under the
 * answer, not repeated here. Per-call cost lives here only (item 6), one
 * line per round. A structured `detail` (item 5) renders per tool family;
 * an older worker's plain `summary` renders as it is.
 */
export function Trail({ turns }: { turns: Turn[] }) {
  if (!turns.length) return <div className="trail-empty">The trail shows every tool call and its cost as the model works.</div>
  return (
    <div className="trail">
      {turns.map((turn) => {
        const costs = roundCosts(turn)
        const total = lastCost(turn)
        return (
          <section key={turn.index} className="trail-turn">
            <div className="trail-head">
              turn {turn.index} · {turn.phase}
              {!turn.running && total && <span className="trail-total"> · {cents(total.turn_cents)} · {plural(turn.calls, 'model call')}</span>}
            </div>
            {turn.rounds.map((round) => (
              <div key={round.step} className="round">
                {round.calls.map((call) => (
                  <Call key={call.id} call={call} />
                ))}
                {costs.has(round.step) && (
                  <div className="round-cost">
                    round {round.step} · {cents(costs.get(round.step)!)}
                  </div>
                )}
              </div>
            ))}
            {workspaceHandoffs(turn).map((h, i) => (
              <a key={i} className="handoff" href={toHref(h.url)} target="_blank" rel="noreferrer noopener">
                {h.label || h.url}
              </a>
            ))}
            {!turn.running && turn.stop && turn.stop !== 'end_turn' && <div className="trail-stop">ended: {turn.stop.replace('_', ' ')}</div>}
          </section>
        )
      })}
    </div>
  )
}

function Call({ call }: { call: TrailCall }) {
  if (TERMINAL_TOOLS.has(call.name)) {
    return (
      <div className="call call-terminal">
        <span className="call-name">→ {toolLabel(call.name)}</span>
      </div>
    )
  }
  const r = call.result
  return (
    <div className={'call' + (r ? (r.ok ? ' ok' : ' bad') : ' pending')}>
      <div className="call-line">
        <span className="call-name">{toolLabel(call.name)}</span>
        <span className="call-input">{inputLine(call.input)}</span>
      </div>
      {r ? (
        <div className="call-result">
          <span className="mark">{r.ok ? '✓' : '✗'}</span>
          {r.detail ? <Detail detail={r.detail} corpus={r.corpus} /> : <span>{r.summary}</span>}
          <span className="call-meta">
            {seconds(r.ms)}
            {r.cost_cents > 0 && ' · ' + cents(r.cost_cents) + ' tool'}
          </span>
        </div>
      ) : (
        <div className="call-result pending">…</div>
      )}
    </div>
  )
}

function inputLine(input: Record<string, unknown>): string {
  const parts: string[] = []
  for (const k of ['corpus', 'corpora', 'query', 'question', 'mode', 'k', 'ids', 'fields', 'seed_id', 'id']) {
    const v = input[k]
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) parts.push(k + '=' + (v.length > 4 ? v.slice(0, 4).join(',') + ',…' : v.join(',')))
    else if (typeof v === 'object') parts.push(k + '=' + JSON.stringify(v).slice(0, 80))
    else parts.push(k + '=' + String(v).slice(0, 80))
  }
  return parts.join(' ')
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
                        <a href={toHref(links.document({ slug: h.corpus, id: t.id }))} target="_blank" rel="noreferrer noopener">
                          {t.title ?? String(t.id)}
                        </a>
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
                <a href={toHref(links.document({ slug, id: d.id }))} target="_blank" rel="noreferrer noopener">
                  {d.title ?? String(d.id)}
                </a>
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
