import { heardKey, shouldSpeak } from './config'
import { pickLine, remember } from './select'
import { OCCASIONS, type OccasionId, type OwlVoice, type SpeechSite, type VoiceConfig } from './types'

/**
 * The owl's speaking, as a small object with timers and no React: given what the voice,
 * the panel and the site say right now (`input`), it decides when a line goes up and when it
 * comes down, and tells whoever is listening (`emit`). `useOwlVoice` is the one place that
 * wires it to a component; tests drive it with fake timers (`speaker.test.ts`).
 *
 *   - `schedule(occasion)`: something true has happened. After the delay the line is said,
 *     unless the rules (`shouldSpeak`) now say otherwise. A newer `schedule` replaces one
 *     that is still waiting.
 *   - A line stands for the dwell, then comes down by itself. A new one replaces it.
 *   - `say(occasion)` is the reader's own doing — a click, or a lab button — and is not
 *     delayed or rationed.
 */

export type Spoken = {
  /** Changes with every line, so a component can key on it and start a fresh reveal. */
  key: number
  text: string
  occasion: OccasionId
  announce: boolean
}

export type SpeakerInput = {
  voice: OwlVoice | null
  config: VoiceConfig
  site: SpeechSite
}

/** What a speaker remembers between lines, and for how long. */
export type Memory = {
  /** Keys (`heardKey`) of what has been said this session. */
  heard: { has(key: string): boolean; add(key: string): void }
  /** The lines last said, per voice and occasion, oldest first. */
  recent: Map<string, string[]>
  roll(): number
}

const SESSION_KEY = 'ragtime.owl.voice.heard'

/** The session's own memory: what was heard survives a reload of the tab, and goes with the tab. */
export function sessionMemory(): Memory {
  return {
    heard: {
      has: (key) => readHeard().includes(key),
      add: (key) => {
        const seen = readHeard()
        if (seen.includes(key)) return
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify([...seen, key]))
        } catch {
          // Private mode or quota: once-per-session then holds for this page view only.
          memoryHeard.add(key)
        }
      },
    },
    recent: SHARED_RECENT,
    roll: Math.random,
  }
}

const SHARED_RECENT = new Map<string, string[]>()
const memoryHeard = new Set<string>()

function readHeard(): string[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    const stored = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
    return [...stored, ...memoryHeard]
  } catch {
    return [...memoryHeard]
  }
}

const ANNOUNCED = new Set<OccasionId>(OCCASIONS.filter((o) => o.announce).map((o) => o.id))

export class Speaker {
  private input: SpeakerInput
  private waiting: ReturnType<typeof setTimeout> | undefined
  private standing: ReturnType<typeof setTimeout> | undefined
  private count = 0
  private current: Spoken | null = null

  private emit: (spoken: Spoken | null) => void
  private memory: Memory

  constructor(input: SpeakerInput, emit: (spoken: Spoken | null) => void, memory: Memory) {
    this.input = input
    this.emit = emit
    this.memory = memory
  }

  /** What the voice, the panel and the site say now. Called on every render, so a line due later is judged by the latest. */
  update(input: SpeakerInput): void {
    this.input = input
  }

  /** A line is up. */
  get shown(): boolean {
    return this.current !== null
  }

  schedule(occasion: OccasionId): void {
    this.cancel()
    if (!this.allowed(occasion)) return
    this.waiting = setTimeout(() => {
      this.waiting = undefined
      // The panel can have changed while the line waited; the rules are asked again.
      if (this.allowed(occasion)) this.speak(occasion)
    }, this.input.config.delayMs)
  }

  /** Right now, and not counted against once-per-session. For the reader's own doing. */
  say(occasion: OccasionId): void {
    this.cancel()
    this.speak(occasion)
  }

  /** A click on the owl: takes down the line that is up, or else says one. */
  poke(): void {
    if (this.current) this.dismiss()
    else if (this.input.config.poke && this.input.site.occasions.includes('poke')) this.say('poke')
  }

  /** The reader has been away for the idle interval. Said only if nothing is up or waiting (a line due for a true state comes first) and the rules allow it. */
  idle(): void {
    if (!this.current && !this.waiting && this.allowed('idle')) this.say('idle')
  }

  /**
   * The state a line was about has ended (a search came back, a refused code was typed
   * over): takes that line down if it is the one up, and leaves any other. A line that
   * says "pending" must not outlive the wait.
   */
  retire(occasion: OccasionId): void {
    if (this.current?.occasion === occasion) this.dismiss()
  }

  /** Drops a line still waiting for its delay. A line already up is left to its dwell. */
  cancel(): void {
    clearTimeout(this.waiting)
    this.waiting = undefined
  }

  dismiss(): void {
    this.cancel()
    clearTimeout(this.standing)
    this.standing = undefined
    if (this.current) {
      this.current = null
      this.emit(null)
    }
  }

  private allowed(occasion: OccasionId): boolean {
    const { voice, config, site } = this.input
    return shouldSpeak({ voice, occasion, config, site, heard: this.memory.heard })
  }

  private speak(occasion: OccasionId): void {
    const { voice, config } = this.input
    if (!voice) return
    const key = `${voice.id}/${occasion}`
    const recent = this.memory.recent.get(key) ?? []
    const text = pickLine(voice, occasion, recent, this.memory.roll())
    if (text === null) return
    this.memory.recent.set(key, remember(recent, text))
    this.memory.heard.add(heardKey(voice, occasion))
    this.current = { key: ++this.count, text, occasion, announce: ANNOUNCED.has(occasion) }
    this.emit(this.current)
    clearTimeout(this.standing)
    this.standing = setTimeout(() => this.dismiss(), config.dwellMs)
  }
}
