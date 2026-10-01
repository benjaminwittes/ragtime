/**
 * The guided tour: what it says, what it points at, and where the card goes.
 *
 * A tour is a short list of steps, each pointing at a real control on the page rather than
 * at a picture of one. This file is the whole of it that can be decided without a browser
 * — the words, the order, the selector each step looks for, and the arithmetic that keeps
 * the card on the screen — so all of it is plain data and plain functions, and
 * `steps.test.ts` holds it. `Tour.tsx` reads these and types no words of its own.
 *
 * The order is the order a first visit takes: what this is, the box, the choice the box
 * offers, the collections under it, then the three controls in the site bar, and last the
 * way to use it from somewhere else. Three ways to work, least to most: search with no
 * AI, the Explorer with it, and RAGtime inside the AI tool a reader already has.
 *
 * **The words say "collection".** The page's own headings still say corpus; a reader on
 * their first visit has no use for the word, and the tour is who they meet first.
 *
 * **The words state no counts.** How many collections there are, and how many records
 * they hold, changes when one is added. Every figure elsewhere on the site is read from
 * the worker for that reason, and a tour that typed one would be the page that went stale.
 */

/** One step. Only `id`, `title` and `body` are required: a step may point at nothing. */
export type TourStep = {
  /** Stable name. The e2e driver finds a step by it; nothing else reads it. */
  id: string
  title: string
  /** One or two sentences, each its own paragraph. */
  body: readonly string[]
  /**
   * What to point at. A step with no selector, or whose selector matches nothing on the
   * page, shows its card in the middle of the window with no ring.
   */
  target?: string
  /** The logical path the step needs to be on. The tour goes there before it looks. */
  route?: string
  /** A link to one docs entry, by slug. */
  link?: { label: string; docs: string }
}

/** The words that are not a step's own. */
export const TOUR = {
  start: 'Take the tour',
  label: 'A tour of RAGtime',
  back: 'Back',
  next: 'Next',
  done: 'Done',
  close: 'End the tour',
  position: (step: number, of: number) => `${step} of ${of}`,
} as const

export const STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to RAGtime',
    body: [
      'One place to search the public record of American government.',
      'Search is free. This tour shows you where things are.',
    ],
  },
  {
    id: 'search',
    title: 'Search every collection at once',
    body: [
      'Type a phrase here and press Enter.',
      'RAGtime looks for your words in every collection. No AI runs, and it costs nothing.',
    ],
    // The form, not the panel round it: the panel runs the width of the page, and a
    // ring that wide points at the hero rather than at the box in it.
    target: '#hub-ask form',
    route: '/',
  },
  {
    id: 'modes',
    title: 'Search, or the Explorer',
    body: [
      'Search finds your words in the record.',
      'The Explorer answers a question with AI. It shows every step it took and what each step cost.',
    ],
    target: '[role="tablist"][aria-label="What the box does"]',
    route: '/',
  },
  {
    id: 'collections',
    title: 'Open one collection',
    body: [
      'Each collection has its own page.',
      'That page has its own filters and its own way to read a document.',
    ],
    target: '#corpora',
    route: '/',
  },
  {
    id: 'access',
    title: 'AI access',
    body: [
      'AI features need access: a demo password, a sign-in, or your own key.',
      'Search never needs any of them.',
    ],
    target: 'button[aria-label="Configure AI access"]',
  },
  {
    id: 'docs',
    title: 'Docs',
    body: [
      'Docs say what each collection holds and how each mode works.',
      'Press ? to open them from any page.',
    ],
    target: 'button[aria-label="Open documentation overlay"]',
  },
  {
    id: 'feedback',
    title: 'Feedback',
    body: [
      'Say what is wrong, and point at it if you can.',
      'Your note goes to the people who build RAGtime.',
    ],
    target: '[data-feedback="open"]',
  },
  {
    id: 'claude',
    title: 'Use RAGtime inside Claude',
    body: ['You can also connect RAGtime to Claude and ask from your own chats.'],
    link: { label: 'How to connect', docs: 'connecting-claude' },
  },
]

/**
 * Whether this page was opened by a link that asks for the tour: `?tour` with any value
 * but `0`. The same rule the feedback panel's link follows (`feedback/point.ts`), so the
 * two read alike in an address.
 */
export function tourRequested(search: string): boolean {
  const value = new URLSearchParams(search).get('tour')
  return value !== null && value !== '0'
}

/**
 * The same query without the request, as a string that can be put straight after a path:
 * empty, or beginning with `?`. Ending the tour writes this to the address bar, so a
 * reload — or a copied link — does not start it again.
 */
export function withoutTour(search: string): string {
  const params = new URLSearchParams(search)
  params.delete('tour')
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** A rectangle in the window's own coordinates, as `getBoundingClientRect` gives one. */
export type Box = { top: number; left: number; width: number; height: number }
export type Size = { width: number; height: number }

/** Air between the card and the thing it points at, and between the card and the edge. */
export const GAP = 12
export const MARGIN = 12

/**
 * Where the card goes, given what it points at.
 *
 * Under the target when there is room, above it when there is not, and when there is room
 * for neither — a target taller than the window, which the collections list always is —
 * at the foot of the window, over the target's lower part. Never off the screen: a card
 * a reader has to scroll to find is a tour that has stopped.
 *
 * Sideways it starts at the target's left edge and is pushed back inside the window, which
 * for the controls at the right of the site bar means it ends flush with the right margin.
 * With nothing to point at, it sits in the middle.
 */
export function placeCard(target: Box | null, card: Size, viewport: Size): { top: number; left: number } {
  const maxLeft = Math.max(MARGIN, viewport.width - card.width - MARGIN)
  const maxTop = Math.max(MARGIN, viewport.height - card.height - MARGIN)
  const within = (value: number, max: number) => Math.min(Math.max(value, MARGIN), max)

  if (target === null) {
    return {
      top: within((viewport.height - card.height) / 2, maxTop),
      left: within((viewport.width - card.width) / 2, maxLeft),
    }
  }

  const below = target.top + target.height + GAP
  const above = target.top - GAP - card.height
  const top = below + card.height <= viewport.height - MARGIN ? below : above >= MARGIN ? above : maxTop
  return { top: within(top, maxTop), left: within(target.left, maxLeft) }
}

/**
 * Whether a target is where a reader can see it, so the tour knows whether to scroll.
 *
 * A control is in view when all of it is. Something taller than most of the window can
 * never be all in view, so it is in view when its top is on the screen and near the top —
 * which is where scrolling to it would put it anyway, and so the test that stops the tour
 * scrolling to the same place twice.
 */
export function inView(target: Box, viewport: Size): boolean {
  if (isTall(target, viewport)) return target.top >= 0 && target.top <= viewport.height * 0.3
  return target.top >= 0 && target.top + target.height <= viewport.height
}

/** Taller than most of the window: scrolled to by its top, not its middle. */
export function isTall(target: Box, viewport: Size): boolean {
  return target.height > viewport.height * 0.8
}
