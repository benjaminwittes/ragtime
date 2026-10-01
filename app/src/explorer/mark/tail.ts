import type { Element, ElementContent, Root } from 'hast'

/**
 * A rehype plugin: put the signature after the last word of the answer. The last word and
 * the glyph go in one span that does not wrap, so the glyph can never land alone at the start
 * of a line (design: it hugs the last word).
 *
 * Marks are made as `span.mark-tail` around the last word and `span.mark-sig` for the glyph;
 * `Markdown` renders the second as the glyph itself.
 */
const INLINE = new Set(['a', 'em', 'strong', 'del', 'code'])

const sig = (): Element => ({ type: 'element', tagName: 'span', properties: { className: ['mark-sig'] }, children: [] })
const tail = (children: ElementContent[]): Element => ({ type: 'element', tagName: 'span', properties: { className: ['mark-tail'] }, children })

type Step = { parent: Element | Root; index: number }

/** The path of (parent, index) steps down to the last text that has a letter in it; null when there is none. */
function lastLetters(node: Element | Root): Step[] | null {
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]!
    if (child.type === 'text') {
      if (/\S/.test(child.value)) return [{ parent: node, index: i }]
    } else if (child.type === 'element') {
      const below = lastLetters(child)
      if (below) return [{ parent: node, index: i }, ...below]
    }
  }
  return null
}

export function rehypeSignature() {
  return (root: Root) => {
    const path = lastLetters(root)
    if (!path) return
    // Climb out of inline wrappers (a link, emphasis, code) to the one the block holds, so the glyph
    // is never inside a link's underline or a code chip.
    let top = path.length - 1
    while (top > 0 && path[top]!.parent.type === 'element' && INLINE.has((path[top]!.parent as Element).tagName)) top--
    const { parent, index } = path[top]!
    const node = parent.children[index]!
    if (node.type === 'text' && top === path.length - 1) {
      // The last thing is plain text: hold its last word with the glyph.
      const m = /^([\s\S]*?)(\S+\s*)$/.exec(node.value)
      const head = m ? m[1]! : ''
      const word = m ? m[2]! : node.value
      parent.children.splice(index, 1, ...(head ? [{ type: 'text' as const, value: head }] : []), tail([{ type: 'text', value: word }, sig()]))
    } else {
      parent.children.splice(index + 1, 0, tail([sig()]))
    }
  }
}
