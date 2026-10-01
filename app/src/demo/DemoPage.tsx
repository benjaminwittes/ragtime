import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { AppLink } from '@/components/AppLink'
import { Button } from '@/components/ui/button'
import { toHref } from '@/lib/routing'
import { cn } from '@/lib/utils'

import { openKit, passphraseIn, slideAfter, type DemoView, type Kit, type SealedKit, type Slide } from './kit.ts'

/** Where the sealed kit is served. Not under `/demo`, so the file and the route never contend for one path. */
const KIT_PATH = '/kits/demo.sealed.json'

/** The passphrase, once a link has delivered it, so the second visit needs no link. */
const KEPT = 'ragtime_demo_kit_key_v1'

/** The words. */
const SAID = {
  loading: 'Opening…',
  locked: 'This page is for the people presenting.',
  ask: 'Open it with the link you were sent, or paste the passphrase from that link here.',
  passphrase: 'Passphrase',
  open: 'Open',
  wrong: 'That passphrase does not open this.',
  unreadable: 'This kit was sealed in a format this page cannot read. Reload, and if that does not help, tell whoever sent the link.',
  missing: 'There is no kit here right now.',
  guide: 'Guide',
  deck: 'Deck',
  present: 'Present',
  notes: 'Notes',
  noNotes: 'No notes for this slide.',
  keys: '← → move · F full screen · N notes',
  forget: 'Lock this page on this device',
} as const

type State =
  | { at: 'loading' }
  | { at: 'missing' }
  | { at: 'locked'; sealed: SealedKit; said: string | null }
  | { at: 'open'; kit: Kit }

function kept(): string | null {
  try {
    return window.localStorage.getItem(KEPT)
  } catch {
    return null
  }
}

function keep(passphrase: string | null) {
  try {
    if (passphrase === null) window.localStorage.removeItem(KEPT)
    else window.localStorage.setItem(KEPT, passphrase)
  } catch {
    /* a browser that refuses storage just asks again next time */
  }
}

/**
 * The presenter's kit: a guide and a deck, for the people giving a demo.
 *
 * Internal, and this app has no server to make it so — it is a static site built from a
 * public repository. So the kit is served sealed (`scripts/seal-kit.mjs`) and opened here,
 * in the browser, with a passphrase the link carries in its fragment: `/demo#k=…`. One
 * link, no sign-in, and neither the words nor the passphrase ever reach a server.
 *
 * The passphrase is taken out of the address bar the moment it is read, and kept on the
 * device instead. That is not tidiness. The deck is shown on a shared screen, with the
 * address bar in view, and a passphrase left there would be handed to the room.
 */
