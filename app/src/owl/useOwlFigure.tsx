import type { CSSProperties, ReactNode } from 'react'
import { join, siteOwl, useSite, type SpotOptions } from './site'
import { OwlSpeech } from './speech'
import type { OwlSiteId } from './types'

/**
 * `OwlSpot` for a page that wraps the owl in a figure of its own. Returns the props
 * `SurfaceIntro` takes — the owl, the wrapper's classes and the wrapper's size
 * properties — for a site whose table entry (`embeds.ts`) has a `figureClassName`:
 *
 *     const owl = useOwlFigure('hub', { lantern: loading ? 'searching' : 'dark' })
 *     <SurfaceIntro {...owl} … />
 *
 * `SurfaceIntro` keeps naming the wrapper for the view transition, which is why this
 * does not render one.
 */
export function useOwlFigure(
  id: OwlSiteId,
  options: SpotOptions = {},
): { figure: ReactNode; figureClassName: string | undefined; figureStyle: CSSProperties } {
  const { site, vars, variant: sited } = useSite(id)
  const speaking = options.speech !== undefined
  return {
    figure: (
      <>
        {siteOwl(site, { ...options, sited, className: site.className })}
        {speaking ? <OwlSpeech>{options.speech}</OwlSpeech> : null}
      </>
    ),
    figureClassName: join(site.figureClassName, speaking && 'owl-spot'),
    figureStyle: vars,
  }
}
