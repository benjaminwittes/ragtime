/**
 * The global knobs — the tokens every surface is built out of.
 *
 * These are not new parameters. `src/index.css` already declares all of them,
 * and Tailwind 4 compiles its utilities to `var(--…)` references, so moving one
 * here repaints every `bg-lawfare-paper`, every `rounded-lg`, every shadcn
 * component and both stylesheets at once. That is the whole reason the global
 * layer is worth tuning first: it is the only place where one value is visibly
 * answered by the entire site.
 *
 * Defaults are the values as authored, and the `source` of each is the block it
 * is authored in — the `:root` cascade for shadcn's semantics, the `@theme`
 * block for the Lawfare palette Tailwind turns into utilities, `@theme inline`
 * for the fonts. Keep them in step with the file; a default that lies makes
 * "changed since default" lie with it. Most colours are authored as `var(--rt-*)`,
 * the family tokens from @lawfare/ragtime-design, so their defaults say so too.
 */

import { defineTunables } from './registry'

const INDEX_CSS = 'src/index.css'

export const globalKnobs = defineTunables([
  /* ---- Colour ---------------------------------------------------------- */
  {
    id: 'global.primary',
    label: 'Primary',
    group: 'Colour',
    scope: 'global',
    kind: 'color',
    value: 'var(--rt-accent)',
    prop: '--primary',
    source: { file: INDEX_CSS, selector: ':root' },
    note: 'Lawfare teal. Buttons, links, focus rings, every accent the kit draws.',
  },
  {
    id: 'global.background',
    label: 'Background',
    group: 'Colour',
    scope: 'global',
    kind: 'color',
    value: 'var(--rt-paper)',
    prop: '--background',
    source: { file: INDEX_CSS, selector: ':root' },
    note: 'The warm paper the editorial redesign put under everything.',
  },
  {
    id: 'global.foreground',
    label: 'Ink',
    group: 'Colour',
    scope: 'global',
    kind: 'color',
    value: 'var(--rt-ink)',
    prop: '--foreground',
    source: { file: INDEX_CSS, selector: ':root' },
  },
  {
    id: 'global.border',
    label: 'Hairline',
    group: 'Colour',
    scope: 'global',
    kind: 'color',
    value: 'var(--rt-rule)',
    prop: '--border',
    source: { file: INDEX_CSS, selector: ':root' },
    note: 'Every rule and card edge. The warm line, not the cool #ddd it replaced.',
  },
  {
    id: 'global.card',
    label: 'Card surface',
    group: 'Colour',
    scope: 'global',
    kind: 'color',
    value: 'var(--rt-raised)',
    prop: '--card',
    source: { file: INDEX_CSS, selector: ':root' },
    note: 'What forms, results and sheets sit on, above the paper.',
  },
  {
    id: 'global.mutedForeground',
    label: 'Muted text',
    group: 'Colour',
    scope: 'global',
    kind: 'color',
    value: 'var(--rt-ink-soft)',
    prop: '--muted-foreground',
    source: { file: INDEX_CSS, selector: ':root' },
  },
  {
    id: 'global.tealBg',
    label: 'Teal wash',
    group: 'Colour',
    scope: 'global',
    kind: 'color',
    value: 'var(--rt-accent-soft)',
    prop: '--color-lawfare-teal-bg',
    source: { file: INDEX_CSS, selector: '@theme' },
    note: 'The pale teal behind pills, chips and the reader’s own turns.',
  },
  {
    id: 'global.paper',
    label: 'Paper (utility)',
    group: 'Colour',
    scope: 'global',
    kind: 'color',
    value: 'var(--rt-paper)',
    prop: '--color-lawfare-paper',
    source: { file: INDEX_CSS, selector: '@theme' },
    note: '`bg-lawfare-paper`. The hub names the surface this way; --background is the same colour by another road.',
  },
  {
    id: 'global.line',
    label: 'Line (utility)',
    group: 'Colour',
    scope: 'global',
    kind: 'color',
    value: 'var(--rt-rule)',
    prop: '--color-lawfare-line',
    source: { file: INDEX_CSS, selector: '@theme' },
    note: '`border-lawfare-line`.',
  },
  {
    id: 'global.textSecondary',
    label: 'Secondary text',
    group: 'Colour',
    scope: 'global',
    kind: 'color',
    value: 'var(--rt-ink-soft)',
    prop: '--color-lawfare-text-secondary',
    source: { file: INDEX_CSS, selector: '@theme' },
  },

  /* ---- Type ------------------------------------------------------------ */
  {
    id: 'global.fontSans',
    label: 'Interface face',
    group: 'Type',
    scope: 'global',
    kind: 'text',
    value: "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    prop: '--font-sans',
    source: { file: INDEX_CSS, selector: '@theme inline' },
    note: 'A full stack. Whatever you name has to be loaded in app/index.html to render.',
  },
  {
    id: 'global.fontSerif',
    label: 'Editorial face',
    group: 'Type',
    scope: 'global',
    kind: 'text',
    value: "'EB Garamond', Garamond, Georgia, serif",
    prop: '--font-serif',
    source: { file: INDEX_CSS, selector: '@theme inline' },
    note: 'Headings, the wordmark, and the Explorer’s answers.',
  },

  /* ---- Shape ----------------------------------------------------------- */
  {
    id: 'global.radius',
    label: 'Corner radius',
    group: 'Shape',
    scope: 'global',
    kind: 'length',
    value: '0.1875rem',
    prop: '--radius',
    units: ['rem', 'px'],
    min: 0,
    max: 2,
    step: 0.025,
    source: { file: INDEX_CSS, selector: ':root' },
    note: 'The one number the whole rounded-* family is computed from (sm ×0.6 … 4xl ×2.6).',
  },
])
