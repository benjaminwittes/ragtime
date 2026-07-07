import type {
  CongressBillDisplayRow,
  CongressCollection,
} from '@/lib/worker-client'

/**
 * Non-component formatting helpers shared across the Congress spoke's
 * components (kept out of the .tsx files so react-refresh sees
 * component-only modules).
 */

/** Ordered collections — drives the collection selector and export keying. */
export const CONGRESS_COLLECTIONS: readonly {
  key: CongressCollection
  label: string
  /** Singular noun for count lines ("435 laws", "1 hearing"). */
  noun: string
}[] = [
  { key: 'hearings', label: 'Hearings', noun: 'hearing' },
  { key: 'laws', label: 'Public laws', noun: 'law' },
  { key: 'bills', label: 'Bills', noun: 'bill' },
  { key: 'record', label: 'Congressional Record', noun: 'granule' },
  { key: 'testimony', label: 'Written testimony', noun: 'statement' },
]

export function collectionLabel(c: CongressCollection): string {
  return CONGRESS_COLLECTIONS.find((x) => x.key === c)?.label ?? c
}

export function collectionNoun(c: CongressCollection, count: number): string {
  const noun = CONGRESS_COLLECTIONS.find((x) => x.key === c)?.noun ?? 'item'
  return count === 1 ? noun : `${noun}s`
}

/** 118 → '118th'. */
export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** 'hr' → 'H.R.', 'sjres' → 'S.J.Res.', etc. */
export function prettyBillType(t: string | null): string {
  switch ((t ?? '').toLowerCase()) {
    case 'hr':
      return 'H.R.'
    case 's':
      return 'S.'
    case 'hres':
      return 'H.Res.'
    case 'sres':
      return 'S.Res.'
    case 'hjres':
      return 'H.J.Res.'
    case 'sjres':
      return 'S.J.Res.'
    case 'hconres':
      return 'H.Con.Res.'
    case 'sconres':
      return 'S.Con.Res.'
    default:
      return (t ?? '').toUpperCase()
  }
}

/** 'H.R. 2454 (114th)' — the bill's short citation. */
export function billCitation(
  row: Pick<CongressBillDisplayRow, 'bill_type' | 'bill_number' | 'congress'>,
): string {
  const type = prettyBillType(row.bill_type)
  const num = row.bill_number ?? '?'
  const cong = row.congress != null ? ` (${ordinal(row.congress)})` : ''
  return `${type} ${num}${cong}`
}

/** 'DAILYDIGEST' → 'Daily Digest', 'HOUSE' → 'House', etc. */
export function prettyGranuleClass(c: string | null): string {
  switch ((c ?? '').toUpperCase()) {
    case 'HOUSE':
      return 'House'
    case 'SENATE':
      return 'Senate'
    case 'EXTENSIONS':
      return 'Extensions of Remarks'
    case 'DAILYDIGEST':
      return 'Daily Digest'
    default:
      return c ?? '—'
  }
}

/**
 * Attribution-candor register for speaker-type badges: 'member' and
 * 'witness' are affirmative attributions; anything else ('ambiguous',
 * unresolved variants) is flagged, never guessed — the muted badge.
 */
export function speakerTypeTone(
  t: string | null,
): 'member' | 'witness' | 'flagged' {
  if (t === 'member') return 'member'
  if (t === 'witness') return 'witness'
  return 'flagged'
}

/**
 * The turns name box accepts a witness name fragment OR a member bioguide
 * id — bioguide ids have a fixed shape ('R000584'), so route by pattern.
 */
export function isBioguideId(s: string): boolean {
  return /^[A-Z]\d{6}$/.test(s.trim())
}

/**
 * Congress AMA cited ids may come back collection-qualified ('bills:75567')
 * or bare. Parse into {collection, id} when possible; null = unparseable.
 */
export function parseCitedId(
  raw: string | number,
  fallback: CongressCollection | null,
): { collection: CongressCollection; id: number } | null {
  if (typeof raw === 'number') {
    return fallback ? { collection: fallback, id: raw } : null
  }
  const m = raw.match(/^(laws|bills|hearings|record|testimony):(\d+)$/)
  if (m) return { collection: m[1] as CongressCollection, id: Number(m[2]) }
  if (/^\d+$/.test(raw) && fallback) {
    return { collection: fallback, id: Number(raw) }
  }
  return null
}
