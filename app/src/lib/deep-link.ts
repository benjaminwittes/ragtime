/**
 * Pure helpers for landing a deep link (`lib/links.ts`) on a spoke. The
 * browser-side readers are `readDeepLink` (lib/routing.ts) and the hooks in
 * `lib/use-deep-link.ts`; this module has no window and no React so the
 * routing rules can be pinned by `deep-link.test.ts`.
 */

/**
 * Worker corpus slugs this app hosts inside another spoke. The Worker's
 * registry has thirteen slugs and the app routes eleven: `clemency` is the
 * second table of the Presidential Documents spoke (its Clemency section),
 * and `lawfare` is the pre-commentary slug that still resolves over the same
 * rows as the commentary spoke's `lawfare` publication.
 */
export const SPOKE_FOR_CORPUS: Readonly<Record<string, string>> = {
  clemency: 'presidential',
  lawfare: 'commentary',
}

/**
 * The spoke slug a deep link routes to: the collection qualifier dropped
 * (`congress:laws` → `congress`), hosted corpora mapped to their spoke.
 * Whether the result is a registered spoke is the router's check, not this
 * module's.
 */
export function spokeSlugFor(linkSlug: string): string {
  const corpus = linkSlug.split(':')[0]
  return SPOKE_FOR_CORPUS[corpus] ?? corpus
}

/** What `/corpus/:slug/:id` names: the corpus as linked (qualifier kept) and the id as written. */
export type DeepLinkedDocument = { slug: string; id: string }

/**
 * The id in the form a collection-fanned spoke's own resolver reads:
 * `/corpus/congress:laws/123` → `laws:123`. An unqualified link passes its
 * id through unchanged, so an id the Worker already qualified
 * (`/corpus/congress/bills:75567`) is not qualified twice.
 */
export function qualifiedId(doc: DeepLinkedDocument): string {
  const i = doc.slug.indexOf(':')
  return i === -1 ? doc.id : doc.slug.slice(i + 1) + ':' + doc.id
}
