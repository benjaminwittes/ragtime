import { useEffect, useState } from 'react'
import { LogOutIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/use-auth'
import {
  isAmaPreflightSkipped,
  setAmaPreflightSkipped,
  subscribeAmaPreflightSkip,
} from '@/lib/ama-preflight-skip'
import { TopupDialog } from '@/auth/TopupDialog'
import { googleOffered } from '@/auth/sign-in'
import { usePaid } from '@/auth/use-paid'
import { getDemoPassword, setDemoPassword } from '@/lib/demo-access'
import { setUsageLogEnabled, useUsageLogEnabled, usageLoggingBuildEnabled } from '@/lib/usage-log'
import { toHref } from '@/lib/routing'
import type { Provider } from './byok-context'
import { useByok } from './use-byok'

type AccessTab = 'paid' | 'byok' | 'demo'

/**
 * "AI access" header affordance — opens a sheet with two ways to authorize
 * AI mode calls:
 *
 *   1. Lawfare-billed (paid tier) — sign-in via Supabase Auth, by magic
 *      link or, when the auth project offers it, with Google.
 *      Signed-in users see their email, balance, and per-query cap, plus
 *      a sign-out button. Top-up (Stripe Checkout) is a follow-up PR.
 *
 *   2. Bring your own key — choose a provider (Anthropic / OpenAI / Google)
 *      and paste its API key. The Worker forwards it to the provider on each
 *      call and discards.
 *
 *   Both can be configured simultaneously; the spoke's `useAuth()` resolves
 *   to whichever is active (paid > BYOK precedence per the legacy app).
 *
 * The trigger renders a status pip — emerald when paid is active, slate
 * when BYOK only, grey when neither. The sheet itself is paged: a tab row
 * at the top lets the user switch between the paid and BYOK panels.
 */
export function AccessSettings() {
  const auth = useAuth()
  const { returnError } = usePaid()
  // Someone who followed a sign-in link, or came back from Google, and got no
  // session lands on a page that looks exactly as it did before they tried.
  // The sheet opens on the sign-in form, which says what happened.
  const [open, setOpen] = useState(returnError !== null)
  // Default the active tab to whatever the user has configured (or paid
  // when neither, since paid is the recommended path). Persisted only for
  // the lifetime of the sheet open — re-opens restart from the default.
  const [tab, setTab] = useState<AccessTab>(() =>
    returnError !== null ? 'paid' : defaultTab(auth),
  )

  const pipColor = auth.isPaid
    ? 'bg-primary'
    : auth.hasByok
      ? 'bg-emerald-500'
      : auth.isDemo
        ? 'bg-amber-500'
        : 'bg-muted-foreground/40'

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => {
          setTab(defaultTab(auth))
          setOpen(true)
        }}
        aria-label="Configure AI access"
        className={cn(
          'flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('inline-block size-1.5 rounded-full', pipColor)}
        />
        {/* "Access" on a phone. Every header this button sits in runs out of row at 390px
            — the Explorer's measurably so — and the word "AI" is the one word here that
            the pip beside it and the sheet behind it both already say. Full text from
            `sm` up, where there is room for it. */}
        <span className="sm:hidden">Access</span>
        <span className="hidden sm:inline">AI access</span>
      </button>
      <SheetContent
        side="right"
        className="!w-full !max-w-md flex h-full flex-col gap-0 p-0"
      >
        <SheetHeader className="border-b border-border p-5 pr-12">
          <SheetTitle className="font-serif text-xl">AI access</SheetTitle>
          <SheetDescription>
            AI modes (writes SQL, reads cases, analyzes, AMA) need credentials.
            Pick one path; you can switch later.
          </SheetDescription>
        </SheetHeader>
        <div className="border-b border-border bg-muted/30">
          <TabRow tab={tab} setTab={setTab} />
        </div>
        {/* `data-stage-private`: a presenter may open this sheet while the stage is showing
            their page, and it holds an account, a balance and keys. The room is told a
            private panel is open and is sent none of it (`stage/mirror.ts`). */}
        <div className="flex-1 overflow-y-auto p-5" data-stage-private="">
          {tab === 'paid' && <PaidPanel onClose={() => setOpen(false)} />}
          {tab === 'byok' && <ByokPanel onClose={() => setOpen(false)} />}
          {tab === 'demo' && <DemoPanel onClose={() => setOpen(false)} />}
          <PreferencesPanel />
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Preferences sub-panel inside the AccessSettings sheet (PR 4w). Surfaces
 * controls that apply across paid + BYOK alike — currently just the AMA
 * pre-flight modal toggle. The modal is the cost-visibility floor; this
 * panel is where the user re-enables it after opting out via the modal's
 * "Don't show this again" checkbox.
 */
function PreferencesPanel() {
  const [skip, setSkipState] = useState(() => isAmaPreflightSkipped())
  const usageLogOn = useUsageLogEnabled()

  useEffect(() => {
    return subscribeAmaPreflightSkip(() => setSkipState(isAmaPreflightSkipped()))
  }, [])

  function handleToggle(nextShow: boolean) {
    setAmaPreflightSkipped(!nextShow)
  }

  return (
    <section className="mt-8 border-t border-border pt-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Preferences
      </h3>
      <label className="mt-3 flex items-start gap-3">
        <input
          type="checkbox"
          checked={!skip}
          onChange={(e) => handleToggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium text-foreground">
            Show pre-flight modal before each AMA query
          </span>
          <span className="block text-[11px] leading-relaxed text-muted-foreground">
            The modal shows the planner&apos;s estimated cost + plan summary
            and asks for confirmation before the synthesis call fires.
            Default on. Turn off if you want AMA queries to auto-execute
            after planning.
          </span>
        </span>
      </label>
      {usageLoggingBuildEnabled && (
        <label className="mt-4 flex items-start gap-3 opacity-80">
          <input
            type="checkbox"
            checked={usageLogOn}
            onChange={(e) => setUsageLogEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium text-foreground">
              Log my sessions for tuning
            </span>
            <span className="block text-[11px] leading-relaxed text-muted-foreground">
              Records each AI answer you run — the query, the plan, what it
              returned, and any rating/note you add — so the tool can be
              refined from real use. Off by default. Your sessions only.
            </span>
          </span>
        </label>
      )}
    </section>
  )
}

function defaultTab(auth: {
  isPaid: boolean
  hasByok: boolean
  isDemo: boolean
}): AccessTab {
  if (auth.isPaid) return 'paid'
  if (auth.hasByok) return 'byok'
  if (auth.isDemo) return 'demo'
  return 'paid'
}

function TabRow({
  tab,
  setTab,
}: {
  tab: AccessTab
  setTab: (t: AccessTab) => void
}) {
  return (
    <div role="tablist" className="flex">
      <TabButton
        active={tab === 'paid'}
        onClick={() => setTab('paid')}
        label="Lawfare-billed"
        sub="Prepaid blocks"
      />
      <TabButton
        active={tab === 'byok'}
        onClick={() => setTab('byok')}
        label="Bring your own key"
        sub="Anthropic · OpenAI · Google"
      />
      <TabButton
        active={tab === 'demo'}
        onClick={() => setTab('demo')}
        label="Demo"
        sub="Lawfare key"
      />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean
  onClick: () => void
  label: string
  sub: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex-1 border-b-2 px-4 py-3 text-left text-sm transition',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span className="block font-medium">{label}</span>
      <span className="block text-[11px] text-muted-foreground">{sub}</span>
    </button>
  )
}

function PaidPanel({ onClose }: { onClose: () => void }) {
  const paid = usePaid()
  if (paid.signedIn) {
    return <SignedInView onClose={onClose} />
  }
  return <SignInForm />
}

/** Whether to offer Google: false until the auth project says it is on. */
function useGoogleOffered(): boolean {
  const [offered, setOffered] = useState(false)
  useEffect(() => {
    let live = true
    void googleOffered().then((yes) => {
      if (live) setOffered(yes)
    })
    return () => {
      live = false
    }
  }, [])
  return offered
}

function SignInForm() {
  const paid = usePaid()
  const google = useGoogleOffered()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  // A failed return is this form's first error, and is said once: taken
  // from the context here, and forgotten there.
  const [error, setError] = useState<string | null>(paid.returnError)
  const { clearReturnError } = paid
  useEffect(() => clearReturnError(), [clearReturnError])

  async function handleGoogle() {
    setError(null)
    setLeaving(true)
    const errMsg = await paid.signInWithGoogle()
    // No error means the browser is already on its way to Google, and the
    // button stays as it is until the page goes.
    if (errMsg) {
      setError(errMsg)
      setLeaving(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || trimmed.indexOf('@') < 1) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const errMsg = await paid.signInWithEmail(trimmed)
      if (errMsg) {
        setError(errMsg)
      } else {
        setSentTo(trimmed)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <div className="space-y-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
        <p className="font-medium text-foreground">
          Check your email.
        </p>
        <p className="text-foreground/90">
          We sent a sign-in link to{' '}
          <code className="font-mono">{sentTo}</code>. Click it to come back
          signed in.
        </p>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setSentTo(null)}
          className="h-7 px-2 text-xs"
        >
          Use a different email
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-foreground/90">
          Sign in to use Lawfare-billed Anthropic credit.
          {!google &&
            ' We send a one-time sign-in link to your email — no password.'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          First-time users start with a $0 balance; top up after sign-in.
        </p>
      </div>
      {google && (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleGoogle()}
            disabled={leaving || submitting}
            className="flex w-full items-center justify-center gap-2"
            data-sign-in="google"
          >
            <GoogleMark />
            {leaving ? 'Opening Google…' : 'Continue with Google'}
          </Button>
          <p
            role="separator"
            className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
          >
            or by email
          </p>
        </>
      )}
      <label className="block space-y-1.5">
        <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Email
        </span>
        <Input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={submitting || leaving}
        />
        {google && (
          <span className="block text-xs text-muted-foreground">
            We send a one-time sign-in link — no password.
          </span>
        )}
      </label>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={submitting || leaving || !email.trim()}>
        {submitting ? 'Sending…' : 'Send sign-in link'}
      </Button>
      <p className="text-xs text-muted-foreground">
        By signing in you agree to our{' '}
        <a
          href={toHref('/terms')}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Terms of Service
        </a>
        . We handle your email and billing data as described in our{' '}
        <a
          href={toHref('/privacy')}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Privacy Policy
        </a>
        .
      </p>
    </form>
  )
}

/** Google's "G", in its own four colours, as its sign-in branding asks. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

function SignedInView({ onClose }: { onClose: () => void }) {
  const paid = usePaid()
  const [signingOut, setSigningOut] = useState(false)
  const [topupOpen, setTopupOpen] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await paid.signOut()
    } finally {
      setSigningOut(false)
      onClose()
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Signed in as
        </h3>
        <p className="mt-1 font-medium text-foreground">
          {paid.email ?? '—'}
        </p>
      </section>

      {paid.account?.billing === 'org' ? (
        <OrgCovered />
      ) : (
        <section className="rounded-md border border-border bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Balance
            </h3>
            <button
              type="button"
              onClick={() => void paid.refreshBalance()}
              className="text-[11px] text-primary hover:underline"
              disabled={paid.balanceLoading}
            >
              {paid.balanceLoading ? 'refreshing…' : 'refresh'}
            </button>
          </div>
          <p
            className={cn(
              'mt-1 font-mono text-3xl font-semibold tabular-nums',
              paid.account && paid.account.balance_cents <= 50
                ? 'text-destructive'
                : paid.account && paid.account.balance_cents <= 500
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-foreground',
            )}
          >
            {paid.account ? fmtCents(paid.account.balance_cents) : '—'}
          </p>
          {paid.account && (
            <p className="mt-2 text-xs text-muted-foreground">
              Per-query cap:{' '}
              <span className="font-mono">
                {fmtCents(paid.account.per_query_cap_cents)}
              </span>
            </p>
          )}
          {paid.balanceError && (
            <p className="mt-2 text-xs text-destructive">{paid.balanceError}</p>
          )}
          <div className="mt-4 flex items-center gap-2">
            <Button type="button" onClick={() => setTopupOpen(true)}>
              Top up
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Prepaid blocks via Stripe Checkout.
            </span>
          </div>
        </section>
      )}

      <section>
        <Button
          type="button"
          variant="outline"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-2"
        >
          <LogOutIcon className="size-3.5" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </section>

      <TopupDialog open={topupOpen} onOpenChange={setTopupOpen} />
    </div>
  )
}

/**
 * What an account on the organisation's allowance sees where a balance would be. Its AI
 * use is paid for, so there is no balance to show and nothing to top up; the one limit
 * it can meet is the day's shared count, which is shown when the Worker sent it.
 */
function OrgCovered() {
  const paid = usePaid()
  const allowance = paid.account?.allowance
  return (
    <section
      className="rounded-md border border-border bg-card p-4"
      data-billing="org"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Covered by Lawfare
        </h3>
        <button
          type="button"
          onClick={() => void paid.refreshBalance()}
          className="text-[11px] text-primary hover:underline"
          disabled={paid.balanceLoading}
        >
          {paid.balanceLoading ? 'refreshing…' : 'refresh'}
        </button>
      </div>
      <p className="mt-1 text-sm text-foreground/90">
        AI use on this account is paid for by Lawfare. There is nothing to top
        up.
      </p>
      {allowance && (
        <p className="mt-2 text-xs text-muted-foreground">
          Shared allowance today:{' '}
          <span className="font-mono">
            {allowance.calls_today === null
              ? '—'
              : allowance.calls_today.toLocaleString()}{' '}
            of {allowance.daily_quota.toLocaleString()}
          </span>{' '}
          model calls, counted across everyone on it.
        </p>
      )}
      {paid.balanceError && (
        <p className="mt-2 text-xs text-destructive">{paid.balanceError}</p>
      )}
    </section>
  )
}

function ByokPanel({ onClose }: { onClose: () => void }) {
  const { config, save, clear, defaultModelFor } = useByok()
  return (
    <ByokForm
      initial={config}
      defaultModelFor={defaultModelFor}
      onSave={(next) => {
        save(next)
        onClose()
      }}
      onClear={() => {
        clear()
        onClose()
      }}
    />
  )
}

const API_KEY_PLACEHOLDER: Record<Provider, string> = {
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  google: 'AIza...',
}

function ByokForm({
  initial,
  defaultModelFor,
  onSave,
  onClear,
}: {
  initial: { provider: Provider; model: string; apiKey: string } | null
  defaultModelFor: (p: Provider) => string
  onSave: (config: {
    provider: Provider
    model: string
    apiKey: string
  }) => void
  onClear: () => void
}) {
  const [provider, setProvider] = useState<Provider>(
    initial?.provider ?? 'anthropic',
  )
  const [model, setModel] = useState(initial?.model ?? defaultModelFor(provider))
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '')

  function handleProviderChange(next: Provider) {
    setProvider(next)
    // Re-default the model to the new provider's default. A model id is
    // provider-specific (e.g. claude-… vs gpt-… vs gemini-…), so carrying
    // the old one over would always be wrong.
    setModel(defaultModelFor(next))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) return
    onSave({
      provider,
      model: model.trim() || defaultModelFor(provider),
      apiKey: trimmedKey,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-foreground/90">
        Choose a provider and paste an API key for it. The Worker forwards your
        prompt to the provider using this key and discards it. Stored in your
        browser&apos;s localStorage; cleared with the Clear button.
      </p>
      <Field label="Provider">
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as Provider)}
          className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT)</option>
          <option value="google">Google (Gemini)</option>
        </select>
      </Field>

      <Field label="Model">
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={defaultModelFor(provider)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Default: <code className="font-mono">{defaultModelFor(provider)}</code>.
        </p>
      </Field>

      <Field label="API key">
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={API_KEY_PLACEHOLDER[provider]}
        />
      </Field>

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={!apiKey.trim()}>
          {initial ? 'Update' : 'Save'}
        </Button>
        {initial && (
          <Button type="button" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
    </form>
  )
}

/**
 * TEMPORARY pre-launch demo affordance. Lets a demoer paste the shared
 * Lawfare demo password, which unlocks the Worker's demo auth mode
 * (Lawfare-billed Anthropic, shared daily quota, no per-user balance).
 * Not a launch tier — see src/lib/demo-access.ts. Remove with that module.
 */
function DemoPanel({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState(() => getDemoPassword() ?? '')
  const saved = getDemoPassword()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = password.trim()
    if (!trimmed) return
    setDemoPassword(trimmed)
    onClose()
  }

  function handleClear() {
    setDemoPassword(null)
    setPassword('')
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground/90">
        Internal demo access. Enter the shared Lawfare demo password to run AI
        modes on Lawfare&apos;s key (shared daily quota, no balance). For
        demos only — regular users use Lawfare-billed sign-in or their own
        key.
        <span className="mt-2 block text-foreground/70">
          Note: sessions run in demo mode are logged (your query, the plan,
          and the result) to help improve the underlying datasets. This
          applies to internal demo use only.
        </span>
      </div>
      <Field label="Demo password">
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Demo password"
        />
      </Field>
      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={!password.trim()}>
          {saved ? 'Update' : 'Save'}
        </Button>
        {saved && (
          <Button type="button" variant="ghost" onClick={handleClear}>
            Clear
          </Button>
        )}
      </div>
    </form>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  )
}

function fmtCents(c: number): string {
  if (!Number.isFinite(c)) return '—'
  if (c < 100) return `${c.toFixed(0)}¢`
  return `$${(c / 100).toFixed(2)}`
}
