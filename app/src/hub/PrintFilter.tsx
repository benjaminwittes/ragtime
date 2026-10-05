/**
 * The photocopy filter the hub's title wears (`hub.css`, `.hub-print-title`): a hair of
 * roughness along the edges of the letters, and the ink spread and clipped a little, as toner
 * does. Defined once, in a zero-size svg, and referred to by id.
 */
export function PrintFilter() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <filter id="hub-print-title" x="-2%" y="-5%" width="104%" height="110%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="5" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" result="w" />
        <feGaussianBlur in="w" stdDeviation="0.3" result="b" />
        <feComponentTransfer in="b">
          <feFuncA type="linear" slope="2.4" intercept="-0.7" />
        </feComponentTransfer>
      </filter>
    </svg>
  )
}
