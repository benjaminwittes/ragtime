import type { CorpusRegistry } from '@lawfare/ragtime-client'

import { EXAMPLE_QUESTIONS } from '../model/examples.ts'

type Props = {
  registry: CorpusRegistry | null
  pinned: string[]
  disabled: boolean
  onAsk(text: string): void
  onTogglePin(slug: string): void
}

/**
 * The empty state (design item 10): three example questions that each
 * orient straight into a brief, and the registry's corpus chips, which
 * pre-fill the brief's corpora when orient proposes one.
 */
export function EmptyState({ registry, pinned, disabled, onAsk, onTogglePin }: Props) {
  const corpora = registry ? registry.corpora.slice().sort(byHubOrder) : []
  return (
    <div className="empty">
      <h2>Ask the federal record a question.</h2>
      <p className="lede">
        Orient runs first and costs almost nothing: it either asks you one question or proposes a research brief you can edit.
        Research spends against the brief, and the trail shows every step and what it cost.
      </p>
      <div className="examples">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button key={q.text} type="button" className="example" onClick={() => onAsk(q.text)} disabled={disabled}>
            <span className="example-shape">{q.shape}</span>
            {q.text}
          </button>
        ))}
      </div>
      {corpora.length > 0 && (
        <div className="pins">
          <div className="label">Search in — optional; pins these corpora to the front of the brief</div>
          <div className="chips">
            {corpora.map((c) => (
              <button
                key={c.slug}
                type="button"
                className={'chip chip-choice' + (pinned.includes(c.slug) ? ' on' : '')}
                onClick={() => onTogglePin(c.slug)}
                disabled={disabled}
                title={c.kind + ' · ' + c.shape}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function byHubOrder(a: CorpusRegistry['corpora'][number], b: CorpusRegistry['corpora'][number]): number {
  const ah = a.lists.hub ?? 99
  const bh = b.lists.hub ?? 99
  return ah - bh || a.name.localeCompare(b.name)
}
