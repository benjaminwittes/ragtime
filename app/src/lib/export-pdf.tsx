/**
 * Narrative PDF export — shared across all spokes.
 *
 * Ported from the legacy single-file app's `downloadAnalysisPdf()`. Opens a
 * Lawfare-branded print window containing the analysis / AMA narrative and
 * triggers the browser print dialog (→ "Save as PDF"). Corpus-agnostic: the
 * only corpus-specific inputs are the subtitle and the metadata rows.
 *
 * The markdown is rendered to static HTML via react-markdown + remark-gfm so
 * the output matches what the in-app narrative shows. The print window styles
 * standard tags (`h1`, `p`, `ul`, …) via its own `<style>` block, so we render
 * WITHOUT the in-app Tailwind component overrides.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const PRINT_CSS = `
@import url("https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Lato:ital,wght@0,400;0,700&display=swap");
@page { margin: 0.75in; }
body { font-family: Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:#303030; line-height:1.55; font-size:11pt; margin:0; padding:0; }
.pdf-header { border-bottom: 2px solid #006A72; padding-bottom: 14pt; margin-bottom: 18pt; }
.pdf-title { font-family: "EB Garamond", Garamond, Georgia, serif; font-size: 28pt; color: #006A72; font-weight: 700; line-height: 1.1; margin-bottom: 4pt; }
.pdf-subtitle { font-family: "EB Garamond", Garamond, Georgia, serif; font-size: 13pt; font-style: italic; color: #555; margin-bottom: 12pt; }
.pdf-meta { font-family: Lato, sans-serif; font-size: 9.5pt; color: #555; }
.pdf-meta .meta-row { margin-bottom: 3pt; }
.pdf-meta .meta-key { font-weight: 700; color: #303030; }
.md-content h1 { font-family: "EB Garamond", serif; font-size: 18pt; color: #006A72; margin: 18pt 0 8pt; font-weight: 700; }
.md-content h2 { font-family: "EB Garamond", serif; font-size: 15pt; color: #006A72; margin: 14pt 0 6pt; font-weight: 700; }
.md-content h3 { font-family: "EB Garamond", serif; font-size: 12.5pt; color: #303030; margin: 12pt 0 4pt; font-weight: 700; }
.md-content h4 { font-family: Lato, sans-serif; font-size: 11pt; color: #303030; margin: 10pt 0 3pt; font-weight: 700; }
.md-content p { margin: 0 0 8pt; }
.md-content ul, .md-content ol { margin: 0 0 8pt 24pt; padding: 0; }
.md-content li { margin-bottom: 3pt; }
.md-content blockquote { border-left: 3px solid #006A72; padding: 2pt 12pt; margin: 8pt 0; color: #555; font-style: italic; }
.md-content code { font-family: ui-monospace, "SF Mono", Monaco, Menlo, monospace; font-size: 9.5pt; background: #f3f3f3; padding: 1pt 4pt; border-radius: 2pt; }
.md-content pre { background: #f3f3f3; padding: 8pt 10pt; border-radius: 3pt; overflow-x: auto; margin: 8pt 0; page-break-inside: avoid; }
.md-content pre code { background: none; padding: 0; font-size: 9pt; }
.md-content a { color: #006A72; text-decoration: none; border-bottom: 1px solid #006A72; }
.md-content table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt; }
.md-content th, .md-content td { border: 1px solid #ddd; padding: 3pt 6pt; text-align: left; }
.md-content th { background: #f3f3f3; font-weight: 700; }
.md-content hr { border: none; border-top: 1px solid #ddd; margin: 14pt 0; }
.pdf-footer { margin-top: 28pt; padding-top: 8pt; border-top: 1px solid #ddd; font-size: 8.5pt; color: #777; text-align: center; font-family: Lato, sans-serif; }
.pdf-foot-brand { color: #006A72; font-weight: 700; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1, h2, h3, h4 { page-break-after: avoid; }
  blockquote, pre { page-break-inside: avoid; }
}
`

export function downloadNarrativePdf(opts: {
  /** Big title at the top. Defaults to "RAGtime Analysis". */
  title?: string
  /** Italic subtitle under the title (typically the corpus name). */
  subtitle?: string
  /** Metadata rows (Prompt / Scope / Generated …). */
  metaRows: { key: string; value: string }[]
  /** The narrative markdown to render. */
  markdown: string
}): void {
  if (!opts.markdown || !opts.markdown.trim()) {
    alert('No narrative content to download.')
    return
  }

  const renderedHtml = renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{opts.markdown}</ReactMarkdown>,
  )
  const generatedAt = new Date().toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  })
  const metaRows = [...opts.metaRows, { key: 'Generated', value: generatedAt }]

  const doc =
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<title>' +
    esc(opts.title ?? 'RAGtime Analysis') +
    '</title><style>' +
    PRINT_CSS +
    '</style></head><body>' +
    '<div class="pdf-header">' +
    '<div class="pdf-title">' +
    esc(opts.title ?? 'RAGtime Analysis') +
    '</div>' +
    (opts.subtitle
      ? '<div class="pdf-subtitle">' + esc(opts.subtitle) + '</div>'
      : '') +
    '<div class="pdf-meta">' +
    metaRows
      .map(
        (r) =>
          '<div class="meta-row"><span class="meta-key">' +
          esc(r.key) +
          ':</span> ' +
          esc(r.value) +
          '</div>',
      )
      .join('') +
    '</div></div>' +
    '<div class="md-content">' +
    renderedHtml +
    '</div>' +
    '<div class="pdf-footer">Generated by <span class="pdf-foot-brand">RAGtime</span> &mdash; A research tool from Lawfare</div>' +
    '</body></html>'

  let w: Window | null = null
  try {
    w = window.open('', '_blank')
  } catch {
    w = null
  }
  if (!w) {
    alert('Could not open the print window. Allow pop-ups for this site, then try again.')
    return
  }
  w.document.open()
  w.document.write(doc)
  w.document.close()

  let printed = false
  function doPrint() {
    if (printed || !w) return
    printed = true
    w.focus()
    w.print()
  }
  w.onload = doPrint
  // onload doesn't always fire for written documents; backstop after reflow.
  setTimeout(doPrint, 400)
}
