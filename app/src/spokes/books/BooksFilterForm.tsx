import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { BooksFacets, BooksFilterFields } from '@lawfare/ragtime-client'
import { coverageHint, languageName } from './books-format'

/**
 * Manual filter for the book catalogue (ragtime-worker#145's filter
 * vocabulary, one control per field).
 *
 * Two rules from the design shape the controls:
 * - A sparse field says how sparse it is, WITH its denominator, next to the
 *   control (P2). Audience is coded on 3.9% of records, so "juvenile" hides
 *   96% of the catalogue from the filter; the hint is what makes that visible.
 *   Coverage comes from /facets, so nothing here is a remembered number.
 * - Author is an exact match in catalogue form, and says so. There is no
 *   fuzzy name matching on purpose: 'smith, jack' scores closer to Goldsmith
 *   than the typo 'goldmsith, jack' does, so a tolerant match would return
 *   the wrong author's books with confidence.
 *
 * The "Try" row is the design's worked shapes as structured filters, not
 * natural-language chips: this spoke has no AI mode to read a sentence.
 */

type FormState = Record<keyof BooksFilterFields, string>

const EMPTY: FormState = {
  search: '', title: '', author: '', subject: '', subjectExact: '',
  classification: '', classificationPrefix: '', language: '', originalLanguage: '',
  uniformTitle: '', series: '', audience: '', yearFrom: '', yearTo: '',
  pagesMin: '', pagesMax: '', illustrated: '', likelyPublicDomain: '', lccn: '', isbn: '',
}

const NUMBER_KEYS = ['yearFrom', 'yearTo', 'pagesMin', 'pagesMax'] as const
const BOOLEAN_KEYS = ['illustrated', 'likelyPublicDomain'] as const

function toState(f: BooksFilterFields | undefined): FormState {
  const s = { ...EMPTY }
  if (!f) return s
  for (const [k, v] of Object.entries(f) as [keyof BooksFilterFields, unknown][]) {
    if (v === undefined || v === null) continue
    s[k] = v === true ? 'true' : String(v)
  }
  return s
}

function toFields(s: FormState): BooksFilterFields {
  const f: BooksFilterFields = {}
  for (const [k, raw] of Object.entries(s) as [keyof BooksFilterFields, string][]) {
    const v = raw.trim()
    if (!v) continue
    if ((NUMBER_KEYS as readonly string[]).includes(k)) {
      const n = Number(v)
      if (Number.isFinite(n)) (f as Record<string, unknown>)[k] = Math.floor(n)
    } else if ((BOOLEAN_KEYS as readonly string[]).includes(k)) {
      if (v === 'true') (f as Record<string, unknown>)[k] = true
    } else {
      (f as Record<string, unknown>)[k] = v
    }
  }
  return f
}

const PRESETS: { label: string; fields: BooksFilterFields }[] = [
  { label: 'By Jack Goldsmith', fields: { author: 'Goldsmith, Jack' } },
  {
    label: 'About Lincoln, under 300 pages, illustrated',
    fields: { subject: 'Lincoln, Abraham', pagesMax: 300, illustrated: true },
  },
  { label: 'In German, on the Weimar constitution', fields: { search: 'Weimar constitution', language: 'ger' } },
  { label: 'War and law, 1901–1925', fields: { subject: 'war (international law)', yearFrom: 1901, yearTo: 1925 } },
]

