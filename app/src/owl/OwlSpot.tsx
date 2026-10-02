import { SPEECH_SITES } from './embeds'
import { join, siteOwl, useSite, type SpotOptions } from './site'
import type { OwlSiteId } from './types'
import { useChosenVoice } from './voice/choice'
import { SpeechSlot } from './voice/slot'

/**
 * Where the owl is placed: the component every page mounts it through.
 *
 * A page names its site and passes only what is dynamic. What the owl is there — pose,
 * lantern policy, hours, title, classes — comes from the table in `embeds.ts`, and its
 * size and variant from the Tune panel's knobs for that site, so "how the owl is embedded
 * on this page" is one entry in one file and not a handful of literals in the page.
 *
 *     <OwlSpot site="gate" shake={wrongCode} occasion={wrongCode ? 'wrong-code' : null} />
 *
 * A site that carries its own width is an `<svg>` and nothing else. One whose entry names
 * a `figureClassName` is wrapped in that figure here. A page that already has a wrapper —
 * `SurfaceIntro`, which names it for the hub-to-Explorer view transition — takes
 * `useOwlFigure` instead (`useOwlFigure.tsx`).
 *
 * With a voice (`voice/`), the owl is also wrapped in a positioned box that holds what it
 * says. The voice is none unless the Tune panel, or a variant, picks one — so by default
 * there is no wrapper and no node, and the owl is mounted exactly as it was.
 */
export function OwlSpot({ site: id, ...options }: SpotOptions & { site: OwlSiteId }) {
  const { site, vars, variant: sited } = useSite(id)
  const variant = options.variant ?? sited
  // Whether there is a voice is known from the knob and the variant alone, so the box that
  // holds the speech is there from the first render; the speech itself arrives when its code does.
  const speaking = useChosenVoice(variant) !== null
  const speaker = speaking ? <SpeechSlot site={SPEECH_SITES[id]} variant={variant} occasion={options.occasion} /> : null

  if (site.figureClassName !== undefined) {
    // The page has no figure of its own here, so this makes the one the table describes.
    return (
      <div className={join(site.figureClassName, speaking && 'owl-spot')} style={vars}>
        {siteOwl(site, { ...options, sited, className: site.className })}
        {speaker}
      </div>
    )
  }
  if (speaking) {
    // The width moves to the box that holds the speech, and the figure fills it.
    return (
      <div className={join('owl-spot', site.className)} style={vars}>
        {siteOwl(site, { ...options, sited, className: 'w-full' })}
        {speaker}
      </div>
    )
  }
  return siteOwl(site, { ...options, sited, className: site.className, style: vars })
}
