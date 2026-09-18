import type { DocsContext, DocsEntry } from './types'
// Global entries (always visible).
import { gettingStartedEntry } from './content/getting-started'
import { hubKeywordSearchEntry } from './content/hub-keyword-search'
import { semanticSearchEntry } from './content/semantic-search'
import { accessAndCostEntry } from './content/access-and-cost'
import { auditabilityEntry } from './content/auditability'
import { freeTierMetadataFloorEntry } from './content/free-tier-metadata-floor'
import { notCommentaryEntry } from './content/not-commentary'
import { givingFeedbackEntry } from './content/giving-feedback'
// Litigation spoke.
import { aboutLitigationEntry } from './content/about-litigation'
import { litigationModesEntry } from './content/litigation-modes'
// OLC spoke.
import { aboutOlcEntry } from './content/about-olc'
import { olcNarrativeSynthesisEntry } from './content/olc-narrative-synthesis'
import { olcOpinionSummaryEntry } from './content/olc-opinion-summary'
// FRUS spoke.
import { aboutFrusEntry } from './content/about-frus'
import { frusNarrativeSynthesisEntry } from './content/frus-narrative-synthesis'
import { frusDocumentSummaryEntry } from './content/frus-document-summary'
// USC spoke.
import { aboutUscEntry } from './content/about-usc'
import { uscAiSynthesisEntry } from './content/usc-ai-synthesis'
import { uscSectionSummaryEntry } from './content/usc-section-summary'
// CFR spoke.
import { aboutCfrEntry } from './content/about-cfr'
import { cfrAiSynthesisEntry } from './content/cfr-ai-synthesis'
import { cfrSectionSummaryEntry } from './content/cfr-section-summary'
// Commentary spoke (federated Lawfare + Executive Functions; replaces the
// standalone Lawfare spoke). The Lawfare-scoped entries below are retained but
// no longer surface, since the Lawfare spoke is not registered.
import { aboutCommentaryEntry } from './content/about-commentary'
import { commentaryNarrativeSynthesisEntry } from './content/commentary-narrative-synthesis'
import { commentaryDocumentSummaryEntry } from './content/commentary-document-summary'
import { aboutLawfareEntry } from './content/about-lawfare'
import { lawfareNarrativeSynthesisEntry } from './content/lawfare-narrative-synthesis'
import { lawfareArticleSummaryEntry } from './content/lawfare-article-summary'
// Presidential Documents spoke.
import { aboutPresidentialEntry } from './content/about-presidential'
import { presidentialNarrativeSynthesisEntry } from './content/presidential-narrative-synthesis'
import { presidentialDocumentSummaryEntry } from './content/presidential-document-summary'
import { aboutClemencyEntry } from './content/about-clemency'
// Federal Register spoke.
import { aboutFrEntry } from './content/about-fr'
// Congress spoke.
import { aboutCongressEntry } from './content/about-congress'
// FBI Records spoke.
import { aboutFbiEntry } from './content/about-fbi'
import { fbiNarrativeSynthesisEntry } from './content/fbi-narrative-synthesis'
import { fbiDocumentSummaryEntry } from './content/fbi-document-summary'
// Sanctions spoke.
import { aboutSanctionsEntry } from './content/about-sanctions'

/**
 * Central docs registry. 38 entries: 8 global and 30 spoke-scoped.
 *
 * Entries live in `./content/<slug>.ts` and are aggregated here.
 *
 * - The eight global entries carry `order` 1 through 8, in the sequence they
 *   are imported above, and render on every surface.
 * - Spoke entries carry `order` 9 for the "How to use this corpus" intro,
 *   10 for the corpus's AI mode, 20 for the per-document Summarize action,
 *   and 11 for the one second surface inside a spoke (`about-clemency`, in
 *   the Presidential spoke). They render only in that spoke.
 *
 * Three entries are registered and can never surface: `about-lawfare`,
 * `lawfare-narrative-synthesis` and `lawfare-article-summary` are scoped to
 * the `lawfare` spoke, which was federated into Commentary and is no longer
 * in `spokes/registry.ts`, so nothing ever sets that context. They are kept
 * rather than deleted because `scripts/suggestions-export.mjs` carries rows
 * off their demo and good-question blocks; deleting them is a decision about
 * that CSV, not about this file.
 */
export const docsEntries: readonly DocsEntry[] = [
  // Global
  gettingStartedEntry,
  hubKeywordSearchEntry,
  semanticSearchEntry,
  accessAndCostEntry,
  auditabilityEntry,
  freeTierMetadataFloorEntry,
  notCommentaryEntry,
  givingFeedbackEntry,
  // Litigation
  aboutLitigationEntry,
  litigationModesEntry,
  // OLC
  aboutOlcEntry,
  olcNarrativeSynthesisEntry,
  olcOpinionSummaryEntry,
  // FRUS
  aboutFrusEntry,
  frusNarrativeSynthesisEntry,
  frusDocumentSummaryEntry,
  // USC
  aboutUscEntry,
  uscAiSynthesisEntry,
  uscSectionSummaryEntry,
  // CFR
  aboutCfrEntry,
  cfrAiSynthesisEntry,
  cfrSectionSummaryEntry,
  // Commentary (federated Lawfare + Executive Functions)
  aboutCommentaryEntry,
  commentaryNarrativeSynthesisEntry,
  commentaryDocumentSummaryEntry,
  // Lawfare (legacy, unreferenced — spoke retired into Commentary)
  aboutLawfareEntry,
  lawfareNarrativeSynthesisEntry,
  lawfareArticleSummaryEntry,
  // Presidential Documents
  aboutPresidentialEntry,
  presidentialNarrativeSynthesisEntry,
  presidentialDocumentSummaryEntry,
  aboutClemencyEntry,
  // Federal Register
  aboutFrEntry,
  // Congress
  aboutCongressEntry,
  // FBI Records
  aboutFbiEntry,
  fbiNarrativeSynthesisEntry,
  fbiDocumentSummaryEntry,
  // Sanctions
  aboutSanctionsEntry,
]

/**
 * Selector — returns the entries that should show in the overlay given
 * the current navigation context. Global entries always; spoke entries
 * only when their spokeSlug matches the active context.
 */
export function selectDocsForContext(ctx: DocsContext): readonly DocsEntry[] {
  return docsEntries
    .filter((entry) => {
      if (entry.scope.kind === 'global') return true
      return entry.scope.spokeSlug === ctx.activeSpokeSlug
    })
    .sort((a, b) => {
      const orderA = a.order ?? Number.POSITIVE_INFINITY
      const orderB = b.order ?? Number.POSITIVE_INFINITY
      if (orderA !== orderB) return orderA - orderB
      return a.title.localeCompare(b.title)
    })
}

/** Lookup helper for deep-linking (?docs=<slug>). */
export function getDocsEntry(slug: string): DocsEntry | undefined {
  return docsEntries.find((e) => e.slug === slug)
}
