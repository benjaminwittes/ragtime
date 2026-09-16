import { createRoot } from 'react-dom/client'

import './tune.css'
// Every surface's knobs, so the panel can list the hub's measure while you are
// standing on the Explorer. This barrel is the only importer of the per-surface
// declarations that the pages do not already pull in themselves.
import './knobs'
import { installTuneOverlay } from './overlay'
import { repoPresets } from './presets'
import {
  applyTuneOverrides,
  localPresets,
  readTuneHash,
  tuneOverrides,
} from './store'
import { TunePanel } from './TunePanel'

/**
 * Start the tuning layer. Called once, from `main.tsx`, behind `TUNE_ENABLED`
 * and through a dynamic import — so a production build never reaches this
 * module and never pays for it.
 *
 * The panel gets its own React root on its own element, outside the app tree.
 * That is not tidiness: the app is the thing being tuned, and a panel mounted
 * inside it would re-render with it, unmount with a route change, and be
 * reachable by the providers and the stylesheets it exists to move.
 */
export function startTuning() {
  installTuneOverlay()

  // A named preset may live in `presets.ts`, which the store cannot see (it is
  // dev-only, and the store ships). If the URL named one and the store came up
  // with nothing, resolve it here.
  const hash = readTuneHash()
  if (hash && !hash.startsWith('~') && Object.keys(tuneOverrides()).length === 0) {
    const preset = repoPresets[hash] ?? localPresets()[hash]
    if (preset) applyTuneOverrides(preset, false)
    else console.warn(`[tune] no preset named "${hash}"`)
  }

  const host = document.createElement('div')
  host.id = 'rt-tune-root'
  document.body.append(host)
  createRoot(host).render(<TunePanel />)

  console.info('[tune] Alt+T to open the tuning panel')
}
