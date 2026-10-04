import { useState, type ReactNode } from 'react'
import { Owl } from '../../Owl'
import type { OwlPin } from '../../types'
import { LinesFigure } from '../lines/LinesFigure'
import { DEFAULT_KNOBS, type LineKnobs, type LineSubject } from '../lines/knobs'
import type { LampState } from '../lines/fields'
import { FRAMES, OWLS, type OwlSpec } from '../lines/owls'

/**
 * An image drawn as a mosaic of tiles of five parallel lines that thicken and thin together,
 * smoothed like ink (`lines/engine.ts`).
 *
 *  - `lines-owl`: an owl drawn for the technique, as an ink-density function in code
 *    (`lines/owls.ts`): big concentric eyes, a plump body, tufts. They blink as the eye rings
 *    pinch shut, breathe, tip the head and flick an ear, all by thickness alone.
 *  - `lines-lantern`: no owl, a lantern as a swelling in a field of tiles, in the owl's
 *    three lantern states.
 *
 * The lab's rules hold: stacks pose only, four sizes, one paper ground, one moving specimen
 * per candidate (the lit one at 112), the rest drawn once and captioned still. A frame row
 * under each candidate holds the blink, the tilt and the searching lantern as still frames.
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

function Lines({ subject, size, state, moving, knobs, t = 0, label }: { subject: LineSubject; size: number; state: LampState; moving: boolean; knobs: LineKnobs; t?: number; label?: string }) {
  return (
    <figure className="m-0">
      <LinesFigure subject={subject} size={size} state={state} moving={moving} knobs={knobs} still={t} />
      <Cap>{`${label ?? state} ${size}px, ${moving ? 'moving' : 'still'}`}</Cap>
    </figure>
  )
}

function Sizes({ subject, knobs, children }: { subject: LineSubject; knobs: LineKnobs; children?: ReactNode }) {
  return (
    <div className={PAPER}>
      {SIZES.map((s) => (
        <Lines key={s} subject={subject} size={s} state="lit" moving={s === 112} knobs={knobs} />
      ))}
      {children}
    </div>
  )
}

function Candidate({ spec, knobs, runAll }: { spec: OwlSpec; knobs: LineKnobs; runAll: boolean }) {
  const subject = spec.id as LineSubject
  return (
    <div className="mt-8">
      <h3 className="font-serif text-xl font-medium">
        {spec.label} <code className="text-sm font-normal text-muted-foreground">lines-owl</code>
      </h3>
      <p className="text-sm text-muted-foreground">{spec.note} The lit 112px one blinks, breathes, tips its head and flicks an ear.</p>
      <Sizes subject={subject} knobs={knobs} />
      <div className={PAPER}>
        {FRAMES.filter((f) => spec.lantern || !f.id.startsWith('search')).map((f) => (
          <Lines key={f.id} subject={subject} size={112} state={f.state} moving={false} knobs={knobs} t={f.t} label={'frame: ' + f.label} />
        ))}
        {spec.lantern ? <Lines subject={subject} size={112} state="dark" moving={false} knobs={knobs} label="dark lantern" /> : null}
      </div>
      <div className={PAPER}>
        {[56, 80].flatMap((size) => [
          <Lines key={'s' + size} subject={subject} size={size} state="searching" moving={false} knobs={knobs} t={2.42} label="searching" />,
          <Lines key={'d' + size} subject={subject} size={size} state="dark" moving={false} knobs={knobs} label="dark" />,
          <Lines key={'b' + size} subject={subject} size={size} state="lit" moving={false} knobs={knobs} t={5.5 * 0.78} label="blink" />,
        ])}
        <Lines subject={subject} size={112} state="searching" moving={runAll} knobs={knobs} t={0.6} label="searching, can run" />
      </div>
    </div>
  )
}

function Lantern({ knobs, runAll }: { knobs: LineKnobs; runAll: boolean }) {
  return (
    <div className="mt-8">
      <h3 className="font-serif text-xl font-medium">
        A lantern in a field of ink <code className="text-sm font-normal text-muted-foreground">lines-lantern</code>
      </h3>
      <p className="text-sm text-muted-foreground">No body. Lit, a bright swell in the ink; searching, the swell pulses and sweeps; dark, only the lantern&rsquo;s own dark swell.</p>
      <Sizes subject="lantern" knobs={knobs}>
        <div className="flex items-end gap-6 border-l pl-8">
          <Lines subject="lantern" size={112} state="searching" moving={runAll} knobs={knobs} t={0.6} />
          <Lines subject="lantern" size={112} state="dark" moving={false} knobs={knobs} />
        </div>
      </Sizes>
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
        <Slider label="tail cut" value={knobs.cut} min={0} max={0.3} step={0.02} onChange={set('cut')} />
        <Slider label="snap px" value={knobs.snapPx} min={0} max={2} step={0.1} onChange={set('snapPx')} />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={runAll} onChange={(e) => setRunAll(e.target.checked)} />
          Also run the searching specimens (heavier)
        </label>
        <button type="button" className="w-fit text-xs underline" onClick={() => setKnobs(DEFAULT_KNOBS)}>
          Reset
        </button>
      </div>
      <h3 className="mt-8 font-serif text-xl font-medium">The base owl, for comparison</h3>
      <div className={PAPER}>
        {SIZES.map((s) => (
          <Base key={s} size={s} lantern="lit" />
        ))}
      </div>
      {OWLS.map((spec) => (
        <Candidate key={spec.id} spec={spec} knobs={knobs} runAll={runAll} />
      ))}
      <Lantern knobs={knobs} runAll={runAll} />
    </div>
  )
}
