import { figureNamed } from './figures.ts'

/**
 * A figure by name (`figures.ts`), or a plain sentence where a presenter on a newer build
 * names one this build does not have.
 */
export function FigureByName({ name }: { name: string }) {
  const entry = figureNamed(name.trim())
  if (!entry) {
    return (
      <p className="text-[1.6cqw] text-lawfare-muted" data-figure="unknown">
        This figure is not in this version of the page. Reload to see it.
      </p>
    )
  }
  const { Figure } = entry
  return <Figure />
}
