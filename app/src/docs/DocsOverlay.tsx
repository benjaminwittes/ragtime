import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { selectDocsForContext, getDocsEntry } from './registry'
import { useDocs } from './DocsContext'

/**
 * The floating-documentation overlay.
 *
 * Mounted by DocsProvider; renders a shadcn Sheet that slides in from the
 * right when isOpen becomes true. Shows a list of available entries
 * (filtered by current spoke context) on top; selected entry's markdown
 * content rendered below.
 *
 * v1 = infrastructure only; the docs registry is empty, so the empty-state
 * message is what users see. Editorial content lands in PR 4b (or staged
 * with each spoke's implementation, so per-spoke docs are written against
 * the real surface).
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
              No documentation entries registered yet. (Infrastructure landed
              in PR 4a; editorial content is a later pass.)
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
                <ReactMarkdown>{activeEntry.content}</ReactMarkdown>
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
