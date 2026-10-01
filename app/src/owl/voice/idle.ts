/**
 * Calls `onIdle` each time the reader has done nothing — no pointer, key, touch or scroll —
 * for `ms`, and again after another `ms` of the same. Returns its own cleanup. Not called
 * while the tab is hidden: nobody is there to be spoken to.
 *
 * One timer, re-armed for the time that is left, rather than one reset per pointer move.
 */
export function watchIdle(ms: number, onIdle: () => void): () => void {
  let last = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined

  const arm = (after: number) => {
    timer = setTimeout(check, Math.max(250, after))
  }
  function check() {
    const quiet = Date.now() - last
    if (quiet >= ms) {
      if (!document.hidden) onIdle()
      last = Date.now()
      arm(ms)
    } else {
      arm(ms - quiet)
    }
  }
  const touch = () => {
    last = Date.now()
  }

  const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
  for (const name of events) window.addEventListener(name, touch, { passive: true, capture: true })
  arm(ms)
  return () => {
    clearTimeout(timer)
    for (const name of events) window.removeEventListener(name, touch, { capture: true })
  }
}
