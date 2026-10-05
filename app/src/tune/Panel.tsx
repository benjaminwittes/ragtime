import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'

import './tune.css'
import { KnobRow, type KnobWrite } from './controls'
import { setPanelOpen, usePanelOpen } from './open'
import { allSurfaces, surfaceIsMounted } from './registry'
import { find, type Candidate } from './search'
import { subscribeTune, tuneValue, tuneVersion } from './store'
import { isOn, nest, type Node } from './tree'
import type { Tunable } from './types'

/**
 * The panel, in both its uses: the tuner's column (`TunePanel.tsx`: every knob, a footer that
 * writes what was moved to source, a preset, a URL) and the reader's settings (`ReaderPanel.tsx`:
 * the knobs marked `user`, kept in the reader's browser). One column on the right, a search
 * box under the title, the scopes as tabs under that, and the knobs grouped as the
 * declarations group them.
 *
 * Typing in the box searches every knob it was given at once: "owl" lists the owl's, "motion"
 * finds the one called that, whichever tab was open. Empty, the tabs are the way in again.
 * The panel starts closed; the gear in the site bar, Ctrl+, and (for the tuner) Alt+T open it,
 * and Escape closes it.
 */

const LIMIT = 60

export function Panel({
  title,
  knobs: given,
  write,
  footer,
  changed = 0,
  hotkeys = true,
}: {
  title: string
  /** The knobs this panel may show: all of them for the tuner, the reader's for a reader. */
  knobs: () => Tunable[]
  /** How a row writes; the tuner's own without one. */
  write?: KnobWrite
  footer?: ReactNode
  /** How many are moved from source, for the title row. */
  changed?: number
  /** Escape closes; off for a host that has its own keys. */
  hotkeys?: boolean
}) {
  useSyncExternalStore(subscribeTune, tuneVersion, tuneVersion)
  const open = usePanelOpen()
  const [scope, setScope] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !hotkeys) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setPanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, hotkeys])

  // The box takes focus as the panel opens, so a reader can type at once.
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  if (!open) return null

  const surfaces = allSurfaces()
  const label = (id: string) => (id === 'global' ? 'Globals' : (surfaces.find((s) => s.id === id)?.label ?? id))
  const knobs = given().filter((k) => k.label)
  const candidates: Candidate[] = knobs.map((knob) => ({ knob, scope: label(knob.scope) }))

  // "The surface you are looking at" is whichever registered selector is in the DOM, so no
  // page has to tell the panel it mounted. Recomputed on every render, which is often enough.
  const onPage = new Set(surfaces.filter(surfaceIsMounted).map((s) => s.id))
  const ids = [...new Set(knobs.map((k) => k.scope))]
  const tabs = [
    ...ids.filter((id) => id === 'global' || onPage.has(id)),
    ...ids.filter((id) => id !== 'global' && !onPage.has(id)),
  ].map((id) => ({ id, label: label(id), here: id === 'global' || onPage.has(id) }))
  const activeScope = scope && ids.includes(scope) ? scope : (tabs.find((t) => t.id !== 'global' && t.here)?.id ?? tabs[0]?.id ?? 'global')

  const q = query.trim()
  const shown: Candidate[] = q ? find(candidates, q).slice(0, LIMIT) : candidates.filter((c) => c.knob.scope === activeScope)
  // A knob with a parent that is shown is drawn under it, and so leaves its own group.
  const roots = nest(shown.map((c) => c.knob))
  const scopeOf = new Map(shown.map((c) => [c.knob.id, c.scope]))
  const sections: { scope: string; group: string; rows: Node[] }[] = []
  for (const node of roots) {
    const last = sections[sections.length - 1]
    const scope = scopeOf.get(node.knob.id)!
    if (last && last.scope === scope && last.group === node.knob.group) last.rows.push(node)
    else sections.push({ scope, group: node.knob.group, rows: [node] })
  }
  const total = q ? find(candidates, q).length : shown.length

  return (
    <aside className="rt-tune" aria-label={title}>
      <div className="rt-tune-head">
        <span className="rt-tune-title">{title}</span>
        {changed > 0 && <span className="rt-tune-count">{changed} changed</span>}
        <span className="rt-tune-grow" />
        <button type="button" className="rt-tune-x" onClick={() => setPanelOpen(false)} title="Close (Esc)" aria-label="Close">
          ×
        </button>
      </div>

      <div className="rt-tune-search">
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings, such as “owl”"
          aria-label="Search settings"
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {!q && tabs.length > 1 && (
        <div className="rt-tune-tabs">
          {tabs.map((s) => (
            <button
              key={s.id}
              type="button"
              className={'rt-tune-tab' + (s.id === activeScope ? ' on' : '') + (s.here ? '' : ' off-page')}
              onClick={() => setScope(s.id)}
              title={s.here ? undefined : 'Not on screen — changing it shows nothing you can see'}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="rt-tune-body">
        {sections.length === 0 && (
          <p className="rt-tune-empty">{q ? <>No setting matches “{q}”.</> : <>Nothing to set here yet.</>}</p>
        )}
        {sections.map((s) => (
          <div key={s.scope + s.group} className="rt-tune-group">
            <div className="rt-tune-group-name">{q ? `${s.scope} / ${s.group}` : s.group}</div>
            {s.rows.map((node) => (
              <Branch key={node.knob.id} node={node} write={write} openId={openId} setOpenId={setOpenId} />
            ))}
          </div>
        ))}
        {total > shown.length && <p className="rt-tune-note">{total - shown.length} more. Type more of the name to narrow it.</p>}
      </div>

      {footer}
    </aside>
  )
}

/**
 * A row and, beneath it, the rows that depend on it: shown only while it is on, indented under
 * a rule, so a setting that would do nothing is not there to be moved.
 */
function Branch({
  node,
  write,
  openId,
  setOpenId,
}: {
  node: Node
  write?: KnobWrite
  openId: string | null
  setOpenId: (id: string | null) => void
}) {
  const on = node.kids.length > 0 && isOn(tuneValue(node.knob.id))
  return (
    <>
      <KnobRow knob={node.knob} write={write} open={openId === node.knob.id} onOpen={setOpenId} />
      {on && (
        <div className="rt-tune-kids">
          {node.kids.map((kid) => (
            <Branch key={kid.knob.id} node={kid} write={write} openId={openId} setOpenId={setOpenId} />
          ))}
        </div>
      )}
    </>
  )
}
