import { reorderTunables } from '@/tune/registry'
import '../voice/all'
import './index'

/**
 * Every knob group the owl has, shipped and deferred (`./index.ts`), for the Tune panel.
 * The panel lists knobs for surfaces that are not on screen, so it needs the declarations
 * of the groups no page has loaded, and the options of the knobs that name a voice, which
 * need each voice's label. Nothing the app's pages import reaches this file.
 */

import.meta.glob('./deferred/*.ts', { eager: true })

/**
 * The panel lists groups in the order their knobs registered, and the deferred groups
 * register after the shipped ones, so what would read `Look, Variant, Sites, Voice, Engraving,
 * Motion, Standing` reads in file-name order instead, as it did when every group was one glob:
 * design, embeds, engraved, motion, standing, voice. A file is named by its base name whether
 * it is shipped or deferred. The voice's two shipped knobs are declared apart from the rest,
 * and the voice picker goes first and the chat switch last, as they did in one file.
 */
const fileOf = (file: string) => /([^/]+)\.ts$/.exec(file)![1]!

reorderTunables((all) => {
  const owl = all.filter((knob) => knob.scope === 'owl')
  const ranked = new Map(owl.map((knob) => [knob, fileOf(knob.source.file)]))
  const files = [...new Set(ranked.values())].sort()
  const place = (id: string) => (id === 'owl.voice.id' ? 0 : id === 'owl.voice.chat' ? 2 : 1)
  const key = (knob: (typeof owl)[number]) => files.indexOf(ranked.get(knob)!) * 3 + place(knob.id)
  // Stable: knobs of one file keep the order they were declared in.
  const sorted = [...owl].sort((a, b) => key(a) - key(b))
  // They go back into the slots the owl's knobs held, so the other surfaces do not move.
  let next = 0
  return all.map((knob) => (knob.scope === 'owl' ? sorted[next++]! : knob))
})
