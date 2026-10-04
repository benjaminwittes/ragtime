import { useState } from 'react'
import { Owl } from '../../Owl'
import type { OwlPin } from '../../types'
import { LinesFigure } from '../lines/LinesFigure'
import { DEFAULT_KNOBS, type LineKnobs, type LineSubject } from '../lines/knobs'
import type { LampState } from '../lines/fields'

/**
 * Two spikes of one idea: an image drawn as a mosaic of tiles of five parallel lines that
 * thicken and thin together, smoothed like ink (`lines/engine.ts`).
 *
 *  - `lines-owl`: today's owl, rasterised to a 48 px field and drawn in line tiles. The
 *    eyes shut as swells pinch together; the lantern is a bright swell.
 *  - `lines-lantern`: no owl, a lantern as a swelling in a field of tiles, in the owl's
 *    three lantern states.
 *
 * The lab's rules hold: stacks pose only, four sizes, one paper ground, one moving specimen
 * per variant (the lit one at 112), the rest drawn once and captioned still. The base owl
 * is the real one, pinned, at the same sizes.
 */

const SIZES = [56, 80, 112, 240]
const STILL: OwlPin = { design: { temperament: null, standing: {}, motion: { blink: false, gazeFollow: false } } }
const PAPER = 'mt-3 flex flex-wrap items-end gap-x-8 gap-y-5 overflow-x-auto rounded-md border bg-background p-4 text-foreground'

function Cap({ children }: { children: string }) {
  return <figcaption className="mt-1 text-xs text-muted-foreground">{children}</figcaption>
}

function Base({ size, lantern }: { size: number; lantern: LampState }) {
  return (
    <figure className="m-0">
      <div style={{ width: size }}>
        <Owl pose="stacks" lantern={lantern} variant="base" pin={STILL} className="w-full lab-still" />
      </div>
      <Cap>{`base ${size}px, still`}</Cap>
    </figure>
  )
}

function Lines({ subject, size, state, moving, knobs }: { subject: LineSubject; size: number; state: LampState; moving: boolean; knobs: LineKnobs }) {
  return (
    <figure className="m-0">
      <LinesFigure subject={subject} size={size} state={state} moving={moving} knobs={knobs} still={state === 'searching' ? 0.6 : 0} />
      <Cap>{`${state} ${size}px, ${moving ? 'moving' : 'still'}`}</Cap>
    </figure>
  )
}

function Spike({ subject, title, note, knobs, runAll }: { subject: LineSubject; title: string; note: string; knobs: LineKnobs; runAll: boolean }) {
  return (
    <div className="mt-8">
      <h3 className="font-serif text-xl font-medium">
        {title} <code className="text-sm font-normal text-muted-foreground">{subject === 'owl' ? 'lines-owl' : 'lines-lantern'}</code>
      </h3>
      <p className="text-sm text-muted-foreground">{note}</p>
      {subject === 'owl' ? (
        <div className={PAPER}>
          {SIZES.map((s) => (
            <Base key={s} size={s} lantern="lit" />
          ))}
          <Base size={112} lantern="searching" />
        </div>
      ) : null}
      <div className={PAPER}>
        {SIZES.map((s) => (
          <Lines key={s} subject={subject} size={s} state="lit" moving={s === 112} knobs={knobs} />
        ))}
        <div className="flex items-end gap-6 border-l pl-8">
          <Lines subject={subject} size={112} state="searching" moving={runAll} knobs={knobs} />
          <Lines subject={subject} size={112} state="dark" moving={false} knobs={knobs} />
        </div>
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-24 text-muted-foreground">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-8 tabular-nums">{value}</span>
    </label>
  )
}

export function LinesSection() {
  const [knobs, setKnobs] = useState<LineKnobs>(DEFAULT_KNOBS)
  const [runAll, setRunAll] = useState(false)
  const set = (k: keyof LineKnobs) => (v: number) => setKnobs((o) => ({ ...o, [k]: v }))
  return (
    <div className="mt-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Tiles of parallel lines, thickened and thinned together; one moving specimen per spike (the lit 112px one).
        Everything else is drawn once. The base owl is above the first spike for comparison.
      </p>
      <div className="mt-3 grid max-w-3xl gap-1 sm:grid-cols-2">
        <Slider label="lines/tile (0=size)" value={knobs.lines} min={0} max={7} step={1} onChange={set('lines')} />
        <Slider label="pitch x" value={knobs.pitch} min={0.7} max={1.8} step={0.05} onChange={set('pitch')} />
        <Slider label="tile width x" value={knobs.tile} min={0.4} max={2.5} step={0.05} onChange={set('tile')} />
        <Slider label="tile lock" value={knobs.lock} min={0} max={1} step={0.05} onChange={set('lock')} />
        <Slider label="bead (pinch)" value={knobs.bead} min={0} max={1.5} step={0.05} onChange={set('bead')} />
        <Slider label="min width" value={knobs.minW} min={0} max={0.4} step={0.02} onChange={set('minW')} />
        <Slider label="max width" value={knobs.maxW} min={0.5} max={1.3} step={0.02} onChange={set('maxW')} />
        <Slider label="tone gamma" value={knobs.gamma} min={0.5} max={2} step={0.05} onChange={set('gamma')} />
        <Slider label="bulge" value={knobs.bulge} min={0} max={1.5} step={0.05} onChange={set('bulge')} />
        <Slider label="snap px" value={knobs.snapPx} min={0} max={2} step={0.1} onChange={set('snapPx')} />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={runAll} onChange={(e) => setRunAll(e.target.checked)} />
          Also run the searching specimens (heavier)
        </label>
        <button type="button" className="w-fit text-xs underline" onClick={() => setKnobs(DEFAULT_KNOBS)}>
          Reset
        </button>
      </div>
      <Spike subject="owl" title="The owl in line tiles" note="Top row: the base owl, still. Bottom row: lit at four sizes, then searching (a still frame) and dark at 112px. The 112px lit one blinks and breathes its lantern." knobs={knobs} runAll={runAll} />
      <Spike subject="lantern" title="A lantern in a field of ink" note="No body. Lit, a bright swell in the ink; searching, the swell pulses and sweeps; dark, only the lantern's own dark swell." knobs={knobs} runAll={runAll} />
    </div>
  )
}
