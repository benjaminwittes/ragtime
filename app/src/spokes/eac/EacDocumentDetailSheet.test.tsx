/**
 * The EAC display-tier rule in the document sheet: text renders ONLY for a
 * full reply about a full document. Every other case is the link-only view.
 *
 * The sheet's Radix parts need a Dialog around them, so the view is rendered
 * inside a mocked sheet module (plain elements) with renderToStaticMarkup.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type {
  EacDocumentDetail,
  EacDocumentDisplayRow,
  EacDocumentResponse,
} from '@lawfare/ragtime-client'

vi.mock('@/components/ui/sheet', () => ({
  SheetHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const { EacDocumentView } = await import('./EacDocumentDetailSheet')

const SECRET = 'TEST-LAB-SECRET-TEXT-should-never-render'
const LINK = 'https://www.eac.gov/sites/default/files/2026-09/Attachment_D.pdf'

const linkOnlyRow: EacDocumentDisplayRow = {
  id: 2184,
  title: 'Attachment_D_VotingWorks_VxSuite_4.0_Test_Plan_As_Run',
  author_group: 'Voting system test lab',
  display: 'link_only',
  source_url: LINK,
}

const fullRow: EacDocumentDisplayRow = {
  id: 2690,
  title: '2008 Election Administration and Voting Survey EAVS Report.pdf',
  author_group: 'U.S. Election Assistance Commission',
  display: 'full',
  source_url: 'https://www.eac.gov/sites/default/files/document_library/files/2008.pdf',
  posted_date: '2023-04-27',
  file_type: 'pdf',
  folder: 'document_library',
}

const fullDetail = (over: Partial<EacDocumentDetail> = {}): EacDocumentDetail => ({
  ...fullRow,
  display: 'full',
  text_length: 20,
  text_source: 'pdf',
  page_count: 3,
  text_content: 'EAVS report body text',
  text_truncated: false,
  ...over,
})

const render = (
  row: EacDocumentDisplayRow,
  reply: EacDocumentResponse | null,
  opts: { loading?: boolean; error?: string | null } = {},
) =>
  renderToStaticMarkup(
    <EacDocumentView
      row={row}
      reply={reply}
      loading={opts.loading ?? false}
      error={opts.error ?? null}
    />,
  )

describe('EacDocumentView — full documents', () => {
  it('shows the text of a full reply about a full document', () => {
    const html = render(fullRow, { kind: 'full', document: fullDetail() })
    expect(html).toContain('EAVS report body text')
    expect(html).not.toContain('link only')
    expect(html).toContain('Posted on eac.gov 2023-04-27')
  })

  it('says when a long text was cut', () => {
    const html = render(fullRow, {
      kind: 'full',
      document: fullDetail({ text_truncated: true, text_length: 600000 }),
    })
    expect(html).toContain('only the first 500,000 characters')
  })
})

describe('EacDocumentView — link-only documents never show text', () => {
  it('shows title, author group and link for the Worker’s link-only reply', () => {
    const html = render(linkOnlyRow, {
      kind: 'link_only',
      document: {
        id: '2184',
        corpus: 'eac',
        display: 'link_only',
        author_group: 'Voting system test lab',
        url: LINK,
        title: linkOnlyRow.title,
        date: '2026-09-03',
        text_withheld: true,
        summary: null,
        message: 'This document is shown as a link only. RAGtime does not return or summarize its text.',
      },
    })
    expect(html).toContain('Attachment D VotingWorks VxSuite 4.0 Test Plan As Run')
    expect(html).toContain('Voting system test lab')
    expect(html).toContain('Posted on eac.gov 2026-09-03')
    expect(html).toContain(LINK)
    expect(html).toContain('shown as a link only')
    expect(html).not.toContain('Document text')
  })

  it('does not show text even if a "full" reply arrives for a document not marked full', () => {
    const html = render(linkOnlyRow, {
      kind: 'full',
      document: fullDetail({ display: 'link_only' as 'full', text_content: SECRET }),
    })
    expect(html).not.toContain(SECRET)
    expect(html).toContain('shown as a link only')
  })

  it('shows the link-only view while a link-only row loads', () => {
    const html = render(linkOnlyRow, null, { loading: true })
    expect(html).toContain('shown as a link only')
    expect(html).not.toContain('Loading document')
  })

  it('treats a row with no display value as link-only', () => {
    const html = render({ ...linkOnlyRow, display: undefined as unknown as string }, null, {
      loading: true,
    })
    expect(html).toContain('shown as a link only')
  })

  it('shows the error, not text or an outside-author claim, when a full row fails to load', () => {
    const html = render(fullRow, null, { error: 'network down' })
    expect(html).toContain('could not be loaded: network down')
    expect(html).not.toContain('Document text')
    expect(html).not.toContain('outside author')
  })

  it('keeps the link-only view when a link-only row fails to load', () => {
    const html = render(linkOnlyRow, null, { error: 'network down' })
    expect(html).toContain('shown as a link only')
    expect(html).toContain('network down')
  })
})
