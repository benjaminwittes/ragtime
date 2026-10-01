import { useContext, useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'

import { SurfaceIntro } from '@/components/SurfaceIntro'
import { toHref } from '@/lib/routing'

import { layOut, lengthSaid, ordinalTicks, yearTicks, type Legend, type Placed, type RecordScene, type StageDoc } from './record.ts'
import { StageFloor } from './stageFloor.ts'

/** The words. */
const SAID = {
  asking: (label: string) => `Asking ${label}…`,
  none: (label: string) => `Nothing in ${label} matches.`,
  onStage: (shown: number, total: number) =>
    shown === total
      ? `${total.toLocaleString('en-US')} on stage`
      : `${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} on stage`,
  wings: 'no place on this floor',
  point: 'Point at one to read it.',
  height: 'Height',
  along: 'Along the floor',
  rows: 'Rows',
} as const

/** The share of the floor given to what has no place along it, when anything has none. */
const WINGS = 0.11
/** Clear floor at each end of the axis, so nothing stands on the edge. */
const PAD = 0.035
/** The tallest a thing may stand, in `cqw`. */
const TALLEST = 11.5
/** How wide every thing is, in `cqw`. Width means nothing here, so it is one number. */
const WIDE = 1.3

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

/**
 * A search, on the stage (`record.ts` is what each form means; `record.css` is how it is
 * drawn). It has to be inside an `Amphitheatre`: that is whose stage it stands on.
 *
 * The same component is the stage's scene and the console's preview of it. On the stage a
 * reader points at a thing to read its label and clicks it to open the document itself,
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
  const floor = useContext(StageFloor)
  const laid = useMemo(() => layOut(scene.docs), [scene.docs])
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
  const wings = laid.unplaced > 0 ? WINGS : 0

  // A placed fraction of the dated floor → a fraction of the whole floor.
  const along = (x: number) => wings + PAD + x * (1 - wings - PAD * 2)
  const spots = useMemo(() => {
    const out = new Map<string, { x: number; z: number }>()
    const inWings = new Map<string | null, number>()
    for (const each of laid.placed) {
      let x: number
      if (each.x === null) {
        const k = inWings.get(each.doc.lane) ?? 0
        inWings.set(each.doc.lane, k + 1)
        x = 0.018 + ((k % 4) * (WINGS - 0.036)) / 3
      } else {
        x = wings + PAD + each.x * (1 - wings - PAD * 2)
      }
      out.set(each.doc.id, { x, z: each.z })
    }
    return out
  }, [laid, wings])

  const ticks = laid.span ? (scene.axis.kind === 'time' ? yearTicks(laid.span) : ordinalTicks(laid.span)) : []
  const chosen = laid.placed.find((each) => each.doc.id === active) ?? null
  const chosenSpot = chosen ? spots.get(chosen.doc.id) : undefined
  const present = FORMS.filter(({ key }) => scene.legend[key] && scene.docs.some((doc) => has(doc, key)))

  function onClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
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

  const set = (
    <div
      className="record-set"
      data-forward={focus !== null && pointed === null ? '' : undefined}
      style={
        chosenSpot
          ? ({
              '--fx': `${chosenSpot.x * 100}%`,
              '--fz': `${chosenSpot.z * 100}%`,
              '--fa': 0.22,
            } as CSSProperties)
          : undefined
      }
    >
      {wings > 0 && <div className="record-wings" style={{ width: `${WINGS * 100}%` }} />}
      {ticks.map((tick) => (
        <div key={tick.label} className="record-tick" style={{ left: `${along(tick.x) * 100}%` }} />
      ))}
      {laid.lanes.map((lane) => (
        <div
          key={lane.name ?? ''}
          className="record-lane"
          style={{
            top: `${lane.from * 100}%`,
            height: `${(lane.to - lane.from) * 100}%`,
          }}
        >
          {lane.name && <span className="record-lane-name">{lane.name}</span>}
        </div>
      ))}
      {wings > 0 && (
        <span className="record-mark" style={{ left: `${(WINGS / 2) * 100}%` }} aria-hidden="true">
          {SAID.wings}
        </span>
      )}
      {ticks.map((tick) => (
        <span key={tick.label} className="record-mark" style={{ left: `${along(tick.x) * 100}%` }} aria-hidden="true">
          {tick.label}
        </span>
      ))}
      <svg className="record-families" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {laid.families.map((family) => (
          <polyline
            key={family.key}
            points={family.ids
              .map((id) => spots.get(id))
              .filter((spot) => spot !== undefined)
              .map((spot) => `${spot.x * 100},${spot.z * 100}`)
              .join(' ')}
          />
        ))}
      </svg>
      {laid.placed.map((each) => (
        <Slab
          key={each.doc.id}
          each={each}
          spot={spots.get(each.doc.id) as { x: number; z: number }}
          active={active === each.doc.id}
          onPoint={setPointed}
          onClick={onClick}
        />
      ))}
    </div>
  )

  return (
    <>
      {/* The set goes on the theatre's own stage, in the theatre's own space; the words
          that go with it are laid over the view, above and below. */}
      {floor && createPortal(set, floor)}
      <div className="record flex flex-1 flex-col justify-between" data-record={scene.pending ? 'pending' : 'on'}>
        <header className="px-[5cqw] pt-[clamp(0.75rem,2.6cqw,2.5rem)]">
          <SurfaceIntro
            level={1}
            className="flex flex-col-reverse gap-[0.4cqw]"
            heading={<>&ldquo;{scene.query}&rdquo;</>}
            lede={scene.label}
            headingClassName="font-serif text-[clamp(1.4rem,3.9cqw,3.75rem)] font-medium leading-[1.05] tracking-tight text-[color:var(--house-ink)]"
            ledeClassName="font-sans text-[clamp(0.66rem,1.1cqw,0.95rem)] font-semibold uppercase tracking-[0.18em] text-[color:var(--house-accent)]"
          />
          <p className="mt-[0.4cqw] font-mono text-[clamp(0.66rem,1.05cqw,0.9rem)] text-[color:var(--house-ink-soft)]" role="status">
            {scene.pending
              ? SAID.asking(scene.label)
              : scene.docs.length === 0
                ? SAID.none(scene.label)
                : SAID.onStage(scene.docs.length, scene.total)}
          </p>
        </header>

        {/* What is pointed at, and what the forms mean: on a pane of dark glass, because
            what is under it is the near seats, bright and out of focus. */}
        <div
          className="mx-[3cqw] mb-[clamp(2.75rem,3.2cqw,3.25rem)] grid w-fit max-w-[min(94cqw,62rem)] gap-[0.5cqw] rounded-lg bg-[rgb(3_32_36/0.7)] px-[1.6cqw] py-[1cqw] shadow-lg backdrop-blur-md"
          data-record="caption"
        >
          <div className="min-h-[4.6cqw]" data-record="label" aria-live="polite">
            {chosen ? (
              <Label doc={chosen.doc} scene={scene} />
            ) : (
              !scene.pending &&
              scene.docs.length > 0 && (
                <p className="text-[clamp(0.8rem,1.3cqw,1.05rem)] text-[color:var(--house-ink-faint)]">{SAID.point}</p>
              )
            )}
          </div>
          <p
            className="flex flex-wrap gap-x-[2cqw] gap-y-1 text-[clamp(0.66rem,1cqw,0.88rem)] leading-relaxed text-[color:var(--house-ink-faint)]"
            data-record="legend"
          >
            <span>
              <b className="font-semibold text-[color:var(--house-ink-soft)]">{SAID.height}</b> {scene.legend.height}
            </span>
            <span>
              <b className="font-semibold text-[color:var(--house-ink-soft)]">{SAID.along}</b> {scene.legend.along}
            </span>
            {scene.legend.rows && laid.lanes.some((lane) => lane.name) && (
              <span>
                <b className="font-semibold text-[color:var(--house-ink-soft)]">{SAID.rows}</b> {scene.legend.rows}
              </span>
            )}
            {present.map(({ key, attrs }) => (
              <span key={key}>
                <i className="record-form record-key" style={{ '--film': 1 } as CSSProperties} {...attrs} />
                {scene.legend[key]}
              </span>
            ))}
            {scene.legend.family && laid.families.length > 0 && (
              <span>
                <i className="mr-[0.5em] inline-block h-px w-[1.6em] bg-[color:var(--house-accent)] align-middle" />
                {scene.legend.family}
              </span>
            )}
          </p>
        </div>
      </div>
    </>
  )
}

