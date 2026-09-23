/**
 * The brief's answer shape doubles as a rendering hint (design item 11): a
 * list renders as cards titled by the citation, a count as a big number with
 * the workspace handoff, a narrative as prose, a document opens the detail
 * sheet. The presets are the chips on the brief card (item 1); free text
 * falls back to narrative.
 */

import { links } from '@lawfare/ragtime-client'

export type AnswerShape = 'list' | 'count' | 'narrative' | 'document'

export const ANSWER_SHAPES: readonly { key: AnswerShape; label: string; text: string }[] = [
  { key: 'list', label: 'List', text: 'a list of the documents, each with its date and holding' },
  { key: 'count', label: 'Count', text: 'a count, with how it was reached' },
  { key: 'narrative', label: 'Narrative', text: 'a short narrative with citations' },
  { key: 'document', label: 'Document', text: 'the one document that answers this' },
]

/** Which preset a free-text answer shape means; narrative when unsure. */
export function detectShape(answerShape: string | null | undefined): AnswerShape {
  const s = (answerShape ?? '').toLowerCase()
  if (/\b(count|how many|number of|tally|total)\b/.test(s)) return 'count'
  if (/\b(list|table|enumerat|catalog|inventory|bullet)/.test(s)) return 'list'
  if (/\b(one document|the document|a document|single document|which document|the opinion|the order|the section)\b/.test(s)) return 'document'
  return 'narrative'
}

export type Citation = { title: string; slug: string; id: string; path: string }

const CITATION = /\[([^\]]{1,200})\]\((rt:\/\/[a-z_]+(?::[a-z_]+)?\/[A-Za-z0-9:_.-]{1,80})\)/g

/** Every rt:// citation in the text, in order, duplicates kept. */
export function citationsIn(markdown: string): Citation[] {
  const out: Citation[] = []
  CITATION.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CITATION.exec(markdown)) !== null) {
    const c = links.parseCitation(m[2]!)
    if (!c) continue
    out.push({ title: m[1]!, slug: c.slug, id: c.id, path: links.fromCitation(m[2]!) })
  }
  return out
}

export function firstCitation(markdown: string): Citation | null {
  return citationsIn(markdown)[0] ?? null
}

/**
 * Link text that is the citation itself rather than a title: the model wrote
 * `[rt://olc/1425](rt://olc/1425)` or `[1425](rt://olc/1425)` against the
 * prompt's `[title](rt://…)`. Seen live on 2026-09-09 in every item of a list
 * answer; the page recovers the title from the item's bold run or from the
 * trail instead of showing the token.
 */
export function isCitationToken(text: string, c?: { slug: string; id: string }): boolean {
  const t = text.trim()
  if (/^rt:\/\//i.test(t)) return true
  if (!c) return /^[a-z_]+(?::[a-z_]+)?[/:][A-Za-z0-9:_.-]+$/.test(t)
  return t === c.id || t === c.slug + '/' + c.id || t === c.slug + ':' + c.id
}

const BOLD = /\*\*([^*]{1,160})\*\*/

/**
 * Document path → title, read off the answer itself: a citation whose link
 * text is a title gives it directly; one whose link text is a token gives it
 * when its line carries a bold run (`**Title** — date — [rt://olc/1](rt://olc/1)`).
 * A line with more than one citation is skipped as ambiguous.
 */
export function titlesIn(markdown: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of markdown.split('\n')) {
    const cites = citationsIn(line)
    if (cites.length !== 1) continue
    const c = cites[0]!
    if (!isCitationToken(c.title, c)) {
      out.set(c.path, c.title.trim())
      continue
    }
    const bold = BOLD.exec(line)
    if (bold) out.set(c.path, bold[1]!.trim())
  }
  return out
}

const SLUG = '[a-z_]+(?::[a-z_]+)?'
const ID = '[A-Za-z0-9:_.-]+'
/** `[rt://slug/id]` or `[rt://slug/id1, id2]` or `[rt://slug/1, rt://slug/2]`: the citation bracketed on its own, no title, no link. Not followed by `(`, which would make it a markdown link. */
const BARE_BRACKET = new RegExp('\\[\\s*rt:\\/\\/(' + SLUG + ')\\/(' + ID + '(?:\\s*,\\s*(?:rt:\\/\\/' + SLUG + '\\/)?' + ID + ')*)\\s*\\](?!\\()', 'g')
/** A naked `rt://slug/id` in prose: not the text or the target of a markdown link. */
const BARE_TOKEN = new RegExp('(?<![\\[(\\w/])rt:\\/\\/(' + SLUG + ')\\/(' + ID + ')(?!\\w)', 'g')
const ITEM_PREFIX = new RegExp('^rt:\\/\\/(' + SLUG + ')\\/')

/** An id as the model wrote it may carry the sentence's punctuation; keep that outside the link. */
function splitId(raw: string): { id: string; tail: string } {
  const m = /^(.*?)([.,;:]+)$/.exec(raw)
  return m ? { id: m[1]!, tail: m[2]! } : { id: raw, tail: '' }
}

