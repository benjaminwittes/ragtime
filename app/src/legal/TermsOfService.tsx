import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { SiteMasthead } from '@/components/SiteMasthead'
import { LAST_UPDATED, TERMS_OF_SERVICE_MD } from './terms-of-service-content'

/**
 * In-app Terms of Service page (route `/terms`). Renders the canonical terms
 * text (terms-of-service-content.ts) so users can read it at/before the point
 * of agreement — linked from the hub footer and the sign-in panel. Companion
 * to the Privacy Policy page; same markdown-styling convention.
 */
export function TermsOfService({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <>
      <SiteMasthead />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="mb-6 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          ← Back to hub
        </button>

        <h1 className="font-serif text-3xl text-foreground">Terms of Service</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The Lawfare Institute (&ldquo;Lawfare,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) &middot;
          Last updated: {LAST_UPDATED}
        </p>

        <article
          className={cn(
            'mt-8 max-w-none text-sm leading-relaxed text-foreground',
            '[&_p]:my-4 [&_p:first-of-type]:mt-0',
            '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-5',
            '[&_li]:my-1.5 [&_li]:pl-1',
            '[&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic',
            '[&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary',
            '[&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:text-foreground',
            '[&_h3]:mt-6 [&_h3]:mb-1.5 [&_h3]:font-semibold',
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{TERMS_OF_SERVICE_MD}</ReactMarkdown>
        </article>
      </main>
    </>
  )
}
