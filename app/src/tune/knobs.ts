/**
 * Every knob in the app, in one import.
 *
 * A surface's own module registers its knobs when the surface's code loads,
 * which is enough for the page to *read* them — but not enough for the panel,
 * which should list the hub's measure while you are standing on the Explorer.
 * So the panel imports this barrel and nothing else does.
 *
 * Adding a surface is one line here plus its own `tune.ts`. Nothing in this
 * file reaches a production bundle: the panel that imports it is behind
 * `TUNE_ENABLED` and loaded dynamically.
 */

import './knobs.global'
import '@/explorer/tune'
import '@/hub/tune'
