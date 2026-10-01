import { MARK } from './config.ts'

export type GlyphState = {
  /** 0 → 1: how much of the five lines has drawn in. */
  p: number
  /** 0 → 1: how far into the breathing state the glyph is. */
  breath: number
  /** 0 → 1.3 while a ripple runs; negative when none does. */
  pulse: number
}

export const restingGlyph = (): GlyphState => ({ p: 1, breath: 0, pulse: -1 })

export type RGB = readonly [number, number, number]

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3))

/**
 * The canvas height is fixed by the constants alone, so no state of the glyph can shift the
 * layout around it: tall enough for the strongest breath or ripple, whichever it is.
 */
export const glyphHeight = (): number =>
  Math.ceil((MARK.lines - 1) * MARK.gap + MARK.weight + 2 * MARK.gap * 1.6 * Math.max(MARK.breatheAmp, MARK.finishAmp) + 2)

/** Advance a glyph's state by `dt` seconds. `breathing` says whether there is no text to read. */
export function stepGlyph(s: GlyphState, dt: number, breathing: boolean): void {
  if (s.p < 1) s.p = Math.min(1, s.p + dt / MARK.drawTime)
  s.breath += ((breathing ? 1 : 0) - s.breath) * Math.min(1, dt * 3)
  if (s.pulse >= 0) {
    s.pulse += dt / 1.1
    if (s.pulse > 1.3) s.pulse = -1
  }
}

/**
 * `ox` is where the glyph starts inside the canvas; `ghost` is the length of the five faded
 * lines trailing behind it. `time` drives the breath and the ripple, in seconds.
 */
export function drawGlyph(c: CanvasRenderingContext2D, s: GlyphState, color: RGB, time: number, ox = 0, ghost = 0): void {
  const { lines: n, gap: g, weight: lw, width: w } = MARK
  const h = glyphHeight()
  const pr = ease(s.p)
  if (pr <= 0) return
  const k = (Math.PI * 2) / (g * 7)
  const [r, gg, bb] = color
  c.lineWidth = lw
  c.lineCap = 'butt'
  if (ghost > 2) {
    const gr = c.createLinearGradient(ox, 0, ox - ghost, 0)
    for (const [u, a] of [[0, 1], [0.25, 0.55], [0.55, 0.18], [1, 0]] as const) {
      gr.addColorStop(u, `rgba(${r},${gg},${bb},${(MARK.ghostStrength * a).toFixed(3)})`)
    }
    c.strokeStyle = gr
    for (let i = 0; i < n; i++) {
      const y = h / 2 + (i - (n - 1) / 2) * g
      c.beginPath()
      c.moveTo(ox, y)
      c.lineTo(ox - ghost, y)
      c.stroke()
    }
  }
  c.save()
  c.translate(ox, 0)
  c.strokeStyle = `rgb(${r},${gg},${bb})`
  for (let i = 0; i < n; i++) {
    const y0 = h / 2 + (i - (n - 1) / 2) * g
    const a = lw / 2
    const end = a + (w - lw) * pr
    c.beginPath()
    for (let x = a; x <= end + 0.1; x += 2) {
      const xx = Math.min(x, end)
      const u = xx / w
      const taper = Math.min(1, Math.min(u, 1 - u) * 12)
      let d = 0
      if (s.breath > 0.01) d += s.breath * 0.9 * MARK.breatheAmp * g * Math.sin(xx * k * 0.6 - time * 2.6 + i * 0.9)
      if (s.pulse >= 0) {
        const q = (u - s.pulse) * 5
        d += 1.4 * MARK.finishAmp * g * Math.exp(-q * q) * Math.sin(xx * k - time * 9 + i * 0.8)
      }
      const y = y0 + d * taper
      if (x === a) c.moveTo(xx, y)
      else c.lineTo(xx, y)
    }
    c.stroke()
  }
  c.restore()
}

/** `#rrggbb` or `rgb(r, g, b)` → channels; null when it is neither. */
export function parseColor(css: string): RGB | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(css.trim())
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as unknown as RGB
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(css.trim())
  if (rgb) return [+rgb[1]!, +rgb[2]!, +rgb[3]!]
  return null
}
