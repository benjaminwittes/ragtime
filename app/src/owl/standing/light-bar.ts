import type { OwlStanding } from '../types'

/**
 * A photocopier's light bar: now and then a band of light crosses the figure from left to
 * right, bleaching what it passes, advancing in ten steps the way a scan head does. It is
 * clipped to the figure's own disc, so no light falls outside the box.
 *
 * It is the one behaviour that adds an element: a group of its own at the end of the page
 * part, drawn invisible until it runs and taken away with the behaviour. Because it is
 * transparent at rest, the stage's mirror, which copies the markup, copies nothing that
 * can be seen.
 *
 * At amount 1 the bar is 16 units wide and takes three-quarters of its strength from the
 * paper's own tone; the pass lasts about a second and a quarter.
 */

const NS = 'http://www.w3.org/2000/svg'
let serial = 0

function make(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(NS, tag)
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
  return el
}

export default {
  id: 'light-bar',
  label: 'Light bar',
  note: 'A copier’s band of light crosses the figure, stepping, now and then.',
  period: 29,
  start(ctx) {
    const page = ctx.part('page')
    if (!page) return
    const frame = ctx.svg.querySelector('.eng-frame')
    const paper = (frame && getComputedStyle(frame).getPropertyValue('--eng-paper').trim()) || '#fffdf2'
    const id = 'owl-bar-' + serial++
    const disc = ctx.design.shape.disc

    // The clip and the gradient sit beside the clipped group, not inside it: a clip path
    // that is a child of what it clips is not a reference the renderer will follow.
    const holder = make('g', { class: 'owl-lightbar' })
    // The clip is on a group that does not move: a clip is in the coordinates of the element
    // it is on, so on the moving group it would travel with the band.
    const clipped = make('g', { 'pointer-events': 'none', 'clip-path': `url(#${id}-clip)` })
    const bar = make('g', { opacity: '0' })
    const defs = make('defs', {})
    const clip = make('clipPath', { id: id + '-clip' })
    clip.appendChild(make('circle', { cx: '50', cy: '50', r: String(disc) }))
    const fade = make('linearGradient', { id: id + '-fade', x1: '0', x2: '1', y1: '0', y2: '0' })
    for (const [offset, opacity] of [['0', '0'], ['0.55', '0.85'], ['1', '0']]) {
      fade.appendChild(make('stop', { offset, 'stop-color': paper, 'stop-opacity': opacity }))
    }
    defs.append(clip, fade)
    const rect = make('rect', { x: '-16', y: '0', width: '16', height: '100', fill: `url(#${id}-fade)` })
    bar.append(rect)
    clipped.append(bar)
    holder.append(defs, clipped)
    ctx.add(page, holder)

    // The width follows the amount, and is written when the amount changes, not on each pass.
    ctx.watch(({ amount }) => {
      const width = 16 * Math.max(amount, 0.3)
      rect.setAttribute('width', String(width))
      rect.setAttribute('x', String(-width))
    })

    ctx.every(() => {
      const a = ctx.config.amount
      void ctx.gesture(
        [bar],
        [
          { opacity: Math.min(1, a), transform: 'translateX(0px)' },
          { opacity: Math.min(1, a), transform: 'translateX(132px)' },
        ],
        { duration: 1250, easing: 'steps(10)' },
      )
    })
  },
} satisfies OwlStanding
