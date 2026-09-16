/**
 * Write-to-source: the client half.
 *
 * Dragging a slider changes an overlay, not a file. That is deliberate — a file
 * written on every frame is a laggy drag and a working tree full of values
 * nobody chose. The decision is the event worth recording, so one button turns
 * the current overlay into real edits in the files the knobs were declared in,
 * Vite's HMR shows the result, and the override is dropped because the source
 * now says it.
 *
 * The client resolves *where* each edit goes (only the browser has the
 * registry) and the dev middleware does the patching (only the server can touch
 * the disk). See `app/vite-plugin-tune.ts` for the other half, including the
 * refusal to write anywhere outside `app/src/`.
 */

import { allTunables, getTunable } from './registry'
import { resetTuneValues, tuneOverrides } from './store'
import type { TuneValue } from './types'

export type TuneEdit =
  | {
      kind: 'css'
      id: string
      file: string
      selector: string
      prop: string
      value: string
    }
  | { kind: 'value'; id: string; file: string; value: TuneValue }

export type TuneEditResult = { id: string; ok: boolean; detail: string }

/** Turn the current overlay into the edits that would land it in source. */
export function pendingEdits(ids?: string[]): TuneEdit[] {
  const overrides = tuneOverrides()
  const wanted = ids ? new Set(ids) : null
  const edits: TuneEdit[] = []
  for (const knob of allTunables()) {
    if (!Object.prototype.hasOwnProperty.call(overrides, knob.id)) continue
    if (wanted && !wanted.has(knob.id)) continue
    const value = overrides[knob.id]
    if (knob.prop) {
      edits.push({
        kind: 'css',
        id: knob.id,
        file: knob.source.file,
        selector: knob.source.selector ?? ':root',
        prop: knob.prop,
        value: String(value),
      })
    } else {
      edits.push({ kind: 'value', id: knob.id, file: knob.source.file, value })
    }
  }
  return edits
}

/** Knobs in the overlay whose source value is a `var(…)` reference. */
export function derivedInOverlay(ids?: string[]): string[] {
  const overrides = tuneOverrides()
  const wanted = ids ? new Set(ids) : null
  return Object.keys(overrides)
    .filter((id) => (wanted ? wanted.has(id) : true))
    .filter((id) => getTunable(id)?.derived)
}

/**
 * Send the edits and drop the overrides that landed. Anything that failed stays
 * in the overlay — a knob whose declaration has moved should keep showing the
 * value you chose, not silently revert to the one in the file.
 */
export async function writeTunedToSource(
  ids?: string[],
): Promise<{ ok: boolean; results: TuneEditResult[] }> {
  const edits = pendingEdits(ids)
  if (edits.length === 0) return { ok: true, results: [] }

  let payload: { results: TuneEditResult[] }
  try {
    const response = await fetch('/__tune/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ edits }),
    })
    if (!response.ok) {
      const detail = await response.text()
      return {
        ok: false,
        results: edits.map((e) => ({
          id: e.id,
          ok: false,
          detail: `${response.status}: ${detail.slice(0, 120)}`,
        })),
      }
    }
    payload = (await response.json()) as { results: TuneEditResult[] }
  } catch (error) {
    return {
      ok: false,
      results: edits.map((e) => ({
        id: e.id,
        ok: false,
        detail: error instanceof Error ? error.message : 'request failed',
      })),
    }
  }

  const landed = payload.results.filter((r) => r.ok).map((r) => r.id)
  resetTuneValues(landed)
  return { ok: payload.results.every((r) => r.ok), results: payload.results }
}

/**
 * Commit a named preset to `src/tune/presets.ts`, which is a normal file in the
 * repo: a tuning worth comparing twice is worth someone else being able to open.
 */
export async function writePresetToRepo(
  name: string,
  values: Record<string, TuneValue>,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch('/__tune/preset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, values }),
    })
    const detail = await response.text()
    return { ok: response.ok, detail: detail.slice(0, 200) }
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'request failed',
    }
  }
}
