import './lab.css'
import { OWL_LAB } from './path'
import type { OwlLabSection } from './types'

/**
 * The owl lab: where the owl is looked at while it is tuned.
 *
 * A dev page, reached at `/owl-lab` under the app's base (`http://localhost:5173/ragtime/owl-lab`
 * from `npm run dev`). It exists only where the tuning layer does (`__RT_TUNE__`; see
 * `App.tsx`), is let past the beta gate for the same reason, and is plain on purpose: the
 * owl is the subject, and the page has to stay legible however the owl is tuned.
 *
 * Every owl here is a real `Owl` or `OwlSpot`, so the Tune panel's Owl tab moves all of
 * them at once, and the panel counts as "on screen" here because there are owls on it.
 * The sections are `sections/*.ts`, found by glob and listed in `order`; a builder adds
 * theirs there (`types.ts`).
 */

const modules = import.meta.glob<OwlLabSection>('./sections/*.ts', { eager: true, import: 'default' })
const SECTIONS = Object.values(modules).sort((a, b) => a.order - b.order)

export default function OwlLab() {
  return (
    <main className="mx-auto max-w-[92rem] px-6 py-8" data-owl-lab>
      <h1 className="font-serif text-3xl font-bold">Owl lab</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Every owl on this page is the real one. Press <kbd className="rounded border px-1">Alt</kbd>
        {' + '}
        <kbd className="rounded border px-1">T</kbd> and open the Owl tab to move the palette, the
        timings or the render style and watch them all change. Open a link as{' '}
        <code>{OWL_LAB}#tune=&lt;preset&gt;</code> to see a saved tuning.
      </p>
      <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Sections">
        {SECTIONS.map((section) => (
          <a key={section.id} href={'#' + section.id} className="text-primary hover:underline">
            {section.title}
          </a>
        ))}
      </nav>
      {SECTIONS.map(({ id, title, Section }) => (
        <section key={id} id={id} className="mt-12 scroll-mt-16">
          <h2 className="border-b pb-2 font-serif text-2xl font-semibold">{title}</h2>
          <Section />
        </section>
      ))}
    </main>
  )
}
