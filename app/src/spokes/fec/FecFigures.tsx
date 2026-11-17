import type { FecSource, FecSummaryRow } from '@lawfare/ragtime-client'
import {
  type FecField,
  cycleLabel,
  fieldLabel,
  formatFecField,
  sourceLabel,
  sourceShortLabel,
} from './fec-format'

/**
 * Shared pieces of the FEC sheets: the source link every row carries, the
 * figures table (one column per cycle row, one line per FEC field), and the
 * ID link that opens the other sheet.
 */

/** "webl file · line 812 ↗" to the FEC file the row came from. */
export function FecSourceLink({
  source,
  short = false,
}: {
  source: FecSource | null | undefined
  short?: boolean
}) {
  const text = short ? sourceShortLabel(source) : sourceLabel(source)
  if (!source?.url) {
    return <span className="text-[11px] text-muted-foreground">{text}</span>
  }
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open the FEC file: ${sourceLabel(source)}`}
      className="whitespace-nowrap text-[11px] text-primary hover:underline"
    >
      {text} ↗
    </a>
  )
}

/**
 * One table of FEC summary figures: a column per row the Worker sent (each a
 * cycle, newest first, as sent), a line per field, labelled with its FEC
 * variable name. Every value links to its own row's source file and says the
 * line. Values are shown exactly as formatted from the strings sent; nothing
 * is added up or compared.
 */
export function FecFiguresTable({
  fields,
  rows,
  caption,
  empty,
}: {
  fields: readonly FecField[]
  rows: readonly FecSummaryRow[]
  caption: string
  empty: string
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="align-bottom">
            <th scope="col" className="px-2 py-1.5 text-left font-medium text-muted-foreground">
              Figure (FEC variable)
            </th>
            {rows.map((r, i) => (
              <th
                key={`${r.cycle}-${r.source_kind ?? ''}-${i}`}
                scope="col"
                className="px-2 py-1.5 text-right font-medium text-foreground"
              >
                <span className="block whitespace-nowrap">{cycleLabel(r.cycle)}</span>
                <FecSourceLink source={r.source} short />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.key} className="border-t border-lawfare-line">
              <th scope="row" className="px-2 py-1 text-left font-normal text-foreground">
                {f.label}{' '}
                <span className="font-mono text-[10px] text-muted-foreground">({f.fec})</span>
              </th>
              {rows.map((r, i) => (
                <td
                  key={`${f.key}-${i}`}
                  className={
                    'px-2 py-1 align-top ' +
                    (f.type === 'amount' ? 'text-right font-mono tabular-nums' : 'text-right')
                  }
                >
                  <FecValue field={f} value={r[f.key]} source={r.source} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One figure, linked to its source file (the line number in the title). */
export function FecValue({
  field,
  value,
  source,
}: {
  field: FecField
  value: unknown
  source: FecSource | null | undefined
}) {
  const text = formatFecField(field, value)
  if (!source?.url) return <span>{text}</span>
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${fieldLabel(field)} — ${sourceLabel(source)}`}
      className="text-foreground hover:text-primary hover:underline"
    >
      {text}
    </a>
  )
}

export type FecOpenTarget = { kind: 'candidate' | 'committee'; id: string }

/** A candidate or committee ID that opens its own sheet. */
export function FecIdLink({
  kind,
  id,
  onOpen,
}: {
  kind: 'candidate' | 'committee'
  id: string | null | undefined
  onOpen?: (target: FecOpenTarget) => void
}) {
  if (!id) return <span className="text-muted-foreground">—</span>
  if (!onOpen) return <span className="font-mono">{id}</span>
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen({ kind, id })
      }}
      title={`Open ${kind} ID ${id}`}
      className="font-mono text-primary hover:underline"
    >
      {id}
    </button>
  )
}

/** Small table helpers, matching the EAC lists. */
export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={'px-2 py-1.5 text-left font-medium ' + (className ?? '')}>
      {children}
    </th>
  )
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={'px-2 py-1.5 align-top ' + (className ?? '')}>{children}</td>
}

/** A column header naming the FEC variable under the plain label. */
export function FecTh({ label, fec }: { label: string; fec: string }) {
  return (
    <Th>
      {label} <span className="font-mono text-[9px] normal-case text-muted-foreground/80">({fec})</span>
    </Th>
  )
}
