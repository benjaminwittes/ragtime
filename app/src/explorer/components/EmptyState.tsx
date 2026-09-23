import { useState } from 'react'
import type { CorpusRegistry } from '@lawfare/ragtime-client'

import { SurfaceIntro } from '@/components/SurfaceIntro'

import { pinnedSummary } from '../model/brief.ts'
import { EXAMPLE_QUESTIONS } from '../model/examples.ts'
import { useExampleCount } from '../tune.ts'

type Props = {
  registry: CorpusRegistry | null
  pinned: string[]
  /** An example question sends a turn, so it waits for a credential and for the line to clear. */
  disabled: boolean
  /**
   * Pinning does not spend, so it waits only for a running turn — never for a credential.
   * These were one prop, and the pins inherited the examples' rule: on a first visit, with
   * no key set, every chip was dead. Nothing said so, because a disabled chip and an
   * unpinned chip look nearly alike, and the reader with the most reason to scope a search
   * before committing to one is exactly the reader who had not signed in yet.
   */
  busy: boolean
  onAsk(text: string): void
  onTogglePin(slug: string): void
}

/**
 * The empty state (design item 10): three example questions that each
 * orient straight into a brief, and the registry's corpus chips, which
 * pre-fill the brief's corpora when orient proposes one.
 */
export function EmptyState({ registry, pinned, disabled, busy, onAsk, onTogglePin }: Props) {
  const corpora = registry ? registry.corpora.slice().sort(byHubOrder) : []
  // Three, unless someone is tuning. The count is a design parameter — how much
  // of the first screen is worked example and how much is the reader's own
  // question — so it is a knob rather than a literal (`../tune.ts`).
  const exampleCount = useExampleCount()
  const examples = EXAMPLE_QUESTIONS.slice(0, exampleCount)
  // Opened by the reader, and it stays open — this is their own toggle, like the trail's.
  // It starts open when something is already pinned, because a restored choice the page
  // has folded away is one the reader did not make on this screen.
  const [open, setOpen] = useState(() => pinned.length > 0)
  // Names, not slugs: the control is read by a person, and `presidential` is not what the
  // chip they pressed said.
  const pinnedNames = pinned.map((slug) => corpora.find((c) => c.slug === slug)?.name ?? slug)
  return (
    <div className="empty">
      {/* The same component the hub opens with, and it carries no class of its own — the
          `h2` and the `.lede` here are styled by `explorer.css` exactly as they were. The
          `<section>` it wraps them in is new and costs nothing: this sheet has no bare
          `section` rule, and a wrapper with no border or padding lets the lede's 18px
          bottom margin collapse straight through it, so the gap to the examples below is
          the one it always was. */}
      <SurfaceIntro
        level={2}
        heading="Ask the federal record a question."
        ledeClassName="lede"
        lede={
          <>
            Planning runs first and costs almost nothing: it either asks you one question or proposes a research brief you can edit.
            Research spends against the brief, and the trail shows every step and what it cost.
          </>
        }
      />
      <div className="examples">
        {examples.map((q) => (
          <button key={q.text} type="button" className="example" onClick={() => onAsk(q.text)} disabled={disabled}>
            <span className="example-shape">{q.shape}</span>
            {q.text}
          </button>
        ))}
      </div>
      {/* For the reader arriving from Search, who has just learned that a quoted phrase, a
          leading minus and OR all do something there and will try them here. What it does
          NOT say is that they are ignored — this surface cannot know that, because the
          agent composing the query runs in the Worker, and guessing across that seam is the
          error this app keeps making. It says the two things this repo can show: the marks
          are Search's, and the query that reaches a corpus is one the Explorer wrote, which
          the trail prints (`Trail.tsx` renders `query` off each tool call). Sits at the foot
          of the empty state because that is the copy nearest the composer, and only on the
          first screen — a line under every turn would be noise by the third. */}
      <p className="hint">
        Ask in plain words — quotes, minus and OR belong to Search. The Explorer writes its
        own searches from your question, and the trail shows each one.
      </p>
      {corpora.length > 0 && (
        <div className="pins">
          {/* Thirteen chips is five rows on a desktop and more on a phone, for a control
              the label itself calls optional — so it folds. It stays rather than going
              away entirely because scoping is worth finding: a reader who never opens this
              never learns the search can be aimed, and orient's proposal is the only thing
              that would have told them. Closed, the control names what is pinned, so a
              choice that is in effect is never out of sight. */}
          <button
            type="button"
            className={'pins-toggle' + (open ? ' on' : '')}
            aria-expanded={open}
            aria-controls="pins-chips"
            onClick={() => setOpen((o) => !o)}
          >
            <span aria-hidden="true">{open ? '▾' : '▸'}</span> {pinnedSummary(pinnedNames)}
          </button>
          {open && (
            <div className="chips" id="pins-chips">
              {corpora.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  className={'chip chip-choice' + (pinned.includes(c.slug) ? ' on' : '')}
                  onClick={() => onTogglePin(c.slug)}
                  disabled={busy}
                  title={c.kind + ' · ' + c.shape}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
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
