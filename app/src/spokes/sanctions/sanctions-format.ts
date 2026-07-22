/**
 * Formatting helpers for the Sanctions spoke (brief #15).
 *
 * The one rule that shapes several of these: publish_date on the entity
 * table is the COPY-FRESHNESS stamp (one value corpus-wide — when OFAC
 * published the list data we hold), NOT a designation date. Nothing here
 * ever formats it as "listed on"; "since when" lives in the FR designation
 * notices.
 */

/** 'entity' | 'individual' | 'vessel' | 'aircraft' → display label. */
export function entityTypeLabel(t: string | null): string {
  switch (t) {
    case 'entity':
      return 'Entity'
    case 'individual':
      return 'Individual'
    case 'vessel':
      return 'Vessel'
    case 'aircraft':
      return 'Aircraft'
    default:
      return t ?? '—'
  }
}

/** 'sdn' | 'consolidated' → display label. */
export function listTypeLabel(t: string | null): string {
  switch (t) {
    case 'sdn':
      return 'SDN list'
    case 'consolidated':
      return 'Consolidated (non-SDN)'
    default:
      return t ?? '—'
  }
}

/** 'faq' | 'enforcement_action' | 'general_license' → display label. */
export function guidanceTypeLabel(t: string | null): string {
  switch (t) {
    case 'faq':
      return 'FAQ'
    case 'enforcement_action':
      return 'Enforcement action'
    case 'general_license':
      return 'General license'
    default:
      return t ?? '—'
  }
}

/** Compact "a.k.a." line: first N aliases + an overflow count. */
export function aliasLine(
  aliases: readonly string[] | null | undefined,
  max = 3,
): string | null {
  if (!aliases || aliases.length === 0) return null
  const shown = aliases.slice(0, max).join(' · ')
  const more = aliases.length - max
  return more > 0 ? `${shown} (+${more} more)` : shown
}

/** OFAC's own per-entity page in the authoritative Sanctions List Search. */
export function ofacSearchUrl(ofacUid: string | null): string | null {
  if (!ofacUid) return null
  const n = Number(ofacUid)
  if (!Number.isFinite(n) || n <= 0) return null
  return `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${Math.floor(n)}`
}

/** Parse a leg-qualified semantic/prose id ('guidance:123' / 'fr:456' /
 *  'entity:789') into its leg + numeric id. Bare numeric ids are treated as
 *  guidance (the MLT path returns plain ofac_guidance ids). */
export function parseSanctionsQualifiedId(
  raw: string,
): { leg: 'guidance' | 'fr' | 'entity'; id: number } | null {
  const m = /^(?:(entity|guidance|fr):)?(\d+)$/.exec(raw)
  if (!m) return null
  const leg = (m[1] ?? 'guidance') as 'guidance' | 'fr' | 'entity'
  const id = Number(m[2])
  if (!Number.isFinite(id) || id <= 0) return null
  return { leg, id }
}
