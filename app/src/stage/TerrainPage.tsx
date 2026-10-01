import { useEffect, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'

import type { RecordScene } from './record.ts'
import { STAGEABLE, gatherRecord, pendingRecord } from './recordGather.ts'
import { RecordStage } from './RecordStage.tsx'

/** The words. */
const SAID = {
  collection: 'Collection',
  phrase: 'A phrase to search for',
  look: 'Look',
  trouble: 'That search did not come back:',
} as const

/** What the page opens on when the address names nothing: a search with a shape worth looking at. */
const FIRST = { c: 'olc', q: 'habeas corpus' } as const

function asked(): { c: string; q: string } {
  const params = new URLSearchParams(window.location.search)
  const c = params.get('c') ?? ''
  const q = (params.get('q') ?? '').trim()
  return { c: STAGEABLE.some((each) => each.slug === c) ? c : FIRST.c, q: q || FIRST.q }
}

/**
 * A search, as ground, on a page of its own: `/terrain?c=<collection>&q=<phrase>`.
 *
 * The same drawing the stage shows when a presenter brings a search on (`RecordStage`),
 * without the presenting — nobody has to be live, and nobody else sees it. It is where
 * the drawing is looked at and worked on, and it is a link that can be sent: the address
 * holds the collection and the phrase, and the page asks for them when it opens.
 */
export function TerrainPage() {
  const [first] = useState(asked)
  const [corpus, setCorpus] = useState(first.c)
  const [phrase, setPhrase] = useState(first.q)
  const [scene, setScene] = useState<RecordScene | null>(() => pendingRecord(first.c, first.q))
  const [trouble, setTrouble] = useState<string | null>(null)
  // What is being waited for. A later search supersedes an earlier one still out.
  const [wanted, setWanted] = useState(first)

  useEffect(() => {
    const pending = pendingRecord(wanted.c, wanted.q)
    if (!pending) return
    let cancelled = false
    gatherRecord(pending).then(
      (got) => {
        if (!cancelled) setScene(got)
      },
      (error: unknown) => {
        if (!cancelled) setTrouble(error instanceof Error ? error.message : String(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [wanted])

  function look(event: FormEvent) {
    event.preventDefault()
    const q = phrase.trim()
    if (!q) return
    const pending = pendingRecord(corpus, q)
    if (!pending) return
    // The ground that is up stays up while the next one is asked for, when it is the same
    // collection: what still matches will stay where it is, and the rest will change
    // round it.
    setScene(scene && scene.corpus === corpus ? { ...pending, docs: scene.docs, total: scene.total } : pending)
    setTrouble(null)
    setWanted({ c: corpus, q })
    window.history.replaceState(null, '', `${window.location.pathname}?c=${encodeURIComponent(corpus)}&q=${encodeURIComponent(q)}`)
  }

  return (
    <main className="stage-house flex min-h-[calc(100dvh-var(--site-bar-h,0px))] flex-col" data-terrain-page="">
      <form onSubmit={look} className="relative z-50 flex flex-wrap items-center gap-2 px-[clamp(1rem,4vw,4rem)] pt-4 text-sm">
        <select
          value={corpus}
          onChange={(event) => setCorpus(event.target.value)}
          aria-label={SAID.collection}
          className="rounded-md border border-[color:var(--house-rule)] bg-card px-2 py-1.5"
        >
          {STAGEABLE.map((each) => (
            <option key={each.slug} value={each.slug}>
              {each.label}
            </option>
          ))}
        </select>
        <input
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
          placeholder={SAID.phrase}
          aria-label={SAID.phrase}
          className="min-w-40 max-w-md flex-1 rounded-md border border-[color:var(--house-rule)] bg-card px-2.5 py-1.5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!phrase.trim()}>
          {SAID.look}
        </Button>
        {trouble && (
          <p role="alert" className="basis-full text-sm text-destructive">
            {SAID.trouble} {trouble}
          </p>
        )}
      </form>
      <div className="flex flex-1 flex-col [container-type:inline-size]">
        {scene && <RecordStage scene={scene} focus={null} />}
      </div>
    </main>
  )
}
