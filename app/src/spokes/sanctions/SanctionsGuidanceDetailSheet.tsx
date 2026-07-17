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
  type SanctionsGuidanceDetail,
  type SanctionsGuidanceDisplayRow,
  fetchSanctionsGuidanceDocument,
} from '@/lib/worker-client'
import { guidanceTypeLabel } from './sanctions-format'
import { ProgramChips } from './SanctionsEntityResultsList'

/**
 * Side sheet showing one OFAC guidance document: full text + metadata.
 *
 * Layout (top to bottom):
 *   - Title + type badge (+ OFAC number), ↗ ofac.treasury.gov
 *   - Programs / EOs / issued-date metadata (31 docs are undated — shown
 *     honestly, not blank)
 *   - "More like this" pivot (the sanctions:guidance MLT key)
 *   - Full document text, with an OCR caveat when quality is flagged
 */
export function SanctionsGuidanceDetailSheet({
  row,
  open,
  onOpenChange,
  onMoreLikeThis,
}: {
  row: SanctionsGuidanceDisplayRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pivot to "more like this document" (briefs §3). Omitted = button hidden. */
  onMoreLikeThis?: (seed: { id: number; title: string | null }) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-full !max-w-2xl flex h-full flex-col gap-0 p-0"
      >
        {row ? (
          <SanctionsGuidanceDetailBody
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

function SanctionsGuidanceDetailBody({
  row,
  onMoreLikeThis,
}: {
  row: SanctionsGuidanceDisplayRow
  onMoreLikeThis?: (seed: { id: number; title: string | null }) => void
}) {
  const auth = useAuth()
  const [detail, setDetail] = useState<SanctionsGuidanceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchSanctionsGuidanceDocument(row.id)
        if (cancelled) return
        setDetail(d.document)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [row.id])

  const title = detail?.title ?? row.title ?? '(untitled)'
  const sourceUrl = detail?.source_url ?? row.source_url
  const guidanceNumber = detail?.guidance_number ?? row.guidance_number
  const issued = detail?.issued_date ?? row.issued_date
  const ocr = detail?.ocr_quality ?? row.ocr_quality
  const degradedOcr = ocr != null && ocr !== 'clean'

  return (
    <>
      <SheetHeader className="space-y-2 border-b border-border bg-card p-5 pr-12">
        <div className="flex flex-wrap items-baseline gap-2">
          <SheetTitle className="font-serif text-base font-semibold leading-snug">
            {title}
          </SheetTitle>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {guidanceTypeLabel(detail?.guidance_type ?? row.guidance_type)}
          </span>
          {sourceUrl && (
            <span className="ml-auto">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Opens in a new tab"
                className="inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                ↗ ofac.treasury.gov
              </a>
            </span>
          )}
        </div>
        <SheetDescription className="text-xs text-muted-foreground">
          {[
            guidanceNumber ? `No. ${guidanceNumber}` : null,
            issued ? `issued ${issued}` : 'no issue date on record',
          ]
            .filter(Boolean)
            .join(' · ')}
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto p-5">
        {onMoreLikeThis && (
          <div className="mb-4 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!auth.hasAuth}
              title={
                auth.hasAuth
                  ? 'Find guidance similar to this document'
                  : 'Configure AI access (header, top right) to enable.'
              }
              onClick={() =>
                onMoreLikeThis({
                  id: row.id,
                  title: detail?.title ?? row.title ?? null,
                })
              }
            >
              More like this
            </Button>
          </div>
        )}
        {loading && (
          <p className="text-sm text-muted-foreground">Loading document…</p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {detail && (
          <div className="space-y-5">
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Programs &amp; authorities
              </h3>
              <div className="mt-1.5 space-y-1.5">
                <ProgramChips programs={detail.programs} max={12} />
                {detail.eo_numbers && detail.eo_numbers.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Executive orders:{' '}
                    {detail.eo_numbers.map((n) => `EO ${n}`).join(', ')}
                  </p>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Document text
              </h3>
              {degradedOcr && (
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  Text quality is flagged &ldquo;{ocr}&rdquo; — verbatim
                  wording may contain recognition errors; the OFAC link above
                  is the original.
                </p>
              )}
              {detail.body_text ? (
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-card p-4 font-sans text-sm leading-relaxed text-foreground">
                  {detail.body_text}
                </pre>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  (No text in the corpus for this document — the original
                  lives at the OFAC link above.)
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  )
}
