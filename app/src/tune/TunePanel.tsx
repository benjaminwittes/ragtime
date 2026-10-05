import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import {
  allSurfaces,
  allTunables,
  surfaceIsMounted,
} from './registry'
import { overlayCssForSource } from './overlay'
import { repoPresets } from './presets'
import {
  TUNE_CAN_WRITE,
  applyTuneOverrides,
  deleteLocalPreset,
  encodeTuneState,
  localPresets,
  resetAllTuneValues,
  saveLocalPreset,
  subscribeTune,
  tuneOverrides,
  tuneVersion,
  urlPresetName,
} from './store'
import { KnobRow } from './controls'
import { derivedInOverlay, writePresetToRepo, writeTunedToSource } from './write'
import type { Tunable } from './types'

/**
 * The tuning panel.
 *
 * One column on the right: a tab per scope (Globals, then every surface, with
 * the one you are standing on first and any other greyed), the knobs grouped
 * the way the declarations group them, and a footer that turns whatever you
 * have moved into something durable — a file edit, a named preset, a URL.
 *
 * Alt+T opens and closes it. It starts closed, and when the page was opened on
 * a preset it hides its handle too, because that page is being photographed.
 */
export function TunePanel() {
  useSyncExternalStore(subscribeTune, tuneVersion, tuneVersion)
  const openedOnPreset = urlPresetName() !== null
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<string | null>(null)
  const [status, setStatus] = useState<{ text: string; bad?: boolean }>({ text: '' })

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // `code`, not `key`: on macOS Option+T is typed as "†", so a handler
      // written against `key` never fires on the machine this is used on.
      if (event.altKey && event.code === 'KeyT') {
        event.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const surfaces = allSurfaces()
  // "The surface you are looking at" is whichever registered selector is in the
  // DOM — no page has to tell the panel it mounted. Recomputed on every render,
  // which is often enough: the panel re-renders on open and on every change.
  const onPage = surfaces.filter(surfaceIsMounted)
  const scopes = [
    { id: 'global', label: 'Globals', here: true },
    ...onPage.map((s) => ({ id: s.id, label: s.label, here: true })),
    ...surfaces
      .filter((s) => !onPage.includes(s))
      .map((s) => ({ id: s.id, label: s.label, here: false })),
  ]
  const activeScope = scope ?? (onPage[0]?.id ?? 'global')

  const knobs = allTunables().filter((k) => k.scope === activeScope)
  const groups = useMemo(() => {
    const byGroup = new Map<string, Tunable[]>()
    for (const knob of knobs) {
      byGroup.set(knob.group, [...(byGroup.get(knob.group) ?? []), knob])
    }
    return [...byGroup.entries()]
  }, [knobs])

  const changed = Object.keys(tuneOverrides()).length

  if (!open) {
    if (openedOnPreset) return null
    return (
      <button
        type="button"
        className="rt-tune-handle"
        title="Tune this page (Alt+T)"
        onClick={() => setOpen(true)}
      >
        {changed > 0 ? changed : 'T'}
      </button>
    )
  }

  return (
    <aside className="rt-tune" aria-label="Design tuning">
      <div className="rt-tune-head">
        <span className="rt-tune-title">Tune</span>
        {changed > 0 && <span className="rt-tune-count">{changed} changed</span>}
        <span className="rt-tune-grow" />
        <button type="button" className="rt-tune-x" onClick={() => setOpen(false)} title="Alt+T">
          ×
        </button>
      </div>

      <div className="rt-tune-tabs">
        {scopes.map((s) => (
          <button
            key={s.id}
            type="button"
            className={
              'rt-tune-tab' +
              (s.id === activeScope ? ' on' : '') +
              (s.here ? '' : ' off-page')
            }
            onClick={() => setScope(s.id)}
            title={s.here ? undefined : 'Not on screen — tuning it changes nothing you can see'}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="rt-tune-body">
        {groups.length === 0 && (
          <p className="rt-tune-empty">
            No knobs declared for this scope yet. Add them in the surface’s own
            <code> tune.ts</code>.
          </p>
        )}
        {groups.map(([group, list]) => (
          <div key={group} className="rt-tune-group">
            <div className="rt-tune-group-name">{group}</div>
            {list.map((knob) => (
              <KnobRow key={knob.id} knob={knob} />
            ))}
          </div>
        ))}
      </div>

      <Footer
        changed={changed}
        status={status}
        setStatus={setStatus}
      />
    </aside>
  )
}

/* -------------------------------------------------------------------------- */
/* Footer: where a tuning goes to stop being temporary                         */
/* -------------------------------------------------------------------------- */

function Footer({
  changed,
  status,
  setStatus,
}: {
  changed: number
  status: { text: string; bad?: boolean }
  setStatus: (s: { text: string; bad?: boolean }) => void
}) {
  const [presetName, setPresetName] = useState('')
  const [selected, setSelected] = useState('')
  const presets = { ...repoPresets, ...localPresets() }
  const names = Object.keys(presets).sort()

  async function write() {
    const derived = derivedInOverlay()
    if (derived.length > 0) {
      const ok = window.confirm(
        `${derived.length} of these read var(…) in source:\n\n${derived.join('\n')}\n\n` +
          'Writing replaces the reference with a literal, so they stop following the theme. Continue?',
      )
      if (!ok) return
    }
    setStatus({ text: 'writing…' })
    const { ok, results } = await writeTunedToSource()
    const failed = results.filter((r) => !r.ok)
    setStatus({
      text: ok
        ? `wrote ${results.length} value${results.length === 1 ? '' : 's'} — HMR has it`
        : `${failed.length} failed: ${failed[0]?.detail ?? ''}`,
      bad: !ok,
    })
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      setStatus({ text: `${what} copied` })
    } catch {
      setStatus({ text: 'clipboard refused — check the console', bad: true })
      console.log(text)
    }
  }

  function apply(name: string) {
    setSelected(name)
    if (!name) return
    applyTuneOverrides(presets[name] ?? {})
    setStatus({ text: `applied “${name}”` })
  }

  return (
    <div className="rt-tune-foot">
      <div className="rt-tune-preset-row">
        <select value={selected} onChange={(e) => apply(e.target.value)}>
          <option value="">— preset —</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
              {n in repoPresets ? ' (repo)' : ''}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="name"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
        />
        <button
          type="button"
          className="rt-tune-btn"
          disabled={!presetName.trim() || changed === 0}
          onClick={() => {
            saveLocalPreset(presetName.trim(), tuneOverrides())
            setStatus({ text: `saved “${presetName.trim()}” in this browser` })
            setPresetName('')
          }}
        >
          Save
        </button>
      </div>

      <div className="rt-tune-buttons">
        <button
          type="button"
          className="rt-tune-btn primary"
          disabled={changed === 0 || !TUNE_CAN_WRITE}
          onClick={write}
          title={
            TUNE_CAN_WRITE
              ? 'Patch these values into the files they were declared in'
              : 'No dev server here — copy the CSS or the link instead'
          }
        >
          Write to source
        </button>
        <button
          type="button"
          className="rt-tune-btn"
          disabled={changed === 0}
          onClick={() => copy(overlayCssForSource(), 'CSS')}
        >
          Copy CSS
        </button>
        <button
          type="button"
          className="rt-tune-btn"
          disabled={changed === 0}
          onClick={() => {
            const url = new URL(window.location.href)
            url.hash = `tune=${encodeTuneState(tuneOverrides())}`
            copy(url.toString(), 'Link')
          }}
          title="A self-contained URL — what the screenshot rig and another machine can open"
        >
          Copy link
        </button>
        <button
          type="button"
          className="rt-tune-btn"
          disabled={changed === 0 || !TUNE_CAN_WRITE || !selected}
          onClick={async () => {
            const result = await writePresetToRepo(selected, tuneOverrides())
            setStatus({ text: result.detail, bad: !result.ok })
          }}
          title="Commit the selected preset name to src/tune/presets.ts with the current values"
        >
          Commit preset
        </button>
        <button
          type="button"
          className="rt-tune-btn"
          disabled={!selected || selected in repoPresets}
          onClick={() => {
            deleteLocalPreset(selected)
            setSelected('')
            setStatus({ text: `deleted “${selected}”` })
          }}
        >
          Delete
        </button>
        <button
          type="button"
          className="rt-tune-btn"
          disabled={changed === 0}
          onClick={() => {
            resetAllTuneValues()
            setStatus({ text: 'back to source' })
          }}
        >
          Reset all
        </button>
      </div>

      <div className={'rt-tune-status' + (status.bad ? ' bad' : '')}>{status.text}</div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */
