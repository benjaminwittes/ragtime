import type { FormEvent, KeyboardEvent, ReactNode, Ref } from 'react'

/**
 * The one box this site asks a question in.
 *
 * The hub's cross-corpus search and the Explorer's composer were written months and two
 * design languages apart, and they are the same object: a field, a control that sends it,
 * a refusal to send nothing, and — on the multi-line one — Enter sends while Shift+Enter
 * writes a newline. Four rules, each spelled twice, each free to drift. They had already
 * started to: the hub guarded on `!q` inside its submit handler while the composer guarded
 * on `!t || disabled` inside its own, which are the same intent reached by two routes.
 *
 * This holds all four, once, and holds nothing else. It ships **no class names**, and that
 * is a constraint rather than a preference: the Explorer's stylesheet is scoped under
 * `.explorer` with element-level rules that beat the app's utilities inside that scope, so
 * a shared component that carried a kit class would be styled correctly on exactly one of
 * its two callers. Each skin passes its own — the hub its utilities, the composer the
 * `.composer` classes `explorer.css` already styles — and the two skins differ in a handful
 * of measurements that are now custom properties read by both (`--ask-*`, declared at
 * `:root` in `index.css` with the hub's values and overridden inside `.explorer` with the
 * composer's). That is what makes the two positions of this box a *morph* rather than a
 * cross-fade when the reader moves between the surfaces: the browser has one element with
 * two rectangles and two sets of real values to interpolate, not two pictures.
 *
 * The submit control's disabled rule is the component's and not a prop, because both
 * callers had written the same one: nothing to send, or the surface is busy.
 */

type Props = {
  /** Which field. `textarea` is the multi-line skin and the only one that needs a key rule. */
  as: 'input' | 'textarea'
  value: string
  onChange(next: string): void
  /** Called with the guard already applied — never for an empty or a disabled box. */
  onSubmit(): void
  placeholder: string
  disabled?: boolean
  submitLabel: ReactNode
  /** On the field. The composer's placeholder is its label; the hub's box needs one said. */
  ariaLabel?: string
  /** On the submit control, for the skin whose label is a glyph rather than a word. */
  submitAriaLabel?: string
  maxLength?: number
  rows?: number
  /** `search` on the hub, for the browser's own clear affordance. Ignored by the textarea. */
  inputType?: 'text' | 'search'
  fieldRef?: Ref<HTMLInputElement | HTMLTextAreaElement>
  /** On the `<form>`. */
  className?: string
  /**
   * On an element wrapping the field and the control — rendered only when a caller names
   * one. The hub positions its submit control absolutely inside a `relative` box, so it
   * needs the wrapper to be the containing block; the composer lays both out as flex
   * children of the form itself and a wrapper there would take the textarea out of that
   * flex context. So the wrapper is structural, and its presence is the caller's call.
   */
  fieldWrapClassName?: string
  fieldClassName?: string
  submitClassName?: string
}

export function AskBox({
  as,
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
  submitLabel,
  ariaLabel,
  submitAriaLabel,
  maxLength,
  rows,
  inputType,
  fieldRef,
  className,
  fieldWrapClassName,
  fieldClassName,
  submitClassName,
}: Props) {
  function submit(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault()
    if (disabled || !value.trim()) return
    onSubmit()
  }

  // A `<textarea>` has no notion of sending, so the rule every chat box has is written
  // here: Enter sends, Shift+Enter is a newline. The single-line skin needs none of this —
  // a form with a submit button already submits on Enter, and intercepting it would be a
  // second implementation of the browser's own behaviour.
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    submit()
  }

  // One ref prop for two element types. The cast is the honest shape of that: a caller
  // holds a ref to the element it asked for, and only it knows which that is.
  const field =
    as === 'textarea' ? (
      <textarea
        ref={fieldRef as Ref<HTMLTextAreaElement>}
        className={fieldClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        aria-label={ariaLabel}
      />
    ) : (
      <input
        ref={fieldRef as Ref<HTMLInputElement>}
        type={inputType}
        className={fieldClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        aria-label={ariaLabel}
      />
    )

  const inner = (
    <>
      {field}
      <button
        type="submit"
        className={submitClassName}
        disabled={disabled || !value.trim()}
        aria-label={submitAriaLabel}
      >
        {submitLabel}
      </button>
    </>
  )

  return (
    // The name that makes this box the same object on both surfaces. It is set here rather
    // than by each caller so there is one place to read it, and it is an inline style
    // rather than a class because it is this element's identity across a navigation and not
    // part of either skin. A view transition name has to be unique in the document when the
    // snapshot is taken, which holds because the hub and the Explorer are two routes and
    // only one of them is mounted: put a second AskBox on a surface that already has one
    // and the browser will refuse the whole transition.
    <form className={className} onSubmit={submit} style={{ viewTransitionName: 'ask-box' }}>
      {fieldWrapClassName === undefined ? inner : <div className={fieldWrapClassName}>{inner}</div>}
    </form>
  )
}