function linkFor(slug: string, id: string, titles?: Map<string, string>): string {
  const cite = `rt://${slug}/${id}`
  let path: string
  try {
    path = links.fromCitation(cite)
  } catch {
    return cite
  }
  return `[${titles?.get(path) ?? slug + '/' + id}](${cite})`
}

/**
 * Citations the model wrote without the link form — `[rt://litigation/71906132]`,
 * `[rt://litigation/73223865, 73223872]`, or a naked `rt://olc/112` in prose
 * (seen live 2026-09-09 in a narrative answer) — rewritten as `[text](rt://…)`
 * so they render as links: one per id, titled from what the conversation knows,
 * else `slug/id`. Existing links are left alone.
 */
export function linkifyCitations(markdown: string, titles?: Map<string, string>): string {
  const bracketed = markdown.replace(BARE_BRACKET, (_m, slug: string, idList: string) =>
    idList
      .split(',')
      .map((item) => {
        let s = slug
        let raw = item.trim()
        const own = ITEM_PREFIX.exec(raw)
        if (own) {
          s = own[1]!
          raw = raw.slice(own[0].length)
        }
        const { id, tail } = splitId(raw)
        return linkFor(s, id, titles) + tail
      })
      .join(', '),
  )
  return bracketed.replace(BARE_TOKEN, (_m, slug: string, raw: string) => {
    const { id, tail } = splitId(raw)
    return linkFor(slug, id, titles) + tail
  })
}

/** A card body after its title and citation are lifted out: no empty bold where a bolded link was, no leading separator, no dash left dangling before punctuation or the end of a line. */
function tidy(s: string): string {
  return s
    .replace(/\*\*\s*\*\*/g, '')
    .replace(/^\s*[—–:,-]\s*/, '')
    .replace(/[ \t]*[—–][ \t]*(?=[.,;:)]|[ \t]*$)/gm, '')
    .replace(/^\s*[—–:,-]\s*/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function firstWords(text: string): string {
  const words = text.split(/\s+/).filter(Boolean)
  return words.slice(0, 10).join(' ') + (words.length > 10 ? '…' : '')
}

/** The first number in the text (commas allowed), for the count renderer. */
export function firstNumber(markdown: string): string | null {
  const m = /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(?![\w,.]*\d)/.exec(markdown.replace(/rt:\/\/[^)\s]+/g, ''))
  return m ? m[1]! : null
}

export type ListCard = {
  title: string
  /** The citation's document path, when the item carried one. */
  path: string | null
  body: string
}

export type ListAnswer = {
  lead: string
  cards: ListCard[]
  rest: string
}

const ITEM = /^(?:[-*•]|\d{1,3}[.)])\s+/

/**
 * Split a list-shaped answer into a lead paragraph, one card per top-level
 * list item, and whatever follows the list. An item is titled by its first
 * citation (the link is lifted out of the body so it is not shown twice) —
 * unless that citation is its own link text, in which case the item's bold
 * run is the title, else its first words; an item without a citation is
 * titled by its first bold run or its first words.
 * Fewer than two items means the answer was not really a list: no cards.
 */
export function splitListAnswer(markdown: string): ListAnswer {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const items: string[][] = []
  const lead: string[] = []
  const rest: string[] = []
  let mode: 'lead' | 'items' | 'rest' = 'lead'
  let blankSinceItem = false
  for (const line of lines) {
    const isItem = ITEM.test(line)
    if (mode === 'lead') {
      if (isItem) {
        mode = 'items'
        items.push([line.replace(ITEM, '')])
      } else lead.push(line)
      continue
    }
    if (mode === 'items') {
      if (isItem) {
        items.push([line.replace(ITEM, '')])
        blankSinceItem = false
      } else if (line.trim() === '') {
        blankSinceItem = true
      } else if (/^\s+/.test(line) || !blankSinceItem) {
        items[items.length - 1]!.push(line.trim())
      } else {
        mode = 'rest'
        rest.push(line)
      }
      continue
    }
    rest.push(line)
  }
  if (items.length < 2) return { lead: markdown.trim(), cards: [], rest: '' }
  const cards = items.map((parts) => {
    const text = parts.join('\n').trim()
    const cites = citationsIn(text)
    const bold = BOLD.exec(text)
    if (cites.length) {
      const c = cites[0]!
      const without = text.replace(`[${c.title}](rt://${c.slug}/${c.id})`, '')
      if (!isCitationToken(c.title, c)) return { title: c.title, path: c.path, body: tidy(without) }
      // The citation is its own link text: the bold run is the title, else the first words.
      if (bold) return { title: bold[1]!.trim(), path: c.path, body: tidy(without.replace(bold[0], '')) }
      const body = tidy(without)
      return { title: firstWords(body), path: c.path, body }
    }
    if (bold) return { title: bold[1]!.trim(), path: null, body: tidy(text.replace(bold[0], '')) }
    return { title: firstWords(text), path: null, body: text }
  })
  return { lead: lead.join('\n').trim(), cards, rest: rest.join('\n').trim() }
}
