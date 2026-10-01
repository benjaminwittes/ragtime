import type { OwlVoice } from '../types'

/**
 * The night watch: hushed, unhurried, a keeper of the building after hours. Short plain
 * sentences with a little lamplight in them, but nothing that says the owl has done more
 * than the page has reported. Draft copy for editorial review.
 */
export default {
  id: 'night-watch',
  label: 'Night watch',
  note: 'Quiet and unhurried, as in an empty building. A lamp, a door, a hush.',
  treatment: 'plate',
  lines: {
    'arrive-hub': ['The lamp is lit.', 'The building is quiet.', 'Take a seat.'],
    'arrive-gate': ['The door is kept.', 'Code, if you have it.', 'Knock with the code.'],
    'explorer-empty': ['Ask quietly.', 'Take your time with it.', 'The lamp is lit. Ask.'],
    'stage-quiet': ['The house is dark.', 'The hall is empty.', 'Lights are down.'],
    'not-found': ['This corridor ends.', 'Wrong door.', 'Nothing at this address.'],
    searching: ['Lantern up.', 'Lamp raised.', 'Hold the lamp.'],
    'search-empty': ['Nothing came back.', 'Nothing answered.', 'The search came back empty.'],
    'search-results': ['Something came back.', 'Come and see.', 'It is below.'],
    working: ['Lamp up. Working.', 'One moment more.', 'Still at it.'],
    answered: ['It is set down.', 'That is the answer.', 'Written above.'],
    'wrong-code': ['The lock holds.', 'The code was not right.', 'That key does not turn.'],
    night: ['It is late. The lamp is lit.', 'Night hours.', 'The lantern is lit.'],
    idle: ['It is quiet.', 'Nothing stirs.', 'The hour passes.'],
    poke: ['Mind the lantern.', 'Shh.', 'Quietly.'],
  },
} satisfies OwlVoice
