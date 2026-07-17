import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  type FbiCollectionCount,
  type FbiFacetCount,
  type FbiFilterFields,
  fetchFbiCollections,
} from '@/lib/worker-client'

/**
 * Manual filter for the FBI Records spoke (brief #14).
 *
 * Axes: FTS + collection + provenance. That's the whole surface — the
 * Worker filter supports exactly these three, and there is deliberately NO
 * date control anywhere (doc_date is NULL corpus-wide; rendering a date
 * picker would promise an axis the corpus cannot honor).
 *
 * Collection is a TYPEAHEAD, not a dropdown (locked decision #2: facet +
 * typeahead only over the 1,755 messy values — no browse page). The
 * debounced input suggests from /corpus/fbi/collections; picking a
 * suggestion stores the RAW stored value (trailing whitespace and all) for
 * the exact-match filter while showing the normalized display name.
 */
export function FbiFilterForm({
  provenance,
  topCollections,
  loading,
  onSubmit,
  initialSearch,
}: {
  /** Facet counts for 'live' / 'wayback-recovered'. */
  provenance: readonly FbiFacetCount[]
  /** Top collections from facets — the typeahead's empty-input seed list. */
  topCollections: readonly FbiCollectionCount[]
  loading: boolean
  onSubmit: (fields: FbiFilterFields) => void
  /** Seed for the full-text field — set when carried over from the hub (`?q=`). */
  initialSearch?: string
}) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [prov, setProv] = useState('')
  const [selectedCollection, setSelectedCollection] =
    useState<FbiCollectionCount | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields: FbiFilterFields = {}
    if (search.trim()) fields.search = search.trim()
    // The RAW stored value, untouched — the Worker matches it exactly.
    if (selectedCollection) fields.collection = selectedCollection.value
    if (prov) fields.provenance = prov
    onSubmit(fields)
  }

  function handleClear() {
    setSearch('')
    setProv('')
    setSelectedCollection(null)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border-b border-border bg-card px-6 py-5"
    >
      <Field label="Full-text search" hint="OCR text + title">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. anthrax, counterintelligence program, Julius Rosenberg"
          disabled={loading}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Collection"
          hint="Vault subject — start typing to search all 1,755"
        >
          <CollectionTypeahead
            selected={selectedCollection}
            onSelect={setSelectedCollection}
            seed={topCollections}
            disabled={loading}
          />
        </Field>
        <Field label="Provenance" hint="Documents removed from the Vault are recoverable here">
          <select
            value={prov}
            onChange={(e) => setProv(e.target.value)}
            disabled={loading}
            className={selectCls(loading)}
          >
            <option value="">— Any —</option>
            {provenance.map((p) => (
              <option key={p.value} value={p.value}>
                {p.value === 'wayback-recovered'
                  ? `Removed from the Vault — recovered (${p.count.toLocaleString()})`
                  : `Live on the Vault (${p.count.toLocaleString()})`}
              </option>
            ))}
          </select>
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
          No date filter — the Vault publishes these scans without document
          dates.
        </span>
      </div>
    </form>
  )
}

/**
 * Debounced autocomplete over /corpus/fbi/collections. Free text alone never
 * filters (the Worker matches the raw value exactly) — a suggestion must be
 * picked; the picked chip shows the normalized display name and carries the
 * raw value underneath.
 */
function CollectionTypeahead({
  selected,
  onSelect,
  seed,
  disabled,
}: {
  selected: FbiCollectionCount | null
  onSelect: (c: FbiCollectionCount | null) => void
  seed: readonly FbiCollectionCount[]
  disabled: boolean
}) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<readonly FbiCollectionCount[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function scheduleFetch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const seq = ++requestSeq.current
      setSearching(true)
      fetchFbiCollections(q)
        .then((rows) => {
          if (seq !== requestSeq.current) return
          setSuggestions(rows)
        })
        .catch(() => {
          if (seq !== requestSeq.current) return
          setSuggestions([])
        })
        .finally(() => {
          if (seq === requestSeq.current) setSearching(false)
        })
    }, 250)
  }

  function handleChange(v: string) {
    setQuery(v)
    setOpen(true)
    if (selected) onSelect(null)
    if (v.trim()) {
      scheduleFetch(v.trim())
    } else {
      setSuggestions([])
    }
  }

  function handlePick(c: FbiCollectionCount) {
    onSelect(c)
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  if (selected) {
    return (
      <div className="flex h-9 items-center gap-2">
        <span
          className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-sm text-primary"
          title={`Filtering on the stored value “${selected.value}”`}
        >
          <span className="truncate">
            {selected.display ?? selected.value.trim()}
          </span>
          <span className="font-mono text-[10px] text-primary/70">
            {selected.count.toLocaleString()}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          disabled={disabled}
          aria-label="Clear collection"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
    )
  }

  const list = query.trim() ? suggestions : seed
  return (
    <div ref={rootRef} className="relative">
      <Input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="e.g. Rosenberg, COINTELPRO, D.B. Cooper"
        disabled={disabled}
      />
      {open && (list.length > 0 || searching) && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card py-1 shadow-md"
        >
          {searching && (
            <li className="px-3 py-1.5 text-xs text-muted-foreground">
              Searching collections…
            </li>
          )}
          {!query.trim() && !searching && (
            <li className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Largest collections
            </li>
          )}
          {list.map((c) => (
            <li key={c.value} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => handlePick(c)}
                className={cn(
                  'flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm',
                  'hover:bg-muted focus:bg-muted focus:outline-none',
                )}
              >
                <span className="truncate text-foreground">
                  {c.display ?? c.value.trim()}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {c.count.toLocaleString()}
                </span>
              </button>
            </li>
          ))}
          {query.trim() && !searching && list.length === 0 && (
            <li className="px-3 py-1.5 text-xs text-muted-foreground">
              No collection matches — the filter needs a picked suggestion.
            </li>
          )}
        </ul>
      )}
    </div>
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
