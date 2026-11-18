import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  StateCodeStatus,
  StateCodesFacets,
  StateCodesFilterFields,
  StateCodesMember,
} from '@lawfare/ragtime-client'
import {
  MEMBER_FALLBACK,
  STATE_CODES_MEMBERS,
  STATUS_ORDER,
  statusLabel,
} from './state-codes-format'

/**
 * Manual filter for the State Codes spoke.
 *
 * Jurisdiction first (the member: only the District for now), then the
 * section lookup, full text and heading, and the structure (title, chapter).
 * Status has two controls: a status picker, and "Hide sections not in force",
 * which the results line can also flip. The toggle is OFF by default: the
 * query design flags what is not in force and OFFERS to leave it out, rather
 * than leaving it out unasked.
 *
 * The hide toggle is owned by the shell, so the results line ("Hide them" /
 * "Show them") and this checkbox never disagree.
 */
export function StateCodesFilterForm({
  facets,
  member,
  onMemberChange,
  inForceOnly,
  onInForceOnlyChange,
  loading,
  onSubmit,
  initialSearch,
}: {
  facets: StateCodesFacets | undefined
  member: StateCodesMember
  onMemberChange: (member: StateCodesMember) => void
  inForceOnly: boolean
  onInForceOnlyChange: (inForceOnly: boolean) => void
  loading: boolean
  onSubmit: (fields: StateCodesFilterFields) => void
  /** Seed for the full-text field — set when carried over from the hub (`?q=`). */
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [citation, setCitation] = useState('')
  const [heading, setHeading] = useState('')
  const [title, setTitle] = useState('')
  const [chapter, setChapter] = useState('')
  const [status, setStatus] = useState<'' | StateCodeStatus>('')
  const [temporaryOnly, setTemporaryOnly] = useState(false)

  const memberFacet = facets?.members[member]
  const titles = memberFacet?.titles ?? []
  const statusCounts = new Map((memberFacet?.statuses ?? []).map((s) => [s.value, s.count]))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: StateCodesFilterFields = { member }
    if (search.trim()) fields.search = search.trim()
    if (citation.trim()) fields.citation = citation.trim()
    if (heading.trim()) fields.heading = heading.trim()
    if (title) fields.title = title
    if (title && chapter.trim()) fields.chapter = chapter.trim()
    if (inForceOnly) fields.inForceOnly = true
    else if (status) fields.status = status
    if (temporaryOnly) fields.temporaryOnly = true
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setCitation('')
    setHeading('')
    setTitle('')
    setChapter('')
    setStatus('')
    setTemporaryOnly(false)
    onInForceOnlyChange(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Jurisdiction" hint="More states to come">
          <select
            value={member}
            onChange={(e) => {
              onMemberChange(e.target.value as StateCodesMember)
              setTitle('')
              setChapter('')
            }}
            disabled={loading}
            className={selectClass(loading)}
          >
            {STATE_CODES_MEMBERS.map((m) => (
              <option key={m} value={m}>
                {facets?.members[m]?.label ?? MEMBER_FALLBACK[m].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Section" hint="Number or citation — exact">
          <Input
            type="text"
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
            placeholder="e.g. 22-1307 or D.C. Code § 22-1307"
            disabled={loading}
          />
        </Field>
        <Field label="Heading contains">
          <Input
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="e.g. Definitions"
            disabled={loading}
          />
        </Field>
      </div>

      <Field label="Full-text search" hint="Section text, heading and citation; not notes or history">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. demonstration, public emergency, homestead allowance"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Title">
          <select
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (!e.target.value) setChapter('')
            }}
            disabled={loading}
            className={selectClass(loading)}
          >
            <option value="">— Any title —</option>
            {titles.map((t) => (
              <option key={t.num} value={t.num}>
                {t.num}. {t.name}
                {t.in_force_count === 0 ? ' (no sections in force)' : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Chapter" hint={title ? 'Exact, e.g. 13 or 1A' : 'Pick a title first'}>
          <Input
            type="text"
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            placeholder="e.g. 13"
            disabled={loading || !title}
          />
        </Field>

        <Field label="Status" hint={inForceOnly ? 'In force only' : undefined}>
          <select
            value={inForceOnly ? 'in_force' : status}
            onChange={(e) => setStatus(e.target.value as '' | StateCodeStatus)}
            disabled={loading || inForceOnly}
            className={selectClass(loading || inForceOnly)}
          >
            <option value="">— Any status —</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
                {statusCounts.has(s) ? ` (${statusCounts.get(s)!.toLocaleString()})` : ''}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Check
          checked={inForceOnly}
          onChange={onInForceOnlyChange}
          disabled={loading}
          label="Hide sections not in force"
          hint="Repealed, expired, recodified, reserved and the rest. The results say how many were hidden."
        />
        <Check
          checked={temporaryOnly}
          onChange={setTemporaryOnly}
          disabled={loading}
          label="Only sections with temporary text"
          hint="Current text that includes emergency or temporary legislation."
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Filtering…' : 'Apply filter'}
        </Button>
        <Button type="button" variant="ghost" onClick={handleClear} disabled={loading}>
          Clear
        </Button>
      </div>
    </form>
  )
}

function selectClass(disabled: boolean): string {
  return cn(
    'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-primary/40',
    disabled && 'cursor-not-allowed opacity-60',
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
  onChange: (checked: boolean) => void
  disabled: boolean
  label: string
  hint: string
}) {
  return (
    <label className="flex items-start gap-2 text-sm" title={hint}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5"
      />
      <span>
        {label}
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </label>
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
          <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">{hint}</span>
        )}
      </span>
      {children}
    </label>
  )
}
