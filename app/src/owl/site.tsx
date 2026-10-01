import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { tuneValue } from '@/tune/store'
import { SITES, siteVars, variantKnob } from './embeds'
import { Owl } from './Owl'
import { firstChoice } from './resolve'
import type { OwlLantern, OwlSite, OwlSiteId } from './types'
import { useTuneVersion } from './useOwlDesign'

/**
 * What `OwlSpot` and `useOwlFigure` share: reading a site's entry and knobs, and drawing
 * the owl they describe. Not for pages — they use one of those two.
 */

export type SpotOptions = {
  /** The lantern the page wants *now*; without it, the site's own. */
  lantern?: OwlLantern
  /** The owl saying no. Runs again each time it turns true, so a page clears it between refusals. */
  shake?: boolean
  /**
   * What the owl says, when something does (`speech.tsx`). Given, the owl is wrapped in
   * a positioned box with the speech anchored beside it; absent, the placement adds no
   * wrapper and no node.
   */
  speech?: ReactNode
  /** A variant id, ahead of the site's own choice. The lab uses it; pages do not. */
  variant?: string
}

/** What a site's knobs say right now: its size properties, and the variant it was pinned to. */
export function useSite(id: OwlSiteId): { site: OwlSite; vars: CSSProperties; variant: string | undefined } {
  const version = useTuneVersion()
  return useMemo(() => {
    const site = SITES[id]
    const picked = tuneValue(variantKnob(id))
    return {
      site,
      vars: siteVars(id, tuneValue) as CSSProperties,
      variant: firstChoice(typeof picked === 'string' ? picked : undefined, site.variant),
    }
    // Read through the store; `version` is what says it moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, version])
}

export function join(...classes: (string | false | undefined)[]): string | undefined {
  const joined = classes.filter(Boolean).join(' ')
  return joined === '' ? undefined : joined
}

/** The owl a site describes, with the classes and style the caller has decided it carries. */
export function siteOwl(
  site: OwlSite,
  options: SpotOptions & { sited: string | undefined; className: string | undefined; style?: CSSProperties },
) {
  return (
    <Owl
      pose={site.pose}
      lantern={options.lantern ?? site.lantern}
      keepsHours={site.keepsHours}
      title={site.title}
      variant={options.variant ?? options.sited}
      className={join(options.className, options.shake && 'owl-no')}
      style={options.style}
    />
  )
}
