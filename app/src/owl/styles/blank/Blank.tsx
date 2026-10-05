import type { OwlFigureProps } from '../../types'

/** An owl's box with nothing in it (`index.tsx` says why). */
export function Blank({ poseId, lantern, className, style, title }: OwlFigureProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      data-owl={poseId}
      data-lantern={lantern}
      className={className ? 'owl ' + className : 'owl'}
      style={style}
    >
      {title ? <title>{title}</title> : null}
    </svg>
  )
}
