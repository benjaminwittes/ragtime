import type { CSSProperties, ReactNode } from 'react'
import { SPEECH_SITES } from './embeds'
import { join, siteOwl, useSite, type SpotOptions } from './site'
import type { OwlSiteId } from './types'
import { useChosenVoice } from './voice/choice'
import { SpeechSlot } from './voice/slot'

/**
 * `OwlSpot` for a page that wraps the owl in a figure of its own. Returns the props
 * `SurfaceIntro` takes — the owl, the wrapper's classes and the wrapper's size
 * properties — for a site whose table entry (`embeds.ts`) has a `figureClassName`:
 *
 *     const owl = useOwlFigure('hub', { lantern: loading ? 'searching' : 'dark' })
 *     <SurfaceIntro {...owl} … />
 *
 * `SurfaceIntro` keeps naming the wrapper for the view transition, which is why this
 * does not render one. With a voice the wrapper gains the `owl-spot` class and the speech
 * is rendered inside it, as `OwlSpot` does; without one, nothing is added.
 */
export function useOwlFigure(
  id: OwlSiteId,
  options: SpotOptions = {},
): { figure: ReactNode; figureClassName: string | undefined; figureStyle: CSSProperties } {
  const { site, vars, variant: sited } = useSite(id)
  const variant = options.variant ?? sited
  const speaking = useChosenVoice(variant) !== null
  return {
    figure: (
      <>
        {siteOwl(site, { ...options, sited, className: site.className })}
        {speaking ? <SpeechSlot site={SPEECH_SITES[id]} variant={variant} occasion={options.occasion} /> : null}
      </>
    ),
    figureClassName: join(site.figureClassName, speaking && 'owl-spot'),
    figureStyle: vars,
  }
}
