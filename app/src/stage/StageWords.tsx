import { SurfaceIntro } from '@/components/SurfaceIntro'
import { KitMarkdown } from '@/demo/parts'

import type { SlideScene } from './protocol.ts'

/**
 * Words in the air over the theatre: a beat of the presentation, as the stage shows it.
 *
 * Not a slide. A slide is a rectangle of a fixed shape with type scaled to fit it, which
 * is the right thing to send down a cable to a projector and the wrong thing to put in a
 * browser: in a phone held upright it is a postage stamp. This is a page. The title and
 * the words under it are set in the reader's own window, between a smallest and a largest
 * size, and when the window is narrow the lines re-wrap and the page scrolls.
 *
 * The title is this surface's opening line, so it is the app's own `SurfaceIntro` and
 * carries that component's name across a change of scene: from one beat to the next it
 * travels, and when the presenter walks into the app it becomes the page's own headline.
 * The part it belongs to is the line beside it — set above, though it comes after in the
 * markup, because `SurfaceIntro` is a heading and then a line.
 *
 * Measures are in `cqi`, of whatever this is set in: the window on the stage, the preview
 * box on the console.
 */
export function StageWords({ scene }: { scene: SlideScene }) {
  return (
    <article
      className="pointer-events-auto relative mx-auto w-full max-w-[76rem] px-[clamp(1.25rem,7cqi,7rem)] pb-[30cqi] pt-[clamp(1.5rem,5cqi,4.5rem)] [text-shadow:0_1px_18px_rgb(4_40_45/0.85)]"
      data-stage="words"
    >
      <SurfaceIntro
        level={1}
        className="flex flex-col-reverse gap-[clamp(0.5rem,1.4cqi,1.25rem)]"
        heading={scene.title}
        lede={scene.part}
        headingClassName="font-serif text-[clamp(2rem,5.4cqi,4.75rem)] font-medium leading-[1.06] tracking-tight text-balance text-[color:var(--house-ink)]"
        ledeClassName="font-sans text-[clamp(0.72rem,1.3cqi,1.05rem)] font-semibold uppercase tracking-[0.18em] text-[color:var(--house-accent)] empty:hidden"
      />
      {scene.body && (
        <div className="stage-body mt-[clamp(1rem,3.2cqi,2.75rem)]">
          <KitMarkdown className="stage-words">{scene.body}</KitMarkdown>
        </div>
      )}
    </article>
  )
}
