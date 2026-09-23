import { SiteBarActions } from '@/components/SiteBar'
import type { CorpusSpoke } from '@lawfare/ragtime-client'

/**
 * Which spoke you are in, said once, in the site's one bar.
 *
 * Every spoke used to open with two bars: the brand strip, and under it a band of the
 * shell's own carrying the title, the docs button and the AI access button. The two
 * controls were global — they are state about the reader, not about the corpus — and
 * they live in the bar now. What was left of the band that is genuinely the page's (the
 * plain-English disclosure, the holdings tiles, the way back to the hub) stays on the
 * page and stops pretending to be chrome; what was genuinely chrome is this, and it
 * goes up through the same slot the Explorer's controls use.
 *
 * The title is the page's `<h1>` even though it renders in the bar: a portal moves the
 * DOM, not the document outline's meaning, and this is still the one heading that names
 * the surface. It truncates rather than wraps — the bar is one row, and a corpus with a
 * long name ("Foreign Relations of the United States") must not be allowed to take it.
 *
 * The slug rides along in mono, as it did in the band, hidden below `sm` where the row
 * has no width to spare. It is the name the deep-link grammar and the docs use, so a
 * reader comparing a URL to a page has it in front of them.
 */
export function SpokeIdentity({ spoke }: { spoke: CorpusSpoke }) {
  return (
    <SiteBarActions>
      {/* A rule rather than a slash: the lockup's slash separates the tagline from the
          Explorer, and a second one would read as a breadcrumb — "RAGtime / Explorer /
          this corpus" — which is a claim about where this page sits that is not true. */}
      <h1 className="min-w-0 truncate border-l border-lawfare-line pl-2 font-serif text-base font-semibold tracking-tight text-foreground sm:pl-3 sm:text-lg">
        {spoke.title}
      </h1>
      <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
        {spoke.slug}
      </span>
    </SiteBarActions>
  )
}
