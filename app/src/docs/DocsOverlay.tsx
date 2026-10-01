import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { navigateTo, toHref } from '@/lib/routing'
import { cn } from '@/lib/utils'
import { selectDocsForContext, getDocsEntry } from './registry'
import { useDocs } from './DocsContext'
import { docsLink } from './request'
import {
  corpusCountFigures,
  loadSpokeFigures,
  resolveFigures,
  type Figures,
  type FigureState,
} from './figures'
import type { DocsEntry } from './types'

/**
 * One entry's markdown, with its `{{figure}}` tokens filled from the live
 * facets of the spoke it belongs to (see figures.ts). The corpus-count words
 * come from the registry and are there at once; the rest arrive after the
 * fetch and read '…' until they do.
 */
function EntryBody({ entry }: { entry: DocsEntry }) {
  const slug = entry.scope.kind === 'spoke' ? entry.scope.spokeSlug : undefined
  const [live, setLive] = useState<{ slug: string | undefined; figures: Figures; state: FigureState }>(
    { slug, figures: {}, state: 'loading' },
  )
  useEffect(() => {
    let cancelled = false
    loadSpokeFigures(slug).then(
      (figures) => !cancelled && setLive({ slug, figures, state: 'ready' }),
      () => !cancelled && setLive({ slug, figures: {}, state: 'failed' }),
    )
    return () => {
      cancelled = true
    }
  }, [slug])
  // A figure set belongs to the spoke that fetched it; never show another's.
  const current = live.slug === slug ? live : { figures: {}, state: 'loading' as FigureState }
  const content = useMemo(
    () => resolveFigures(entry.content, { ...corpusCountFigures(), ...current.figures }, current.state),
    [entry.content, current.figures, current.state],
  )
  return <ReactMarkdown components={{ a: DocsAnchor }}>{content}</ReactMarkdown>
}

/**
 * A link inside a docs page (`request.ts` says which of four things it is).
 *
 * Pages write logical paths, so the mount prefix is added here, once — a page
 * that spelled `/ragtime/…` would be right on one deploy and wrong on the
 * other. Every branch keeps a real `href`, so a modified click, a middle
 * click and "copy link address" all still do what a link does; only the
 * plain click is taken, as `AppLink` takes it.
 */
function DocsAnchor({ href, children }: { href?: string; children?: ReactNode }) {
  const { open, close } = useDocs()
  const link = docsLink(href ?? '')
  if (link.kind === 'outside') {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }
  if (link.kind === 'file') {
    return (
      <a href={toHref(link.to)} target="_blank" rel="noopener">
        {children}
      </a>
    )
  }
  const plain = (e: MouseEvent<HTMLAnchorElement>) =>
    e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey
  if (link.kind === 'entry') {
    return (
      <a
        href={toHref(`/?docs=${encodeURIComponent(link.slug)}`)}
        onClick={(e) => {
          if (!plain(e)) return
          e.preventDefault()
          open(link.slug)
        }}
      >
        {children}
      </a>
    )
  }
  return (
    <a
      href={toHref(link.to)}
      onClick={(e) => {
        if (!plain(e)) return
        e.preventDefault()
        close()
        navigateTo(link.to)
      }}
    >
      {children}
    </a>
  )
}

/**
 * The floating-documentation overlay.
 *
 * Mounted by DocsProvider; renders a shadcn Sheet that slides in from the
 * right when isOpen becomes true. It shows one of two things, never both: the
 * list of entries that apply here (globals plus the active spoke's), or one
 * entry's markdown with an "← All topics" button back to the list.
 *
 * The empty state below is unreachable in this build — the registry is never
 * empty, and the globals alone make `selectDocsForContext` return nine on
 * every surface. It is kept as the honest branch for a registry that has been
 * emptied, and it says that rather than naming a pull request.
 */
export function DocsOverlay() {
  const { isOpen, close, activeSlug, activeSpokeSlug, open } = useDocs()

  const entries = useMemo(
    () => selectDocsForContext({ activeSpokeSlug }),
    [activeSpokeSlug],
  )
  const activeEntry = activeSlug ? getDocsEntry(activeSlug) : undefined

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (open ? null : close())}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">Documentation</SheetTitle>
          <SheetDescription>
            Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono">?</kbd>{' '}
            anywhere to open / close this overlay.
          </SheetDescription>
        </SheetHeader>

        {entries.length === 0 ? (
          <div className="px-6 py-8">
            <p className="text-sm text-muted-foreground italic">
              No documentation topics apply here.
            </p>
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1 px-6">
            {activeEntry ? (
              <article
                className={cn(
                  'max-w-none py-4 text-sm leading-relaxed text-foreground',
                  // The typography plugin isn't installed, so style the
                  // rendered markdown directly: real gaps between paragraphs
                  // and list items, comfortable line height.
                  '[&_p]:my-4 [&_p:first-of-type]:mt-0',
                  '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-5',
                  '[&_li]:my-1.5 [&_li]:pl-1',
                  '[&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic',
                  '[&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary',
                  '[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-lg',
                  '[&_h3]:mt-5 [&_h3]:mb-1.5 [&_h3]:font-semibold',
                  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
                  '[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
                )}
              >
                <button
                  className="mb-4 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  onClick={() => open(undefined)}
                  type="button"
                >
                  ← All topics
                </button>
                <h2 className="mb-3 font-serif text-2xl">{activeEntry.title}</h2>
                <EntryBody entry={activeEntry} />
              </article>
            ) : (
              <nav className="py-4">
                <ul className="space-y-1">
                  {entries.map((entry) => (
                    <li key={entry.slug}>
                      <button
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors"
                        onClick={() => open(entry.slug)}
                        type="button"
                      >
                        <div className="text-sm font-medium text-foreground">
                          {entry.title}
                        </div>
                        {entry.summary && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {entry.summary}
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  )
}
