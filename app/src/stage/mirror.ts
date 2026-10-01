/**
 * Showing the presenter's page on the stage as a page, not as a picture of one.
 *
 * A screen share sends pixels: text nobody can select, links nobody can follow, at
 * whatever size the presenter's window happened to be. This sends the markup instead. The
 * stage is the same app with the same stylesheet, so the presenter's markup laid out in a
 * reader's own window *is* the interface — real text, hover states, links that open — at
 * the reader's own width. What it is not is live: there is no React behind it, so a
 * button does nothing and a field cannot be typed in. The presenter drives; the room reads.
 *
 * It also costs the service nothing. A stage that re-ran the presenter's search in every
 * reader's browser would send the Worker one request per reader per query, from a room
 * that may share one address and one rate limit. A mirrored page makes no requests at all.
 *
 * Three rules, each with a reason:
 *
 * - **Some things are never sent.** A password field's value, an email field's value, and
 *   anything inside `[data-stage-private]` — the AI access sheet, which shows an account
 *   and a balance. The presenter may open those on stage; the room sees that a private
 *   panel is open and not what is in it. `[data-stage-skip]` is left out entirely: that is
 *   the presenter's own dock.
 * - **What arrives is cleaned before it is drawn**, although it is signed: a stage that
 *   inserted whatever a keyholder sent would make the kit's passphrase a way to run script
 *   in every reader's session, and it should only ever be a way to present.
 * - **The page is morphed, not replaced.** A streaming answer is a new frame several times
 *   a second. Replacing the markup each time would drop the reader's hover, their text
 *   selection and every scroll position; changing only what changed keeps all three.
 */

import { GAZE_X, GAZE_Y, OWL_ATTR, lookOwlAt } from '@/owl/contract'

/**
 * Never in a frame, and removed again on arrival. One list for both ends on purpose: a
 * path (`pathOf`) counts the children a frame keeps, so the two ends must agree on which
 * those are, or every scroll and every pointer lands one element off.
 */
const NEVER = 'script,noscript,template,link,meta,base,iframe,frame,object,embed,canvas,style'

/** Left out of a frame altogether: the above, and whatever the presenter's side marks. */
const SKIP = `${NEVER},[data-stage-skip]`

/** Kept as a box, with its contents replaced by a sentence. */
const PRIVATE = '[data-stage-private]'

export const PRIVATE_SAID = 'The presenter has a private panel open.'

/** How far down an element is scrolled, as a fraction, written where the stage can read it. */
const Y = 'data-stage-y'

export type Captured = { html: string; cls: string; vars: Record<string, string> }

function isSkipped(el: Element): boolean {
  return el.matches(SKIP)
}

function fraction(top: number, height: number, client: number): number {
  const room = height - client
  return room > 0 ? Math.round((top / room) * 10_000) / 10_000 : 0
}

/** One picture of a document's body, ready to pack and send. */
export function capture(doc: Document): Captured {
  const copy = doc.body.cloneNode(true) as HTMLElement
  // The clone has the same shape as the page, so the two are walked together: the live
  // side is read for what markup does not carry (a typed value, a scroll position), the
  // copy is written. Removals wait until the walk is over so the shapes stay aligned.
  const drop: Element[] = []
  const walk = (live: Element, made: Element) => {
    if (isSkipped(live)) {
      drop.push(made)
      return
    }
    if (live.matches(PRIVATE)) {
      made.textContent = PRIVATE_SAID
      made.setAttribute('data-stage-private', 'shown')
      return
    }
    if (live instanceof HTMLInputElement) {
      const secret = live.type === 'password' || live.type === 'email'
      if (live.type === 'checkbox' || live.type === 'radio') made.toggleAttribute('checked', live.checked)
      else made.setAttribute('value', secret ? '' : live.value)
    } else if (live instanceof HTMLTextAreaElement) {
      made.textContent = live.value
    } else if (live instanceof HTMLOptionElement) {
      made.toggleAttribute('selected', live.selected)
    }
    // Where the owl is looking is the presenter's pointer, sixty times a second. That is
    // not a new picture of the page: the stage is told where the pointer is anyway, and
    // turns its own owl's eyes to it (`lookAt`). Left in, every move of the mouse over a
    // page with the owl on it would send the page again.
    if (live.hasAttribute(OWL_ATTR)) {
      const style = (made as Element & ElementCSSInlineStyle).style
      style.removeProperty(GAZE_X)
      style.removeProperty(GAZE_Y)
      if (made.getAttribute('style') === '') made.removeAttribute('style')
    }
    if (live.scrollTop > 0) made.setAttribute(Y, String(fraction(live.scrollTop, live.scrollHeight, live.clientHeight)))
    // An id is unique in a document, and the stage is a document with ids of its own.
    if (made.id === 'root') made.removeAttribute('id')
    for (let i = 0; i < live.children.length; i += 1) walk(live.children[i], made.children[i])
  }
  for (let i = 0; i < doc.body.children.length; i += 1) walk(doc.body.children[i], copy.children[i])
  for (const el of drop) el.remove()

  const root = doc.documentElement
  const vars: Record<string, string> = {}
  for (let i = 0; i < root.style.length; i += 1) {
    const name = root.style.item(i)
    if (name.startsWith('--')) vars[name] = root.style.getPropertyValue(name)
  }
  return { html: copy.innerHTML, cls: root.className, vars }
}

