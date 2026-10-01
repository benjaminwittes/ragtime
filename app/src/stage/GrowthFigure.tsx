/** The words. */
const SAID = {
  held: 'Collections held',
  by: (count: number, month: string) => `${count} ${count === 1 ? 'collection' : 'collections'} by the end of ${month}`,
  source: 'Each is placed in the month it first appeared in the app, in 2026.',
} as const

const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September'] as const

/**
 * What arrived, by the month it first appeared in the app (this repository's own history;
 * the connector's month is the service's). Kept by hand: a month is added when it ends.
 * The first row is the one the columns above count.
 */
const GROUPS: readonly { said: string; arrived: readonly (readonly string[])[] }[] = [
  {
    said: 'Collections',
    arrived: [
      ['Federal court litigation'],
      ['OLC opinions', 'Foreign Relations of the United States', 'United States Code', 'Code of Federal Regulations'],
      ['Commentary', 'Presidential Documents'],
      ['Federal Register', 'Congress', 'FBI Records', 'Sanctions'],
      [],
      ['Library of Congress catalogue'],
    ],
  },
  {
    said: 'Integrations',
    arrived: [[], [], [], ['Claude connector'], [], ['CourtListener, live', 'Google Books']],
  },
  {
    said: 'Ways to search and ask',
    arrived: [
      [],
      ['Keyword search across every collection', 'AI answers over a collection'],
      ['Search by meaning', 'More like this', 'CSV and PDF export'],
      ['Questions across collections'],
      [],
      ['The Explorer', 'Links straight to a document'],
    ],
  },
]

/** How many collections were held by the end of each month. */
const HELD = GROUPS[0].arrived.reduce<number[]>((held, month) => [...held, (held.at(-1) ?? 0) + month.length], [])
const MOST = Math.max(...HELD)

/**
 * How RAGtime has grown: what arrived in each month since the first collection, in three
 * groups, under a column for how many collections were held by the end of that month.
 *
 * A table, because it is one: months across, groups down, and every cell says in words
 * what arrived. The columns are the only drawing, one hue, each with its number over it,
 * so nothing here is read from colour.
 */
export function GrowthFigure() {
  return (
    <div className="flex flex-col gap-[1.2cqw]" data-figure="growth">
      <table className="w-full table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-[13cqw]" />
          {MONTHS.map((month) => (
            <col key={month} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="row" className="pb-[0.6cqw] pr-[1cqw] align-bottom font-sans text-[1.1cqw] font-semibold uppercase tracking-[0.14em] text-primary">
              {SAID.held}
            </th>
            {MONTHS.map((month, at) => (
              <td key={month} className="px-[0.6cqw] align-bottom" title={SAID.by(HELD[at], month)} data-figure-node={month}>
                <div className="flex h-[9cqw] flex-col justify-end">
                  <span className="mb-[0.3cqw] font-mono text-[1.25cqw] tabular-nums text-foreground">{HELD[at]}</span>
                  <div className="w-[38%] min-w-[2.4cqw] rounded-t-[0.35cqw] bg-primary" style={{ height: `${(HELD[at] / MOST) * 6.4}cqw` }} />
                </div>
              </td>
            ))}
          </tr>
          <tr className="border-t border-lawfare-line-strong">
            <td />
            {MONTHS.map((month) => (
              <th key={month} scope="col" className="px-[0.6cqw] py-[0.6cqw] font-mono text-[1.05cqw] font-normal uppercase tracking-[0.08em] text-lawfare-text-secondary">
                {month}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((group) => (
            <tr key={group.said} className="border-t border-lawfare-line">
              <th scope="row" className="py-[0.9cqw] pr-[1cqw] align-top font-sans text-[1.1cqw] font-semibold uppercase leading-snug tracking-[0.14em] text-primary">
                {group.said}
              </th>
              {group.arrived.map((names, at) => (
                <td key={MONTHS[at]} className="px-[0.6cqw] py-[0.9cqw] align-top">
                  <ul className="grid gap-[0.45cqw]">
                    {names.map((name) => (
                      <li key={name} className="font-serif text-[1.3cqw] leading-[1.2]">
                        {name}
                      </li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-lawfare-line pt-[0.9cqw] text-[1.15cqw] text-lawfare-text-secondary">{SAID.source}</p>
    </div>
  )
}
