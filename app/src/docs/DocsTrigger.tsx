import { Button } from '@/components/ui/button'
import { useDocs } from './DocsContext'

/**
 * Compact button that opens the docs overlay. Mounted in the app header /
 * nav. The keyboard `?` shortcut wired by DocsProvider is the parallel
 * affordance.
 */
export function DocsTrigger() {
  const { open } = useDocs()
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => open()}
      aria-label="Open documentation overlay"
    >
      {/* The word goes at phone width, the glyph does not: `?` is also the keyboard
          shortcut that opens this, so the button and the key read the same. `aria-label`
          carries the meaning either way. */}
      <span className="font-mono">?</span>
      <span className="ml-1 hidden sm:inline">Docs</span>
    </Button>
  )
}
