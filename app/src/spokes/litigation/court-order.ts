/**
 * The court list shows the selected courts first and the rest after, each
 * group in the facet's own order. The form re-sorts only when a selection is
 * settled (a preset, an Apply), never on a single tick, so a row does not
 * jump out from under the pointer.
 */
export function selectedFirst(
  courts: readonly string[],
  selected: ReadonlySet<string>,
): string[] {
  return [
    ...courts.filter((c) => selected.has(c)),
    ...courts.filter((c) => !selected.has(c)),
  ]
}
