import { useMemo, useState, type MouseEvent } from 'react'

import { SurfaceIntro } from '@/components/SurfaceIntro'
import { toHref } from '@/lib/routing'

import { lengthSaid, ordinalTicks, yearTicks, type Legend, type RecordScene, type StageDoc } from './record.ts'
import { Terrain } from './Terrain.tsx'
import { draw, ground, outline } from './terrain.ts'

/** The words. */
const SAID = {
  asking: (label: string) => `Asking ${label}…`,
  none: (label: string) => `Nothing in ${label} matches.`,
  onStage: (shown: number, total: number) =>
    shown === total ? `${total.toLocaleString('en-US')} documents` : `${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} documents`,
  wings: 'undated',
  point: 'Point at one to read it.',
  height: 'Height',
  along: 'Along the ground',
  rows: 'Rows',
} as const

/** The forms a document can take, in the order the legend lists them. */
const FORMS: { key: keyof Legend; attrs: Record<string, string> }[] = [
  { key: 'hatched', attrs: { 'data-face': 'hatched' } },
  { key: 'open', attrs: { 'data-face': 'open' } },
  { key: 'rough', attrs: { 'data-rough': '' } },
  { key: 'uncapped', attrs: { 'data-uncapped': '' } },
  { key: 'film', attrs: { 'data-film': '' } },
  { key: 'marked', attrs: { 'data-marked': '' } },
]

function has(doc: StageDoc, key: keyof Legend): boolean {
  if (key === 'hatched') return doc.face === 'hatched'
  if (key === 'open') return doc.face === 'open'
  if (key === 'rough') return doc.rough
  if (key === 'uncapped') return !doc.capped
  if (key === 'film') return doc.film > 0
  if (key === 'marked') return doc.marked
  return false
}

/** One column standing alone, for the legend: drawn by the geometry that draws the rest. */
const KEY = draw(outline({ id: 'key', x: 0, y: 0, r: 1.5, h: 0 }, []), 3)

/**
 * A search, as ground (`record.ts` is what each form means; `terrain.ts` is how the
 * ground is made; `record.css` is how it is drawn).
 *
 * The same component is the stage's scene and the console's preview of it. On the stage a
 * reader points at a column to read its label and clicks it to open the document itself,
 * in a tab of their own. On the console a click brings it forward for the whole room
 * (`onPick`), which is the one thing here a presenter does that a reader cannot.
 */
