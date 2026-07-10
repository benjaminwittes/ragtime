import type { CorpusSpoke } from '../types'
import { fetchCongressFacets } from '@/lib/worker-client'

/**
 * Congress spoke (brief #13).
 *
 * The legislative branch's record as ONE spoke over five collections —
 * public laws, bills, hearing transcripts, the Congressional Record, and
 * written witness testimony — routed internally by a compact collection
 * selector (locked design: no separate hub cards per collection).
 *
 * Surfaces:
 * - Manual filter per collection (+ the keyword/semantic/both toggle —
 *   semantic lights up when the corpus embed lands).
 * - "Who said what": the hearings collection's speaker-turn sub-pane —
 *   witness/member + topic + Q→A pairing over ~7M attributed turns.
 * - claude_ama: plan→execute→synthesize across the five tables.
 * - Summarize-one-document on every detail sheet.
 *
 * Counts (live from /corpus/congress/facets; snapshot 2026-07-10):
 * laws 94,301 · bills 170,991 · hearings 35,361 · record 904,210 ·
 * testimony 14,874 — ~1.22M documents.
 */
export const congressSpoke: CorpusSpoke = {
  slug: 'congress',
  title: 'Congress',
  description:
    'Public laws, bills, hearing transcripts, the Congressional Record, and witness testimony — the legislative branch across five collections.',
  status: 'active',

  plainEnglishDisclosure:
    'Five collections of the congressional record: public laws (1789 to present), bills (108th Congress on; full text from the 113th), hearing transcripts with per-speaker attribution (1933 on), the Congressional Record (1994 on), and written witness testimony (House, 118th–119th). Coverage varies by collection — the selector below routes between them.',

  getHoldings: async () => {
    const knownGaps = [
      'Floor debate (Congressional Record) begins 1994 — no earlier floor material',
      'Bill text begins with the 113th Congress (2013); bills back to the 108th are metadata-only',
      'Hearing speaker attribution covers 86% of turns (modern era ~94%); ambiguous speakers are flagged, never guessed',
      'Written testimony covers House committees, 118th–119th Congresses',
    ]
    try {
      const f = await fetchCongressFacets()
      const c = f.collections
      const total =
        c.laws.count +
        c.bills.count +
        c.hearings.count +
        c.record.count +
        c.testimony.count
      return {
        counts: { documents: total },
        coverage: 'Laws to 1789 · hearings 1933 → · record 1994 → · bills 2003 →',
        lastUpdated: c.record.latest,
        provenance: {
          laws: c.laws.count,
          bills: c.bills.count,
          hearings: c.hearings.count,
          record: c.record.count,
          testimony: c.testimony.count,
        },
        knownGaps,
      }
    } catch {
      return {
        counts: { documents: 1219737 },
        coverage: 'Laws to 1789 · hearings 1933 → · record 1994 → · bills 2003 →',
        lastUpdated: '2026-07-10',
        provenance: {
          laws: 94301,
          bills: 170991,
          hearings: 35361,
          record: 904210,
          testimony: 14874,
        },
        knownGaps,
      }
    }
  },

  queryModes: ['manual_filter', 'claude_ama'],
  flagships: {
    present: ['retrieval', 'filtering', 'analytical'],
    paradigmatic: 'analytical',
  },
  facets: [],
  suggestionChips: [
    'Find every time Pam Bondi has been asked about the Epstein files',
    'Trace the legislative history of FISA Section 702',
    'What has Congress ever heard about the National Endowment for Democracy?',
    'Which FISA-reform bills actually became law?',
  ],
  defaultSearchDepth: 'full-doc',
  semanticSearch: true,
  moreLikeThis: {
    documentUnit: { label: 'document' },
    similarityHints: [
      'the same legislative subject',
      'hearings before the same committee',
      'measures from the same Congress',
    ],
    supportsMultiSelect: false,
    permitsCrossCorpusPivot: false,
  },
}
