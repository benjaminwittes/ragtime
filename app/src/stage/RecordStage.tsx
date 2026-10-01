import { useMemo, useState, type MouseEvent } from 'react'

import { Owl } from '@/components/Owl'
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
 *
 * It is also a view of a collection page's own results (`plain`): that page has already
 * said what was asked, so the heading and the owl are left off, and a document is opened
 * the way that page opens one (`onOpen`) instead of in another tab.
 */
export function RecordStage({
  scene,
  focus,
  onPick,
  plain = false,
  onOpen,
}: {
  scene: RecordScene
  /** The one the presenter has brought forward. */
  focus: string | null
  onPick?: (id: string | null) => void
  /** Only the count, the ground, the label and the legend: the page it is on has the heading. */
  plain?: boolean
  /** Open this document here, in the page's own way. Without it a document opens in a new tab. */
  onOpen?: (id: string) => void
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
      return
    }
    if (onOpen) {
      event.preventDefault()
      onOpen(id)
    }
  }

  return (
    <div className="record mx-auto flex w-full max-w-[92rem] flex-1 flex-col px-[clamp(1rem,4cqi,4rem)] pb-12 pt-[clamp(0.75rem,2cqi,2rem)]" data-record={scene.pending ? 'pending' : 'on'}>
      <header>
        {/* The owl is the archivist, and this is the archive being fetched: it stands
            beside what was asked for, with its lantern up for as long as the collection
            has not answered. It is the app's own owl, so its eyes follow the reader's
            pointer across the ground. The name of the collection is set above the phrase,
            though `SurfaceIntro` writes the heading first. */}
        {!plain && (
          <SurfaceIntro
            level={1}
            className="grid grid-cols-[auto_1fr] items-center gap-x-[clamp(0.6rem,1.4cqi,1.4rem)] gap-y-[0.3cqi]"
            figure={<Owl lantern={scene.pending ? 'searching' : 'dark'} className="w-full" />}
            figureClassName="col-start-1 row-span-2 row-start-1 w-[clamp(3rem,5.2cqi,4.75rem)]"
            heading={<>&ldquo;{scene.query}&rdquo;</>}
            lede={scene.label}
            headingClassName="col-start-2 row-start-2 font-serif text-[clamp(1.4rem,3.2cqi,3rem)] font-medium leading-[1.05] tracking-tight text-[color:var(--house-ink)]"
            ledeClassName="col-start-2 row-start-1 self-end font-sans text-[clamp(0.68rem,1.1cqi,0.95rem)] font-semibold uppercase tracking-[0.18em] text-[color:var(--house-accent)]"
          />
        )}
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
        {/* The label is as tall as it is whatever it says, and when it says nothing: the
            ground above takes the height the words leave it, so a label that grew with its
            title moved the ground under the pointer, and the pointer was then on another
            column. */}
        <div className="relative" data-record="label" aria-live="polite">
          <LabelRoom />
          {chosen ? (
            <Label doc={chosen} scene={scene} onOpen={onOpen} />
          ) : (
            !scene.pending &&
            scene.docs.length > 0 && (
              <p className="absolute inset-x-0 top-0 text-[clamp(0.8rem,1.3cqi,1.05rem)] text-[color:var(--house-ink-faint)]">{SAID.point}</p>
            )
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

/** The label's three lines of type: its number and date, its title, and what it is. */
const TYPE = {
  number: 'font-mono text-[clamp(0.68rem,1.05cqi,0.9rem)]',
  title: 'font-serif text-[clamp(1.05rem,1.7cqi,1.55rem)] leading-tight',
  facts: 'text-[clamp(0.78rem,1.2cqi,1.02rem)]',
} as const

/**
 * The room a label is given, which is the most one may take: one line for its number, two
 * for its title and one for what it is, and on a narrow page a line more for each of the
 * last two. Empty and unseen, and the only thing that gives the label's box a height: the
 * label is laid over it, so the box is this tall whatever is in it. `Label` cuts each line
 * where this stops.
 */
function LabelRoom() {
  return (
    <div className="invisible grid gap-[0.25cqi]" aria-hidden="true">
      <p className={`${TYPE.number} h-[1lh]`} />
      <p className={`${TYPE.title} h-[2lh] @max-2xl:h-[3lh]`} />
      <p className={`${TYPE.facts} h-[1lh] @max-2xl:h-[2lh]`} />
    </div>
  )
}

/**
 * What the column pointed at is: its real title, as a real link, and its form put into words.
 *
 * It never takes more than its room (`LabelRoom`): a title that runs past its lines is cut
 * there, and the link's own title has the rest.
 */
function Label({ doc, scene, onOpen }: { doc: StageDoc; scene: RecordScene; onOpen?: (id: string) => void }) {
  const own = doc.href.startsWith('/')
  const facts = [doc.line, lengthSaid(doc, scene.unit), doc.lane].filter(Boolean)
  const forms = FORMS.filter(({ key }) => scene.legend[key] && has(doc, key)).map(({ key }) => scene.legend[key] as string)
  return (
    <div className="absolute inset-0 grid content-start gap-[0.25cqi] overflow-hidden">
      <p className={`${TYPE.number} line-clamp-1 min-h-[1lh] text-[color:var(--house-accent)]`}>{[doc.number, doc.when].filter(Boolean).join(' · ')}</p>
      <p className={`${TYPE.title} line-clamp-2 text-[color:var(--house-ink)] text-balance @max-2xl:line-clamp-3`}>
        <a
          href={own ? toHref(doc.href) : doc.href}
          target="_blank"
          rel="noopener noreferrer"
          title={doc.title}
          // A plain click opens it the page's own way where there is one; a click meant
          // for another tab still gets the link.
          onClick={
            onOpen &&
            ((event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
              event.preventDefault()
              onOpen(doc.id)
            })
          }
          className="underline decoration-[color:var(--house-rule)] underline-offset-[0.18em] hover:decoration-[color:var(--house-accent)]"
        >
          {doc.title}
        </a>
      </p>
      <p className={`${TYPE.facts} line-clamp-1 text-[color:var(--house-ink-soft)] @max-2xl:line-clamp-2`}>{[...facts, ...forms].join(' · ')}</p>
    </div>
  )
}