export function RecordStage({
  scene,
  focus,
  onPick,
}: {
  scene: RecordScene
  /** The one the presenter has brought forward. */
  focus: string | null
  onPick?: (id: string | null) => void
}) {
  const laid = useMemo(() => ground(scene.docs), [scene.docs])
  // What this reader last pointed at. It stays until they point at something else, so the
  // label is still there when the pointer travels to it — and so a touch, which stops
  // pointing the moment the finger lifts, can read a label at all. The presenter bringing
  // one forward takes it back: that is the room being shown something.
  const [pointed, setPointed] = useState<string | null>(null)
  const [seenFocus, setSeenFocus] = useState(focus)
  if (focus !== seenFocus) {
    setSeenFocus(focus)
    setPointed(null)
  }
  const active = pointed ?? focus
  const marks = laid.span ? (scene.axis.kind === 'time' ? yearTicks(laid.span) : ordinalTicks(laid.span)) : []
  const chosen = scene.docs.find((doc) => doc.id === active) ?? null
  const present = FORMS.filter(({ key }) => scene.legend[key] && scene.docs.some((doc) => has(doc, key)))

  function onClick(event: MouseEvent, id: string) {
    if (onPick) {
      event.preventDefault()
      onPick(focus === id ? null : id)
      return
    }
    // A touch has no "point at": the first touch reads the label, the second opens it.
    if (active !== id) {
      event.preventDefault()
      setPointed(id)
    }
  }

  return (
    <div className="record mx-auto flex w-full max-w-[92rem] flex-1 flex-col px-[clamp(1rem,4cqi,4rem)] pb-12 pt-[clamp(0.75rem,2cqi,2rem)]" data-record={scene.pending ? 'pending' : 'on'}>
      <header>
        <SurfaceIntro
          level={1}
          className="flex flex-col-reverse gap-[0.4cqi]"
          heading={<>&ldquo;{scene.query}&rdquo;</>}
          lede={scene.label}
          headingClassName="font-serif text-[clamp(1.4rem,3.2cqi,3rem)] font-medium leading-[1.05] tracking-tight text-[color:var(--house-ink)]"
          ledeClassName="font-sans text-[clamp(0.68rem,1.1cqi,0.95rem)] font-semibold uppercase tracking-[0.18em] text-[color:var(--house-accent)]"
        />
        <p className="mt-[0.4cqi] font-mono text-[clamp(0.68rem,1.05cqi,0.9rem)] text-[color:var(--house-ink-faint)]" role="status">
          {scene.pending
            ? SAID.asking(scene.label)
            : scene.docs.length === 0
              ? SAID.none(scene.label)
              : SAID.onStage(scene.docs.length, scene.total)}
        </p>
      </header>

      {/* The ground takes whatever height the words leave it (`record.css`), and no less
          than it needs to be read at all. */}
      <div className="relative my-[0.6cqi] min-h-[11rem] w-full flex-1">
        <Terrain
          docs={scene.docs}
          laid={laid}
          marks={marks}
          active={active}
          forward={focus !== null && pointed === null}
          onPoint={setPointed}
          onPick={onClick}
          wingsSaid={SAID.wings}
        />
      </div>

      <footer className="grid gap-[0.7cqi]">
        <div className="min-h-[clamp(3.9rem,4.9cqi,5.2rem)]" data-record="label" aria-live="polite">
          {chosen ? (
            <Label doc={chosen} scene={scene} />
          ) : (
            !scene.pending &&
            scene.docs.length > 0 && <p className="text-[clamp(0.8rem,1.3cqi,1.05rem)] text-[color:var(--house-ink-faint)]">{SAID.point}</p>
          )}
        </div>
        <p
          className="flex flex-wrap items-end gap-x-[2cqi] gap-y-1 border-t border-[color:var(--house-rule)] pt-[0.8cqi] text-[clamp(0.68rem,1cqi,0.88rem)] leading-relaxed text-[color:var(--house-ink-soft)]"
          data-record="legend"
        >
          <span>
            <b className="font-semibold text-[color:var(--house-ink)]">{SAID.height}</b> {scene.legend.height}
          </span>
          <span>
            <b className="font-semibold text-[color:var(--house-ink)]">{SAID.along}</b> {scene.legend.along}
          </span>
          {scene.legend.rows && laid.lanes.some((lane) => lane.name) && (
            <span>
              <b className="font-semibold text-[color:var(--house-ink)]">{SAID.rows}</b> {scene.legend.rows}
            </span>
          )}
          {present.map(({ key, attrs }) => (
            <span key={key}>
              <svg className="terrain terrain-key" viewBox="-1.9 -3.9 3.8 5" aria-hidden="true">
                <g className="terrain-form" {...attrs}>
                  <path className="t-wall" d={KEY.light} />
                  <path className="t-wall t-shade" d={KEY.shade} />
                  <path className="t-strata" d={KEY.strata} />
                  <path className="t-edge" d={KEY.edge} />
                  <polygon className="t-top" points={KEY.top} />
                  <polygon className="t-inner" points={KEY.inner} />
                  <path className="t-crack" d={KEY.crack} />
                </g>
              </svg>
              {scene.legend[key]}
            </span>
          ))}
        </p>
      </footer>
    </div>
  )
}

/** What the column pointed at is: its real title, as a real link, and its form put into words. */
function Label({ doc, scene }: { doc: StageDoc; scene: RecordScene }) {
  const own = doc.href.startsWith('/')
  const facts = [doc.line, lengthSaid(doc, scene.unit), doc.lane].filter(Boolean)
  const forms = FORMS.filter(({ key }) => scene.legend[key] && has(doc, key)).map(({ key }) => scene.legend[key] as string)
  return (
    <div className="grid gap-[0.25cqi]">
      <p className="font-mono text-[clamp(0.68rem,1.05cqi,0.9rem)] text-[color:var(--house-accent)]">
        {[doc.number, doc.when].filter(Boolean).join(' · ') || ' '}
      </p>
      <p className="font-serif text-[clamp(1.05rem,1.7cqi,1.55rem)] leading-tight text-[color:var(--house-ink)] text-balance">
        <a
          href={own ? toHref(doc.href) : doc.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-[color:var(--house-rule)] underline-offset-[0.18em] hover:decoration-[color:var(--house-accent)]"
        >
          {doc.title}
        </a>
      </p>
      <p className="text-[clamp(0.78rem,1.2cqi,1.02rem)] text-[color:var(--house-ink-soft)]">{[...facts, ...forms].join(' · ')}</p>
    </div>
  )
}
