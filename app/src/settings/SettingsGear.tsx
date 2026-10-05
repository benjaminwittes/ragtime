import { lazy, Suspense, useEffect, useState } from 'react'
import { SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The gear at the top right of the site bar, for everyone: it opens the settings palette.
 * The palette and everything it lists (`SettingsPalette.tsx`, and the tuning registry under
 * it) is a chunk of its own, fetched the first time the gear is asked for, so the bar costs the
 * page a button. `Cmd+,` / `Ctrl+,` opens it from the keyboard, as it does in most apps with
 * settings.
 */

const Palette = lazy(() => import('./SettingsPalette'))

export function SettingsGear() {
  const [open, setOpen] = useState(false)
  // Once opened it stays mounted, so closing it is not a refetch and a reopened palette is instant.
  const [used, setUsed] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setUsed(true)
        setOpen((v) => !v)
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
        aria-haspopup="dialog"
        title="Settings (Ctrl+,)"
        onClick={() => {
          setUsed(true)
          setOpen(true)
        }}
        // Warm the chunk on the way in, so the palette is there by the time the click lands.
        onPointerEnter={() => void import('./SettingsPalette')}
        onFocus={() => void import('./SettingsPalette')}
      >
        <SettingsIcon aria-hidden />
      </Button>
      {used ? (
        <Suspense fallback={null}>
          <Palette open={open} onOpenChange={setOpen} />
        </Suspense>
      ) : null}
    </>
  )
}
