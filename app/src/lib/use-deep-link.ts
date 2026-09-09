import { useEffect, useMemo, useRef } from 'react'
import type { DeepLinkedDocument } from './deep-link'
import type { ParsedLink } from './links'
import { readDeepLink } from './routing'

/** The deep link this shell was mounted on, read once (see `readDeepLink`). */
export function useDeepLink(): ParsedLink | null {
  return useMemo(() => readDeepLink(), [])
}

/**
 * `/corpus/:slug/:id` → open that document's detail sheet once, on mount,
 * through the shell's own id resolver — the same path its more-like-this and
 * citation opens take, so the sheet arrives with a full row. Ref-guarded
 * against StrictMode's dev double-invoke, like the `?q=` carryover.
 *
 * A link that names no document is a no-op. A resolver that fails (an id the
 * corpus no longer has, a network error) leaves the user on the workspace,
 * which is where the Explorer's handoff landed before this route existed.
 */
export function useOpenDeepLinkedDocument(
  open: (doc: DeepLinkedDocument) => void | Promise<void>,
): void {
  const link = useDeepLink()
  const openedRef = useRef(false)
  useEffect(() => {
    if (openedRef.current || !link?.id) return
    openedRef.current = true
    const doc: DeepLinkedDocument = { slug: link.slug, id: link.id }
    void (async () => open(doc))().catch(() => {
      // Best-effort: the workspace is the landing either way.
    })
    // Mount-only: the link and the resolver are stable for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
