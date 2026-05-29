import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { OlcAmaPlan, OlcAmaSynthesis } from '@/lib/worker-client'

/**
 * AMA result panel for the OLC spoke. Renders the narrative + plan
 * disclosure + candor notes + cited opinion ids.
 *
 * Layout (top to bottom):
 *   - Plan (collapsible details) — what the agent decided to do
 *   - Candor notes — released-vs-issued caveats, missing facets, degraded OCR
 *   - Narrative markdown — the actual answer
 *   - Cited opinions — the opinion_ids the agent returned (list/hybrid
 *     output_mode only); each is clickable to open the detail sheet
 *
 * Brief #2 §5 — attribution-forward, auditable. The plan + candor notes
 * sit above the answer so the user sees the methodology before the prose.
 */
export function OlcAmaResult({
  synthesis,
  plan,
  loading,
  error,
  onOpenOpinion,
}: {
  synthesis: OlcAmaSynthesis | null
  plan: OlcAmaPlan | null
  loading: boolean
  error: string | undefined
  onOpenOpinion: (id: number) => void
}) {
  if (loading && !synthesis) {
    return (
      <section className="border-b border-border bg-background px-6 py-8 text-sm text-muted-foreground">
        Working — see the session log above for progress.
      </section>
    )
  }
  if (error && !synthesis) {
    return (
      <section className="border-b border-border bg-background px-6 py-8">
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      </section>
    )
  }
  if (!synthesis) {
    return (
      <section className="border-b border-border bg-background px-6 py-8 text-sm text-muted-foreground">
        Ask a question to see a narrative synthesis here.
      </section>
    )
  }

  return (
    <section className="border-b border-border bg-background px-6 py-6">
      {plan && <PlanDisclosure plan={plan} />}
      {synthesis.candor_notes.length > 0 && (
        <CandorNotes notes={synthesis.candor_notes} />
      )}
      <article className="mt-4 space-y-3 text-sm text-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={MARKDOWN_COMPONENTS}
        >
          {synthesis.answer_markdown}
        </ReactMarkdown>
      </article>
      {synthesis.opinion_ids && synthesis.opinion_ids.length > 0 && (
        <CitedOpinions
          ids={synthesis.opinion_ids}
          onOpen={onOpenOpinion}
        />
      )}
    </section>
  )
}

function PlanDisclosure({ plan }: { plan: OlcAmaPlan }) {
  const [open, setOpen] = useState(false)
  const queryCount = plan.queries.length
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="mb-3 rounded-md border border-border bg-card"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/40">
        Plan ({plan.output_mode} · {queryCount} quer{queryCount === 1 ? 'y' : 'ies'})
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3 text-xs text-foreground/90">
        <p className="leading-relaxed">{plan.approach_summary || '(no plan summary)'}</p>
        {plan.queries.length > 0 && (
          <ol className="space-y-2 list-decimal pl-5">
            {plan.queries.map((q, i) => (
              <li key={i} className="leading-snug">
                <span className="font-medium">{q.label}</span>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded border border-border bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                  {q.sql}
                </pre>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  )
}

function CandorNotes({ notes }: { notes: readonly string[] }) {
  return (
    <aside
      className={cn(
        'mb-3 rounded-md border px-3 py-2 text-xs',
        'border-amber-400/50 bg-amber-500/10 text-amber-900 dark:text-amber-200',
      )}
    >
      <h3 className="text-[10px] font-medium uppercase tracking-wider opacity-80">
        Candor notes
      </h3>
      <ul className="mt-1 list-disc pl-5">
        {notes.map((n, i) => (
          <li key={i} className="leading-relaxed">
            {n}
          </li>
        ))}
      </ul>
    </aside>
  )
}

function CitedOpinions({
  ids,
  onOpen,
}: {
  ids: readonly number[]
  onOpen: (id: number) => void
}) {
  return (
    <section className="mt-6 border-t border-border pt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Cited opinions ({ids.length.toLocaleString()})
      </h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {ids.map((id) => (
          <li key={id}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs font-mono"
              onClick={() => onOpen(id)}
            >
              Opinion #{id}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Same shape as the litigation analysis-narrative markdown styles, so the
 *  editorial register is consistent across spokes. */
const MARKDOWN_COMPONENTS = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="font-serif text-2xl font-semibold mt-2 mb-3" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className="font-serif text-xl font-semibold mt-5 mb-2 border-b border-border pb-1"
      {...props}
    />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="font-serif text-base font-semibold mt-4 mb-1.5" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="leading-relaxed text-foreground" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-primary hover:underline" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-6 space-y-1" {...props} />
  ),
  ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-6 space-y-1" {...props} />
  ),
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  blockquote: (props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground"
      {...props}
    />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]"
      {...props}
    />
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <table
      className="my-3 w-full border-collapse text-xs"
      {...props}
    />
  ),
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th
      className="border border-border bg-muted/40 px-2 py-1 text-left font-medium"
      {...props}
    />
  ),
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="border border-border px-2 py-1 align-top" {...props} />
  ),
}
