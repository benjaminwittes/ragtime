import { useEffect, useRef, useState } from 'react'
import type { CorpusRegistry, ExplorerBrief } from '@lawfare/ragtime-client'

import { ChatOwl } from '@/owl/voice/ChatOwl'
import { landed } from '@/owl/voice/landed'
import { useChatOwl } from '@/owl/voice/useVoice'

import { normalizeBrief, sameBrief } from '../model/brief.ts'
import { phasePill, plural, workingLabel } from '../model/format.ts'
import { acceptMarker, type Turn, answerText } from '../model/turn.ts'
import { Answer } from './Answer.tsx'
import { BriefCard } from './BriefCard.tsx'
import { Mark } from './Mark.tsx'
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
  // Whether the owl is called into the conversation: a switch in the Tune panel, off by default.
  const chatOwl = useChatOwl()
  // While the brush paints an answer in it follows its own glyph down the page, so the page must not jump to the end under it.
  const [painting, setPainting] = useState(false)
  useEffect(() => {
    if (!painting) end.current?.scrollIntoView({ block: 'end' })
  }, [turns, painting])

  // The working label of the one running turn (always the last). A keepalive carries no
  // label of its own and shows the previous one, so the previous one has to outlive a
  // render: state, adjusted during render, rather than a ref read while rendering.
  const running = turns.length && turns[turns.length - 1]!.running ? turns[turns.length - 1]! : null
  const [lastLabel, setLastLabel] = useState('')
  const runningLabel = running ? workingLabel(running, lastLabel) : ''
  if (runningLabel !== lastLabel) setLastLabel(runningLabel)

  // The turns whose answer the reader watched arrive. Only those get painted in; one restored from
  // storage is just shown. Keyed by `startedAt`, since `index` repeats from one conversation to the next.
  const [watched, setWatched] = useState<ReadonlySet<number>>(new Set())
  if (running && !watched.has(running.startedAt)) setWatched(new Set(watched).add(running.startedAt))

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
          // `data-running`: whether the turn is still going is a fact about the turn, and it
          // is said here rather than left to be read off the working indicator, which is
          // not shown while the answer is being written.
          <article key={turn.index + ':' + turn.startedAt} className={'turn turn-' + turn.phase} data-running={turn.running ? '' : undefined}>
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

            {/* From the first word that arrives, not from the end of the turn: the answer
                is written while it streams (`Answer`, `Brush`). */}
            {answerText(turn) && (
              <Answer turn={turn} priorTurns={turns.slice(0, i)} brief={brief} now={now} reveal={watched.has(turn.startedAt)} onPainting={setPainting} />
            )}

            {turn.error && (
              <div className="error">
                <b>{turn.error.code}</b> — {turn.error.message}
                {turn.error.retryable && <span className="hint"> · worth trying again</span>}
              </div>
            )}

            {/* The working mark says the turn is busy with something the reader cannot
                see. While words are arriving they can see it: the mark is at the end of
                them, writing. */}
            {turn.running && !answerText(turn) && (
              <div className="working" aria-live="polite">
                {/* The experimental owl (`owl.voice.chat`, off) stands where the mark does and
                    says its own line after the real status, which is passed through untouched. */}
                {chatOwl ? (
                  <ChatOwl occasion="working">{label || (turn.phase === 'orient' ? 'planning…' : 'researching…')}</ChatOwl>
                ) : (
                  <>
                    <Mark />
                    {label || (turn.phase === 'orient' ? 'planning…' : 'researching…')}
                  </>
                )}
              </div>
            )}

            {/* The same owl, once the last answer has landed (a turn that stopped on a question,
                a brief, a cap or an error has not answered): it settles at the foot of it. A turn
                restored from storage gets the figure without a line, since nobody watched it land. */}
            {chatOwl && isLast && landed(turn) && (
              <div className="owl-chat-end">
                <ChatOwl occasion="answered" speaks={watched.has(turn.startedAt)} />
              </div>
            )}
          </article>
        )
      })}
      <div ref={end} />
    </div>
  )
}
