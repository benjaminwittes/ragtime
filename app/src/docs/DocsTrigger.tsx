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
      <span className="font-mono mr-1">?</span> Docs
    </Button>
  )
}
