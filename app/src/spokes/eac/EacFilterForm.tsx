import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { EacFacets, EacFilterFields } from '@lawfare/ragtime-client'
import { EAC_DATE_NOTE, fileTypeLabel, folderLabel } from './eac-format'

/**
 * Manual filter for the EAC spoke.
 *
 * Axes: words (FTS over title + text) · title · author group · file type ·
 * folder · shown in full / link only · posted-date range. These are the
 * Worker's /corpus/eac/filter fields, minus `category`: the Worker has no
 * vocabulary route for it, and a free-text box would promise matches it
 * cannot make (the eac_category values must match exactly).
 *
 * Every dropdown option carries the RAW stored value; labels are display only.
 */
export function EacFilterForm({
  facets,
  loading,
  onSubmit,
  initialSearch,
}: {
  /** Facet lists; undefined while they load (the dropdowns show "Any" only). */
  facets: EacFacets | undefined
  loading: boolean
  onSubmit: (fields: EacFilterFields) => void
  /** Seed for the words field — set when carried over from the hub (`?q=`). */
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [title, setTitle] = useState('')
  const [authorGroup, setAuthorGroup] = useState('')
  const [fileType, setFileType] = useState('')
  const [folder, setFolder] = useState('')
  const [display, setDisplay] = useState<'' | 'full' | 'link_only'>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: EacFilterFields = {}
    if (search.trim()) fields.search = search.trim()
    if (title.trim()) fields.title = title.trim()
    if (authorGroup) fields.authorGroup = authorGroup
    if (fileType) fields.fileType = fileType
    if (folder) fields.folder = folder
    if (display) fields.display = display
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) fields.from = from
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) fields.to = to
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setTitle('')
    setAuthorGroup('')
    setFileType('')
    setFolder('')
    setDisplay('')
    setFrom('')
    setTo('')
  }

  const count = (n: number | string | undefined) =>
    n == null ? '' : ` (${Number(n).toLocaleString()})`

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field
        label="Words"
        hint="title + text of every document, including link-only ones (matched, not shown)"
      >
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. VVSG 2.0, poll worker recruitment, HAVA audit"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Title contains">
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Test Plan, Standards Board"
            disabled={loading}
          />
        </Field>
        <Field label="Author group" hint="who wrote it">
          <select
            value={authorGroup}
            onChange={(e) => setAuthorGroup(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {(facets?.author_groups ?? []).map((g) => (
              <option key={g.value} value={g.value}>
                {g.value}
                {count(g.count)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Shown as">
          <select
            value={display}
            onChange={(e) => setDisplay(e.target.value as '' | 'full' | 'link_only')}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            <option value="full">Full text{count(facets?.shown_in_full)}</option>
            <option value="link_only">Link only{count(facets?.link_only)}</option>
          </select>
        </Field>
        <Field label="File type">
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {(facets?.file_types ?? []).map((t) => (
              <option key={t.value} value={t.value}>
                {fileTypeLabel(t.value)}
                {count(t.count)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Folder" hint="where eac.gov filed it">
          <select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {(facets?.folders ?? []).map((f) => (
              <option key={f.value} value={f.value}>
                {folderLabel(f.value)}
                {count(f.count)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Posted on eac.gov"
          hint={
            facets?.earliest && facets?.latest
              ? `${facets.earliest} → ${facets.latest}`
              : 'date posted on eac.gov'
          }
        >
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="Posted from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={loading}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              aria-label="Posted to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={loading}
            />
          </div>
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Filtering…' : 'Apply filter'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleClear}
          disabled={loading}
        >
          Clear
        </Button>
        <span className="ml-auto text-[11px] text-muted-foreground/70">
          {EAC_DATE_NOTE}
        </span>
      </div>
    </form>
  )
}

function selectCls(loading: boolean) {
  return cn(
    'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-primary/40',
    loading && 'cursor-not-allowed opacity-60',
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
