import fs from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'

/**
 * Write-to-source: the dev-server half of the tuning tool.
 *
 * Two endpoints, both `apply: 'serve'`, so none of this exists in a build:
 *
 *   POST /__tune/write   — patch tuned values into the files they came from
 *   POST /__tune/preset  — rewrite `src/tune/presets.ts` with a named tuning
 *
 * The browser decides *what* to write (only it has the registry); this decides
 * *whether* it may. Every path is resolved and checked to be inside `app/src/`
 * before anything is opened, so a request cannot name `../../.ssh/config` and
 * be believed.
 *
 * Patching, not appending. A tuned value replaces the declaration it came from,
 * in place, and the *last* matching declaration in the block is the one taken —
 * because within one CSS block the last declaration is the one in force, and
 * `:root` in `index.css` really does declare `--primary` twice (shadcn's
 * neutral, then the Lawfare override below it). Patching the first would edit a
 * line that the cascade then overrides, and the page would not move.
 */

const APP_ROOT = import.meta.dirname
const SRC_ROOT = path.join(APP_ROOT, 'src')

type CssEdit = {
  kind: 'css'
  id: string
  file: string
  selector: string
  prop: string
  value: string
}
type ValueEdit = { kind: 'value'; id: string; file: string; value: string | number | boolean }
type Edit = CssEdit | ValueEdit
type Result = { id: string; ok: boolean; detail: string }

export function tunePlugin(): Plugin {
  return {
    name: 'rt-tune-write',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__tune/write', jsonHandler((body) => {
        const edits = (body as { edits?: Edit[] }).edits ?? []
        const results: Result[] = []
        // Group by file so a request touching one file reads and writes it once.
        const byFile = new Map<string, Edit[]>()
        for (const edit of edits) {
          byFile.set(edit.file, [...(byFile.get(edit.file) ?? []), edit])
        }
        for (const [file, fileEdits] of byFile) {
          const resolved = resolveInSrc(file)
          if (!resolved) {
            for (const edit of fileEdits) {
              results.push({ id: edit.id, ok: false, detail: `refused path: ${file}` })
            }
            continue
          }
          let text = fs.readFileSync(resolved, 'utf8')
          let dirty = false
          for (const edit of fileEdits) {
            const next =
              edit.kind === 'css'
                ? patchCss(text, edit)
                : patchDeclaredValue(text, edit)
            if (typeof next === 'string') {
              text = next
              dirty = true
              results.push({ id: edit.id, ok: true, detail: file })
            } else {
              results.push({ id: edit.id, ok: false, detail: next.error })
            }
          }
          if (dirty) fs.writeFileSync(resolved, text)
        }
        return { results }
      }))

      server.middlewares.use('/__tune/preset', jsonHandler((body) => {
        const { name, values } = body as {
          name?: string
          values?: Record<string, unknown>
        }
        if (!name || !values) throw new Error('name and values are required')
        const file = path.join(SRC_ROOT, 'tune', 'presets.ts')
        const existing = readPresets(file)
        existing[name] = values
        fs.writeFileSync(file, presetsFile(existing))
        return `committed “${name}” to src/tune/presets.ts`
      }))
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Patching                                                                    */
/* -------------------------------------------------------------------------- */

type Failure = { error: string }

/** Replace (or add) one custom property inside the first block with this selector. */
function patchCss(text: string, edit: CssEdit): string | Failure {
  const block = findBlock(text, edit.selector)
  if (!block) return { error: `no ${edit.selector} block in ${edit.file}` }

  const body = text.slice(block.start, block.end)
  const propRe = new RegExp(
    `(^|[;{\\s])(${escapeRe(edit.prop)})(\\s*:\\s*)([^;{}]*)(;?)`,
    'g',
  )
  let last: RegExpExecArray | null = null
  let match: RegExpExecArray | null
  while ((match = propRe.exec(body)) !== null) last = match

  if (last) {
    const valueStart = block.start + last.index + last[1].length + last[2].length + last[3].length
    const valueEnd = valueStart + last[4].length
    // Keep whatever trailed the old value on the line (a comment, usually).
    const trailing = last[4].match(/\s*\/\*.*$/)?.[0] ?? ''
    return text.slice(0, valueStart) + edit.value + trailing + text.slice(valueEnd)
  }

  // Not declared yet — add it at the end of the block, indented like its neighbours.
  const indent = /\n([ \t]+)\S/.exec(body)?.[1] ?? '  '
  const insertion = `${indent}${edit.prop}: ${edit.value};\n`
  const beforeClose = text.slice(0, block.end).replace(/[ \t]*$/, '')
  return beforeClose + '\n' + insertion + text.slice(block.end)
}

