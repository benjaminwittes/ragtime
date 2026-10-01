import type { ReactNode } from 'react'

/** A labelled control, as the lab's sections lay them out. */

export const SELECT_CLASS = 'rounded border bg-background px-2 py-1 text-sm'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
