import { provideStandingKit } from '../index'
import * as kit from './kit'

/**
 * The standing code, loaded now instead of when a design first asks, for what looks at all of
 * the behaviours at once: the lab and the tests. Nothing the app's pages import reaches this
 * file.
 *
 * Importing it hands the code to the registry, so a design is resolved on its first render
 * and a host starts without a fetch.
 */

provideStandingKit(kit)

export const { getStanding, standingIds, standingList } = kit
