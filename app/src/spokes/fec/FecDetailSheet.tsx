import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  type FecCandidateCycle,
  type FecCandidateDetail,
  type FecCommitteeCycle,
  type FecCommitteeDetail,
  type FecSummaryRow,
  fetchFecCandidate,
  fetchFecCommittee,
} from '@lawfare/ragtime-client'
import {
  CANDIDATE_STATUS_LABELS,
  CANDIDATE_SUMMARY_FIELDS,
  CANDIDATE_TOTALS_FIELDS,
  CANDIDATE_TOTALS_FILES,
  COMMITTEE_TYPE_LABELS,
  DESIGNATION_LABELS,
  EM_DASH,
  FEC_CYCLE_NOTE,
  FILING_FREQ_LABELS,
  ICI_LABELS,
  OFFICE_LABELS,
  ORG_TYPE_LABELS,
  PAC_PARTY_TOTALS_FIELDS,
  PARTY_LABELS,
  codeLabel,
  cycleLabel,
  formatFecExact,
} from './fec-format'
import {
  type FecOpenTarget,
  FecFiguresTable,
  FecIdLink,
  FecSourceLink,
  FecTh,
  Td,
} from './FecFigures'

/**
 * Side sheet for one FEC candidate ID or committee ID, fetched from
 * /corpus/fec/candidate or /corpus/fec/committee. Linked IDs open the other
 * sheet in place (`onOpen`).
 *
 * Everything shown is what the FEC files say, as sent: amounts exactly, codes
 * as filed with a plain label beside them, each row linked to its source file
 * and line. Nothing is added up, compared or merged; the shared-principal-
 * committee view is shown as a flag for review, never as a finding.
 */
