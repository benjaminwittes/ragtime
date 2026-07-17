import type { DocsContext, DocsEntry } from './types'
// Global entries (always visible).
import { gettingStartedEntry } from './content/getting-started'
import { hubKeywordSearchEntry } from './content/hub-keyword-search'
import { semanticSearchEntry } from './content/semantic-search'
import { accessAndCostEntry } from './content/access-and-cost'
import { auditabilityEntry } from './content/auditability'
import { freeTierMetadataFloorEntry } from './content/free-tier-metadata-floor'
import { notCommentaryEntry } from './content/not-commentary'
import { usingDocumentationEntry } from './content/using-documentation'
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

/**
 * Central docs registry.
 *
 * Entries live in `./content/<slug>.ts` and are aggregated here.
 *
 * Editorial intent (per brief #6 §6, brief #6 decisions 9b cross-reference):
 * - Global entries cover cross-cutting principles users should know once:
 *   getting started, the cross-corpus hub search, the keyword/semantic
 *   retrieval toggle, access & cost, auditability, the free-tier metadata
 *   floor, primary-sources-not-commentary, how the docs overlay / `?`
 *   shortcut works, and how to give feedback. Ordered (order 1-9) so they
 *   list in a stable sequence everywhere.
 * - Spoke entries cover per-corpus content: a "How to use this corpus"
 *   intro (order 9), the corpus's AI synthesis mode (order 10), and the
 *   per-document Summarize action (order 20). They surface only when their
 *   spoke is the active context, sorted after the globals.
 *
 * Ordering is the editorial sequence from the in-app documentation draft
 * (the full text reviewed 2026-06-02 and folded back in).
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
  usingDocumentationEntry,
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
