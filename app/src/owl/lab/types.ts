import type { ComponentType } from 'react'

/**
 * One block of the owl lab. A section is a `.ts` file in `lab/sections/` whose default
 * export is an `OwlLabSection`; the lab finds it by glob and lists it in `order`, so adding
 * one edits nothing that exists. Its component goes in a `.tsx` beside it, which keeps that
 * file exporting only components (the lint rule for fast refresh).
 */
export type OwlLabSection = {
  id: string
  title: string
  /** Lower comes first. The built-in sections are 10, 20. */
  order: number
  Section: ComponentType
}
