/**
 * The vocabulary of the owl's voice, in one file so the voices (`voices/`), the pure rules
 * (`select.ts`, `config.ts`, `fit.ts`) and the components can all import it without
 * importing each other.
 *
 * A voice is data: who is speaking, how it is set on the page, and what it says on each
 * occasion. An occasion is a state the owl is really in. The list is closed and typed, so a
 * voice cannot be written for a moment the app has no way to report, and a page cannot
 * announce one that is not in the list.
 */

/* -------------------------------------------------------------------------- */
/* Occasions                                                                   */
/* -------------------------------------------------------------------------- */

export type Occasion = {
  id: string
  /** For people: the knob's label and the lab's heading. */
  label: string
  /** What has to be true for the owl to say it, and which code reports it. */
  when: string
  /**
   * Whether the line goes to a screen reader. Only a reply to something the reader just
   * did is announced (a refused code, an empty result, an answer that has landed); the
   * rest is colour, and a polite live region is not the place for colour.
   */
  announce: boolean
}

/**
 * Every moment the owl can speak, and the one state that makes each true. Nothing here is
 * inferred: each is a fact a page already holds and passes in (`OwlSpot`'s `occasion`), or
 * the owl's own mount, the reader's clock, or the reader's own input.
 */
export const OCCASIONS = [
  {
    id: 'arrive-hub',
    label: 'Hub: arrives',
    when: 'The hub’s first screen has mounted.',
    announce: false,
  },
  {
    id: 'arrive-gate',
    label: 'Gate: arrives',
    when: 'The access gate is on screen.',
    announce: false,
  },
  {
    id: 'explorer-empty',
    label: 'Explorer: empty',
    when: 'The Explorer is showing its empty state: no question has been asked in this conversation.',
    announce: false,
  },
  {
    id: 'stage-quiet',
    label: 'Stage: nobody presenting',
    when: 'The stage is showing its empty screen.',
    announce: false,
  },
  {
    id: 'not-found',
    label: 'Not found',
    when: 'The address matches no page.',
    announce: false,
  },
  {
    id: 'searching',
    label: 'A search is out',
    when: 'The hub’s search is waiting on the worker (the lantern’s own searching state).',
    announce: false,
  },
  {
    id: 'search-empty',
    label: 'Search came back empty',
    when: 'The hub’s search returned, and every corpus reported a count of zero.',
    announce: true,
  },
  {
    id: 'search-results',
    label: 'Search came back',
    when: 'The hub’s search returned, and at least one corpus reported a count above zero.',
    announce: false,
  },
  {
    id: 'working',
    label: 'Explorer: working',
    when: 'An Explorer turn is running and no word of the answer has arrived (the row that carries the working label).',
    announce: false,
  },
  {
    id: 'answered',
    label: 'Explorer: answered',
    when: 'The last Explorer turn has ended, with an answer and without an error.',
    announce: true,
  },
  {
    id: 'wrong-code',
    label: 'Gate: wrong code',
    when: 'The access code just entered was refused.',
    announce: true,
  },
  {
    id: 'night',
    label: 'After dark',
    when: 'The owl keeps hours here and arrived inside its night window by the reader’s clock, which is when its lantern is lit unasked.',
    announce: false,
  },
  {
    id: 'idle',
    label: 'Long idle',
    when: 'The reader has not touched the page, by pointer, key or scroll, for the idle interval.',
    announce: false,
  },
  {
    id: 'poke',
    label: 'Clicked',
    when: 'The reader clicked or tapped the owl.',
    announce: false,
  },
] as const satisfies readonly Occasion[]

export type OccasionId = (typeof OCCASIONS)[number]['id']

export const OCCASION_IDS: readonly OccasionId[] = OCCASIONS.map((o) => o.id)

/** The occasions that are the reader's doing or the clock's, not a page's state, and are never "once per session". */
export const REPEATING: readonly OccasionId[] = ['idle', 'poke']

/* -------------------------------------------------------------------------- */
/* Treatments and places                                                       */
/* -------------------------------------------------------------------------- */

export const TREATMENT_IDS = ['plate', 'typed', 'stamp', 'lines'] as const
export type TreatmentId = (typeof TREATMENT_IDS)[number]

/** How a line is set on the page. The type and rules are `voice.css`, keyed on `data-treatment`. */
export type Treatment = {
  id: TreatmentId
  label: string
  /** One line, shown beside the treatment in the lab. */
  note: string
}

/**
 * Where the speech goes, relative to the owl's box. `beside` is to its right, and flips to
 * its left when there is no room; `below` and `above` centre on it. `inline` is in the
 * flow, for a row that is already a line of text (the Explorer's working row).
 */
export type SpeechPlace = 'beside' | 'beside-start' | 'below' | 'above' | 'inline'

/** What an embed site says about its owl's speech. The table is `SPEECH_SITES` in `embeds.ts`. */
export type SpeechSite = {
  place: SpeechPlace
  /** The occasion the owl speaks on arriving, when there is one. */
  arrival: OccasionId | null
  /** Every occasion this site can truthfully report. The owl is silent on any other here. */
  occasions: readonly OccasionId[]
  /** Does the owl keep late hours here (so `night` can take the place of the arrival line)? */
  keepsHours: boolean
}

/* -------------------------------------------------------------------------- */
/* Voices                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One voice. `lines` holds the copy, by occasion; an occasion a voice has no line for is
 * one it stays silent on. Every voice file is draft copy for editorial review, and the
 * copy is the only thing in it that is not structure.
 */
export type OwlVoice = {
  id: string
  label: string
  /** The register, in a line, for the panel and the lab. */
  note: string
  /** How this voice is set unless a knob overrides it. */
  treatment: TreatmentId
  lines: Partial<Record<OccasionId, readonly string[]>>
}

/* -------------------------------------------------------------------------- */
/* Config                                                                      */
/* -------------------------------------------------------------------------- */

/** What the Tune panel's Voice group says, read into one value (`config.ts`). */
export type VoiceConfig = {
  /** The voice picked in the panel, or null for none. */
  voice: string | null
  /** The occasions switched on. */
  enabled: ReadonlySet<OccasionId>
  /** Milliseconds from the occasion to the first letter. */
  delayMs: number
  /** Milliseconds a line stands once it is up. */
  dwellMs: number
  /** Each occasion at most once a session, per voice. */
  oncePerSession: boolean
  /** A click or tap on the owl speaks, or dismisses what is up. */
  poke: boolean
  /** Seconds without input before `idle`; the occasion has its own switch. */
  idleSeconds: number
  /** The treatment that wins over the voice's own, or null to follow the voice. */
  treatment: TreatmentId | null
  /** Milliseconds per letter when a line is typed out; 0 puts it up whole. */
  typeMs: number
  /** Whether the owl stands in the Explorer's conversation. */
  chat: ChatMode
}

export type ChatMode = 'off' | 'row'
