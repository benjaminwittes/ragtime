import { Button } from '@/components/ui/button'
import type { FecCandidateRow, FecCommitteeRow, FecFilterResult } from '@lawfare/ragtime-client'
import {
  CANDIDATE_STATUS_LABELS,
  COMMITTEE_TYPE_LABELS,
  DESIGNATION_LABELS,
  EM_DASH,
  OFFICE_LABELS,
  asOfLabel,
  PARTY_LABELS,
  codeLabel,
  cycleLabel,
  idCountLabel,
} from './fec-format'
import { type FecOpenTarget, FecIdLink, FecTh, Td } from './FecFigures'

/**
 * FEC results: one row per candidate ID or committee ID (never per cycle),
 * with name, office, party and the rest taken from its latest cycle, and
 * every cycle the ID appears in. Clicking a row opens its sheet. The count
 * line says "candidate IDs", not "candidates".
 */
export function FecResultsList({
  result,
  loading,
  error,
  hasRun,
  onOpen,
  onPage,
}: {
  result: FecFilterResult | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  onOpen: (target: FecOpenTarget) => void
  /** Move to another page of the same query (a new offset). */
  onPage: (offset: number) => void
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Search FEC candidate IDs or committee IDs by name or ID, or filter by cycle and the FEC’s
          own codes. Each result opens the full cycle-by-cycle record and its summary figures.
        </p>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Searching…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-destructive">Search failed: {error}</p>
      </div>
    )
  }
  if (!result || result.results.length === 0) {
    return (
      <div className="px-6 py-8">
        <p className="text-center text-sm text-muted-foreground">
          No {result?.kind === 'committee' ? 'committee IDs' : 'candidate IDs'} matched. Try fewer
          words, an ID, or a wider range of cycles.
        </p>
      </div>
    )
  }

  const first = result.offset + 1
  const last = result.offset + result.results.length
  const asOf = asOfLabel(result.as_of?.fetched)
  return (
    <div className="space-y-3 px-6 py-4">
      {asOf && (
        <p className="text-xs text-muted-foreground" data-testid="fec-as-of">
          {asOf}
        </p>
      )}
      <div className="flex flex-wrap items-baseline gap-3 text-xs text-muted-foreground">
        <span>
          {idCountLabel(result.total, result.kind)} matched · showing {first.toLocaleString('en-US')}–
          {last.toLocaleString('en-US')}
        </span>
        <span className="ml-auto flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={result.offset === 0}
            onClick={() => onPage(Math.max(0, result.offset - result.limit))}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={last >= result.total}
            onClick={() => onPage(result.offset + result.limit)}
          >
            Next
          </Button>
        </span>
      </div>
      {result.kind === 'candidate' ? (
        <CandidateTable rows={result.results} onOpen={onOpen} />
      ) : (
        <CommitteeTable rows={result.results} onOpen={onOpen} />
      )}
    </div>
  )
}

function rowProps(target: FecOpenTarget, name: string | null, onOpen: (t: FecOpenTarget) => void) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: () => onOpen(target),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen(target)
      }
    },
    'aria-label': `Open ${target.kind} ID ${target.id}${name ? ` (${name})` : ''}`,
    className:
      'cursor-pointer border-t border-lawfare-line hover:bg-muted/40 focus:bg-muted/60 focus:outline-none',
  }
}

export function CandidateTable({
  rows,
  onOpen,
}: {
  rows: readonly FecCandidateRow[]
  onOpen: (target: FecOpenTarget) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[11px] text-muted-foreground">
          <tr>
            <FecTh label="Candidate ID" fec="CAND_ID" />
            <FecTh label="Name" fec="CAND_NAME" />
            <FecTh label="Office" fec="CAND_OFFICE" />
            <FecTh label="State / district" fec="CAND_OFFICE_ST" />
            <FecTh label="Party" fec="CAND_PTY_AFFILIATION" />
            <FecTh label="Status" fec="CAND_STATUS" />
            <FecTh label="Principal committee" fec="CAND_PCC" />
            <FecTh label="Cycles it appears in" fec="cycle" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} {...rowProps({ kind: 'candidate', id: r.id }, r.name, onOpen)}>
              <Td className="whitespace-nowrap font-mono text-xs">{r.id}</Td>
              <Td>{r.name ?? EM_DASH}</Td>
              <Td className="text-xs">{codeLabel(r.office, OFFICE_LABELS)}</Td>
              <Td className="text-xs">{[r.state, r.district].filter(Boolean).join('-') || EM_DASH}</Td>
              <Td className="text-xs">{codeLabel(r.party, PARTY_LABELS)}</Td>
              <Td className="text-xs">{codeLabel(r.status, CANDIDATE_STATUS_LABELS)}</Td>
              <Td className="text-xs">
                <FecIdLink kind="committee" id={r.pcc} onOpen={onOpen} />
              </Td>
              <Td>
                <CycleChips cycles={r.cycles} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CommitteeTable({
  rows,
  onOpen,
}: {
  rows: readonly FecCommitteeRow[]
  onOpen: (target: FecOpenTarget) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[11px] text-muted-foreground">
          <tr>
            <FecTh label="Committee ID" fec="CMTE_ID" />
            <FecTh label="Name" fec="CMTE_NM" />
            <FecTh label="Type" fec="CMTE_TP" />
            <FecTh label="Designation" fec="CMTE_DSGN" />
            <FecTh label="Party" fec="CMTE_PTY_AFFILIATION" />
            <FecTh label="State" fec="CMTE_ST" />
            <FecTh label="Connected organization" fec="CONNECTED_ORG_NM" />
            <FecTh label="Candidate ID" fec="CAND_ID" />
            <FecTh label="Cycles it appears in" fec="cycle" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} {...rowProps({ kind: 'committee', id: r.id }, r.name, onOpen)}>
              <Td className="whitespace-nowrap font-mono text-xs">{r.id}</Td>
              <Td>{r.name ?? EM_DASH}</Td>
              <Td className="text-xs">{codeLabel(r.type, COMMITTEE_TYPE_LABELS)}</Td>
              <Td className="text-xs">{codeLabel(r.designation, DESIGNATION_LABELS)}</Td>
              <Td className="text-xs">{codeLabel(r.party, PARTY_LABELS)}</Td>
              <Td className="text-xs">{r.state ?? EM_DASH}</Td>
              <Td className="text-xs">{r.connected_org ?? EM_DASH}</Td>
              <Td className="text-xs">
                <FecIdLink kind="candidate" id={r.cand_id} onOpen={onOpen} />
              </Td>
              <Td>
                <CycleChips cycles={r.cycles} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Every cycle the ID appears in, ascending, each said in full. */
function CycleChips({ cycles }: { cycles: readonly number[] }) {
  if (cycles.length === 0) return <span className="text-muted-foreground">{EM_DASH}</span>
  return (
    <ul className="flex flex-wrap gap-1">
      {[...cycles]
        .sort((a, b) => a - b)
        .map((c) => (
          <li
            key={c}
            className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {cycleLabel(c)}
          </li>
        ))}
    </ul>
  )
}
