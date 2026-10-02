import '../voice/all'
import './index'

/**
 * Every knob group the owl has, shipped and deferred (`./index.ts`), for the Tune panel.
 * The panel lists knobs for surfaces that are not on screen, so it needs the declarations
 * of the groups no page has loaded, and the options of the knobs that name a voice, which
 * need each voice's label. Nothing the app's pages import reaches this file.
 */

import.meta.glob('./deferred/*.ts', { eager: true })