export function DemoPage({ view }: { view: DemoView }) {
  const [state, setState] = useState<State>({ at: 'loading' })
  // Read once, into state, and not inside the effect that strips it: StrictMode runs an
  // effect twice in development, and the second run would find the fragment already gone
  // and conclude that no link had been followed.
  const [fromLink] = useState(() => passphraseIn(window.location.hash))

  useEffect(() => {
    let cancelled = false
    if (fromLink !== null && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    ;(async () => {
      let sealed: SealedKit
      try {
        const response = await fetch(toHref(KIT_PATH), { cache: 'no-cache' })
        if (!response.ok) throw new Error(String(response.status))
        sealed = (await response.json()) as SealedKit
      } catch {
        if (!cancelled) setState({ at: 'missing' })
        return
      }
      const passphrase = fromLink ?? kept()
      if (passphrase === null) {
        if (!cancelled) setState({ at: 'locked', sealed, said: null })
        return
      }
      const opened = await openKit(sealed, passphrase)
      if (cancelled) return
      if (opened.ok) {
        keep(passphrase)
        setState({ at: 'open', kit: opened.kit })
      } else {
        // A kept passphrase that no longer opens the kit means the kit was re-sealed
        // with a new one; forget it, so the page asks rather than failing forever.
        if (fromLink === null) keep(null)
        setState({ at: 'locked', sealed, said: fromLink === null ? null : SAID[opened.why] })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fromLink])

  async function tryPassphrase(sealed: SealedKit, passphrase: string) {
    const opened = await openKit(sealed, passphrase.trim())
    if (opened.ok) {
      keep(passphrase.trim())
      setState({ at: 'open', kit: opened.kit })
    } else {
      setState({ at: 'locked', sealed, said: SAID[opened.why] })
    }
  }

  if (state.at !== 'open') {
    return (
      <main className="min-h-[60vh] bg-lawfare-paper text-foreground">
        <div className="mx-auto max-w-md px-6 py-20">
          {state.at === 'loading' && <p className="text-sm text-lawfare-text-secondary">{SAID.loading}</p>}
          {state.at === 'missing' && <p className="text-sm text-lawfare-text-secondary">{SAID.missing}</p>}
          {state.at === 'locked' && (
            <Locked said={state.said} onTry={(passphrase) => tryPassphrase(state.sealed, passphrase)} />
          )}
        </div>
      </main>
    )
  }

  const { kit } = state
  return (
    <main className="min-h-screen bg-lawfare-paper text-foreground" data-demo={view}>
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <header className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-lawfare-line py-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl font-medium tracking-tight">{kit.title}</h1>
            <p className="text-sm text-lawfare-text-secondary">{kit.when}</p>
          </div>
          <nav className="flex items-baseline gap-5 font-serif text-lg" aria-label="Kit">
            <Face to="/demo" current={view === 'guide'}>
              {SAID.guide}
            </Face>
            <Face to="/demo/deck" current={view === 'deck'}>
              {SAID.deck}
            </Face>
          </nav>
        </header>

        {view === 'guide' ? (
          <article className="mx-auto max-w-3xl py-8">
            <KitMarkdown className={PROSE}>{kit.guide}</KitMarkdown>
            <p className="mt-12 border-t border-lawfare-line pt-4 text-xs text-lawfare-muted">
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  keep(null)
                  window.location.reload()
                }}
              >
                {SAID.forget}
              </button>
            </p>
          </article>
        ) : (
          <Deck slides={kit.slides} />
        )}
      </div>
    </main>
  )
}

function Face({ to, current, children }: { to: string; current: boolean; children: ReactNode }) {
  return (
    <AppLink
      to={to}
      aria-current={current ? 'page' : undefined}
      className="border-b-2 border-transparent pb-0.5 text-lawfare-text-secondary hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
    >
      {children}
    </AppLink>
  )
}

function Locked({ said, onTry }: { said: string | null; onTry: (passphrase: string) => Promise<void> }) {
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
      <h1 className="font-serif text-2xl font-medium">{SAID.locked}</h1>
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
          {busy ? SAID.loading : SAID.open}
        </Button>
      </div>
    </form>
  )
}

/**
 * The typography plugin is not installed (see `DocsOverlay`), so rendered markdown is
 * styled directly. The guide is read at a desk, mid-rehearsal, so it gets real tables and
 * room between sections.
 */
const PROSE = cn(
  'text-[15px] leading-relaxed',
  '[&_p]:my-3',
  '[&_h1]:mt-10 [&_h1]:mb-3 [&_h1]:font-serif [&_h1]:text-3xl [&_h1]:font-medium [&_h1:first-child]:mt-0',
  '[&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:border-t [&_h2]:border-lawfare-line [&_h2]:pt-5 [&_h2]:font-serif [&_h2]:text-2xl',
  '[&_h3]:mt-6 [&_h3]:mb-1.5 [&_h3]:font-semibold',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
  // A checklist's box is its marker; a bullet beside it is a second one.
  '[&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-0',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:font-serif [&_blockquote]:text-lg',
  '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
  '[&_th]:border-b [&_th]:border-lawfare-line-strong [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border-b [&_td]:border-lawfare-line [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top',
  '[&_hr]:my-8 [&_hr]:border-lawfare-line',
  '[&_input[type=checkbox]]:mr-2',
)

/**
 * A slide's markdown, sized against the slide and not the window: every measure is in
 * `cqw`, so the same slide is the same picture in a rehearsal column and on a projector.
 */
const SLIDE = cn(
  'text-[2.3cqw] leading-snug',
  '[&_p]:my-[1.1cqw]',
  '[&_ul]:my-[1.1cqw] [&_ul]:list-disc [&_ul]:pl-[3cqw] [&_ol]:my-[1.1cqw] [&_ol]:list-decimal [&_ol]:pl-[3cqw]',
  '[&_li]:my-[0.7cqw] [&_li::marker]:text-primary',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-[0.5cqw] [&_code]:font-mono [&_code]:text-[1.9cqw]',
  '[&_blockquote]:my-[1.4cqw] [&_blockquote]:border-l-[0.3cqw] [&_blockquote]:border-primary [&_blockquote]:pl-[1.8cqw] [&_blockquote]:font-serif [&_blockquote]:text-[3cqw] [&_blockquote]:leading-tight',
  '[&_table]:my-[1.2cqw] [&_table]:w-full [&_table]:border-collapse [&_table]:text-[1.9cqw]',
  '[&_th]:border-b [&_th]:border-lawfare-line-strong [&_th]:px-[0.8cqw] [&_th]:py-[0.5cqw] [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border-b [&_td]:border-lawfare-line [&_td]:px-[0.8cqw] [&_td]:py-[0.5cqw] [&_td]:align-top',
  '[&_h2]:mt-[1.6cqw] [&_h2]:font-serif [&_h2]:text-[2.8cqw]',
)

/**
 * Kit markdown. Links are written as the docs write them — a logical path for anything
 * in this app — and every one opens in a new tab, because the page a presenter is reading
 * from is the one page they must not navigate away from.
 */
function KitMarkdown({ children, className }: { children: string; className?: string }) {
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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

function editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

/** The slide a reload should come back to: `#s=<n>`, one-based, as a presenter counts. */
function slideInHash(count: number): number {
  const n = Number(new URLSearchParams(window.location.hash.replace(/^#/, '')).get('s'))
  return Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : 0
}

/**
 * The deck: one slide on a 16:9 stage, the notes and the running order under it.
 *
 * Full screen takes the stage alone, so what the room sees is the slide and nothing a
 * presenter reads from. The notes are for rehearsal and for a second window; the guide is
 * what a presenter keeps beside them on the day.
 */
function Deck({ slides }: { slides: Slide[] }) {
  const [at, setAt] = useState(() => slideInHash(slides.length))
  const [notes, setNotes] = useState(true)
  const [full, setFull] = useState(false)
  const stage = useRef<HTMLDivElement>(null)

  // The key handler reads where the deck is from a ref, not from the closure and not from
  // a state updater: it has to decide *during the event* whether the key was its own, so
  // that Space moves a slide instead of scrolling the page, and an updater runs too late
  // to call `preventDefault`.
  const here = useRef(at)
  useEffect(() => {
    here.current = at
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#s=${at + 1}`)
  }, [at])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (editable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        if (document.fullscreenElement) void document.exitFullscreen()
        else void stage.current?.requestFullscreen?.()
        return
      }
      if (event.key === 'n' || event.key === 'N') {
        setNotes((shown) => !shown)
        return
      }
      const next = slideAfter(event.key, here.current, slides.length)
      if (next === here.current) return
      event.preventDefault()
      setAt(next)
    }
    const onFull = () => setFull(document.fullscreenElement === stage.current)
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFull)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFull)
    }
  }, [slides.length])

  const slide = slides[at]
  if (!slide) return null
  return (
    <div className="py-6">
      {/* The full-screen element is this wrapper, not the slide: full screen stretches
          its element to the display, and a 16:9 slide on a 16:10 laptop needs something
          around it to be centred in. */}
      <div
        ref={stage}
        className={cn('flex items-center justify-center', full && 'bg-lawfare-paper')}
        data-demo="stage"
      >
        <section
          aria-roledescription="slide"
          aria-label={`${at + 1} of ${slides.length}: ${slide.title}`}
          style={full ? { width: 'min(100vw, calc(100vh * 16 / 9))' } : undefined}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) return
            const box = event.currentTarget.getBoundingClientRect()
            const forward = event.clientX - box.left > box.width / 3
            setAt((here) => slideAfter(forward ? 'ArrowRight' : 'ArrowLeft', here, slides.length))
          }}
          className={cn(
            'relative flex aspect-video w-full cursor-pointer flex-col overflow-hidden bg-card [container-type:inline-size]',
            !full && 'rounded-md border border-lawfare-line-strong shadow-sm',
          )}
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
              {at + 1} / {slides.length}
            </span>
          </div>
        </section>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-lawfare-muted">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAt((here) => slideAfter('ArrowLeft', here, slides.length))}
          disabled={at === 0}
        >
          ←
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAt((here) => slideAfter('ArrowRight', here, slides.length))}
          disabled={at === slides.length - 1}
        >
          →
        </Button>
        <Button size="sm" onClick={() => void stage.current?.requestFullscreen?.()}>
          {SAID.present}
        </Button>
        <span>{SAID.keys}</span>
      </div>

      <div className="mt-6 grid gap-8 md:grid-cols-[1fr_18rem]">
        <section aria-label={SAID.notes}>
          <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-lawfare-muted">
            {SAID.notes}
          </h3>
          {notes &&
            (slide.notes ? (
              <KitMarkdown className={cn('mt-1', PROSE)}>{slide.notes}</KitMarkdown>
            ) : (
              <p className="mt-2 text-sm text-lawfare-muted">{SAID.noNotes}</p>
            ))}
        </section>
        <ol className="grid content-start gap-0.5 text-sm">
          {slides.map((each, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => setAt(index)}
                aria-current={index === at ? 'true' : undefined}
                className="flex w-full gap-2 rounded px-2 py-1 text-left text-lawfare-text-secondary hover:bg-muted aria-[current=true]:bg-lawfare-teal-bg aria-[current=true]:text-foreground"
              >
                <span className="w-5 shrink-0 text-right tabular-nums text-lawfare-muted">{index + 1}</span>
                <span className="min-w-0 truncate">{each.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
