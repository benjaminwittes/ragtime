import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/use-auth'
import {
  type EacDocumentDisplayRow,
  type EacDocumentResponse,
  fetchEacDocument,
} from '@lawfare/ragtime-client'
import { LinkOnlyChip } from './EacResultsList'
import {
  EAC_DATE_NOTE,
  eacDate,
  eacLink,
  eacTitle,
  fileTypeLabel,
  folderLabel,
  isFullDisplay,
} from './eac-format'

/**
 * Side sheet showing one EAC document.
 *
 * The display-tier rule lives here more than anywhere: text is rendered ONLY
 * when the Worker's /corpus/eac/document reply is a full document AND that
 * document says `display: 'full'`. A link-only reply, or a row with no
 * display value, shows the title, date, author group, the
 * link-only message and the eac.gov link, and nothing more; an error on a
 * full row shows the error and the link, never text. While the reply
 * loads, only what the list row already showed is on screen.
 *
 * No AI summary (summarize is off for EAC) and no save buttons (see
 * EacResultsList: the save targets fetch text themselves).
 */
export function EacDocumentDetailSheet({
  row,
  open,
  onOpenChange,
  onMoreLikeThis,
}: {
  row: EacDocumentDisplayRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pivot to "more like this document". Omitted = button hidden. */
  onMoreLikeThis?: (seed: { id: number; title: string | null }) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-full !max-w-2xl flex h-full flex-col gap-0 p-0"
      >
        {row ? (
          <EacDocumentDetailBody
            key={row.id}
            row={row}
            onMoreLikeThis={onMoreLikeThis}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            No document selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function EacDocumentDetailBody({
  row,
  onMoreLikeThis,
}: {
  row: EacDocumentDisplayRow
  onMoreLikeThis?: (seed: { id: number; title: string | null }) => void
}) {
  const auth = useAuth()
  const [reply, setReply] = useState<EacDocumentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchEacDocument(row.id)
        if (!cancelled) setReply(d)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [row.id])

  return (
    <EacDocumentView
      row={row}
      reply={reply}
      loading={loading}
      error={error}
      moreLikeThis={
        onMoreLikeThis
          ? {
              enabled: auth.hasAuth,
              onClick: () => onMoreLikeThis({ id: row.id, title: row.title ?? null }),
            }
          : undefined
      }
    />
  )
}

/**
 * What the sheet shows, as a pure function of the list row and the Worker's
 * reply — kept separate so the tier rule is tested by rendering it
 * (EacDocumentDetailSheet.test.tsx).
 */
export function EacDocumentView({
  row,
  reply,
  loading,
  error,
  moreLikeThis,
}: {
  row: EacDocumentDisplayRow
  reply: EacDocumentResponse | null
  loading: boolean
  error: string | null
  moreLikeThis?: { enabled: boolean; onClick: () => void }
}) {
  const full =
    reply?.kind === 'full' && isFullDisplay(reply.document) ? reply.document : null
  const linkOnly = reply?.kind === 'link_only' ? reply.document : null
  // Shown as full only once the reply proves it; until then, and on any
  // other answer, the sheet is the link-only view.
  const showLinkOnly = !full && (!!linkOnly || !isFullDisplay(row))

  const title = eacTitle(full?.title ?? linkOnly?.title ?? row.title)
  const href = (full && eacLink(full)) ?? (linkOnly && eacLink(linkOnly)) ?? eacLink(row)
  const date = (full && eacDate(full)) ?? (linkOnly && eacDate(linkOnly)) ?? eacDate(row)
  const authorGroup = full?.author_group ?? linkOnly?.author_group ?? row.author_group

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-lawfare-line bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {title}
          </SheetTitle>
          {showLinkOnly && <LinkOnlyChip />}
          {href && (
            <span className="ml-auto">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title="Opens in a new tab"
                className="inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                ↗ eac.gov
              </a>
            </span>
          )}
        </div>
        <SheetDescription className="text-xs text-muted-foreground">
          {[
            authorGroup,
            date ? `Posted on eac.gov ${date}` : null,
            full ? fileTypeLabel(full.file_type) : null,
            full ? folderLabel(full.folder) : null,
            full?.page_count != null ? `${full.page_count.toLocaleString()} pages` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto p-5">
        {moreLikeThis && (
          <div className="mb-4 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!moreLikeThis.enabled}
              title={
                moreLikeThis.enabled
                  ? 'Find documents similar to this one'
                  : 'Configure AI access (header, top right) to enable.'
              }
              onClick={moreLikeThis.onClick}
            >
              More like this
            </Button>
          </div>
        )}

        {showLinkOnly ? (
          <section className="space-y-3">
            <p className="border-l-2 border-lawfare-line bg-muted/30 py-2 pl-3 pr-3 text-sm leading-relaxed text-foreground">
              {linkOnly?.message ??
                'This document is shown as a link only. RAGtime does not return or summarize its text.'}{' '}
              It was written by an outside author ({authorGroup ?? 'author not yet determined'}),
              so RAGtime searches its text but does not show it.
              {href ? ' Open it on eac.gov to read it.' : ''}
            </p>
            {href && (
              <p className="text-sm">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-primary hover:underline"
                >
                  {href}
                </a>
              </p>
            )}
            {error && (
              <p className="text-xs text-muted-foreground">
                (The document could not be loaded: {error})
              </p>
            )}
          </section>
        ) : error ? (
          <p className="border-l-2 border-destructive bg-destructive/10 py-2 pl-3 pr-3 text-sm text-destructive">
            The document could not be loaded: {error}
            {href ? ' You can open it on eac.gov.' : ''}
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading document…</p>
        ) : full ? (
          <div className="space-y-5">
            <p className="text-[11px] text-muted-foreground/80">{EAC_DATE_NOTE}</p>
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Document text
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                Extracted from the file on eac.gov
                {full.extract_kind === 'ocr' || full.text_source === 'ocr'
                  ? ' by OCR — wording may contain recognition errors'
                  : ''}
                ; the file on eac.gov is the original.
              </p>
              {full.text_truncated && (
                <p className="mt-2 border-l-2 border-amber-400 bg-amber-500/10 py-2 pl-3 pr-3 text-xs text-amber-900 dark:text-amber-200">
                  This document is long; only the first 500,000 characters
                  {full.text_length != null
                    ? ` of ${full.text_length.toLocaleString()}`
                    : ''}{' '}
                  are shown here. Read the rest on eac.gov.
                </p>
              )}
              {full.text_content ? (
                <pre className="mt-2 whitespace-pre-wrap break-words border-t border-lawfare-line pt-4 font-sans text-sm leading-relaxed text-foreground">
                  {full.text_content}
                </pre>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  (No text could be extracted from this file — open it on
                  eac.gov.)
                </p>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </>
  )
}
