// The State Codes page's reader notice (ragtime-worker#110): the catalogue's
// coverage.notice, generated into the client by `npm run registry:sync`.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { READER_NOTICES, corpusReaderNotice } from '@lawfare/ragtime-client'
import { ReaderNotice } from './StateCodesSpokeShell'

describe('the State Codes reader notice', () => {
  it('comes from the generated registry and names the DCMR and the federal law to check', () => {
    const notice = corpusReaderNotice('state_codes')
    expect(notice).toBe(READER_NOTICES.state_codes)
    expect(notice).toMatch(/^This covers the DC Code only\./)
    expect(notice).toContain('DC Municipal Regulations (DCMR), which RAGtime does not carry')
    expect(notice).toContain('dcregs.dc.gov')
    expect(notice).toContain("Search RAGtime's Code of Federal Regulations and U.S. Code too.")
  })

  it('is shown on the page as a note', () => {
    const html = renderToStaticMarkup(<ReaderNotice />)
    expect(html).toContain('role="note"')
    expect(html).toContain('This covers the DC Code only.')
  })

  it('no other corpus has one', () => {
    expect(Object.keys(READER_NOTICES)).toEqual(['state_codes'])
    expect(corpusReaderNotice('usc')).toBeNull()
  })
})
