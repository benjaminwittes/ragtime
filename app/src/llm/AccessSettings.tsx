import { useState } from 'react'
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
import type { Provider } from './byok-context'
import { useByok } from './use-byok'

/**
 * "AI access" header affordance — opens a sheet where the user configures
 * their bring-your-own-key. v1 supports Anthropic only (the Worker accepts
 * OpenAI / Google on the BYOK path, but the React app doesn't surface them
 * yet — adding more providers is a config-only follow-up).
 *
 * Lives next to the docs trigger in the spoke header. Renders a status pip
 * (configured / not configured) so the user can see at a glance whether
 * AI modes are available without opening the sheet.
 */
export function AccessSettings() {
  const { config, isConfigured, save, clear, defaultModelFor } = useByok()
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Configure AI access (bring your own key)"
        className={cn(
          'flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block size-1.5 rounded-full',
            isConfigured ? 'bg-emerald-500' : 'bg-muted-foreground/40',
          )}
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
            Bring your own API key. AI modes (
            <span className="font-mono">claude_sql</span>, etc.) will call the
            Cloudflare Worker, which forwards your prompt to the provider
            using this key. Stored in your browser's localStorage; cleared
            with the Clear button below.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-5">
          <ByokForm
            initial={config}
            defaultModelFor={defaultModelFor}
            onSave={(next) => {
              save(next)
              setOpen(false)
            }}
            onClear={() => {
              clear()
              setOpen(false)
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
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
  // v1 only exposes Anthropic. State machinery is in place for OpenAI /
  // Google so adding them later is a small follow-up.
  const provider: Provider = 'anthropic'
  const [model, setModel] = useState(initial?.model ?? defaultModelFor(provider))
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) return
    onSave({ provider, model: model.trim() || defaultModelFor(provider), apiKey: trimmedKey })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Provider">
        <select
          value={provider}
          disabled
          aria-disabled="true"
          className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-muted-foreground"
        >
          <option value="anthropic">Anthropic</option>
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          OpenAI and Google are accepted by the Worker but not yet surfaced in
          this UI.
        </p>
      </Field>

      <Field label="Model">
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={defaultModelFor(provider)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Default: <code className="font-mono">{defaultModelFor(provider)}</code>.
          Override to use a different Claude model (e.g.,{' '}
          <code className="font-mono">claude-opus-4-7</code>,{' '}
          <code className="font-mono">claude-haiku-4-5</code>).
        </p>
      </Field>

      <Field label="API key">
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Stored in your browser's localStorage. Sent to the Cloudflare Worker
          in the request body on each AI-mode call; the Worker forwards it to
          the provider and discards it.
        </p>
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