/**
 * Replace the `value:` of the tunable declared with this id.
 *
 * Deliberately narrow: it finds `id: '<the id>'` and takes the next `value:`
 * before the next `id:`. A declaration written some other way is not patched —
 * it is reported, and the panel keeps the override so nothing is lost.
 */
function patchDeclaredValue(text: string, edit: ValueEdit): string | Failure {
  const idRe = new RegExp(`id:\\s*['"\`]${escapeRe(edit.id)}['"\`]`)
  const found = idRe.exec(text)
  if (!found) return { error: `no declaration with id ${edit.id} in ${edit.file}` }

  const from = found.index + found[0].length
  const nextId = text.slice(from).search(/\bid:\s*['"`]/)
  const limit = nextId === -1 ? text.length : from + nextId
  const region = text.slice(from, limit)
  const valueRe = /(\n\s*value:\s*)([^,\n]+)/
  const hit = valueRe.exec(region)
  if (!hit) return { error: `no value: field for ${edit.id}` }

  const start = from + hit.index + hit[1].length
  const end = start + hit[2].length
  return text.slice(0, start) + literal(edit.value) + text.slice(end)
}

/**
 * The first block whose selector is exactly this one: the selector at the start
 * of a line, then a brace. Quote style is ignored, so a knob may declare
 * `[data-tune="hub"]` for a stylesheet that writes it with single quotes.
 */
function findBlock(text: string, selector: string): { start: number; end: number } | null {
  const pattern = escapeRe(selector).replace(/["']/g, `["']`)
  const re = new RegExp(`^[ \\t]*${pattern}[ \\t]*\\{`, 'm')
  const match = re.exec(text)
  if (!match) return null
  const open = text.indexOf('{', match.index)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return { start: open + 1, end: i }
    }
  }
  return null
}

function literal(value: string | number | boolean): string {
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  return String(value)
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* -------------------------------------------------------------------------- */
/* Presets file                                                                */
/* -------------------------------------------------------------------------- */

function readPresets(file: string): Record<string, unknown> {
  try {
    const text = fs.readFileSync(file, 'utf8')
    const json = /repoPresets:\s*TunePresets\s*=\s*([\s\S]*?)\n?$/.exec(text)?.[1]
    if (!json) return {}
    return JSON.parse(json.trim().replace(/;\s*$/, '')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function presetsFile(presets: Record<string, unknown>): string {
  return `/**
 * Committed tunings.
 *
 * A preset is a named set of knob values. Saving one in the panel keeps it in
 * this browser; committing one writes it here, where it is a normal file in the
 * repo — reviewable in a diff, openable by anyone on the branch, and nameable
 * in a URL (\`#tune=<name>\`) so the screenshot rig can shoot it.
 *
 * Rewritten wholesale by the dev middleware on "Commit preset"
 * (\`app/vite-plugin-tune.ts\`). Hand-editing is fine — it is just data — but
 * expect the panel to reformat it. Imported only by the panel, which is itself
 * loaded only when tuning is enabled, so this never reaches a production build.
 */

import type { TunePresets } from './store'

export const repoPresets: TunePresets = ${JSON.stringify(presets, null, 2)}
`
}

/* -------------------------------------------------------------------------- */
/* Plumbing                                                                    */
/* -------------------------------------------------------------------------- */

/** Resolve a repo-relative path, refusing anything that escapes `app/src/`. */
function resolveInSrc(file: string): string | null {
  const resolved = path.resolve(APP_ROOT, file)
  const inside = resolved === SRC_ROOT || resolved.startsWith(SRC_ROOT + path.sep)
  if (!inside || !fs.existsSync(resolved)) return null
  return resolved
}

function jsonHandler(
  handle: (body: unknown) => unknown,
): Connect.NextHandleFunction {
  return (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('POST only')
      return
    }
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const result = handle(body)
        res.setHeader('content-type', typeof result === 'string' ? 'text/plain' : 'application/json')
        res.end(typeof result === 'string' ? result : JSON.stringify(result))
      } catch (error) {
        res.statusCode = 400
        res.end(error instanceof Error ? error.message : 'bad request')
      }
    })
  }
}
