#!/usr/bin/env node
/*
 * suggestions-import.mjs — write a reviewed content/suggestions.csv back into
 * the source files.
 *
 *   node scripts/suggestions-import.mjs                  # write
 *   node scripts/suggestions-import.mjs --dry-run        # say what would change
 *   node scripts/suggestions-import.mjs --in /tmp/x.csv
 *
 * The rules this obeys, in the order they bite:
 *
 *   1. Rows are matched on `id`. An id the source does not have is an error;
 *      an id the source has and the CSV does not is an error. Both are
 *      reported together, and nothing is written.
 *   2. Only `text` may change. Every other column is re-derived from the
 *      source and compared: a reviewer who edited `constraints` or `corpus` is
 *      told that the edit was ignored, and it never reaches a file.
 *   3. All or nothing. Every file's new contents are computed in memory first;
 *      one failing row means no file is touched.
 *   4. Typography is normalised to the style of the literal being written —
 *      see `normalise` below, which is where a spreadsheet's straight
 *      apostrophes become the curly ones the TS string literals use.
 *   5. Docs prose is markdown inside a template literal. Only the paragraph or
 *      bullet this row owns is rewritten, re-wrapped to the column width
 *      measured from the file itself. A bullet nobody edited keeps its own
 *      line breaks.
 *   6. Comments are never read from and never written to: the scanner blanks
 *      every comment before it looks for anything.
 *   7. A summary of every change — per file, per id, old then new.
 *   8. Export then import with no edits leaves the tree byte-identical,
 *      because a row whose text still matches the source produces no write at
 *      all. That is the cheapest test that this pair is correct; run it.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { ROOT, COLUMNS, csvParse, buildRecords, read, renderBlock } from './suggestions-export.mjs'

/* ===========================================================================
 * Typography and encoding
 * ======================================================================== */

/**
 * House style, decided by the literal the text is going into rather than
 * applied flat — the app does not use one apostrophe everywhere, and pretending
 * it does would rewrite files nobody asked to change.
 *
 *   ts-single  the chips, the hub samples, the Explorer examples. These sit in
 *              single-quoted TS strings and use a curly `’`, which is exactly
 *              why they need no escaping. A spreadsheet returns a straight `'`;
 *              convert it back.
 *   ts-double  the litigation chips, which chose a double-quoted literal
 *              *because* their apostrophes are straight. Leave them straight.
 *   attr       a JSX `placeholder="…"`. Straight `'` is legal and is what the
 *              one placeholder with an apostrophe already uses.
 *   md         markdown in a template literal. Measured before deciding:
 *              app/src/docs/content carries 223 straight apostrophes against 2
 *              curly ones, so straight is the house style there.
 *
 * Smart double quotes become `&ldquo;`/`&rdquo;` only where the string being
 * replaced already speaks in entities; otherwise they are left plain.
 */
function normalise(text, ctx, originalRaw) {
  let out = text
  if (ctx === 'ts-single') out = out.replace(/'/g, '’')
  if (/&ldquo;|&rdquo;/.test(originalRaw || '')) {
    out = out.replace(/“/g, '&ldquo;').replace(/”/g, '&rdquo;')
  }
  return out
}

function encodeTs(text, quote) {
  const escaped = text.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), '\\' + quote)
  return quote + escaped + quote
}

/* ===========================================================================
 * Validation
 * ======================================================================== */

const DERIVED = COLUMNS.filter((c) => c !== 'text' && c !== 'id')

class Report {
  constructor() {
    this.errors = []
    this.warnings = []
    this.changes = []
  }
  error(msg) {
    this.errors.push(msg)
  }
  warn(msg) {
    this.warnings.push(msg)
  }
}

function tidy(text, report, id) {
  let out = text
  if (out !== out.trim()) {
    report.warn(id + ': leading or trailing whitespace trimmed (a spreadsheet adds it).')
    out = out.trim()
  }
  return out
}

/* ===========================================================================
 * main
 * ======================================================================== */

