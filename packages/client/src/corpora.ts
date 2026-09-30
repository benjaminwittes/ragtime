/**
 * The corpus list, names and hub layout, read from the generated copy of the
 * Worker's registry (`npm run registry:sync`). Nothing here is hand-kept: the
 * slugs, the hub groups and the labels all come from `generated/registry.ts`.
 */
import { CORPORA, HUB_GROUPS, LIVE_APIS, REGISTRY_VERSION } from './generated/registry.ts'
import type { CorpusSlug } from './corpus-types.ts'

export { CORPORA, HUB_GROUPS, LIVE_APIS, REGISTRY_VERSION as GENERATED_REGISTRY_VERSION }

export type HubGroupId = (typeof HUB_GROUPS)[number]['id']

/** Slugs that have a card on the hub (the registry's `hub` is not null). */
export type HubCardSlug = Extract<(typeof CORPORA)[number], { hub: { group: string } }>['slug']

const bySlug: ReadonlyMap<string, (typeof CORPORA)[number]> = new Map(CORPORA.map((c) => [c.slug, c]))

/** Chip and routing-summary label: "USC", "Fed. Register", "LOC catalogue". */
export function corpusShortLabel(slug: CorpusSlug): string {
  return bySlug.get(slug)?.shortName ?? slug
}

/** Full label: the hub card title, or the registry name for a corpus with no card. */
export function corpusLongLabel(slug: CorpusSlug): string {
  const c = bySlug.get(slug)
  return c ? (c.hub ? c.hub.title : c.name) : slug
}
