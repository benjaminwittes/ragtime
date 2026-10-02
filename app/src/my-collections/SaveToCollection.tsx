import { useState } from 'react'
import { addMyCollectionItem, createMyCollection, type MyCollection } from '@lawfare/ragtime-client'

import { AppLink } from '@/components/AppLink'
import { cn } from '@/lib/utils'

import { myCollectionPath } from './availability'
import { useMyCollections } from './use-my-collections'

/**
 * "Save" on a document: put it in one of the reader's collections.
 *
 * Renders nothing unless the reader is signed in and the worker has
 * collections switched on (`useMyCollections().available`), so it can sit in
 * every document sheet without a guard at each call site.
 *
 * What is saved is the document's address: the corpus and the id, the same
 * pair the app's own `/corpus/<corpus>/<id>` link is built from, with the
 * title for the list. The id is sent as text.
 *
 * The control is a small disclosure rather than a dialog. A document sheet is
 * already a dialog, and one more layer over it for a two-line choice would be
 * the heavier of the two things on the screen.
 */
export function SaveToCollection({
  corpus,
  docId,
  title,
  sourceUrl,
  naturalKey,
  quote,
  className,
}: {
  /** The corpus as a citation names it: `olc`, or `congress:hearings`. */
  corpus: string
  docId: string | number
  title: string
  sourceUrl?: string | null
  naturalKey?: string | null
  quote?: string | null
  className?: string
}) {
  const mine = useMyCollections()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ collection: MyCollection; duplicate: boolean } | null>(null)

  const token = mine.sessionToken
  if (!mine.available || !token) return null

  async function saveTo(collection: MyCollection) {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const r = await addMyCollectionItem(token, collection.id, {
        corpus,
        doc_id: docId,
        title: title.trim() || `${corpus} ${docId}`,
        source_url: sourceUrl,
        natural_key: naturalKey,
        quote,
      })
      setSaved({ collection, duplicate: r.duplicate })
      setOpen(false)
      void mine.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function createAndSave(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name || !token) return
    setBusy(true)
    setError(null)
    try {
      const collection = await createMyCollection(token, name)
      setNewName('')
      await saveTo(collection)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className={cn('relative inline-block text-left', className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Save this document to one of your collections"
        className="inline-flex items-baseline gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
      >
        {saved ? 'Saved' : 'Save'}
      </button>
      {saved && !open && (
        <span className="ml-2 text-[11px] font-normal text-muted-foreground" role="status">
          {saved.duplicate ? 'Already in ' : 'Saved to '}
          <AppLink to={myCollectionPath(saved.collection.id)} className="text-primary hover:underline">
            {saved.collection.name}
          </AppLink>
        </span>
      )}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-background p-2 text-xs font-normal shadow-md"
          data-stage-private=""
        >
          <div className="px-1 pb-1 font-medium uppercase tracking-wide text-muted-foreground">
            Save to a collection
          </div>
          {mine.collections.length === 0 && (
            <div className="px-1 py-1 text-muted-foreground">You have no collections yet.</div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {mine.collections.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() => void saveTo(c)}
                className="flex w-full items-baseline justify-between gap-2 rounded px-1 py-1 text-left text-foreground hover:bg-muted disabled:opacity-50"
              >
                <span className="min-w-0 truncate">{c.name}</span>
                {c.scope === 'org' && <span className="shrink-0 text-[10px] text-muted-foreground">shared</span>}
              </button>
            ))}
          </div>
          <form onSubmit={createAndSave} className="mt-2 flex gap-1 border-t border-border pt-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={120}
              placeholder="New collection"
              aria-label="Name for a new collection"
              disabled={busy}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="h-7 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Create
            </button>
          </form>
          {error && <div className="mt-2 px-1 text-destructive">{error}</div>}
        </div>
      )}
    </div>
  )
}
