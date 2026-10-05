import { useEffect, useState, useSyncExternalStore } from 'react'

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
import { Panel } from './Panel'
import { allTunables } from './registry'
import { setPanelOpen, togglePanel, usePanelOpen } from './open'
import { derivedInOverlay, writePresetToRepo, writeTunedToSource } from './write'

/**
 * The tuning panel: `Panel` with every knob in it, a footer that turns whatever has been moved
 * into something durable (a file edit, a named preset, a URL), and the handle on the left edge.
 *
 * Alt+T opens and closes it. It starts closed, and when the page was opened on a preset it
 * hides its handle too, because that page is being photographed. The gear in the site bar
 * opens this same panel in a tuning build, and a reader's panel (`ReaderPanel.tsx`) elsewhere.
 */
export function TunePanel() {
  useSyncExternalStore(subscribeTune, tuneVersion, tuneVersion)
  const openedOnPreset = urlPresetName() !== null
  const open = usePanelOpen()
  const [status, setStatus] = useState<{ text: string; bad?: boolean }>({ text: '' })

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // `code`, not `key`: on macOS Option+T is typed as "†", so a handler
      // written against `key` never fires on the machine this is used on.
      if (event.altKey && event.code === 'KeyT') {
        event.preventDefault()
        togglePanel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const changed = Object.keys(tuneOverrides()).length

  if (!open) {
    if (openedOnPreset) return null
    return (
      <button type="button" className="rt-tune-handle" title="Tune this page (Alt+T)" onClick={() => setPanelOpen(true)}>
        {changed > 0 ? changed : 'T'}
      </button>
    )
  }

  return (
    <Panel
      title="Tune"
      knobs={allTunables}
      changed={changed}
      footer={<Footer changed={changed} status={status} setStatus={setStatus} />}
    />
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
