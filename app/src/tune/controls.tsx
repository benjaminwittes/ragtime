import { useMemo } from 'react'

import './controls.css'
import { getSurface } from './registry'
import { isTuned, resetTuneValue, setTuneValue, tuneValue } from './store'
import type { Tunable, TuneValue } from './types'

/**
 * One knob's row and the control for its kind: the part of the tuning panel that is not the
 * panel, shared with the settings gear (`src/settings/`). By default a row writes the tuner's
 * overrides; the gear hands it the reader's own store instead (`write`).
 */

export type KnobWrite = {
  set: (id: string, value: TuneValue) => void
  reset: (id: string) => void
  /** Has this been moved from its default, by whoever this row writes for? */
  changed: (id: string) => boolean
}

const TUNER: KnobWrite = { set: setTuneValue, reset: resetTuneValue, changed: isTuned }

/* -------------------------------------------------------------------------- */
/* One knob                                                                    */
/* -------------------------------------------------------------------------- */

export function KnobRow({ knob, write = TUNER }: { knob: Tunable; write?: KnobWrite }) {
  const value = tuneValue(knob.id)
  const tuned = write.changed(knob.id)
  return (
    <div className="rt-tune-row">
      <label className="rt-tune-label">
        <span>{knob.label}</span>
        {tuned && <span className="rt-tune-dot" title="changed from source" />}
        {tuned && (
          <button
            type="button"
            className="rt-tune-reset"
            onClick={() => write.reset(knob.id)}
            title={`Back to ${String(knob.value)}`}
          >
            reset
          </button>
        )}
      </label>
      <Control knob={knob} value={value} write={write} />
      {knob.note && <div className="rt-tune-note">{knob.note}</div>}
      {knob.derived && (
        <div className="rt-tune-note rt-tune-derived">
          Follows the theme in source (<code>{String(knob.value)}</code>). Writing it
          here would pin a literal.
        </div>
      )}
    </div>
  )
}

function Control({ knob, value, write }: { knob: Tunable; value: TuneValue | undefined; write: KnobWrite }) {
  switch (knob.kind) {
    case 'color':
      return <ColorControl knob={knob} value={String(value ?? '')} write={write} />
    case 'length':
      return <LengthControl knob={knob} value={String(value ?? '')} write={write} />
    case 'number':
    case 'int':
      return <NumberControl knob={knob} value={Number(value ?? 0)} write={write} />
    case 'boolean':
      return (
        <div className="rt-tune-control">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => write.set(knob.id, e.target.checked)}
          />
        </div>
      )
    case 'select':
      return (
        <div className="rt-tune-control">
          <select
            value={String(value ?? '')}
            onChange={(e) => write.set(knob.id, e.target.value)}
          >
            {(knob.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )
    default:
      return (
        <div className="rt-tune-control">
          <input
            type="text"
            className="rt-tune-wide"
            value={String(value ?? '')}
            onChange={(e) => write.set(knob.id, e.target.value)}
          />
        </div>
      )
  }
}

/**
 * Colour: a swatch you can pick with, beside the string as authored. Both are
 * live, and the string is the one that counts — it keeps `oklch(…)`,
 * `color-mix(…)` and `var(…)` typable, which the native picker cannot express.
 */
function ColorControl({ knob, value, write }: { knob: Tunable; value: string; write: KnobWrite }) {
  const hex = useMemo(() => resolveToHex(value, knob), [value, knob])
  return (
    <div className="rt-tune-control">
      <input
        type="color"
        value={hex}
        onChange={(e) => write.set(knob.id, e.target.value)}
      />
      <input
        type="text"
        className="rt-tune-wide"
        value={value}
        spellCheck={false}
        onChange={(e) => write.set(knob.id, e.target.value)}
      />
    </div>
  )
}

function LengthControl({ knob, value, write }: { knob: Tunable; value: string; write: KnobWrite }) {
  const units = knob.units ?? ['px']
  const parsed = parseLength(value, units[0])
  const min = knob.min ?? 0
  const max = knob.max ?? 100
  const step = knob.step ?? 1
  const emit = (n: number, unit: string) => write.set(knob.id, `${trim(n)}${unit}`)
  return (
    <div className="rt-tune-control">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamp(parsed.n, min, max)}
        onChange={(e) => emit(Number(e.target.value), parsed.unit)}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={trim(parsed.n)}
        onChange={(e) => emit(Number(e.target.value), parsed.unit)}
      />
      {units.length > 1 ? (
        <select
          value={parsed.unit}
          onChange={(e) => emit(parsed.n, e.target.value)}
        >
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      ) : (
        <span className="rt-tune-note">{parsed.unit}</span>
      )}
    </div>
  )
}

function NumberControl({ knob, value, write }: { knob: Tunable; value: number; write: KnobWrite }) {
  const min = knob.min ?? 0
  const max = knob.max ?? 100
  const step = knob.step ?? (knob.kind === 'int' ? 1 : 0.1)
  return (
    <div className="rt-tune-control">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamp(value, min, max)}
        onChange={(e) => write.set(knob.id, Number(e.target.value))}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => write.set(knob.id, Number(e.target.value))}
      />
    </div>
  )
}


function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function trim(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}

function parseLength(value: string, fallbackUnit: string): { n: number; unit: string } {
  const match = /^\s*(-?[\d.]+)\s*([a-z%]*)\s*$/i.exec(value)
  if (!match) return { n: 0, unit: fallbackUnit }
  return { n: Number(match[1]), unit: match[2] || fallbackUnit }
}

/**
 * A hex the native colour input will accept, for any CSS colour the browser
 * understands — including `oklch(…)`, which is how shadcn writes half of them.
 *
 * `var(…)` cannot be normalized on its own, so it is resolved against the live
 * page first: the computed value of the property on the surface's own element
 * is what the page is actually painting, which is the honest answer to "what
 * colour is this knob right now".
 */
function resolveToHex(value: string, knob: Tunable): string {
  let literal = value
  if (literal.includes('var(')) {
    const surface = knob.scope === 'global' ? null : getSurface(knob.scope)
    const host =
      (surface && document.querySelector(surface.selector)) || document.documentElement
    const computed = knob.prop
      ? getComputedStyle(host).getPropertyValue(knob.prop).trim()
      : ''
    literal = computed || (/,\s*([^),]+)\)/.exec(literal)?.[1] ?? '#000000')
  }
  try {
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return '#000000'
    ctx.fillStyle = '#000000'
    ctx.fillStyle = literal
    const normalized = ctx.fillStyle
    return typeof normalized === 'string' && normalized.startsWith('#')
      ? normalized
      : '#000000'
  } catch {
    return '#000000'
  }
}