export function BooksFilterForm({
  facets,
  loading,
  onSubmit,
  initialFields,
}: {
  facets: BooksFacets | undefined
  loading: boolean
  onSubmit: (fields: BooksFilterFields) => void
  /** Seed — from the hub's `?q=` carryover or a workspace deep link. */
  initialFields?: BooksFilterFields
}) {
  const [s, setS] = useState<FormState>(() => toState(initialFields))
  const [advancedOpen, setAdvancedOpen] = useState(() =>
    ['classification', 'classificationPrefix', 'series', 'uniformTitle', 'originalLanguage', 'subjectExact', 'lccn', 'isbn'].some(
      (k) => !!initialFields?.[k as keyof BooksFilterFields],
    ),
  )
  const set = (k: keyof BooksFilterFields) => (v: string) => setS((prev) => ({ ...prev, [k]: v }))
  const cov = facets?.coverage

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(toFields(s))
  }

  function runPreset(fields: BooksFilterFields) {
    setS(toState(fields))
    onSubmit(fields)
  }

  const floor = facets?.public_domain_floor

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border-b border-border bg-card px-6 py-5">
      <Field label="Search the catalogue" hint="Words in the title, author names and subject headings — not the books’ text, which we do not hold">
        <Input
          type="text"
          value={s.search}
          onChange={(e) => set('search')(e.target.value)}
          placeholder="e.g. habeas corpus, Weimar constitution, Cuban missile crisis"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Author" hint="Exact, as catalogued: Surname, Forename. A misspelling matches nothing rather than someone else">
          <Input value={s.author} onChange={(e) => set('author')(e.target.value)} placeholder="Goldsmith, Jack" disabled={loading} />
        </Field>
        <Field label="Title contains">
          <Input value={s.title} onChange={(e) => set('title')(e.target.value)} placeholder="terror presidency" disabled={loading} />
        </Field>
        <Field label="Subject heading contains" hint="Library of Congress subject headings — people, places and topics">
          <Input value={s.subject} onChange={(e) => set('subject')(e.target.value)} placeholder="Lincoln, Abraham" disabled={loading} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Published from">
          <Input type="number" inputMode="numeric" value={s.yearFrom} onChange={(e) => set('yearFrom')(e.target.value)} placeholder="e.g. 1901" disabled={loading} />
        </Field>
        <Field label="Published to">
          <Input type="number" inputMode="numeric" value={s.yearTo} onChange={(e) => set('yearTo')(e.target.value)} placeholder="e.g. 1925" disabled={loading} />
        </Field>
        <Field label="Pages, at least" hint={coverageHint(cov?.page_count) ?? undefined}>
          <Input type="number" inputMode="numeric" value={s.pagesMin} onChange={(e) => set('pagesMin')(e.target.value)} disabled={loading} />
        </Field>
        <Field label="Pages, at most">
          <Input type="number" inputMode="numeric" value={s.pagesMax} onChange={(e) => set('pagesMax')(e.target.value)} disabled={loading} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Language" hint={coverageHint(cov?.language) ?? undefined}>
          <select value={s.language} onChange={(e) => set('language')(e.target.value)} disabled={loading} className={selectCls(loading)}>
            <option value="">— Any —</option>
            {(facets?.languages ?? []).slice(0, 60).map((l) => (
              <option key={l.value} value={l.value}>
                {languageName(l.value)} ({l.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Audience" hint={coverageHint(cov?.audience) ?? undefined}>
          <select value={s.audience} onChange={(e) => set('audience')(e.target.value)} disabled={loading} className={selectCls(loading)}>
            <option value="">— Any —</option>
            {(facets?.audiences ?? []).map((a) => (
              <option key={a.value} value={a.value}>
                {a.label ?? a.value} ({a.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="space-y-2">
        <Check
          checked={s.illustrated === 'true'}
          onChange={(v) => set('illustrated')(v ? 'true' : '')}
          disabled={loading}
          label="Illustrated"
          hint={coverageHint(cov?.illustrations)}
        />
        <Check
          checked={s.likelyPublicDomain === 'true'}
          onChange={(v) => set('likelyPublicDomain')(v ? 'true' : '')}
          disabled={loading}
          label={floor != null ? `Likely public domain (published ${floor} or earlier)` : 'Likely public domain'}
          hint="A date heuristic for finding free full text elsewhere — not a legal determination"
        />
      </div>

      <details open={advancedOpen} onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)} className="border-t border-lawfare-line pt-3">
        <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Catalogue fields
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Exact subject heading" hint="The whole heading with subdivisions. Heading forms drift across decades, so this can miss books the substring search finds">
            <Input value={s.subjectExact} onChange={(e) => set('subjectExact')(e.target.value)} placeholder="Presidents -- United States" disabled={loading} />
          </Field>
          <Field label="LC class starts with" hint="Letters only — KF is US federal law">
            <Input value={s.classificationPrefix} onChange={(e) => set('classificationPrefix')(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 3))} placeholder="KF" disabled={loading} />
          </Field>
          <Field label="LC class number" hint="Exact">
            <Input value={s.classification} onChange={(e) => set('classification')(e.target.value)} placeholder="KF5053" disabled={loading} />
          </Field>
          <Field label="Series contains" hint={coverageHint(cov?.series) ?? undefined}>
            <Input value={s.series} onChange={(e) => set('series')(e.target.value)} disabled={loading} />
          </Field>
          <Field label="Uniform title contains" hint={coverageHint(cov?.uniform_title) ?? 'The cataloguer’s own work title, for translations and editions'}>
            <Input value={s.uniformTitle} onChange={(e) => set('uniformTitle')(e.target.value)} placeholder="Don Quixote" disabled={loading} />
          </Field>
          <Field label="Translated from" hint={coverageHint(cov?.original_language) ?? 'Three-letter MARC code'}>
            <Input value={s.originalLanguage} onChange={(e) => set('originalLanguage')(e.target.value.toLowerCase().slice(0, 3))} placeholder="rus" disabled={loading} />
          </Field>
          <Field label="LCCN">
            <Input value={s.lccn} onChange={(e) => set('lccn')(e.target.value)} placeholder="2007024871" disabled={loading} />
          </Field>
          <Field label="ISBN">
            <Input value={s.isbn} onChange={(e) => set('isbn')(e.target.value)} placeholder="9780393065503" disabled={loading} />
          </Field>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Filtering…' : 'Apply filter'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setS({ ...EMPTY })} disabled={loading}>
          Clear
        </Button>
      </div>

      <div className="flex flex-wrap items-baseline gap-2 text-xs">
        <span className="text-muted-foreground">Try:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => runPreset(p.fields)}
            disabled={loading}
            className="rounded border border-lawfare-line px-2 py-0.5 text-foreground hover:bg-muted/60 disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>
    </form>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-snug text-muted-foreground/80">{hint}</span>}
    </label>
  )
}

function Check({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled: boolean
  label: string
  hint: string | null
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span>
        {label}
        {hint && <span className="block text-[11px] leading-snug text-muted-foreground/80">{hint}</span>}
      </span>
    </label>
  )
}

function selectCls(disabled: boolean) {
  return cn(
    'h-9 w-full rounded-md border border-input bg-background px-2 text-sm',
    disabled && 'opacity-50',
  )
}
