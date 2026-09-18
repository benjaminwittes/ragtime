import { useEffect, useRef, useState } from 'react'
import type { CorpusRegistry, ExplorerBrief } from '@lawfare/ragtime-client'

import { normalizeBrief, sameBrief } from '../model/brief.ts'
import { phasePill, plural, workingLabel } from '../model/format.ts'
import { acceptMarker, type Turn } from '../model/turn.ts'
import { Answer } from './Answer.tsx'
import { BriefCard } from './BriefCard.tsx'
import { Markdown } from './Markdown.tsx'

type Props = {
  turns: Turn[]
  brief: ExplorerBrief | null
  proposed: ExplorerBrief | null
  registry: CorpusRegistry | null
  now: number
  busy: boolean
  onAccept(brief: ExplorerBrief): void
}

export function Conversation({ turns, brief, proposed, registry, now, busy, onAccept }: Props) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns])

  // The working label of the one running turn (always the last). A keepalive carries no
  // label of its own and shows the previous one, so the previous one has to outlive a
  // render: state, adjusted during render, rather than a ref read while rendering.
  const running = turns.length && turns[turns.length - 1]!.running ? turns[turns.length - 1]! : null
  const [lastLabel, setLastLabel] = useState('')
  const runningLabel = running ? workingLabel(running, lastLabel) : ''
  if (runningLabel !== lastLabel) setLastLabel(runningLabel)

  return (
    <div className="conversation">
      {turns.map((turn, i) => {
        const isLast = i === turns.length - 1
        const label = turn.running ? runningLabel : ''
        // The pinned bar above the conversation already says which brief research runs
        // against, so a transcript copy of the same brief is a second bar saying the same
        // thing. It earns its place only when it differs from the pinned one — a proposal
        // not yet accepted, or a brief the reader edited (item 8), which is the only way
        // to read back which brief an earlier phase actually ran against.
        const shownBrief = isLast && proposed ? proposed : turn.brief
        const showBrief = !!shownBrief && (!brief || !sameBrief(normalizeBrief(shownBrief), brief))
        // What the marker says depends on what came before it — see `acceptMarker`.
        return (
          <article key={turn.index} className={'turn turn-' + turn.phase}>
            {turn.promptKind === 'accept' ? (
              <div className="marker">{acceptMarker(turns, i)}</div>
            ) : (
              <div className={'bubble user' + (turn.promptKind === 'reply' ? ' reply' : '')}>{turn.prompt}</div>
            )}

            {/* Item 2 put the model's narration in the conversation, faint. Faint is not
                the same as out of the way: on a research turn it is several paragraphs of
                the model talking about what it is about to do, above the answer that was
                asked for. So the steps fold into one line and open on a tap — the answer
                is what the page is for, and the work is one gesture behind it. */}
            {turn.narration.length > 0 && (
              <details className="steps">
                <summary className="steps-summary">{plural(turn.narration.length, 'step')}</summary>
                {turn.narration.map((n, j) => (
                  <Markdown key={j} text={n} className="narration" />
                ))}
              </details>
            )}

            {turn.question && (
              <div className="question" role="group" aria-label="Clarifying question">
                <div className="question-head">
                  <span className="pill">{phasePill(turn)}</span>
                  <span className="hint">one question before any research spends — reply below</span>
                </div>
                <p>{turn.question}</p>
              </div>
            )}

            {showBrief && (
              <BriefCard
                brief={shownBrief}
                registry={registry}
                editable={isLast && !brief}
                // Its own brief, never the accepted one: a card only survives the check
                // above by differing from what is pinned, and `accepted` would make it
                // render that pinned brief instead — two identical bars again, with the
                // history it was kept for overwritten. Null also drops the Edit
                // affordance, which belongs to the pinned bar; this card is a record.
                accepted={null}
                disabled={busy}
                startOpen={false}
                onAccept={onAccept}
              />
            )}

            {turn.answer && <Answer turn={turn} priorTurns={turns.slice(0, i)} brief={brief} now={now} />}

            {turn.error && (
              <div className="error">
                <b>{turn.error.code}</b> — {turn.error.message}
                {turn.error.retryable && <span className="hint"> · worth trying again</span>}
              </div>
            )}

            {turn.running && (
              <div className="working" aria-live="polite">
                <span className="dot" />
                {label || (turn.phase === 'orient' ? 'planning…' : 'researching…')}
              </div>
            )}
          </article>
        )
      })}
      <div ref={end} />
    </div>
  )
}
