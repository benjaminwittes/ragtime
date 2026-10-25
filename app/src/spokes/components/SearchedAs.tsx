import { cn } from '@/lib/utils'

/**
 * The "Searched as" line on a corpus page, under the result count: how the
 * worker read the search box's text, shown only when that says something the
 * typed words did not. The rule is `searchBoxLine` in `lib/searched-as.ts`,
 * the same one Search's card uses; this is only its markup, in the card's
 * styling. `centered` is for the no-match message, which is centred. Takes no
 * hooks, so it can be called as a plain function in tests.
 */
export function SearchedAs({
  line,
  centered,
}: {
  line: string | null | undefined
  centered?: boolean
}) {
  if (!line) return null
  return (
    <p
      data-testid="searched-as"
      className={cn('mt-1 font-mono text-[11px] text-muted-foreground', centered && 'text-center')}
    >
      {line}
    </p>
  )
}