export function FecDetailSheet({
  target,
  open,
  onOpenChange,
  onOpen,
}: {
  target: FecOpenTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpen: (target: FecOpenTarget) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!w-full !max-w-4xl flex h-full flex-col gap-0 p-0">
        {target ? (
          <FecDetailBody key={`${target.kind}:${target.id}`} target={target} onOpen={onOpen} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            Nothing selected.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function FecDetailBody({
  target,
  onOpen,
}: {
  target: FecOpenTarget
  onOpen: (target: FecOpenTarget) => void
}) {
  const [candidate, setCandidate] = useState<FecCandidateDetail | null>(null)
  const [committee, setCommittee] = useState<FecCommitteeDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        if (target.kind === 'candidate') {
          const d = await fetchFecCandidate(target.id)
          if (!cancelled) setCandidate(d)
        } else {
          const d = await fetchFecCommittee(target.id)
          if (!cancelled) setCommittee(d)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [target.kind, target.id])

  return target.kind === 'candidate' ? (
    <FecCandidateView id={target.id} detail={candidate} loading={loading} error={error} onOpen={onOpen} />
  ) : (
    <FecCommitteeView id={target.id} detail={committee} loading={loading} error={error} onOpen={onOpen} />
  )
}

/* ── candidate ───────────────────────────────────────────────────────────── */

/** The candidate sheet as a pure function of the reply (tested by rendering it). */
export function FecCandidateView({
  id,
  detail,
  loading,
  error,
  onOpen,
}: {
  id: string
  detail: FecCandidateDetail | null
  loading: boolean
  error: string | null
  onOpen?: (target: FecOpenTarget) => void
}) {
  const latest = detail?.cycles[0]
  const name =
    latest?.name ?? summaryName(detail ? [...detail.totals, ...detail.summary] : [], 'cand_name') ?? id
  return (
    <>
      <SheetHeader className="space-y-1 border-b border-lawfare-line bg-card p-5 pr-12">
        <SheetTitle className="font-serif text-base font-semibold leading-snug">{name}</SheetTitle>
        <SheetDescription className="text-xs text-muted-foreground">
          {[
            `Candidate ID ${id}`,
            latest ? codeLabel(latest.office, OFFICE_LABELS) : null,
            latest?.state ?? null,
            latest ? codeLabel(latest.party, PARTY_LABELS) : null,
            latest ? `latest: ${cycleLabel(latest.cycle)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <p className="text-[11px] text-muted-foreground/80">
          {FEC_CYCLE_NOTE} One candidate ID is one record; a person who ran for different offices
          has several candidate IDs, and they are not merged here.
        </p>
        {error ? (
          <ErrorBand error={error} />
        ) : loading || !detail ? (
          <p className="text-sm text-muted-foreground">Loading candidate ID…</p>
        ) : (
          <>
            {detail.shared_principal_committee.length > 0 && (
              <section
                aria-label="Flag for review"
                className="space-y-2 border-l-2 border-amber-400 bg-amber-500/10 py-2 pl-3 pr-3 text-sm text-amber-950 dark:text-amber-100"
              >
                <p className="font-medium">Flag for review: shared principal committee</p>
                <p className="text-xs">
                  In these cycles the FEC candidate master lists more than one candidate ID with the
                  same principal campaign committee (CAND_PCC). This is a flag for a person to
                  review, not a finding that the IDs are the same candidate. Every record is kept.
                </p>
                <ul className="space-y-1 text-xs">
                  {detail.shared_principal_committee.map((s) => (
                    <li key={`${s.cycle}-${s.cand_pcc}`}>
                      {cycleLabel(s.cycle)}: committee{' '}
                      <FecIdLink kind="committee" id={s.cand_pcc} onOpen={onOpen} /> is the
                      principal committee of {s.n.toLocaleString('en-US')} candidate IDs:{' '}
                      {s.cand_ids.map((cid, i) => (
                        <span key={cid}>
                          {i > 0 && ', '}
                          {cid === id ? (
                            <span className="font-mono">{cid} (this one)</span>
                          ) : (
                            <FecIdLink kind="candidate" id={cid} onOpen={onOpen} />
                          )}
                          {s.cand_names[i] ? ` ${s.cand_names[i]}` : ''}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detail.cycles.length === 0 && <NotInMasterNote kind="candidate" />}
            <Section title="Cycle by cycle (candidate master, cn)">
              <CandidateCyclesTable rows={detail.cycles} onOpen={onOpen} />
            </Section>

            {CANDIDATE_TOTALS_FILES.map((file) => (
              <Section key={file.kind} title={`Totals: ${file.title}`} note={file.note}>
                <FecFiguresTable
                  caption={file.title}
                  fields={CANDIDATE_TOTALS_FIELDS}
                  rows={detail.totals.filter((r) => r.source_kind === file.kind)}
                  empty={`No ${file.kind} rows for this candidate ID.`}
                />
              </Section>
            ))}

            <Section
              title="Candidate summary (candidate_summary)"
              note="The FEC’s own 50-field candidate summary, published from the 2008 cycle. Net figures are the FEC’s, not computed here."
            >
              <FecFiguresTable
                caption="Candidate summary"
                fields={CANDIDATE_SUMMARY_FIELDS}
                rows={detail.summary}
                empty="No candidate summary rows for this candidate ID."
              />
            </Section>

            <Section
              title="Linked committees (candidate-committee linkage, ccl)"
              note="The linkage file is published from the 2000 cycle."
            >
              {detail.committees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No linked committees.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <FecTh label="Cycle" fec="FEC_ELECTION_YR" />
                        <FecTh label="Committee ID" fec="CMTE_ID" />
                        <FecTh label="Name" fec="CMTE_NM" />
                        <FecTh label="Type" fec="CMTE_TP" />
                        <FecTh label="Designation" fec="CMTE_DSGN" />
                        <FecTh label="Linkage ID" fec="LINKAGE_ID" />
                        <FecTh label="Source" fec="ccl" />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.committees.map((c) => (
                        <tr key={`${c.cycle}-${c.linkage_id}`} className="border-t border-lawfare-line">
                          <Td className="whitespace-nowrap">{cycleLabel(c.cycle)}</Td>
                          <Td>
                            <FecIdLink kind="committee" id={c.cmte_id} onOpen={onOpen} />
                          </Td>
                          <Td>{c.cmte_name ?? EM_DASH}</Td>
                          <Td>{codeLabel(c.cmte_tp, COMMITTEE_TYPE_LABELS)}</Td>
                          <Td>{codeLabel(c.cmte_dsgn, DESIGNATION_LABELS)}</Td>
                          <Td className="font-mono">{formatFecExact(c.linkage_id)}</Td>
                          <Td>
                            <FecSourceLink source={c.source} short />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </>
  )
}

function CandidateCyclesTable({
  rows,
  onOpen,
}: {
  rows: readonly FecCandidateCycle[]
  onOpen?: (target: FecOpenTarget) => void
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No cycle rows.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <FecTh label="Cycle" fec="cycle" />
            <FecTh label="Name" fec="CAND_NAME" />
            <FecTh label="Party" fec="CAND_PTY_AFFILIATION" />
            <FecTh label="Office" fec="CAND_OFFICE" />
            <FecTh label="State" fec="CAND_OFFICE_ST" />
            <FecTh label="District" fec="CAND_OFFICE_DISTRICT" />
            <FecTh label="Election year" fec="CAND_ELECTION_YR" />
            <FecTh label="Incumbent/challenger" fec="CAND_ICI" />
            <FecTh label="Status" fec="CAND_STATUS" />
            <FecTh label="Principal committee" fec="CAND_PCC" />
            <FecTh label="Address" fec="CAND_ST1…CAND_ZIP" />
            <FecTh label="Source" fec="cn" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cycle} className="border-t border-lawfare-line">
              <Td className="whitespace-nowrap">{cycleLabel(r.cycle)}</Td>
              <Td>{r.name ?? EM_DASH}</Td>
              <Td>{codeLabel(r.party, PARTY_LABELS)}</Td>
              <Td>{codeLabel(r.office, OFFICE_LABELS)}</Td>
              <Td>{r.state ?? EM_DASH}</Td>
              <Td>{r.district ?? EM_DASH}</Td>
              <Td>{formatFecExact(r.election_year)}</Td>
              <Td>{codeLabel(r.ici, ICI_LABELS)}</Td>
              <Td>{codeLabel(r.status, CANDIDATE_STATUS_LABELS)}</Td>
              <Td>
                <FecIdLink kind="committee" id={r.pcc} onOpen={onOpen} />
              </Td>
              <Td>{formatAddress(r.address)}</Td>
              <Td>
                <FecSourceLink source={r.source} short />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── committee ───────────────────────────────────────────────────────────── */

/** The committee sheet as a pure function of the reply (tested by rendering it). */
export function FecCommitteeView({
  id,
  detail,
  loading,
  error,
  onOpen,
}: {
  id: string
  detail: FecCommitteeDetail | null
  loading: boolean
  error: string | null
  onOpen?: (target: FecOpenTarget) => void
}) {
  const latest = detail?.cycles[0]
  const name = latest?.name ?? summaryName(detail?.totals ?? [], 'cmte_nm') ?? id
  return (
    <>
      <SheetHeader className="space-y-1 border-b border-lawfare-line bg-card p-5 pr-12">
        <SheetTitle className="font-serif text-base font-semibold leading-snug">{name}</SheetTitle>
        <SheetDescription className="text-xs text-muted-foreground">
          {[
            `Committee ID ${id}`,
            latest ? codeLabel(latest.type, COMMITTEE_TYPE_LABELS) : null,
            latest ? codeLabel(latest.designation, DESIGNATION_LABELS) : null,
            latest ? `latest: ${cycleLabel(latest.cycle)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <p className="text-[11px] text-muted-foreground/80">{FEC_CYCLE_NOTE}</p>
        {error ? (
          <ErrorBand error={error} />
        ) : loading || !detail ? (
          <p className="text-sm text-muted-foreground">Loading committee ID…</p>
        ) : (
          <>
            {detail.joint_fundraiser && (
              <section
                aria-label="Joint fundraiser"
                className="border-l-2 border-sky-400 bg-sky-500/10 py-2 pl-3 pr-3 text-xs text-foreground"
              >
                <p className="font-medium">Joint fundraiser (CMTE_DSGN J)</p>
                <p className="mt-1">
                  The committee master designates this committee a joint fundraiser in at least one
                  cycle. A joint fundraising committee raises money for several participating
                  committees and passes it on to them, so the same money can appear again in a
                  participant’s figures. It may have no candidate ID, and it may not appear in the
                  linkage file.
                </p>
              </section>
            )}

            {detail.cycles.length === 0 && <NotInMasterNote kind="committee" />}
            <Section title="Cycle by cycle (committee master, cm)">
              <CommitteeCyclesTable rows={detail.cycles} onOpen={onOpen} />
            </Section>

            <Section
              title="PAC and party totals (webk)"
              note="The FEC’s PAC and party summary file. Candidate committees’ totals are in their candidates’ webl and weball rows."
            >
              <FecFiguresTable
                caption="PAC and party totals"
                fields={PAC_PARTY_TOTALS_FIELDS}
                rows={detail.totals}
                empty="No webk rows for this committee ID."
              />
            </Section>

            <Section
              title="Linked candidates (candidate-committee linkage, ccl)"
              note="The linkage file is published from the 2000 cycle."
            >
              {detail.candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No linked candidate IDs.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <FecTh label="Cycle" fec="FEC_ELECTION_YR" />
                        <FecTh label="Candidate ID" fec="CAND_ID" />
                        <FecTh label="Name" fec="CAND_NAME" />
                        <FecTh label="Office" fec="CAND_OFFICE" />
                        <FecTh label="State" fec="CAND_OFFICE_ST" />
                        <FecTh label="Linkage ID" fec="LINKAGE_ID" />
                        <FecTh label="Source" fec="ccl" />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.candidates.map((c) => (
                        <tr key={`${c.cycle}-${c.linkage_id}`} className="border-t border-lawfare-line">
                          <Td className="whitespace-nowrap">{cycleLabel(c.cycle)}</Td>
                          <Td>
                            <FecIdLink kind="candidate" id={c.cand_id} onOpen={onOpen} />
                          </Td>
                          <Td>{c.cand_name ?? EM_DASH}</Td>
                          <Td>{codeLabel(c.office, OFFICE_LABELS)}</Td>
                          <Td>{c.state ?? EM_DASH}</Td>
                          <Td className="font-mono">{formatFecExact(c.linkage_id)}</Td>
                          <Td>
                            <FecSourceLink source={c.source} short />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </>
  )
}

function CommitteeCyclesTable({
  rows,
  onOpen,
}: {
  rows: readonly FecCommitteeCycle[]
  onOpen?: (target: FecOpenTarget) => void
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No cycle rows.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <FecTh label="Cycle" fec="cycle" />
            <FecTh label="Name" fec="CMTE_NM" />
            <FecTh label="Treasurer" fec="TRES_NM" />
            <FecTh label="Type" fec="CMTE_TP" />
            <FecTh label="Designation" fec="CMTE_DSGN" />
            <FecTh label="Party" fec="CMTE_PTY_AFFILIATION" />
            <FecTh label="Filing frequency" fec="CMTE_FILING_FREQ" />
            <FecTh label="Organization type" fec="ORG_TP" />
            <FecTh label="Connected organization" fec="CONNECTED_ORG_NM" />
            <FecTh label="Candidate ID" fec="CAND_ID" />
            <FecTh label="Address" fec="CMTE_ST1…CMTE_ZIP" />
            <FecTh label="Source" fec="cm" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cycle} className="border-t border-lawfare-line">
              <Td className="whitespace-nowrap">{cycleLabel(r.cycle)}</Td>
              <Td>{r.name ?? EM_DASH}</Td>
              <Td>{r.treasurer ?? EM_DASH}</Td>
              <Td>{codeLabel(r.type, COMMITTEE_TYPE_LABELS)}</Td>
              <Td>{codeLabel(r.designation, DESIGNATION_LABELS)}</Td>
              <Td>{codeLabel(r.party, PARTY_LABELS)}</Td>
              <Td>{codeLabel(r.filing_freq, FILING_FREQ_LABELS)}</Td>
              <Td>{codeLabel(r.org_type, ORG_TYPE_LABELS)}</Td>
              <Td>{r.connected_org ?? EM_DASH}</Td>
              <Td>
                <FecIdLink kind="candidate" id={r.cand_id} onOpen={onOpen} />
              </Td>
              <Td>{formatAddress(r.address)}</Td>
              <Td>
                <FecSourceLink source={r.source} short />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The name for an ID the master file does not list: the first non-empty name
 * the summary rows carry (newest first, as sent), or null.
 */
function summaryName(rows: readonly FecSummaryRow[], key: string): string | null {
  for (const r of rows) {
    const v = r[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** Some IDs appear only in the summary files, not the master file. */
function NotInMasterNote({ kind }: { kind: 'candidate' | 'committee' }) {
  const file = kind === 'candidate' ? 'candidate master (cn)' : 'committee master (cm)'
  return (
    <p className="border-l-2 border-lawfare-line bg-muted/30 py-2 pl-3 pr-3 text-xs text-foreground">
      This {kind} ID is not in the FEC {file} file for any cycle; it appears only in the FEC’s
      summary files, shown below as the FEC publishes them.
    </p>
  )
}

/* ── shared ──────────────────────────────────────────────────────────────── */

function formatAddress(a: Record<string, string | null> | string | null | undefined): string {
  if (!a) return EM_DASH
  if (typeof a === 'string') return a.trim() || EM_DASH
  const line = [a.st1, a.st2, a.city, [a.st, a.zip].filter(Boolean).join(' ')]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ')
  return line || EM_DASH
}

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {note && <p className="text-[11px] text-muted-foreground/80">{note}</p>}
      {children}
    </section>
  )
}

function ErrorBand({ error }: { error: string }) {
  return (
    <p className="border-l-2 border-destructive bg-destructive/10 py-2 pl-3 pr-3 text-sm text-destructive">
      Could not load this record: {error}
    </p>
  )
}
