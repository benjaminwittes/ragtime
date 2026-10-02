import './index'

/**
 * Every knob group the owl has, shipped and deferred (`./index.ts`), for the Tune panel.
 * The panel lists knobs for surfaces that are not on screen, so it needs the declarations
 * of the groups no page has loaded. Nothing the app's pages import reaches this file.
 */

import.meta.glob('./deferred/*.ts', { eager: true })
