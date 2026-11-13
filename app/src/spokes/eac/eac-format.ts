/**
 * Non-component helpers shared across the EAC spoke's components (kept out of
 * the .tsx files so react-refresh sees component-only modules — the
 * congress-format.ts precedent).
 */

/**
 * The one rule every EAC surface follows: a document is shown in full ONLY
 * when its row says exactly `display: 'full'`. A missing, null or unknown
 * value is link-only — the Worker's own rule (worker/display.js), repeated
 * here so a bug can only ever hide text, never show it.
 */
export function isFullDisplay(row: { display?: string | null } | null | undefined): boolean {
  return row?.display === 'full'
}

/**
 * A row's date as YYYY-MM-DD. /filter and /items-by-ids name it `posted_date`;
 * semantic search, more-like-this and the link-only document reply name it
 * `date`. Link-only rows from /filter currently arrive with neither (the
 * Worker's link-only allowlist keeps `date`, not `posted_date`), so null is a
 * normal answer, shown as no date.
 */
export function eacDate(row: { posted_date?: string | null; date?: string | null }): string | null {
  const raw = row.posted_date ?? row.date ?? null
  if (!raw) return null
  const m = String(raw).match(/^\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : String(raw)
}

/**
 * The date every EAC row carries is when eac.gov POSTED the file, not when the
 * document was written. About 7,100 of the 9,200 documents share the posted
 * date 2023-04-27, when eac.gov re-uploaded its older library, so for older
 * material the date says nothing about the document itself. Every surface that
 * shows or filters by date says so. (A real document-date column would be
 * pipeline work: the dates are in the text, eac.gov's listing titles and
 * some URLs.)
 */
export const EAC_LIBRARY_REUPLOAD_DATE = '2023-04-27'

export const EAC_DATE_NOTE =
  'Dates are when eac.gov posted the file, not when it was written. Most older documents show 2023-04-27, the day eac.gov re-uploaded its library.'

/** True when a row's date is the library re-upload date, not a real posting. */
export function isLibraryReuploadDate(date: string | null | undefined): boolean {
  return date === EAC_LIBRARY_REUPLOAD_DATE
}

/**
 * Titles on eac.gov are often the uploaded file name
 * ('Attachment_D_VotingWorks_VxSuite_4.0_Test_Plan_As_Run', '… EAVS Report.pdf').
 * A trailing file extension is dropped, underscores become spaces and runs of
 * spaces collapse; nothing else is changed, so the title still matches what
 * eac.gov shows.
 */
const TITLE_EXTENSION = /\.(pdf|docx?|xlsx?|pptx?|csv|zip|txt)$/i

export function eacTitle(title: string | null | undefined): string {
  const t = (title ?? '')
    .trim()
    .replace(TITLE_EXTENSION, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t || 'Untitled document'
}

/** The link to the document on eac.gov: `source_url` on list rows, `url` on
 *  semantic results and the link-only document reply. */
export function eacLink(row: { source_url?: string | null; url?: string | null }): string | null {
  return row.source_url || row.url || null
}

const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  csv: 'CSV',
  zip: 'ZIP archive',
  plain: 'Text',
  html: 'Web page',
  msword: 'Word',
  'vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'vnd.ms-excel': 'Excel',
  'vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'vnd.ms-powerpoint': 'PowerPoint',
  'vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'octet-stream': 'File',
}

/** 'vnd.ms-excel' → 'Excel'. Unknown types are shown as stored. Display only:
 *  filters round-trip the RAW value. */
export function fileTypeLabel(fileType: string | null | undefined): string | null {
  if (!fileType) return null
  return FILE_TYPE_LABELS[fileType] ?? fileType
}

/**
 * Folder values are the pipeline's grouping of eac.gov's media index:
 * 'dated:2025' (a dated upload folder) or a snake_case section name
 * ('voting_system', 'document_library'). Display only: filters round-trip
 * the RAW value.
 */
export function folderLabel(folder: string | null | undefined): string | null {
  if (!folder) return null
  const dated = folder.match(/^dated:(\d{4})$/)
  if (dated) return `Uploaded in ${dated[1]}`
  const words = folder.replace(/_+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : null
}

/** File size for the results list: 161434 → '158 KB'. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}
