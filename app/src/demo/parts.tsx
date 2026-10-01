import { isValidElement, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Button } from '@/components/ui/button'
import { toHref } from '@/lib/routing'
import { cn } from '@/lib/utils'

import { FigureByName } from '@/stage/FigureByName'

import { SLIDE } from './prose.ts'

/**
 * The pieces of the presenter's kit that more than one page draws: the form that asks for
 * the passphrase, the kit's markdown, and a slide. `/demo` reads them, `/present` drives
 * with them, and `/stage` shows the slide to the room — one slide component, so what a
 * presenter rehearses is exactly what an audience gets.
 */

const SAID = {
  ask: 'Open it with the link you were sent, or paste the passphrase from that link here.',
  passphrase: 'Passphrase',
  open: 'Open',
  opening: 'Opening…',
} as const

export function Locked({
  title,
  said,
  onTry,
}: {
  title: string
  said: string | null
  onTry: (passphrase: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || !value.trim()) return
    setBusy(true)
    await onTry(value)
    setBusy(false)
  }
  return (
    <form onSubmit={submit} className="grid gap-3" data-demo="locked">
      <h1 className="font-serif text-2xl font-medium">{title}</h1>
      <p className="text-sm text-lawfare-text-secondary">{SAID.ask}</p>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={SAID.passphrase}
        aria-label={SAID.passphrase}
        autoComplete="off"
        className="w-full rounded-md border border-lawfare-line-strong bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {said !== null && (
        <p role="alert" className="text-sm text-destructive">
          {said}
        </p>
      )}
      <div>
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy ? SAID.opening : SAID.open}
        </Button>
      </div>
    </form>
  )
}

/**
 * The name in a fenced `figure` block, or null for any other block. Markdown hands a
 * fence over as `<pre><code class="language-figure">`, so this reads the one child.
 */
function figureIn(children: ReactNode): string | null {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(children)) return null
  if (children.props.className !== 'language-figure') return null
  return String(children.props.children ?? '').trim() || null
}

/**
 * Kit markdown. Links are written as the docs write them — a logical path for anything
 * in this app — and every one opens in a new tab, because the page a presenter is reading
 * from is the one page they must not navigate away from. The same holds for the room: a
 * link on a slide opens beside the stage, not instead of it.
 *
 * A fenced block marked `figure` is not code: it names a live figure (`stage/figures.ts`),
 * drawn in its place.
 */
export function KitMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: label }) => {
            const own = !!href && href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\')
            return (
              <a href={own ? toHref(href) : href} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            )
          },
          pre: ({ children: block }) => {
            const figure = figureIn(block)
            return figure === null ? <pre>{block}</pre> : <FigureByName name={figure} />
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

/** What a slide shows. A deck's `Slide` without its notes, which is all the room is sent. */
export type SlideFaceContent = { part: string; title: string; body: string }

/**
 * One slide, 16:9, every measure in `cqw` so it is the same picture at any width. The
 * element is the slide and nothing else: whoever places it decides how wide it is and
 * what a click on it does.
 */
export function SlideFace({
  slide,
  at,
  of,
  className,
  ...rest
}: { slide: SlideFaceContent; at: number; of: number } & ComponentProps<'section'>) {
  return (
    <section
      aria-roledescription="slide"
      aria-label={`${at + 1} of ${of}: ${slide.title}`}
      className={cn('relative flex aspect-video w-full flex-col overflow-hidden bg-card [container-type:inline-size]', className)}
      {...rest}
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center px-[7cqw] pb-[2cqw] pt-[5cqw]">
        {slide.part && (
          <p className="mb-[1.2cqw] font-sans text-[1.5cqw] font-semibold uppercase tracking-[0.14em] text-primary">
            {slide.part}
          </p>
        )}
        <h2 className="font-serif text-[4.6cqw] font-medium leading-[1.08] tracking-tight text-balance">
          {slide.title}
        </h2>
        {slide.body && <KitMarkdown className={cn('mt-[2.2cqw]', SLIDE)}>{slide.body}</KitMarkdown>}
      </div>
      <div className="flex items-baseline justify-between px-[7cqw] pb-[2.4cqw] font-sans text-[1.3cqw] text-lawfare-muted">
        <span>RAGtime</span>
        <span>
          {at + 1} / {of}
        </span>
      </div>
    </section>
  )
}
