import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { CorpusSlug } from '@/spokes/types'
import { DocsOverlay } from './DocsOverlay'

/**
 * Docs-overlay context.
 *
 * Provides:
 *   - isOpen: whether the overlay is currently shown
 *   - open(slug?): opens the overlay, optionally pre-selecting an entry
 *   - close(): closes the overlay
 *   - activeSlug: which entry is currently shown (undefined = list view)
 *   - activeSpokeSlug: which corpus spoke is the current navigation context
 *   - setActiveSpokeSlug: setter for the spoke context (called by the
 *     spoke renderer when the user enters/leaves a spoke)
 *
 * The provider also wires the global `?` keyboard shortcut (Shift+/) that
 * opens the overlay from anywhere in the app — suppressed when the user is
 * typing in an input/textarea/contenteditable so it doesn't fight with
 * normal typing.
 */
export type DocsContextValue = {
  isOpen: boolean
  open: (slug?: string) => void
  close: () => void
  activeSlug: string | undefined
  activeSpokeSlug: CorpusSlug | undefined
  setActiveSpokeSlug: (slug?: CorpusSlug) => void
}

const DocsContext = createContext<DocsContextValue | undefined>(undefined)

export function DocsProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeSlug, setActiveSlug] = useState<string | undefined>(undefined)
  const [activeSpokeSlug, setActiveSpokeSlug] = useState<
    CorpusSlug | undefined
  >(undefined)

  const open = useCallback((slug?: string) => {
    setActiveSlug(slug)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  // Global `?` shortcut. Suppressed if focus is inside an editable element so
  // it doesn't fight with normal typing.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== '?') return
      const target = e.target as HTMLElement | null
      if (target && isEditableTarget(target)) return
      e.preventDefault()
      setIsOpen((prev) => !prev)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const value = useMemo<DocsContextValue>(
    () => ({
      isOpen,
      open,
      close,
      activeSlug,
      activeSpokeSlug,
      setActiveSpokeSlug,
    }),
    [isOpen, open, close, activeSlug, activeSpokeSlug],
  )

  return (
    <DocsContext.Provider value={value}>
      {children}
      <DocsOverlay />
    </DocsContext.Provider>
  )
}

export function useDocs(): DocsContextValue {
  const ctx = useContext(DocsContext)
  if (!ctx) {
    throw new Error('useDocs must be used within a DocsProvider')
  }
  return ctx
}

function isEditableTarget(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  return false
}
