import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { links } from '@lawfare/ragtime-client'

import { toHref } from '@/lib/routing'

type Props = {
  text: string
  className?: string
  /** Document path (origin-relative) → title; a link whose text is the citation itself shows the title instead. */
  titles?: Map<string, string>
}

/** The text of a link's children when it is plain text; null when it is richer than that. */
function plainText(children: React.ReactNode): string | null {
  if (typeof children === 'string') return children
  if (Array.isArray(children) && children.length === 1 && typeof children[0] === 'string') return children[0]
  return null
}

/**
 * The answer's markdown. `rt://slug/id` citations resolve through the client
 * package's `links.fromCitation` and nothing else (contract §4); every other
 * URL goes through react-markdown's own transform, which drops unsafe
 * schemes. Links open in a new tab for now: the conversation is not yet persisted, so navigating in place would lose it. A citation the model
 * wrote as its own link text (`[rt://olc/1425](rt://olc/1425)`) shows the
 * title the conversation knows for it, when it knows one.
 */
export function Markdown({ text, className, titles }: Props) {
  const urlTransform = (url: string): string => {
    if (url.startsWith('rt://')) {
      try {
        return toHref(links.fromCitation(url))
      } catch {
        return ''
      }
    }
    return defaultUrlTransform(url)
  }
  const titleFor = (href: string, children: React.ReactNode): string | null => {
    if (!titles) return null
    const shown = plainText(children)
    if (shown === null || !shown.trim().startsWith('rt://')) return null
    for (const [path, title] of titles) if (href === toHref(path)) return title
    return null
  }
  return (
    <div className={className ? 'md ' + className : 'md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {titleFor(href, children) ?? children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
