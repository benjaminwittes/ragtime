import { useEffect, useState, type ReactNode } from 'react'
import {
  createMyCollection,
  deleteMyCollection,
  exportMyCollection,
  getMyCollection,
  removeMyCollectionItem,
  updateMyCollection,
  type MyCollection,
  type MyCollectionItem,
} from '@lawfare/ragtime-client'

import { AppLink } from '@/components/AppLink'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { navigateTo } from '@/lib/routing'
import { BackToHubLink } from '@/spokes/components/BackToHubLink'

import {
  MY_COLLECTIONS_PATH,
  itemCountLabel,
  itemDocumentPath,
  myCollectionPath,
  scopeLabel,
} from './availability'
import { useMyCollections } from './use-my-collections'

/**
 * A signed-in reader's own collections.
 *
 *   `/my/collections`        → every collection: the reader's private ones and
 *                              their organization's
 *   `/my/collections/<id>`   → one collection and what is in it
 *
 * Not `/collections`, which is the project's curated litigation collections
 * and open to everyone. These belong to an account.
 *
 * Both pages exist only for a signed-in reader whose worker has collections
 * switched on. For anyone else they render `fallback`, which `App` sets to its
 * ordinary "Not found": the address is then no different from one that was
 * never a page.
 */

function Gate({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const mine = useMyCollections()
  if (mine.available) return <>{children}</>
  if (mine.checked) return <>{fallback}</>
  // The question is still out. Say nothing about collections until it is back.
  return <main className="min-h-screen bg-background" aria-busy="true" />
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function MyCollectionsIndex({ fallback }: { fallback: ReactNode }) {
  return (
    <Gate fallback={fallback}>
      <IndexBody />
    </Gate>
  )
}

function IndexBody() {
  const mine = useMyCollections()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !mine.sessionToken) return
    setBusy(true)
    setError(null)
    try {
      await createMyCollection(mine.sessionToken, trimmed)
      setName('')
      await mine.refresh()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10" data-stage-private="">
        <BackToHubLink />
        <h1 className="mt-4 font-serif text-3xl font-bold">My collections</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Lists of documents you have saved. A collection is private unless you share it with your organization.
        </p>

        <form onSubmit={create} className="mt-6 flex max-w-md items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Name for a new collection"
            aria-label="Name for a new collection"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'New collection'}
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {mine.collections.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            No collections yet. Make one here, or use Save on any document.
          </p>
        )}
        <ul className="mt-6 space-y-5">
          {mine.collections.map((c) => (
            <li key={c.id} className="border-b border-border pb-5">
              <AppLink to={myCollectionPath(c.id)} className="font-serif text-xl font-semibold text-primary hover:underline">
                {c.name}
              </AppLink>
              <span className="ml-2 text-sm text-muted-foreground">{itemCountLabel(c.item_count)}</span>
              <p className="mt-1 text-sm text-muted-foreground">{scopeLabel(c)}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

export function MyCollectionPage({ id, fallback }: { id: string; fallback: ReactNode }) {
  return (
    <Gate fallback={fallback}>
      <CollectionBody id={id} fallback={fallback} />
    </Gate>
  )
}

function CollectionBody({ id, fallback }: { id: string; fallback: ReactNode }) {
  const mine = useMyCollections()
  const token = mine.sessionToken
  const [collection, setCollection] = useState<MyCollection | null>(null)
  const [items, setItems] = useState<MyCollectionItem[]>([])
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // App keys this page by id, so a different collection is a new mount.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    getMyCollection(token, id)
      .then((r) => {
        if (cancelled) return
        setCollection(r.collection)
        setItems(r.items)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // Gone, or not the reader's to see: the worker says the same for both.
        if ((e as { status?: number }).status === 404) setMissing(true)
        else setError(message(e))
      })
    return () => {
      cancelled = true
    }
  }, [token, id])

  if (missing) return <>{fallback}</>

  /** Run one change, show its error if it has one, and keep the list in the bar and index current. */
  async function act(change: (sessionToken: string) => Promise<void>) {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      await change(token)
      void mine.refresh()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  const rename = (e: React.FormEvent) => {
    e.preventDefault()
    const next = (renaming ?? '').trim()
    if (!next) return
    void act(async (t) => {
      setCollection(await updateMyCollection(t, id, { name: next }))
      setRenaming(null)
    })
  }
  const share = (to: 'org' | 'private') =>
    void act(async (t) => {
      setCollection(await updateMyCollection(t, id, { share: to }))
    })
  const remove = (item: MyCollectionItem) =>
    void act(async (t) => {
      await removeMyCollectionItem(t, id, item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    })
  const destroy = () => {
    if (!collection) return
    if (!window.confirm(`Delete "${collection.name}" and everything saved in it? This cannot be undone.`)) return
    void act(async (t) => {
      await deleteMyCollection(t, id)
      navigateTo(MY_COLLECTIONS_PATH)
    })
  }
  const copy = () =>
    void act(async (t) => {
      await navigator.clipboard.writeText(await exportMyCollection(t, id))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10" data-stage-private="">
        <AppLink to={MY_COLLECTIONS_PATH} className="text-sm text-muted-foreground hover:text-foreground">
          <span aria-hidden>←</span> My collections
        </AppLink>

        {renaming === null ? (
          <h1 className="mt-4 font-serif text-3xl font-bold">{collection?.name ?? ' '}</h1>
        ) : (
          <form onSubmit={rename} className="mt-4 flex max-w-md items-center gap-2">
            <Input
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              maxLength={120}
              aria-label="Collection name"
              autoFocus
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !renaming.trim()}>
              Save name
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRenaming(null)} disabled={busy}>
              Cancel
            </Button>
          </form>
        )}

        {collection && (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {scopeLabel(collection)} · {itemCountLabel(items.length)}
              {collection.scope === 'org' && !collection.created_by_me && ' · created by someone else in your organization'}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copy} disabled={busy || items.length === 0}>
                {copied ? 'Copied' : 'Copy as rt:// lines'}
              </Button>
              {collection.can_share && (
                <Button type="button" variant="outline" size="sm" onClick={() => share('org')} disabled={busy}>
                  Share with my organization
                </Button>
              )}
              {collection.can_make_private && (
                <Button type="button" variant="outline" size="sm" onClick={() => share('private')} disabled={busy}>
                  Make private
                </Button>
              )}
              {collection.can_manage && renaming === null && (
                <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(collection.name)} disabled={busy}>
                  Rename
                </Button>
              )}
              {collection.can_manage && (
                <Button type="button" variant="destructive" size="sm" onClick={destroy} disabled={busy}>
                  Delete
                </Button>
              )}
            </div>
          </>
        )}
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        {!collection && !error && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

        {collection && items.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            Nothing saved here yet. Open a document and use Save.
          </p>
        )}
        <ul className="mt-6">
          {items.map((item) => {
            const path = itemDocumentPath(item)
            return (
              <li key={item.id} className="flex items-start justify-between gap-4 border-b border-border py-3">
                <div className="min-w-0">
                  {path ? (
                    <AppLink to={path} className="text-primary hover:underline">
                      {item.title}
                    </AppLink>
                  ) : (
                    <span>{item.title}</span>
                  )}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{item.corpus}</span>
                  {item.natural_key && <span className="ml-2 text-xs text-muted-foreground">{item.natural_key}</span>}
                  {item.quote && (
                    <blockquote className="mt-1 border-l-2 border-border pl-3 text-sm text-foreground/80">
                      {item.quote}
                    </blockquote>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  disabled={busy}
                  aria-label={`Remove ${item.title} from this collection`}
                  className="shrink-0 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </main>
  )
}
