import type { EngravedParams, ScanParams } from './params'

/**
 * The scanned-document finish, as an SVG filter description: what the engraving would
 * look like after being photocopied. It is data, not markup, so it can be tested in node
 * (`layers.tsx` turns it into elements), and so the chain can be repeated once per
 * generation.
 *
 * The filter splits the figure into two masks and treats each as a copier would.
 *
 *   ink     — how much of each pixel is ink: the source's alpha less its luminance, so a
 *             dark line scores high, paper scores nothing and the clear page around the
 *             owl scores nothing either;
 *   outline — where anything at all was painted, which carries the paper disc.
 *
 * Both are warped (the wobble), blurred (the ink spread), roughened with seeded noise
 * (speckle and dropout) and clipped hard (the 1-bit look). After the last generation the
 * ink mask is filled with the ink colour over the paper colour. Every noise source has a
 * `seed`, so the same settings always draw the same page.
 */

export type Prim = {
  tag: string
  attrs: Record<string, string | number>
  children?: Prim[]
}

export type ScanFilter = {
  /** The filter region, in figure units. Generous: the warp and the blur push edges outward. */
  region: { x: number; y: number; width: number; height: number }
  prims: Prim[]
}

const P = (tag: string, attrs: Record<string, string | number>, children?: Prim[]): Prim => ({ tag, attrs, children })

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** An opaque turbulence field, red and green carrying the noise. */
function noise(result: string, frequency: number, octaves: number, seed: number): Prim[] {
  return [
    P('feTurbulence', { type: 'fractalNoise', baseFrequency: round(frequency), numOctaves: octaves, seed, result: result + '-raw' }),
    P('feColorMatrix', { in: result + '-raw', type: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1', result }),
  ]
}

/** Noise as an alpha mask: alpha = the red channel, colour nothing. */
function noiseAlpha(result: string, frequency: number, seed: number): Prim[] {
  return [
    P('feTurbulence', { type: 'fractalNoise', baseFrequency: round(frequency), numOctaves: 2, seed, result: result + '-raw' }),
    P('feColorMatrix', { in: result + '-raw', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0', result }),
  ]
}

/** Dots: the part of a noise mask above `level`, hardened. `density` 0 is none, 1 is a lot. */
function dots(result: string, source: string, density: number): Prim[] {
  const level = 0.84 - 0.16 * density
  return [
    P('feComponentTransfer', { in: source, result }, [
      P('feFuncA', { type: 'linear', slope: 60, intercept: round(-60 * level) }),
    ]),
  ]
}

const round = (v: number) => Math.round(v * 1000) / 1000

/** A clip about `threshold`: a straight line in alpha, steep when `hardness` is high. */
function clip(source: string, result: string, threshold: number, hardness: number): Prim {
  const slope = 1 + 39 * Math.pow(hardness, 1.6)
  return P('feComponentTransfer', { in: source, result }, [
    P('feFuncA', { type: 'linear', slope: round(slope), intercept: round(0.5 - slope * threshold) }),
  ])
}

export function scanFilter(scan: ScanParams, engraved: Pick<EngravedParams, 'ink'>, px: number): ScanFilter {
  const prims: Prim[] = []
  const u = Math.max(px, 24) / 100
  // A speck smaller than a device pixel is only grey, so the noise is never finer than that.
  const fineLimit = 0.45 * u
  prims.push(
    P('feColorMatrix', {
      in: 'SourceGraphic',
      type: 'matrix',
      values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 1 0',
      result: 'ink-0',
    }),
    P('feColorMatrix', {
      in: 'SourceGraphic',
      type: 'matrix',
      values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
      result: 'out-0',
    }),
  )
  for (let g = 1; g <= scan.generations; g++) {
    const seed = scan.seed + g * 17
    const prev = g - 1
    const wobble = scan.wobble * (1 + 0.4 * (g - 1))
    const spread = scan.spread * (1 + 0.35 * (g - 1))
    const grain = 0.25 + 0.2 * (g - 1)
    const speckle = clamp(scan.speckle * (1 + 0.5 * (g - 1)), 0, 1)
    const dropout = clamp(scan.dropout * (1 + 0.5 * (g - 1)), 0, 1)
    prims.push(...noise(`warp-${g}`, scan.wobbleScale, 2, seed))
    for (const mask of ['ink', 'out']) {
      prims.push(
        P('feDisplacementMap', {
          in: `${mask}-${prev}`,
          in2: `warp-${g}`,
          scale: round(wobble),
          xChannelSelector: 'R',
          yChannelSelector: 'G',
          result: `${mask}-${g}-warped`,
        }),
        P('feGaussianBlur', { in: `${mask}-${g}-warped`, stdDeviation: round(spread), result: `${mask}-${g}-soft` }),
      )
    }
    // Roughen the ink: a little grain everywhere, then toner specks and missing specks.
    prims.push(...noiseAlpha(`grain-${g}`, clamp(0.55, 0.1, fineLimit * 2), seed + 1))
    prims.push(
      P('feComposite', {
        in: `ink-${g}-soft`,
        in2: `grain-${g}`,
        operator: 'arithmetic',
        k1: 0,
        k2: 1,
        k3: round(grain * 0.5 * scan.hardness),
        k4: round(-grain * 0.25 * scan.hardness),
        result: `ink-${g}-grain`,
      }),
    )
    let inkOut = `ink-${g}-grain`
    if (speckle > 0) {
      prims.push(...noiseAlpha(`spk-raw-${g}`, clamp(0.7, 0.1, fineLimit * 2), seed + 2))
      prims.push(...dots(`spk-all-${g}`, `spk-raw-${g}`, speckle))
      // Toner lands on the page, not on the empty air round it.
      prims.push(P('feComposite', { in: `spk-all-${g}`, in2: `out-${g}-soft`, operator: 'in', result: `spk-${g}` }))
      prims.push(
        P('feComposite', {
          in: inkOut,
          in2: `spk-${g}`,
          operator: 'arithmetic',
          k1: 0,
          k2: 1,
          k3: 1,
          k4: 0,
          result: `ink-${g}-spk`,
        }),
      )
      inkOut = `ink-${g}-spk`
    }
    if (dropout > 0) {
      prims.push(...noiseAlpha(`drp-raw-${g}`, clamp(0.6, 0.1, fineLimit * 2), seed + 3))
      prims.push(...dots(`drp-${g}`, `drp-raw-${g}`, dropout))
      prims.push(
        P('feComposite', {
          in: inkOut,
          in2: `drp-${g}`,
          operator: 'arithmetic',
          k1: 0,
          k2: 1,
          k3: -1,
          k4: 0,
          result: `ink-${g}-drp`,
        }),
      )
      inkOut = `ink-${g}-drp`
    }
    prims.push(clip(inkOut, `ink-${g}`, scan.threshold, scan.hardness))
    prims.push(clip(`out-${g}-soft`, `out-${g}`, 0.5, scan.hardness))
  }
  const last = scan.generations
  prims.push(
    P('feComposite', { in: `out-${last}`, in2: `ink-${last}`, operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'union' }),
    P('feFlood', { floodColor: scan.paperTone, result: 'paper' }),
    P('feComposite', { in: 'paper', in2: 'union', operator: 'in', result: 'paper-layer' }),
    P('feFlood', { floodColor: engraved.ink, result: 'toner' }),
    P('feComposite', { in: 'toner', in2: `ink-${last}`, operator: 'in', result: 'toner-layer' }),
    P('feMerge', {}, [P('feMergeNode', { in: 'paper-layer' }), P('feMergeNode', { in: 'toner-layer' })]),
  )
  return { region: { x: -14, y: -14, width: 128, height: 128 }, prims }
}
