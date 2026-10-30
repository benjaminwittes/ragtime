import { cn } from '@/lib/utils'
import { EntryBody } from './DocsOverlay'
import { selectDocsForContext } from './registry'

/** The route, as a logical path. */
export const ABOUT_PATH = '/about'

/**
 * "What is RAGtime?" (route `/about`): the global docs entries on one page.
 *
 * The Lawfare team's UI/UX live document found the `?` docs button hard to
 * find and asked for a page in the header instead, its subheaders being the
 * current global entries ("Search, Explained", "Access & Cost", …) with their
 * text, until Samara and Mary draft the page's own. So the page reads the
 * registry rather than holding copy: an entry edited for the overlay changes
 * here too, and the drafted page replaces this body, not a second copy.
 *
 * The first global entry, "Start Here: What Is RAGtime?", answers the page's
 * own title, so it is the introduction and has no heading of its own. The
 * spoke entries stay in the overlay, which opens inside each corpus.
 */
export function AboutPage() {
  const [intro, ...sections] = selectDocsForContext({ activeSpokeSlug: undefined })
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-serif text-3xl text-foreground">What is RAGtime?</h1>
      <nav aria-label="On this page" className="mt-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {sections.map((entry) => (
            <li key={entry.slug}>
              <a href={`#${entry.slug}`} className="text-primary underline-offset-4 hover:underline">
                {entry.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <article
        className={cn(
          'mt-8 max-w-none text-sm leading-relaxed text-foreground',
          // The typography plugin isn't installed, so the markdown is styled
          // directly, as in DocsOverlay and PrivacyPolicy.
          '[&_p]:my-4',
          '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_li]:my-1.5 [&_li]:pl-1',
          '[&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic',
          '[&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary',
          '[&_h2]:mt-12 [&_h2]:mb-2 [&_h2]:scroll-mt-20 [&_h2]:font-serif [&_h2]:text-2xl',
          '[&_h3]:mt-6 [&_h3]:mb-1.5 [&_h3]:font-serif [&_h3]:text-lg',
          '[&_h4]:mt-5 [&_h4]:mb-1.5 [&_h4]:font-semibold',
          '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
          '[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
        )}
      >
        {intro && (
          <section aria-label={intro.title}>
            <EntryBody entry={intro} nested />
          </section>
        )}
        {sections.map((entry) => (
          <section key={entry.slug} aria-labelledby={entry.slug}>
            <h2 id={entry.slug}>{entry.title}</h2>
            <EntryBody entry={entry} nested />
          </section>
        ))}
      </article>
      <p className="mt-12 text-xs text-muted-foreground">
        Each corpus has its own guide too: open the corpus and press{' '}
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">?</kbd>.
      </p>
    </main>
  )
}