/**
 * Where an element is, as the stage can find it again: the index of each ancestor among
 * its parent's children, counting only the children a frame keeps. `[]` is the page
 * itself. Null when the element is not in a frame at all — skipped, or inside something
 * private — because the stage has nothing there to point at.
 */
export function pathOf(el: Element, body: Element): number[] | null {
  const path: number[] = []
  let at: Element | null = el
  while (at && at !== body) {
    const parent: Element | null = at.parentElement
    if (!parent || isSkipped(at) || parent.matches(PRIVATE)) return null
    let index = 0
    for (const sibling of parent.children) {
      if (sibling === at) break
      if (!isSkipped(sibling)) index += 1
    }
    path.unshift(index)
    at = parent
  }
  return at === body ? path : null
}

/** The element a path names, under the stage's own root. */
export function resolve(root: Element, path: number[]): Element | null {
  let at: Element | undefined = root
  for (const index of path) {
    at = at.children[index]
    if (!at) return null
  }
  return at
}

const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'poster']

/**
 * A frame's markup → elements safe to put in this document. No script, no frames, no
 * inline handlers, no `javascript:` anywhere a URL goes. Then made the stage's own: every
 * link opens in a new tab, because the page a reader is following is the one page a click
 * must not take them away from, and every field is read-only.
 */
export function clean(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  for (const el of doc.body.querySelectorAll(NEVER)) el.remove()
  for (const el of doc.body.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || name === 'srcdoc' || name === 'autofocus') el.removeAttribute(attr.name)
      else if (URL_ATTRS.includes(name) && /^\s*(javascript|vbscript|data:text\/html)/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
    if (el instanceof HTMLAnchorElement && el.hasAttribute('href')) {
      el.target = '_blank'
      el.rel = 'noopener noreferrer'
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.readOnly = true
      el.tabIndex = -1
    } else if (el instanceof HTMLSelectElement) {
      el.tabIndex = -1
    }
  }
  return doc.body
}

function syncAttributes(live: Element, next: Element): void {
  for (const attr of [...live.attributes]) {
    if (next.hasAttribute(attr.name)) continue
    live.removeAttribute(attr.name)
    // An element is reused for whatever is now in its place, and it would keep the scroll
    // of what was there before.
    if (attr.name === Y) live.scrollTop = 0
  }
  for (const attr of [...next.attributes]) {
    if (live.getAttribute(attr.name) !== attr.value) live.setAttribute(attr.name, attr.value)
  }
  // A field's `value` attribute is only its starting value; what is shown is the property.
  if (live instanceof HTMLInputElement && next instanceof HTMLInputElement) {
    if (live.type === 'checkbox' || live.type === 'radio') live.checked = next.hasAttribute('checked')
    else if (live.value !== (next.getAttribute('value') ?? '')) live.value = next.getAttribute('value') ?? ''
  }
}

/**
 * Make `live`'s children the same as `next`'s, touching as little as possible. Children
 * are matched by position: the pages this mirrors mostly grow at the end (an answer
 * streaming in, results arriving), which is the case position handles best.
 */
export function morph(live: Element, next: Element, doc: Document = live.ownerDocument): void {
  const want = [...next.childNodes]
  for (let i = 0; i < want.length; i += 1) {
    const b = want[i]
    const a = live.childNodes[i]
    if (!a) {
      live.appendChild(doc.importNode(b, true))
    } else if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) {
      live.replaceChild(doc.importNode(b, true), a)
    } else if (a instanceof Element && b instanceof Element) {
      syncAttributes(a, b)
      if (a instanceof HTMLTextAreaElement) a.value = b.textContent ?? ''
      else morph(a, b, doc)
    } else if (a.nodeValue !== b.nodeValue) {
      a.nodeValue = b.nodeValue
    }
  }
  while (live.childNodes.length > want.length) live.removeChild(live.lastChild as ChildNode)
}

/** Put every scrolled element in a frame where the presenter had it. */
export function applyScrolls(root: Element): void {
  for (const el of root.querySelectorAll(`[${Y}]`)) {
    scrollToFraction(el, Number(el.getAttribute(Y)))
  }
}

export function scrollToFraction(el: Element, y: number): void {
  if (!Number.isFinite(y)) return
  el.scrollTop = y * (el.scrollHeight - el.clientHeight)
}

/**
 * Turn every owl on the mirrored page to look at a point in the window — where the
 * presenter is pointing — or straight ahead when they are pointing nowhere. On the
 * presenter's own page the owl follows the presenter's pointer; on the stage it follows
 * the same pointer, so the room's owl is looking at what the presenter is showing them.
 */
export function lookAt(root: Element, at: { x: number; y: number } | null): void {
  // The owl is read for how far its pupils may travel as well as where its eyes are: that
  // arrives in the frame, in the owl's own style attribute (`@/owl/contract`).
  for (const owl of root.querySelectorAll<SVGSVGElement>(`svg[${OWL_ATTR}]`)) lookOwlAt(owl, at)
}

/** How far down the window is, as the same fraction a frame uses for an element. */
export function windowFraction(win: Window): number {
  const page = win.document.documentElement
  return fraction(win.scrollY, page.scrollHeight, win.innerHeight)
}
