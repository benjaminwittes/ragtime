import type { ComponentType } from 'react'

import { HoldingsFigure } from './HoldingsFigure.tsx'

/**
 * Figures: the diagrams a presenter can put on stage, drawn live in each reader's own
 * browser.
 *
 * A slide is the same words for everyone. A figure is a small working thing: the reader
 * can hover it, tab through it and follow a link out of it while the presenter talks, and
 * what one reader is looking at is not what the next one is. So a figure is not sent — it
 * is named, and every browser draws its own from the build it already has, with whatever
 * live numbers it fetches for itself.
 *
 * Two ways onto the stage: the console puts one up whole, and a slide can hold one in a
 * fenced block (` ```figure ` then the name), with the slide's words around it.
 *
 * Every measure in a figure is in `cqw`, like a slide's: it is the same picture on a phone
 * and on a projector, and inside a slide it is the slide's width that it scales to.
 *
 * To add one: write the component, and name it here.
 */
export type FigureEntry = {
  /** What the console calls it. */
  title: string
  Figure: ComponentType
}

/** The figures this build knows. */
export const FIGURES: Record<string, FigureEntry> = {
  holdings: { title: 'What RAGtime holds', Figure: HoldingsFigure },
}

export function figureNamed(name: string): FigureEntry | undefined {
  return Object.hasOwn(FIGURES, name) ? FIGURES[name] : undefined
}
