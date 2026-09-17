/**
 * The one Markdown element map for every spoke surface: the results
 * narrative, the AMA answers, and the detail sheets' in-panel summaries.
 * Twenty-two files each carried a copy of this map and had begun to drift
 * apart from one another; this is the single definition they all import.
 *
 * Its styling was decided at 7e75ba3 ("A spoke's results stop being a table
 * in a box"), which put the map on the ruled-page doctrine: rules drawn in
 * `border-lawfare-line` rather than `border-border`, a blockquote that reads
 * as the record's own words instead of as a greyed aside, and a Markdown
 * table un-boxed the same way the table of cases beside it is. Read that
 * commit before changing anything here, because a change here now lands on
 * every spoke at once.
 */

/**
 * Explicit element styling for the narrative markdown. Tailwind v4 doesn't
 * ship the `prose` utilities (those are v3's @tailwindcss/typography), so
 * we style each element directly. Matches the editorial register of the
 * legacy spoke surface — serif headings, primary-color links, monospace
 * inline code.
 */
export const MARKDOWN_COMPONENTS = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="font-serif text-2xl font-semibold mt-2 mb-3" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className="font-serif text-xl font-semibold mt-5 mb-2 border-b border-lawfare-line pb-1"
      {...props}
    />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="font-serif text-base font-semibold mt-4 mb-1.5" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="leading-relaxed text-foreground" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-primary hover:underline" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-6 space-y-1" {...props} />
  ),
  ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-6 space-y-1" {...props} />
  ),
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  // A blockquote inside a corpus synthesis is the record's own words, quoted back. So it
  // takes the record's face and the page's foreground ink, and a leading rule in the
  // strong hairline marks it as quoted before a word is read — not italic, not greyed,
  // which said "aside" about the one thing on the page that is primary source.
  blockquote: (props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-2 border-lawfare-line-strong pl-4 font-serif text-foreground"
      {...props}
    />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic" {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
      {...props}
    />
  ),
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="my-4 border-lawfare-line" {...props} />
  ),
  // A table the model wrote is the same object as the table of cases below it, so it is
  // un-boxed the same way: the scroll stays, the border and the corner go, the heads are
  // labels rather than a band, and the rule rides on each body row. The rule is reached
  // through `tbody` rather than through the `tr` component because that component renders
  // the header's row too, and a rule above the heads would open the table twice.
  table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead
      className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
      {...props}
    />
  ),
  tbody: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <tbody className="[&>tr]:border-t [&>tr]:border-lawfare-line" {...props} />
  ),
  tr: (props: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr {...props} />
  ),
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className="px-3 py-2 text-left font-medium" {...props} />
  ),
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="px-3 py-2 align-top" {...props} />
  ),
}

/**
 * Compact markdown styling for a detail sheet's in-panel summary: tighter
 * spacing and a smaller heading scale than the AMA result block, because the
 * side sheet is narrow. All ten detail sheets carried this identical variant,
 * so it lives here once rather than ten times over.
 *
 * It is the canonical map with one thing changed, the scale. The blockquote,
 * the table, the code span, the rules — everything that carries the ruled-page
 * doctrine — it inherits, which is the point of spreading rather than copying.
 */
export const SUMMARY_MARKDOWN_COMPONENTS = {
  ...MARKDOWN_COMPONENTS,
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="font-serif text-lg font-semibold mt-2 mb-1.5" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="font-serif text-base font-semibold mt-3 mb-1" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="font-serif text-sm font-semibold mt-2 mb-1" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="leading-relaxed text-foreground/90" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-5 space-y-0.5" {...props} />
  ),
  ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-5 space-y-0.5" {...props} />
  ),
}
