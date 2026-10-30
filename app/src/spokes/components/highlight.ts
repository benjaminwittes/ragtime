import { SNIPPET_HL_START, SNIPPET_HL_STOP } from '@lawfare/ragtime-client'

/**
 * A searched term, carried from a result's snippet into the text it came from.
 *
 * The UI/UX live document: a search for "vindictive prosecution" highlights the
 * phrase in the results list, and the highlight is gone once the case is
 * opened. The snippet is CourtListener's own highlighting of what matched, so
 * the terms it marks are the ones to look for in the docket: they are what the
 * search actually matched, stemmed forms included ("prosecutions" for
 * "prosecution"), which re-reading the query here would get wrong.
 */

/** One run of text, and whether it is a match. */
export type Segment = { text: string; hit: boolean }

/** A snippet cut at its highlight delimiters. An unclosed mark runs to the end. */
export function snippetSegments(snippet: string): Segment[] {
  const out: Segment[] = []
  let i = 0
  while (i < snippet.length) {
    const start = snippet.indexOf(SNIPPET_HL_START, i)
    if (start === -1) {
      out.push({ text: snippet.slice(i), hit: false })
      break
    }
    if (start > i) out.push({ text: snippet.slice(i, start), hit: false })
    const stop = snippet.indexOf(SNIPPET_HL_STOP, start + 1)
    if (stop === -1) {
      out.push({ text: snippet.slice(start + 1), hit: true })
      break
    }
    out.push({ text: snippet.slice(start + 1, stop), hit: true })
    i = stop + 1
  }
  return out
}

/** The distinct terms a snippet marks, longest first so a phrase wins over a word inside it. */
export function snippetTerms(snippet: string | undefined): string[] {
  if (!snippet) return []
  const seen = new Map<string, string>()
  for (const s of snippetSegments(snippet)) {
    const t = s.text.trim()
    if (s.hit && t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t)
  }
  return [...seen.values()].sort((a, b) => b.length - a.length)
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * `text` cut wherever one of `terms` occurs, ignoring case, at word edges only,
 * so "act" does not light up inside "fact".
 */
export function termSegments(text: string, terms: readonly string[]): Segment[] {
  if (!text || terms.length === 0) return text ? [{ text, hit: false }] : []
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${terms.map(escape).join('|')})(?![\\p{L}\\p{N}])`,
    'giu',
  )
  const out: Segment[] = []
  let i = 0
  for (const m of text.matchAll(pattern)) {
    const at = m.index!
    if (at > i) out.push({ text: text.slice(i, at), hit: false })
    out.push({ text: m[0], hit: true })
    i = at + m[0].length
  }
  if (i < text.length) out.push({ text: text.slice(i), hit: false })
  return out
}
