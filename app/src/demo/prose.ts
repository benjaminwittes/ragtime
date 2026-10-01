import { cn } from '@/lib/utils'

/**
 * The typography plugin is not installed (see `DocsOverlay`), so rendered markdown is
 * styled directly. The guide is read at a desk, mid-rehearsal, so it gets real tables and
 * room between sections.
 */
export const PROSE = cn(
  'text-[15px] leading-relaxed',
  '[&_p]:my-3',
  '[&_h1]:mt-10 [&_h1]:mb-3 [&_h1]:font-serif [&_h1]:text-3xl [&_h1]:font-medium [&_h1:first-child]:mt-0',
  '[&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:border-t [&_h2]:border-lawfare-line [&_h2]:pt-5 [&_h2]:font-serif [&_h2]:text-2xl',
  '[&_h3]:mt-6 [&_h3]:mb-1.5 [&_h3]:font-semibold',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
  // A checklist's box is its marker; a bullet beside it is a second one.
  '[&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-0',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:font-serif [&_blockquote]:text-lg',
  '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
  '[&_th]:border-b [&_th]:border-lawfare-line-strong [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border-b [&_td]:border-lawfare-line [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top',
  '[&_hr]:my-8 [&_hr]:border-lawfare-line',
  '[&_input[type=checkbox]]:mr-2',
)

/**
 * A slide's markdown, sized against the slide and not the window: every measure is in
 * `cqw`, so the same slide is the same picture in a rehearsal column and on a projector.
 */
export const SLIDE = cn(
  'text-[2.3cqw] leading-snug',
  '[&_p]:my-[1.1cqw]',
  '[&_ul]:my-[1.1cqw] [&_ul]:list-disc [&_ul]:pl-[3cqw] [&_ol]:my-[1.1cqw] [&_ol]:list-decimal [&_ol]:pl-[3cqw]',
  '[&_li]:my-[0.7cqw] [&_li::marker]:text-primary',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-[0.5cqw] [&_code]:font-mono [&_code]:text-[1.9cqw]',
  '[&_blockquote]:my-[1.4cqw] [&_blockquote]:border-l-[0.3cqw] [&_blockquote]:border-primary [&_blockquote]:pl-[1.8cqw] [&_blockquote]:font-serif [&_blockquote]:text-[3cqw] [&_blockquote]:leading-tight',
  '[&_table]:my-[1.2cqw] [&_table]:w-full [&_table]:border-collapse [&_table]:text-[1.9cqw]',
  '[&_th]:border-b [&_th]:border-lawfare-line-strong [&_th]:px-[0.8cqw] [&_th]:py-[0.5cqw] [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border-b [&_td]:border-lawfare-line [&_td]:px-[0.8cqw] [&_td]:py-[0.5cqw] [&_td]:align-top',
  '[&_h2]:mt-[1.6cqw] [&_h2]:font-serif [&_h2]:text-[2.8cqw]',
)
