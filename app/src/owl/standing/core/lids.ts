/** How far the lids close, as the owl's own blink is set (`--owl-blink-closed`), read when a behaviour needs it so the panel's value is the live one. */
export function lidClosed(svg: SVGSVGElement): number {
  const value = Number.parseFloat(getComputedStyle(svg).getPropertyValue('--owl-blink-closed'))
  return Number.isFinite(value) ? value : 0.08
}