function Slab({
  each,
  spot,
  active,
  onPoint,
  onClick,
}: {
  each: Placed
  spot: { x: number; z: number }
  active: boolean
  onPoint: (id: string) => void
  onClick: (event: MouseEvent<HTMLAnchorElement>, id: string) => void
}) {
  const { doc } = each
  const place = {
    '--x': `${spot.x * 100}%`,
    '--z': `${spot.z * 100}%`,
    '--h': `${(each.height * TALLEST).toFixed(2)}cqw`,
    '--w': `${WIDE}cqw`,
    '--i': each.order,
    '--film': doc.film,
  } as CSSProperties
  const own = doc.href.startsWith('/')
  return (
    <>
      <span className="record-shadow" style={place} aria-hidden="true" />
      <a
        className="record-slab record-form"
        style={place}
        href={own ? toHref(doc.href) : doc.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={doc.when ? `${doc.title}, ${doc.when}` : doc.title}
        data-record-doc={doc.id}
        data-face={doc.face}
        data-rough={doc.rough ? '' : undefined}
        data-uncapped={doc.capped ? undefined : ''}
        data-film={doc.film > 0 ? '' : undefined}
        data-marked={doc.marked ? '' : undefined}
        data-active={active ? '' : undefined}
        onPointerEnter={() => onPoint(doc.id)}
        onFocus={() => onPoint(doc.id)}
        onClick={(event) => onClick(event, doc.id)}
      />
    </>
  )
}

/** What the thing pointed at is: its real title, as a real link, and its form put into words. */
function Label({ doc, scene }: { doc: StageDoc; scene: RecordScene }) {
  const own = doc.href.startsWith('/')
  const facts = [doc.line, lengthSaid(doc, scene.unit), doc.lane].filter(Boolean)
  const forms = FORMS.filter(({ key }) => scene.legend[key] && has(doc, key)).map(({ key }) => scene.legend[key] as string)
  return (
    <div className="grid gap-[0.3cqw]">
      <p className="font-mono text-[clamp(0.68rem,1.05cqw,0.9rem)] text-[color:var(--house-accent)]">
        {[doc.number, doc.when].filter(Boolean).join(' · ') || ' '}
      </p>
      <p className="font-serif text-[clamp(1rem,1.7cqw,1.6rem)] leading-tight text-[color:var(--house-ink)] text-balance">
        <a
          href={own ? toHref(doc.href) : doc.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-[color:var(--house-ink-faint)] underline-offset-[0.18em] hover:decoration-[color:var(--house-accent)]"
        >
          {doc.title}
        </a>
      </p>
      <p className="text-[clamp(0.78rem,1.25cqw,1.05rem)] text-[color:var(--house-ink-soft)]">{[...facts, ...forms].join(' · ')}</p>
    </div>
  )
}
