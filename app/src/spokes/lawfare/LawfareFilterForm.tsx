import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  LawfareAuthorFacet,
  LawfareFacetCount,
  LawfareFilterFields,
  LawfareTopicFacet,
} from '@/lib/worker-client'

/**
 * Manual filter for the Lawfare spoke.
 *
 * Richer than OLC's — Author and Topic are first-class facets here. Axes:
 * keyword (FTS over body text + title + dek), a searchable Author select
 * sourced from the facet top_authors, a Topic select over the ~13 controlled
 * facet topics, a content-type select (article / podcast / newsletter), a
 * date range on published_date, and an "Include roundups & announcements"
 * toggle (maps to include_suppressed, default OFF — roundups and
 * announcements are noise for most research).
 *
 * Author select is searchable because the top-authors list is long; we filter
 * the option set with a small text input rather than reaching for a combobox
 * component (keeping the control set the same plain <select>/<input> primitives
 * the other spokes use).
 */
export function LawfareFilterForm({
  topAuthors,
  topics,
  contentTypes,
  loading,
  onSubmit,
  initialSearch,
}: {
  topAuthors: readonly LawfareAuthorFacet[]
  topics: readonly LawfareTopicFacet[]
  contentTypes: readonly LawfareFacetCount[]
  loading: boolean
  onSubmit: (fields: LawfareFilterFields) => void
  /** Seed for the keyword field — set when carried over from the hub (`?q=`). */
  initialSearch?: string
}) {
  const [q, setQ] = useState(initialSearch ?? '')
  const [authorSlug, setAuthorSlug] = useState('')
  const [authorQuery, setAuthorQuery] = useState('')
  const [topicSlug, setTopicSlug] = useState('')
  const [contentType, setContentType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [includeSuppressed, setIncludeSuppressed] = useState(false)

  // Filter the author option set by the searchable text input. Always keep the
  // currently-selected author visible even if it doesn't match the query, so
  // the <select> never shows an empty/mismatched value.
  const visibleAuthors = useMemo(() => {
    const needle = authorQuery.trim().toLowerCase()
    if (!needle) return topAuthors
    return topAuthors.filter(
      (a) =>
        a.slug === authorSlug || a.name.toLowerCase().includes(needle),
    )
  }, [topAuthors, authorQuery, authorSlug])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: LawfareFilterFields = {}
    if (q.trim()) fields.q = q.trim()
    // A picked author from the (top-50) dropdown filters by exact slug; otherwise
    // the typed text becomes a free-text name match, so authors outside the
    // dropdown (the long tail) are reachable instead of silently ignored.
    if (authorSlug) fields.author_slug = authorSlug
    else if (authorQuery.trim()) fields.author_name = authorQuery.trim()
    if (topicSlug) fields.topic_slug = topicSlug
    if (contentType) fields.content_type = contentType
    if (from.trim()) fields.date_from = from.trim()
    if (to.trim()) fields.date_to = to.trim()
    if (includeSuppressed) fields.include_suppressed = true
    onSubmit(fields)
  }

  function handleClear() {
    setQ('')
    setAuthorSlug('')
    setAuthorQuery('')
    setTopicSlug('')
    setContentType('')
    setFrom('')
    setTo('')
    setIncludeSuppressed(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field label="Keyword" hint="Article text + title + dek">
        <Input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Section 702, emergency powers, AI liability"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              value={authorSlug}
              onChange={(e) => setAuthorSlug(e.target.value)}
              disabled={loading}
              className={selectClass(loading)}
            >
              <option value="">— Any author —</option>
              {visibleAuthors.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name} ({a.count.toLocaleString()})
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="Topic">
          <select
            value={topicSlug}
            onChange={(e) => setTopicSlug(e.target.value)}
            disabled={loading}
            className={selectClass(loading)}
          >
            <option value="">— Any topic —</option>
            {topics.map((t) => (
              <option key={t.value} value={t.value}>
                {prettyTopic(t.value)} ({t.count.toLocaleString()})
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Content type">
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            disabled={loading}
            className={selectClass(loading)}
          >
            <option value="">— Any —</option>
            {contentTypes.map((c) => (
              <option key={c.value} value={c.value}>
                {prettyContentType(c.value)} ({c.count.toLocaleString()})
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

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={includeSuppressed}
          onChange={(e) => setIncludeSuppressed(e.target.checked)}
          disabled={loading}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        <span>
          Include roundups &amp; announcements
          <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
            Off by default — these are link round-ups and housekeeping posts
          </span>
        </span>
      </label>

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

/** "national-security" → "National security". Topic slugs are kebab-case; the
 *  worker may already send display-ready values, so this is a gentle fallback. */
function prettyTopic(s: string): string {
  if (!s.includes('-')) return s
  const spaced = s.replace(/-/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function prettyContentType(s: string): string {
  if (s === 'article') return 'Article'
  if (s === 'podcast') return 'Podcast'
  if (s === 'newsletter') return 'Newsletter'
  return s
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
