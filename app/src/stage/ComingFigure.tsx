/** The words. */
const SAID = {
  building: 'Being built',
  asked: 'Asked for',
  tracked: 'Every request is tracked, from the day it is asked for to the day it ships.',
} as const

/**
 * What has been asked for and is not here yet, by name, as the requests stood on
 * 2026-10-01. Names only, and kept by hand: who asked, how soon and what stands in the
 * way are the tracker's business, not the room's.
 */
const BUILDING = [
  'House and Senate Precedents',
  'Congressional Research Service (CRS)',
  'Government Accountability Office (GAO) Reports',
  'Inspector General (IG) Reports',
  'Special Counsel and Independent Counsel Reports',
  'DC Code',
  'Public Papers of the Presidents (PPP)',
  'Congressional Serial Set (CSS)',
  'SEC Filings (8-K, 10-K, 10-Q)',
  'The rest of the FBI Vault',
  'Court of Federal Claims docket',
  'Supreme Court docket',
  'Case law',
  'Dockets from military commissions cases',
] as const

const ASKED = [
  'FEC Campaign Finance Data',
  'Federal Contracts and Spending Data: USASpending.gov',
  'Federal Contracts and Spending Data: SAM.gov',
  'Executive Office for Immigration Review (EOIR) Immigration Court Data',
  'State Department Central Foreign Policy Files',
  'CIA Records Search Tool (CREST)',
  'National Security Internet Archive',
  'National Archives Access to Archival Databases (NARA AAD)',
  'Board of Veterans’ Appeals Decisions',
  'Foreign Intelligence Surveillance Court (FISC) Public Filings',
  'Foreign Agents Registration Act (FARA) Bulk Data',
  'Senate Lobbying Disclosure Act (LDA) filings',
  'Judiciary Electronic Filing and Service System (JEFS) Portal',
  'Pandemic Oversight Documents',
  'Election Assistance Commission (EAC)',
  'DC Code of Municipal Regulations (DCMR)',
  'Papers from the AI labs (Anthropic, Meta, OpenAI, DeepSeek)',
  'Pre-OLC archive (1789–1982)',
  'Structured roll-call votes',
  'Declassified opinions and orders of the FISC, from ODNI',
  'Consent decrees and pattern-or-practice findings, DOJ Civil Rights Division',
  'Export-control designations',
  'DOJ Press Releases',
  'State Department Country Reports on Human Rights Practices',
  'Privacy Act systems of records, as typed data',
  'Regulations.gov',
  'Oversight.gov',
] as const

function Names({ heading, names, wide = false }: { heading: string; names: readonly string[]; wide?: boolean }) {
  return (
    <section>
      <h3 className="mb-[0.7cqw] flex items-baseline gap-[0.8cqw] border-b border-lawfare-line-strong pb-[0.35cqw] font-sans text-[1.1cqw] font-semibold uppercase tracking-[0.14em] text-primary">
        {heading}
        <span className="font-mono font-normal tracking-normal text-lawfare-text-warm">{names.length}</span>
      </h3>
      <ul className={wide ? 'columns-2 gap-x-[2.5cqw]' : undefined}>
        {names.map((name) => (
          <li key={name} className="mb-[0.45cqw] break-inside-avoid font-serif text-[1.42cqw] leading-[1.25]" data-figure-node={name}>
            {name}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Corpora coming soon: what is being built, and what has been asked for and not started.
 * A list to be read from the back of a room, so it is names and nothing to operate: it says
 * that requests are tracked and does not send anyone to the tracker.
 */
export function ComingFigure() {
  return (
    <div className="flex flex-col gap-[1.6cqw]" data-figure="coming">
      <div className="grid grid-cols-3 items-start gap-x-[2.5cqw]">
        <Names heading={SAID.building} names={BUILDING} />
        <div className="col-span-2">
          <Names heading={SAID.asked} names={ASKED} wide />
        </div>
      </div>
      <p className="border-t border-lawfare-line pt-[1cqw] text-[1.3cqw] text-lawfare-text-secondary">{SAID.tracked}</p>
    </div>
  )
}
