import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The speech sheet is a chunk of its own, fetched with the speech code. Markup the page
 * renders before that code arrives, or without ever fetching it, has to be styled by a
 * sheet the page carries. These hold the rules in the right place: they read the source,
 * because a stylesheet that moves back is invisible to every other test.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = (path: string) => readFileSync(resolve(here, path), 'utf8')

/** The stylesheets a source file imports, resolved from its own directory. */
function importedSheets(file: string): string[] {
  return [...read(file).matchAll(/^import\s+'(\.[^']+\.css)'/gm)].map((m) => resolve(here, dirname(file), m[1]!))
}

describe('what the placement renders before the speech code arrives', () => {
  it('has the conversation owl’s rules in a sheet ChatOwl imports', () => {
    const sheets = importedSheets('ChatOwl.tsx').map((p) => readFileSync(p, 'utf8'))
    const css = sheets.join('\n')
    for (const selector of ['.owl-chat-fig {', '.owl-chat-fig .owl {', '.owl-chat-end {']) expect(css).toContain(selector)
  })

  it('has the positioned box in the owl’s own sheet, which index.css imports', () => {
    expect(read('../../index.css')).toContain('./owl/owl.css')
    expect(read('../owl.css')).toContain('.owl-spot {')
  })

  it('keeps all of them out of the speech sheet', () => {
    const speech = read('voice.css')
    expect(speech).not.toContain('.owl-chat-')
    expect(speech).not.toMatch(/^\.owl-spot\b/m)
  })

  it('imports the speech sheet only from the speech code', () => {
    expect(read('../speech.tsx')).toContain("import './voice/voice.css'")
    for (const file of ['ChatOwl.tsx', 'choice.ts', 'slot.tsx', 'layer.ts', '../OwlSpot.tsx', '../useOwlFigure.tsx', '../site.tsx']) {
      expect(importedSheets(file).some((p) => p.endsWith('voice.css')), file).toBe(false)
    }
  })
})
