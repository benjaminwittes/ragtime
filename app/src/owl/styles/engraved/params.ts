import type { TuneValue } from '@/tune/types'

/**
 * The engraved style's parameters as the drawing code wants them: numbers clamped to
 * something that cannot loop forever, selects narrowed to their options.
 *
 * Their defaults are not here. A knob's `value:` is the one copy (`knobs/engraved.ts`),
 * and `resolve.ts` lays a variant's `params.engraved` and whatever is tuned over it, so
 * this file only coerces what arrives.
 */

export const SCREENS = ['straight', 'displaced', 'contour', 'mixed'] as const
export type ScreenKind = (typeof SCREENS)[number]

export const GROUNDS = ['none', 'paper', 'tint'] as const
export type GroundKind = (typeof GROUNDS)[number]

export const FIDELITIES = ['draft', 'normal', 'fine'] as const
export type Fidelity = (typeof FIDELITIES)[number]

export type EngravedParams = {
  screen: ScreenKind
  /** Distance between lines, figure units. */
  pitch: number
  /** Direction of the straight screen, degrees clockwise from horizontal. */
  angle: number
  /** How far each region's own angle departs from `angle`, 0 (all one) to 1 (as the table says). */
  fan: number
  /** The finest line, figure units. */
  wmin: number
  /** The heaviest line, as a share of the spacing. */
  wmax: number
  /** Tone under which lines stop printing at all. */
  floor: number
  gamma: number
  contrast: number
  brightness: number
  /** Direction the light comes from, degrees clockwise from the right. */
  light: number
  model: number
  edge: number
  shadow: number
  grain: number
  displace: number
  contourPitch: number
  /** Tone over which a second screen at another angle starts; 1 turns it off. */
  hatch: number
  hatchAngle: number
  hatchWeight: number
  /** Tone under which a line breaks into dashes. 0 turns it off. */
  breakAt: number
  dash: number
  keyline: number
  ground: GroundKind
  ink: string
  paper: string
  fidelity: Fidelity
  /** Coarsen the screen on a small figure, so that it never asks the screen for less than a pixel. */
  adapt: boolean
  minPitchPx: number
  /** Hand wobble: how far a line wanders off true, figure units. */
  waver: number
  seed: number
}

export type ScanParams = {
  on: boolean
  /** Ink spread: blur before the threshold, figure units. */
  spread: number
  /** Edge wobble: how far the warp pushes an edge, figure units. */
  wobble: number
  wobbleScale: number
  /** 0 keeps the soft edge; 1 clips to pure ink and paper. */
  hardness: number
  /** The tone at which the clip falls, 0 to 1. Higher fattens the ink. */
  threshold: number
  speckle: number
  dropout: number
  /** Degrees. The whole figure turns, as on a page fed in crooked. */
  skew: number
  generations: number
  paperTone: string
  seed: number
}

const asNum = (v: TuneValue | undefined, lo: number, hi: number): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo
}
const asStr = (v: TuneValue | undefined, fallback: string): string => (typeof v === 'string' && v ? v : fallback)
const asOne = <T extends string>(v: TuneValue | undefined, options: readonly T[]): T =>
  options.find((o) => o === v) ?? options[0]

export function engravedParams(raw: Readonly<Record<string, TuneValue>>): EngravedParams {
  return {
    screen: asOne(raw.screen, SCREENS),
    pitch: asNum(raw.pitch, 0.4, 12),
    angle: asNum(raw.angle, -180, 180),
    fan: asNum(raw.fan, 0, 1.5),
    wmin: asNum(raw.wmin, 0, 3),
    wmax: asNum(raw.wmax, 0.05, 1.4),
    floor: asNum(raw.floor, 0, 0.9),
    gamma: asNum(raw.gamma, 0.2, 4),
    contrast: asNum(raw.contrast, 0.1, 4),
    brightness: asNum(raw.brightness, -1, 1),
    light: asNum(raw.light, -360, 360),
    model: asNum(raw.model, 0, 3),
    edge: asNum(raw.edge, -1, 1.5),
    shadow: asNum(raw.shadow, 0, 1.5),
    grain: asNum(raw.grain, 0, 1),
    displace: asNum(raw.displace, 0, 12),
    contourPitch: asNum(raw.contourPitch, 0.4, 12),
    hatch: asNum(raw.hatch, 0, 1),
    hatchAngle: asNum(raw.hatchAngle, -180, 180),
    hatchWeight: asNum(raw.hatchWeight, 0.1, 1.5),
    breakAt: asNum(raw.breakAt, 0, 1),
    dash: asNum(raw.dash, 0.8, 12),
    keyline: asNum(raw.keyline, 0, 3),
    ground: asOne(raw.ground, GROUNDS),
    ink: asStr(raw.ink, '#111111'),
    paper: asStr(raw.paper, '#ffffff'),
    fidelity: asOne(raw.fidelity, FIDELITIES),
    adapt: raw.adapt !== false,
    minPitchPx: asNum(raw.minPitchPx, 1, 12),
    waver: asNum(raw.waver, 0, 2),
    seed: Math.round(asNum(raw.seed, 0, 9999)),
  }
}

export function scanParams(raw: Readonly<Record<string, TuneValue>>): ScanParams {
  return {
    on: raw.scan === true,
    spread: asNum(raw.scanSpread, 0, 2),
    wobble: asNum(raw.scanWobble, 0, 3),
    wobbleScale: asNum(raw.scanWobbleScale, 0.01, 1.5),
    hardness: asNum(raw.scanHardness, 0, 1),
    threshold: asNum(raw.scanThreshold, 0.05, 0.95),
    speckle: asNum(raw.scanSpeckle, 0, 1),
    dropout: asNum(raw.scanDropout, 0, 1),
    skew: asNum(raw.scanSkew, -10, 10),
    generations: Math.round(asNum(raw.scanGenerations, 1, 4)),
    paperTone: asStr(raw.scanPaperTone, asStr(raw.paper, '#ffffff')),
    seed: Math.round(asNum(raw.seed, 0, 9999)),
  }
}
