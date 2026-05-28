import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  type CourtPreset,
  type FilterFields,
  detectCourtPreset,
  isCircuitCourt,
  resolveCourtPreset,
} from '@/lib/worker-client'
import type { FacetSpec } from '../types'

/**
 * Brief #6 §2's eight-axis filter form, ported from index.html.
 *
 * Mostly descriptor-driven: the `facets` array dictates which controls
 * render and how. Court presets are litigation-specific (the descriptor's
 * `scopes` array carries them, but for v1 we hard-code the resolve logic
 * here since the four presets map cleanly to the well-known circuit-vs-
 * district taxonomy in `isCircuitCourt`).
 *
 * Defaults (brief #6 §6): `from` = 2025-01-20, courts = all-courts preset.
 */

const LITIGATION_FLOOR = '2025-01-20'

type FacetData = {
  courts: readonly string[]
  judges: readonly string[]
  collections: readonly { slug: string; name: string }[]
}

export function FilterForm({
  facets,
  facetData,
  loading,
  onSubmit,
}: {
  facets: readonly FacetSpec[]
  facetData: FacetData | undefined
  /** Submit-in-flight flag — disables the apply button. */
  loading: boolean
  onSubmit: (fields: FilterFields) => void
}) {
  const facetById = useMemo(() => {
    const m = new Map<string, FacetSpec>()
    for (const f of facets) m.set(f.id, f)
    return m
  }, [facets])

  // Field state. We treat fields as a flat record; the submit step packs
  // it into the FilterFields wire shape.
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [judge, setJudge] = useState('')
  const [caseType, setCaseType] = useState<'' | 'cv' | 'cr' | 'mj' | 'mc'>('')
  const [collection, setCollection] = useState('')
  const [cause, setCause] = useState('')
  const [from, setFrom] = useState(LITIGATION_FLOOR)
  const [to, setTo] = useState('')

  // Court state. `undefined` = user hasn't touched the courts; default to
  // "all selected" derived from facetData. This sidesteps the "initialize
  // state from async-arriving props" antipattern (`useEffect` that calls
  // setState) — the default is computed during render instead.
  const [userCourtsSel, setUserCourtsSel] = useState<Set<string> | undefined>(
    undefined,
  )
  const courtsSel = useMemo(
    () => userCourtsSel ?? new Set(facetData?.courts ?? []),
    [userCourtsSel, facetData],
  )

  const activePreset = useMemo<CourtPreset | null>(() => {
    if (!facetData) return null
    return detectCourtPreset([...courtsSel], facetData.courts)
  }, [courtsSel, facetData])

  function applyPreset(preset: CourtPreset) {
    if (!facetData) return
    setUserCourtsSel(new Set(resolveCourtPreset(preset, facetData.courts)))
  }

  function toggleCourt(code: string) {
    setUserCourtsSel((prev) => {
      // If the user hasn't touched the selection yet, the visible state is
      // "all courts" from facetData — toggling one off means starting from
      // that baseline.
      const base = prev ?? new Set(facetData?.courts ?? [])
      const next = new Set(base)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function clearAll() {
    setSearch('')
    setName('')
    setJudge('')
    setCaseType('')
    setCollection('')
    setCause('')
    setFrom(LITIGATION_FLOOR)
    setTo('')
    // Reset back to the "default = all courts from facetData" state.
    setUserCourtsSel(undefined)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const allCourtsSelected =
      facetData != null && courtsSel.size === facetData.courts.length
    const fields: FilterFields = {
      ...(search ? { search } : {}),
      ...(name ? { name } : {}),
      ...(judge ? { judge } : {}),
      ...(caseType ? { caseType } : {}),
      ...(collection ? { collection } : {}),
      ...(cause ? { cause } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(allCourtsSelected
        ? { allCourts: true }
        : { courts: [...courtsSel] }),
    }
    onSubmit(fields)
  }

  const showCourts = facetById.has('courts')
  const showCollection = facetById.has('collection')
  const showJudge = facetById.has('judge')

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {facetById.has('fts') && (
          <Field label="Full-text search" hint="Docket-entry descriptions">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. preliminary injunction, TRO…"
            />
          </Field>
        )}
        {facetById.has('case_name') && (
          <Field label="Case name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ACLU, Trump, EPA…"
            />
          </Field>
        )}
      </div>

      {showCourts && (
        // Fieldset, not Field — Field wraps in a <label>, which would make
        // the preset buttons inherit the whole legend + checkbox list as
        // their accessible names. <fieldset><legend> is the correct
        // semantic for a group of related controls.
        <fieldset className="block space-y-1.5">
          <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Courts
          </legend>
          <div className="space-y-2">
            <div
              role="group"
              aria-label="Court selection presets"
              className="flex flex-wrap gap-1.5"
            >
              {(['all', 'district', 'circuit', 'none'] as const).map((p) => {
                const label =
                  p === 'all'
                    ? 'All'
                    : p === 'district'
                      ? 'District'
                      : p === 'circuit'
                        ? 'Circuit'
                        : 'None'
                const a11yLabel =
                  p === 'all'
                    ? 'Select all courts'
                    : p === 'district'
                      ? 'Select district courts only'
                      : p === 'circuit'
                        ? 'Select circuit courts only'
                        : 'Clear court selection'
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={activePreset === p}
                    aria-label={a11yLabel}
                    onClick={() => applyPreset(p)}
                    disabled={!facetData}
                    className={cn(
                      'rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors',
                      activePreset === p
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-background text-foreground hover:bg-muted',
                      !facetData && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
              <span
                aria-live="polite"
                className="ml-auto self-center text-xs text-muted-foreground"
              >
                {facetData
                  ? `${courtsSel.size} of ${facetData.courts.length} selected`
                  : 'loading…'}
              </span>
            </div>
            <ScrollArea
              role="group"
              aria-label="Court list"
              className="h-48 rounded-md border border-border bg-background"
            >
              <ul className="divide-y divide-border">
                {(facetData?.courts ?? []).map((code) => {
                  const checked = courtsSel.has(code)
                  return (
                    <li key={code}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted',
                          checked && 'bg-muted/50',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCourt(code)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="font-mono text-xs uppercase">
                          {code}
                        </span>
                        <span
                          className={cn(
                            'ml-auto text-xs',
                            isCircuitCourt(code)
                              ? 'text-blue-700 dark:text-blue-300'
                              : 'text-muted-foreground',
                          )}
                        >
                          {isCircuitCourt(code) ? 'Circuit' : 'District'}
                        </span>
                      </label>
                    </li>
                  )
                })}
                {facetData == null && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">
                    Loading courts…
                  </li>
                )}
              </ul>
            </ScrollArea>
          </div>
        </fieldset>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {showJudge && (
          <Field label="Judge">
            <select
              value={judge}
              onChange={(e) => setJudge(e.target.value)}
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs"
              disabled={!facetData}
            >
              <option value="">— Any —</option>
              {(facetData?.judges ?? []).map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </Field>
        )}
        {facetById.has('case_type') && (
          <Field label="Case type">
            <select
              value={caseType}
              onChange={(e) =>
                setCaseType(
                  e.target.value as '' | 'cv' | 'cr' | 'mj' | 'mc',
                )
              }
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs"
            >
              <option value="">— Any —</option>
              <option value="cv">Civil</option>
              <option value="cr">Criminal</option>
              <option value="mj">Magistrate</option>
              <option value="mc">Misc</option>
            </select>
          </Field>
        )}
        {showCollection && (
          <Field label="Collection">
            <select
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs"
              disabled={!facetData}
            >
              <option value="">— Any —</option>
              {(facetData?.collections ?? []).map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {facetById.has('cause') && (
          <Field label="Cause / NOS">
            <Input
              value={cause}
              onChange={(e) => setCause(e.target.value)}
              placeholder="e.g. APA, 551, 1983…"
            />
          </Field>
        )}
        {facetById.has('date_range') && (
          <>
            <Field label="Filed from">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="Filed to">
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" disabled={loading}>
          {loading ? 'Filtering…' : 'Apply filter'}
        </Button>
        <Button type="button" variant="ghost" onClick={clearAll}>
          Clear
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && (
          <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}
