import { toHref } from '@/lib/routing'
import { cents, plural, seconds, toolLabel } from '../model/format.ts'
import { workspaceHandoffs } from '../model/sources.ts'
import { TERMINAL_TOOLS, lastCost, roundCosts, type TrailCall, type Turn } from '../model/turn.ts'
import { ToolDetail } from './tool-detail.tsx'

/**
 * The trail (design item 4): tool calls with their summary, time and cost,
 * and workspace handoffs. Document handoffs are the sources under the
 * answer, not repeated here. Per-call cost lives here only (item 6), one
 * line per round. A structured `detail` (item 5) renders per tool family
 * (`tool-detail.tsx`); a plain `summary` renders as it is, and also stands in
 * for a `detail` this build cannot read.
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
          {r.detail ? <ToolDetail detail={r.detail} summary={r.summary} corpus={r.corpus} /> : <span>{r.summary}</span>}
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
