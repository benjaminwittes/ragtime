/**
 * Sources under an answer (design item 12, and the search-only state):
 * the documents the answer cites, each marked as read in full or only seen
 * in search results. Reading is a `fetch_documents` call in full mode, in
 * this turn or an earlier one of the same conversation — the model's
 * context carries what it read before.
 */

import { links, type ExplorerHandoffEvent } from '@lawfare/ragtime-client'
import { citationsIn, isCitationToken, linkifyCitations, titlesIn } from './answer-shape.ts'
import type { Turn } from './turn.ts'

export type Source = {
  slug: string
  id: string
  title: string
  /** Origin-relative, in the deep-link grammar; the app prefixes the public site's origin. */
  path: string
  read: boolean
}

export type SourceReport = {
  sources: Source[]
  readCount: number
  /** No document was read in full in this conversation up to and including this turn. */
  searchOnly: boolean
  /** Documents read in full this turn that the answer did not cite. */
  readUncited: Source[]
}

function key(slug: string, id: string | number): string {
  return slug + '/' + String(id)
}

/** `slug/id` → title for every document read in full across the given turns. */
export function readDocuments(turns: readonly Turn[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const turn of turns) {
    for (const round of turn.rounds) {
      for (const call of round.calls) {
        const d = call.result?.detail
        if (!d || d.kind !== 'documents' || d.mode !== 'full') continue
        const slug = d.corpus ?? (typeof call.input.corpus === 'string' ? call.input.corpus : null)
        if (!slug) continue
        for (const doc of d.documents) {
          if (doc.id === null || doc.error) continue
          out.set(key(slug, doc.id), doc.title ?? String(doc.id))
        }
      }
    }
  }
  return out
}

/**
 * `slug/id` → title for every document a tool result named: a search hit's
 * top titles, a fetch's titles in either mode. What the page falls back on
 * when a citation's link text is the citation itself.
 */
export function titleIndex(turns: readonly Turn[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const turn of turns) {
    for (const round of turn.rounds) {
      for (const call of round.calls) {
        const d = call.result?.detail
        if (!d) continue
        if (d.kind === 'search') {
          for (const h of d.hits) for (const t of h.top) if (t.id !== null && t.title) out.set(key(h.corpus, t.id), t.title)
        } else if (d.kind === 'documents') {
          const slug = d.corpus ?? (typeof call.input.corpus === 'string' ? call.input.corpus : null)
          if (!slug) continue
          for (const doc of d.documents) if (doc.id !== null && !doc.error && doc.title) out.set(key(slug, doc.id), doc.title)
        }
      }
    }
  }
  return out
}

/**
 * Document path → the best title the conversation knows for it: the answer's
 * own (a titled citation, or the bold run beside a token one), else the
 * trail's. For the markdown renderer, so a link whose text is `rt://olc/1425`
 * can show the title instead.
 */
export function knownTitles(turn: Turn, priorTurns: readonly Turn[] = []): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, title] of titleIndex(priorTurns.concat(turn))) {
    const slash = k.indexOf('/')
    out.set(links.document({ slug: k.slice(0, slash), id: k.slice(slash + 1) }), title)
  }
  for (const [path, title] of titlesIn(turn.answer)) out.set(path, title)
  return out
}

/** Whether any full-mode fetch happened in these turns, even one that failed. */
export function anyFullRead(turns: readonly Turn[]): boolean {
  return turns.some((t) =>
    t.rounds.some((r) =>
      r.calls.some((c) => c.name === 'fetch_documents' && c.input.mode === 'full' && c.result?.ok === true),
    ),
  )
}

export function sourcesOf(turn: Turn, priorTurns: readonly Turn[] = []): SourceReport {
  const scope = priorTurns.concat(turn)
  const read = readDocuments(scope)
  const known = knownTitles(turn, priorTurns)
  const seen = new Set<string>()
  const sources: Source[] = []
  for (const h of turn.handoffs) {
    if (h.kind !== 'document') continue
    const parsed = links.parse(h.url)
    if (!parsed || !parsed.id) continue
    const k = key(parsed.slug, parsed.id)
    if (seen.has(k)) continue
    seen.add(k)
    // The worker labels a document handoff with the citation's link text; when that is the citation itself, look the title up.
    const label = (h.label ?? '').trim()
    const title = label && !isCitationToken(label, { slug: parsed.slug, id: parsed.id }) ? label : (known.get(h.url) ?? k)
    sources.push({ slug: parsed.slug, id: parsed.id, title, path: h.url, read: read.has(k) })
  }
  // The worker makes a handoff only for the link form; a citation the model bracketed or wrote naked is a source all the same.
  for (const c of citationsIn(linkifyCitations(turn.answer, known))) {
    const k = key(c.slug, c.id)
    if (seen.has(k)) continue
    seen.add(k)
    sources.push({ slug: c.slug, id: c.id, title: isCitationToken(c.title, c) ? (known.get(c.path) ?? k) : c.title, path: c.path, read: read.has(k) })
  }
  const readCount = sources.filter((s) => s.read).length
  const readThisTurn = readDocuments([turn])
  const readUncited: Source[] = []
  for (const [k, title] of readThisTurn) {
    if (seen.has(k)) continue
    const slash = k.indexOf('/')
    const slug = k.slice(0, slash)
    const id = k.slice(slash + 1)
    readUncited.push({ slug, id, title, path: links.document({ slug, id }), read: true })
  }
  return { sources, readCount, searchOnly: !anyFullRead(scope), readUncited }
}

/** Workspace handoffs for the trail (item 4). */
export function workspaceHandoffs(turn: Turn): ExplorerHandoffEvent[] {
  return turn.handoffs.filter((h) => h.kind === 'workspace')
}
