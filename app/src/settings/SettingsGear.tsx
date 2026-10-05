import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setPanelOpen, togglePanel, usePanelOpen } from '@/tune/open'
import { TUNE_ENABLED } from '@/tune/store'

/**
 * The gear at the top right of the site bar, for everyone. It opens the panel on the right:
 * the tuner's own where tuning is on (`tune/TunePanel.tsx`, mounted at boot), and everywhere
 * else the reader's (`tune/ReaderPanel.tsx`, the same panel showing the knobs a reader may
 * move), fetched the first time it is wanted so the bar costs the page a button. Whichever it
 * is has a search box at the top. `Ctrl+,` / `Cmd+,` opens it from the keyboard.
 */

const ReaderPanel = TUNE_ENABLED ? null : lazy(() => import('@/tune/ReaderPanel'))
const warm = () => void import('@/tune/ReaderPanel')

export function SettingsGear() {
  const open = usePanelOpen()
  // Once wanted, the reader's panel stays mounted, so closing it is not a refetch.
  const [wanted, setWanted] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setWanted(true)
        togglePanel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Settings"
        aria-expanded={open}
        title="Settings (Ctrl+,)"
        onClick={() => {
          setWanted(true)
          if (open) setPanelOpen(false)
          else setPanelOpen(true)
        }}
        // Warm the chunk on the way in, so the panel is there by the time the click lands.
        onPointerEnter={TUNE_ENABLED ? undefined : warm}
        onFocus={TUNE_ENABLED ? undefined : warm}
      >
        <SettingsIcon aria-hidden />
      </Button>
      {/* Through a portal, to the body: the bar is a view-transition group and so a stacking context,
          and a panel inside it would sit under the page. The tuner's own panel has a root of its own. */}
      {ReaderPanel && wanted
        ? createPortal(
            <Suspense fallback={null}>
              <ReaderPanel />
            </Suspense>,
            document.body,
          )
        : null}
    </>
  )
}