function run(argv) {
  const inPath = argv.includes('--in') ? argv[argv.indexOf('--in') + 1] : 'content/suggestions.csv'
  const dryRun = argv.includes('--dry-run')
  const report = new Report()

  const rows = csvParse(readFileSync(resolve(ROOT, inPath), 'utf8'))
  if (rows.length === 0) {
    process.stderr.write('ERROR: ' + inPath + ' is empty.\n')
    return 1
  }
  const header = rows[0]
  const body = rows.slice(1).filter((r) => r.some((c) => c !== ''))

  for (const c of COLUMNS) {
    if (!header.includes(c)) {
      process.stderr.write('ERROR: ' + inPath + ' has no `' + c + '` column. Re-export and start again.\n')
      return 1
    }
  }
  for (const c of header) {
    if (!COLUMNS.includes(c)) report.warn('unknown column `' + c + '` in the CSV — ignored.')
  }
  const col = (row, name) => row[header.indexOf(name)] ?? ''

  const { records, blocks } = buildRecords()
  const byId = new Map(records.map((r) => [r.id, r]))

  // --- 1. the id sets must be the same set -------------------------------
  const seen = new Set()
  for (const row of body) {
    const id = col(row, 'id')
    if (id === '') {
      report.error('a row has an empty `id`. Rows are matched on `id`; it may not be blank.')
      continue
    }
    if (seen.has(id)) report.error('duplicate id in the CSV: ' + id)
    seen.add(id)
    if (!byId.has(id)) {
      report.error(
        'unknown id: ' +
          id +
          ' — no such string in the source. Either the row was invented, or the source moved under the CSV (placeholder ids carry a line number). Re-export and re-apply the edit.',
      )
    }
  }
  for (const r of records) {
    if (!seen.has(r.id)) {
      report.error(
        'missing id: ' + r.id + ' — the source has this string and the CSV does not. Rows may not be deleted.',
      )
    }
  }

  // --- 2. only `text` may change ------------------------------------------
  const edits = [] // { record, text }
  for (const row of body) {
    const id = col(row, 'id')
    const rec = byId.get(id)
    if (!rec) continue
    for (const c of DERIVED) {
      const got = col(row, c)
      const want = String(rec[c] ?? '')
      if (got !== want) {
        report.warn(
          id + ': `' + c + '` was edited and is ignored — it is re-derived from the source on every run.',
        )
      }
    }
    let text = tidy(col(row, 'text'), report, id)
    if (text === '') {
      report.error(
        id + ': `text` is empty. A blank suggestion renders as a blank chip, placeholder or bullet; delete it in the source instead.',
      )
      continue
    }
    if (/[\r\n]/.test(text)) {
      report.error(id + ': `text` holds a line break. Suggestion copy is one line.')
      continue
    }
    if (text === rec.text) continue

    // --- 3. per-surface encoding checks, before anything is written -------
    if (rec.block) {
      const block = blocks.get(rec.block)
      const collapsed = text.replace(/\s+/g, ' ')
      if (collapsed !== text) {
        report.warn(id + ': runs of whitespace collapsed to single spaces (markdown re-wraps anyway).')
        text = collapsed
      }
      if (block.form === 'paragraph' && hasBareSemicolon(text)) {
        report.error(
          id +
            ': `text` holds a `;` outside quotation marks. The demo-queries paragraph separates its items with `; `, so that would silently split one item into two.',
        )
        continue
      }
      if (/[`\\]|\$\{/.test(text)) {
        report.error(
          id + ': `text` holds a backtick, a backslash or `${`, which cannot go into a template literal unescaped.',
        )
        continue
      }
    } else {
      for (const w of rec.writes) {
        if (w.encode === 'attr' && text.includes('"')) {
          report.error(
            id + ': `text` holds a double quote, and this is a JSX attribute written with double quotes. Use a curly quote, or edit the source by hand.',
          )
        }
      }
    }
    edits.push({ record: rec, text })
  }

  if (report.errors.length) return finish(report, [], dryRun, true)

  // --- 4. compute every file's new contents, in memory --------------------
  const perFile = new Map() // file -> [{ start, end, replacement, id, before, after }]
  const push = (file, edit) => {
    if (!perFile.has(file)) perFile.set(file, [])
    perFile.get(file).push(edit)
  }

  const touchedBlocks = new Map() // blockKey -> items[]
  for (const { record, text } of edits) {
    if (record.block) {
      const block = blocks.get(record.block)
      if (!touchedBlocks.has(record.block)) touchedBlocks.set(record.block, block.items.slice())
      const items = touchedBlocks.get(record.block)
      items[record.blockIndex] = normalise(text, 'md', block.original)
      continue
    }
    for (const w of record.writes) {
      const src = read(w.file)
      const originalRaw = src.slice(w.start, w.end)
      if (w.encode === 'attr') {
        const value = normalise(text, 'attr', originalRaw)
        push(w.file, {
          start: w.start,
          end: w.end,
          replacement: value,
          id: record.id,
          before: originalRaw,
          after: value,
        })
      } else {
        const ctx = w.quote === "'" ? 'ts-single' : 'ts-double'
        const value = normalise(text, ctx, originalRaw)
        const literal = encodeTs(value, w.quote)
        push(w.file, {
          start: w.start,
          end: w.end,
          replacement: literal,
          id: record.id,
          before: originalRaw,
          after: literal,
        })
      }
    }
  }

  for (const [key, items] of touchedBlocks) {
    const block = blocks.get(key)
    const rendered = renderBlock(block, items)
    push(block.file, {
      start: block.start,
      end: block.end,
      replacement: rendered,
      id: block.file + ' ' + block.marker,
      before: block.original,
      after: rendered,
    })
  }

  const newContents = new Map()
  for (const [file, list] of perFile) {
    list.sort((a, b) => a.start - b.start)
    for (let i = 1; i < list.length; i++) {
      if (list[i].start < list[i - 1].end) {
        report.error('overlapping writes in ' + file + ' (' + list[i - 1].id + ' and ' + list[i].id + ').')
      }
    }
    let src = read(file)
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]
      src = src.slice(0, e.start) + e.replacement + src.slice(e.end)
    }
    newContents.set(file, src)
  }

  if (report.errors.length) return finish(report, [], dryRun, true)

  for (const [file, list] of perFile) {
    for (const e of list) report.changes.push({ file, id: e.id, before: e.before, after: e.after })
  }

  // --- 5. write, or say that nothing needed writing -----------------------
  if (!dryRun) {
    for (const [file, contents] of newContents) writeFileSync(join(ROOT, file), contents, 'utf8')
  }

  return finish(report, [...newContents.keys()], dryRun, false)
}

/** A `;` outside a pair of double quotes — the demo paragraph's item separator. */
function hasBareSemicolon(text) {
  let inQuotes = false
  for (const c of text) {
    if (c === '"') inQuotes = !inQuotes
    else if (c === ';' && !inQuotes) return true
  }
  return false
}

function finish(report, files, dryRun, failed) {
  const out = process.stdout
  for (const w of report.warnings) out.write('warning: ' + w + '\n')
  if (failed) {
    for (const e of report.errors) process.stderr.write('ERROR: ' + e + '\n')
    process.stderr.write(
      '\n' + report.errors.length + ' error(s). Nothing was written — this importer is all or nothing.\n',
    )
    return 1
  }
  if (report.changes.length === 0) {
    out.write('no changes: every row already matches the source. Nothing written.\n')
    return 0
  }
  const byFile = new Map()
  for (const c of report.changes) {
    if (!byFile.has(c.file)) byFile.set(c.file, [])
    byFile.get(c.file).push(c)
  }
  for (const [file, list] of byFile) {
    out.write('\n' + file + '\n')
    for (const c of list) {
      out.write('  ' + c.id + '\n')
      out.write('    - ' + oneLine(c.before) + '\n')
      out.write('    + ' + oneLine(c.after) + '\n')
    }
  }
  out.write(
    '\n' +
      report.changes.length +
      ' change(s) across ' +
      byFile.size +
      ' file(s)' +
      (dryRun ? ' — DRY RUN, nothing written.' : ' — written.') +
      '\n',
  )
  return 0
}

function oneLine(s) {
  return s.replace(/\n/g, '\\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    process.exit(run(process.argv.slice(2)))
  } catch (e) {
    process.stderr.write(String(e && e.stack ? e.stack : e) + '\n')
    process.exit(1)
  }
}
