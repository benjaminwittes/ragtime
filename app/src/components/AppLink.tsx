import type { AnchorHTMLAttributes, MouseEvent } from 'react'

import { navigateTo, toHref } from '@/lib/routing'

/**
 * A link to somewhere else in this app.
 *
 * A real `href`, so the things people do to links keep working — cmd/ctrl-click and
 * middle-click open a new tab, right-click copies the address, the status bar shows where
 * it goes, and a crawler sees a URL. Only an unmodified left-click is intercepted, and
 * then it is `pushState` rather than a reload, so the page it leaves keeps its state and
 * Back really is back.
 *
 * `to` is a *logical* path (`/corpus/olc/1425`); the deploy's mount prefix is added here,
 * once, by `toHref`. Three copies of this rule existed — App's own `navigate`, the
 * masthead's link and the way back to the hub — before the Explorer's answers needed a
 * fourth; this is the one.
 */
export function AppLink({
  to,
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> & { to: string }) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    // Anything the reader modified is the browser's to answer: a new tab, a new window,
    // a download. Only the plain click is ours.
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigateTo(to)
  }
  return (
    <a href={toHref(to)} onClick={onClick} {...rest}>
      {children}
    </a>
  )
}
