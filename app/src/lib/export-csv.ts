/**
 * Dataset CSV export — shared across all spokes.
 *
 * Ported from the legacy single-file app's `downloadCurrentPage()` (the
 * "Download CSV ↓" affordance that lived on every stack page). The React
 * rebuild dropped it; this restores it generically.
 *
 * Shape contract (unchanged from legacy so downstream tooling keeps working):
 *   - Operation metadata is embedded as `#`-prefixed comment lines at the top.
 *     Python's csv module / pandas (comment='#') ignore them; Excel/Sheets
 *     show a few deletable rows. Multi-line values (SQL, prompts) collapse to
 *     single spaces so each metadata key stays on one line.
 *   - For analysis/AMA exports the narrative markdown is embedded in the header
 *     as a `# --- narrative ---` block.
 *   - One file = one download = no Chrome multi-download throttle.
 */

/** One column in the CSV body. `value` extracts the cell from a row. */
export type CsvColumn<Row> = {
  header: string
  value: (row: Row) => string | number | boolean | null | undefined
}

export type CsvMetaLine = { key: string; value: unknown }

/** RFC-4180-ish quoting: quote cells containing comma, quote, CR or LF. */
export function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

/** Build a `# key: value` metadata line, or null if the value is empty. */
function metaLine(key: string, value: unknown): string | null {
  if (value == null) return null
  const s = String(value).replace(/\s+/g, ' ').trim()
  if (!s) return null
  return '# ' + key + ': ' + s
}

export function buildCsv<Row>(opts: {
  /** Title shown on the first comment line. */
  title?: string
  /** Metadata key/value pairs embedded as `#` comment lines. */
  meta?: CsvMetaLine[]
  /** Optional narrative markdown embedded in the header (analysis/AMA). */
  narrativeMarkdown?: string
  columns: CsvColumn<Row>[]
  rows: readonly Row[]
}): string {
  const headerLines: string[] = [
    `# ${opts.title ?? 'RAGtime — export'}`,
    `# generated: ${new Date().toISOString()}`,
  ]
  for (const m of opts.meta ?? []) {
    const line = metaLine(m.key, m.value)
    if (line) headerLines.push(line)
  }
  headerLines.push('#')

  if (opts.narrativeMarkdown && opts.narrativeMarkdown.trim()) {
    headerLines.push('# --- narrative ---')
    for (const ln of opts.narrativeMarkdown.split('\n')) {
      headerLines.push('# ' + ln)
    }
    headerLines.push('# --- end-narrative ---')
    headerLines.push('#')
  }

  const lines = headerLines.slice()
  lines.push(opts.columns.map((c) => csvCell(c.header)).join(','))
  for (const row of opts.rows) {
    lines.push(opts.columns.map((c) => csvCell(c.value(row))).join(','))
  }
  return lines.join('\n')
}

/** Trigger a client-side download of `content` as `filename`. */
export function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

/** Build + download a CSV in one call. */
export function downloadCsv<Row>(
  filename: string,
  opts: Parameters<typeof buildCsv<Row>>[0],
): void {
  downloadBlob(buildCsv(opts), filename, 'text/csv')
}

/** Filesystem-safe slug for a filename fragment. */
export function fileSlug(s: string, max = 48): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max) || 'export'
  )
}
