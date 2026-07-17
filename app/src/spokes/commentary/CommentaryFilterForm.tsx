import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  CommentaryAuthorFacet,
  CommentaryFilterFields,
  CommentaryPostTypeFacet,
  CommentaryPublication,
  CommentaryPublicationFacet,
} from '@/lib/worker-client'

/**
 * Manual filter for the Commentary spoke.
 *
 * Axes: keyword (FTS over body text + title + subtitle/dek), a NEW Publication
 * dropdown (Any / Lawfare / Executive Functions, from the publications facet
 * with counts), a searchable Author select (commentary authors match by NAME
 * substring — there is no slug, so this is simpler than Lawfare's slug/name
 * split), a content-type select (from the post_types facet; scoped to the
 * chosen publication when one is picked), and a date range on published_date.
 *
 * DROPS Lawfare's Topic control and the "include roundups" toggle — commentary
 * has neither field as a first-class cross-publication filter.
 *
 * Author select is searchable because the top-authors list is long; we filter
 * the option set with a small text input rather than reaching for a combobox,
 * keeping the same plain <select>/<input> primitives the other spokes use.
 */
export function CommentaryFilterForm({
  publications,
  topAuthors,
  postTypes,
  loading,
  onSubmit,
  initialSearch,
}: {
  publications: Record<string, CommentaryPublicationFacet>
  topAuthors: readonly CommentaryAuthorFacet[]
  postTypes: readonly CommentaryPostTypeFacet[]
  loading: boolean
  onSubmit: (fields: CommentaryFilterFields) => void
  /** Seed for the keyword field — set when carried over from the hub (`?q=`). */
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [publication, setPublication] = useState<'' | CommentaryPublication>('')
  const [authorQuery, setAuthorQuery] = useState('')
  const [author, setAuthor] = useState('')
  const [postType, setPostType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  // Publication dropdown options, in a stable order (Lawfare first).
  const publicationOptions = useMemo(() => {
    const order: CommentaryPublication[] = ['lawfare', 'executive_functions']
    return order
      .filter((key) => publications[key])
      .map((key) => ({ key, facet: publications[key] }))
  }, [publications])

  // Content-type options: when a publication is chosen, scope the options to
  // that publication's types; otherwise show all (deduped by value, summed).
  const contentTypeOptions = useMemo(() => {
    if (publication) {
      return postTypes
        .filter((t) => t.publication === publication)
        .map((t) => ({ value: t.value, count: t.count }))
    }
    const byValue = new Map<string, number>()
    for (const t of postTypes) {
      byValue.set(t.value, (byValue.get(t.value) ?? 0) + t.count)
    }
    return Array.from(byValue.entries()).map(([value, count]) => ({
      value,
      count,
    }))
  }, [postTypes, publication])

  // Filter the author option set by the searchable text input. Always keep the
  // currently-selected author visible even if it doesn't match the query, so
  // the <select> never shows an empty/mismatched value.
  const visibleAuthors = useMemo(() => {
    const needle = authorQuery.trim().toLowerCase()
    if (!needle) return topAuthors
    return topAuthors.filter(
      (a) => a.name === author || a.name.toLowerCase().includes(needle),
    )
  }, [topAuthors, authorQuery, author])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: CommentaryFilterFields = {}
    if (search.trim()) fields.search = search.trim()
    if (publication) fields.publication = publication
    // A picked author from the dropdown filters by that exact name; otherwise
    // the typed text becomes the name substring, so authors outside the
    // top-50 dropdown (the long tail) are still reachable.
    if (author) fields.author = author
    else if (authorQuery.trim()) fields.author = authorQuery.trim()
    if (postType) fields.postType = postType
    if (from.trim()) fields.from = from.trim()
    if (to.trim()) fields.to = to.trim()
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setPublication('')
    setAuthorQuery('')
    setAuthor('')
    setPostType('')
    setFrom('')
    setTo('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field label="Keyword" hint="Piece text + title + subtitle">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. Section 702, emergency powers, executive privilege"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Publication">
          <select
            value={publication}
            onChange={(e) => {
              const next = e.target.value as '' | CommentaryPublication
              setPublication(next)
              // A content type may not exist in the newly-scoped publication;
              // clear it so we never send a type the publication lacks.
              setPostType('')
            }}
            disabled={loading}
            className={selectClass(loading)}
          >
            <option value="">— Any publication —</option>
            {publicationOptions.map(({ key, facet }) => (
              <option key={key} value={key}>
                {facet.label} ({facet.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Author" hint="Type a name to search; or pick from the top list">
          <div className="space-y-1.5">
            <Input
              type="text"
              value={authorQuery}
              onChange={(e) => setAuthorQuery(e.target.value)}
              placeholder="Search by author name…"
              disabled={loading}
            />
            <select
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              disabled={loading}
              className={selectClass(loading)}
            >
              <option value="">— Any author —</option>
              {visibleAuthors.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name} ({a.count.toLocaleString()})
                </option>
              ))}
            </select>
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Content type">
          <select
            value={postType}
            onChange={(e) => setPostType(e.target.value)}
            disabled={loading}
            className={selectClass(loading)}
          >
            <option value="">— Any —</option>
            {contentTypeOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {prettyPostType(c.value)} ({c.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Published from">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={loading}
          />
        </Field>
        <Field label="Published to">
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={loading}
          />
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
      </div>
    </form>
  )
}

function selectClass(loading: boolean): string {
  return cn(
    'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-primary/40',
    loading && 'cursor-not-allowed opacity-60',
  )
}

/** "essay" → "Essay". Post-type values are lowercase across both
 *  publications; the worker may already send display-ready values, so this is
 *  a gentle fallback. */
function prettyPostType(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
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
