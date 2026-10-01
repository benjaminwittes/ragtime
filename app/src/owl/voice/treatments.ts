import { TREATMENT_IDS, type Treatment, type TreatmentId } from './types'

/**
 * The ways a line can be set. Each belongs to the world of documents rather than to a
 * chat: the typography is `voice.css`, keyed on `data-treatment`, and uses only the
 * self-hosted faces and system stacks the app already allows. A voice names its own
 * (`OwlVoice.treatment`); a knob can override it for every voice.
 */
export const TREATMENTS: Record<TreatmentId, Treatment> = {
  plate: {
    id: 'plate',
    label: 'Plate caption',
    note: 'Small capitals between two hairlines, as under an engraved plate.',
  },
  typed: {
    id: 'typed',
    label: 'Typed note',
    note: 'A typewritten marginal note, set off by a rule down its left edge.',
  },
  stamp: {
    id: 'stamp',
    label: 'Rubber stamp',
    note: 'Capitals in a ruled box, a degree off true, as a clerk’s stamp lands.',
  },
}

export const treatmentList = (): readonly Treatment[] => TREATMENT_IDS.map((id) => TREATMENTS[id])

/** For the knob that overrides a voice's own. */
export function treatmentOptions(): { label: string; value: string }[] {
  return [{ label: 'follow the voice', value: 'voice' }, ...treatmentList().map((t) => ({ label: t.label, value: t.id }))]
}

export function isTreatment(value: unknown): value is TreatmentId {
  return typeof value === 'string' && (TREATMENT_IDS as readonly string[]).includes(value)
}
