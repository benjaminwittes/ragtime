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
 *   1. Lawfare-billed (paid tier) — magic-link sign-in via Supabase Auth.
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
  const [open, setOpen] = useState(false)
  // Default the active tab to whatever the user has configured (or paid
  // when neither, since paid is the recommended path). Persisted only for
  // the lifetime of the sheet open — re-opens restart from the default.
  const [tab, setTab] = useState<AccessTab>(() => defaultTab(auth))

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
        AI access
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
        <div className="flex-1 overflow-y-auto p-5">
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

function SignInForm() {
  const paid = usePaid()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          Sign in to use Lawfare-billed Anthropic credit. We send a one-time
          sign-in link to your email — no password.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          First-time users start with a $0 balance; top up after sign-in.
        </p>
      </div>
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
          disabled={submitting}
        />
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting || !email.trim()}>
        {submitting ? 'Sending…' : 'Send sign-in link'}
      </Button>
      <p className="text-xs text-muted-foreground">
        We handle your email and billing data as described in our{' '}
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
