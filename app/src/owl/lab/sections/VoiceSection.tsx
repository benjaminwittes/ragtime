import { useMemo, useState } from 'react'
import { Owl } from '../../Owl'
import { OwlSpeech } from '../../speech'
import { voiceList } from '../../voice/all'
import { TREATMENTS, treatmentList } from '../../voice/treatments'
import { OCCASIONS, OCCASION_IDS, type OccasionId, type OwlVoice, type SpeechPlace, type TreatmentId } from '../../voice/types'
import { useOwlVoice } from '../../voice/useVoice'
import { Field, SELECT_CLASS as select } from '../Field'

/**
 * The owl's voices, looked at: every line of every voice by occasion and treatment, and a
 * live owl that can be made to say each occasion. The six embed sites with a line held in
 * place are on the Embed sites section, which has the controls for it. None of this depends
 * on the Tune panel's Voice knob: the controls are the section's own, so the lab shows the
 * voices whether or not the panel has switched one on.
 */

type Treated = TreatmentId | 'voice' | 'all'

/* -------------------------------------------------------------------------- */
/* Every line                                                                  */
/* -------------------------------------------------------------------------- */

function Line({ text, treatment }: { text: string; treatment: TreatmentId }) {
  // The real note, in the flow: the same rules as on a page, with nothing anchored.
  return (
    <li className="mb-2">
      <span className="owl-note" data-place="inline" data-treatment={treatment}>
        {text}
      </span>
    </li>
  )
}

function CopySheet({ voice, treated }: { voice: OwlVoice; treated: Treated }) {
  const columns: TreatmentId[] =
    treated === 'all' ? treatmentList().map((t) => t.id) : [treated === 'voice' ? voice.treatment : treated]
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-left align-top">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="w-48 py-1 pr-4 font-normal">Occasion</th>
            {columns.map((id) => (
              <th key={id} className="py-1 pr-4 font-normal">
                {TREATMENTS[id].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {OCCASIONS.map((occasion) => {
            const lines = voice.lines[occasion.id] ?? []
            return (
              <tr key={occasion.id} className="border-t align-top">
                <th className="py-2 pr-4 text-sm font-normal">
                  {occasion.label}
                  <code className="block text-xs text-muted-foreground">{occasion.id}</code>
                  {occasion.announce && <span className="text-xs text-muted-foreground">announced</span>}
                </th>
                {columns.map((column) => (
                  <td key={column} className="py-2 pr-4">
                    {lines.length === 0 ? (
                      <span className="text-xs text-muted-foreground">silent</span>
                    ) : (
                      <ul className="list-none p-0">
                        {lines.map((line) => (
                          <Line key={line} text={line} treatment={column} />
                        ))}
                      </ul>
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Copy() {
  const [treated, setTreated] = useState<Treated>('all')
  const [only, setOnly] = useState('all')
  const shown = voiceList().filter((voice) => only === 'all' || voice.id === only)
  return (
    <div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <Field label="Voice">
          <select className={select} value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="all">all</option>
            {voiceList().map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Set in">
          <select className={select} value={treated} onChange={(e) => setTreated(e.target.value as Treated)}>
            <option value="all">all three treatments</option>
            <option value="voice">each voice’s own</option>
            {treatmentList().map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-4">
        {shown.map((voice) => (
          <div key={voice.id} className="mb-10">
            <h3 className="font-serif text-xl font-semibold">{voice.label}</h3>
            <p className="text-sm opacity-80">
              {voice.note} <span className="opacity-70">Default treatment: {TREATMENTS[voice.treatment].label}.</span>
            </p>
            <CopySheet voice={voice} treated={treated} />
          </div>
        ))}
      </div>
      <ul className="mt-2 text-xs text-muted-foreground">
        {treatmentList().map((t) => (
          <li key={t.id}>
            <b>{t.label}.</b> {t.note}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* A live owl                                                                  */
/* -------------------------------------------------------------------------- */

function LiveOwl({ voice, treatment, place }: { voice: string; treatment: TreatmentId | null; place: SpeechPlace }) {
  const site = useMemo(() => ({ place, arrival: null, occasions: OCCASION_IDS, keepsHours: false }), [place])
  const config = useMemo(
    () => ({ voice, treatment, enabled: new Set<OccasionId>(OCCASION_IDS), delayMs: 0, dwellMs: 8000, poke: true, idleSeconds: 45 }),
    [voice, treatment],
  )
  const speaking = useOwlVoice(site, { config })
  return (
    <div>
      <div className="flex min-h-40 items-start justify-center rounded-md border bg-background p-8">
        <div className="owl-spot w-28">
          <Owl pose="stacks" lantern="dark" title="The owl" className="w-full" />
          {speaking && <OwlSpeech voice={speaking} />}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {OCCASIONS.map((occasion) => (
          <button
            key={occasion.id}
            type="button"
            className="rounded border px-2 py-1 text-xs hover:bg-muted"
            title={occasion.when}
            onClick={() => speaking?.say(occasion.id)}
          >
            {occasion.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Click the owl to dismiss a line or to hear a click line; Escape dismisses too. A line from an occasion marked
        “announced” is also put in the live region for a screen reader.
      </p>
    </div>
  )
}

function Live() {
  const [voice, setVoice] = useState(voiceList()[0]?.id ?? 'none')
  const [treatment, setTreatment] = useState<TreatmentId | 'voice'>('voice')
  const [place, setPlace] = useState<SpeechPlace>('beside')
  return (
    <div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <Field label="Voice">
          <select className={select} value={voice} onChange={(e) => setVoice(e.target.value)}>
            {voiceList().map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Treatment">
          <select className={select} value={treatment} onChange={(e) => setTreatment(e.target.value as TreatmentId | 'voice')}>
            <option value="voice">follow the voice</option>
            {treatmentList().map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Place">
          <select className={select} value={place} onChange={(e) => setPlace(e.target.value as SpeechPlace)}>
            {(['beside', 'beside-start', 'below', 'above'] as const).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-4 max-w-xl">
        <LiveOwl key={voice} voice={voice} treatment={treatment === 'voice' ? null : treatment} place={place} />
      </div>
    </div>
  )
}

export function VoiceSection() {
  return (
    <div>
      <h3 className="mt-6 font-serif text-xl font-semibold">A live owl</h3>
      <Live />
      <h3 className="mt-10 font-serif text-xl font-semibold">The six sites</h3>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        The six sites, each holding a line, are the ones in <a href="#sites" className="text-primary hover:underline">Embed sites</a>:
        choose the voice, the treatment and the occasion in the controls above them, and the placements can be
        compared there without a second copy of the sites on this page.
      </p>
      <h3 className="mt-10 font-serif text-xl font-semibold">Every line</h3>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        All copy is draft for editorial review. Each voice is one file in <code>owl/voice/voices/</code>; its lines are
        there, together, and nowhere else.
      </p>
      <Copy />
    </div>
  )
}
