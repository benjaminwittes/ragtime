import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { links } from '@lawfare/ragtime-client'

import { AppLink } from '@/components/AppLink'
import { toHref, toLogicalHref } from '@/lib/routing'

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
 * schemes. A citation the model wrote as its own link text
 * (`[rt://olc/1425](rt://olc/1425)`) shows the title the conversation knows
 * for it, when it knows one.
 *
 * **Where a link goes is decided per link, not per component.** An answer mixes
 * this app's corpora with the open web, so `toLogicalHref` sorts them: a
 * citation opens the document in place, and anything with an origin of its own
 * opens in a new tab, which is what the rest of the site's `↗` links do. This
 * used to be one rule — everything to a new tab — because the conversation was
 * not saved and navigating away lost it. It is saved now (`model/persist.ts`),
 * so leaving the page and coming back costs nothing.
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
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>
            const label = titleFor(href, children) ?? children
            const logical = toLogicalHref(href)
            return logical ? (
              <AppLink to={logical}>{label}</AppLink>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {label}
              </a>
            )
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
