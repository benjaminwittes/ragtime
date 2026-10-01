import { createContext } from 'react'

/**
 * The floor of the stage, once it is in the document — so that what is brought on
 * (`RecordStage`) can be put *on* it, in the theatre's own space, from a component that is
 * not inside it. The same move as the site bar's slot. Its own file because a file that
 * exports a component should export nothing else.
 */
export const StageFloor = createContext<HTMLElement | null>(null)
