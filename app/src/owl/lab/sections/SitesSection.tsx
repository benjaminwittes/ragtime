import { useMemo, useState, type ReactNode } from 'react'
import { SurfaceIntro } from '@/components/SurfaceIntro'
import { SITES } from '../../embeds'
import { OwlSpot } from '../../OwlSpot'
import type { OwlSiteId } from '../../types'
import { useOwlFigure } from '../../useOwlFigure'
import { voiceList } from '../../voice'
import { VoiceHold } from '../../voice/hold'
import { OCCASIONS, type OccasionId, type TreatmentId } from '../../voice/types'
import { treatmentList } from '../../voice/treatments'
import { Field, SELECT_CLASS } from '../Field'

/**
 * Each embed-registry site, drawn with its real classes and its real wrapper, the way
 * the page it belongs to mounts it. The text beside the owl is stand-in copy; the figure
 * is `OwlSpot` or `useOwlFigure` exactly as the page uses them, so a change to a site's
 * entry in `embeds.ts` or its size knob shows here.
 */

const LEDE = 'Stand-in text, to show what the owl sits beside.'

function Hub() {
  const owl = useOwlFigure('hub')
  return <SurfaceIntro level={2} className="text-center" {...owl} heading="Hub heading" lede={LEDE} headingClassName="font-serif text-3xl" />
}

function Explorer() {
  const owl = useOwlFigure('explorer')
  return (
    // The Explorer's own sheet sizes the figure, and only under `.explorer .empty`.
    <div className="explorer" style={{ display: 'block' }}>
      <div className="empty">
        <SurfaceIntro level={2} {...owl} heading="Ask the federal record a question." lede={LEDE} ledeClassName="lede" />
      </div>
    </div>
  )
}

function Gate() {
  const [wrong, setWrong] = useState(false)
  return (
    <div className="max-w-sm">
      <OwlSpot site="gate" shake={wrong} />
      <h3 className="font-serif text-2xl font-bold">RAGtime</h3>
      <button
        type="button"
        className="mt-2 rounded border px-2 py-1 text-xs"
        onClick={() => {
          setWrong(true)
          window.setTimeout(() => setWrong(false), 700)
        }}
      >
        Wrong code
      </button>
    </div>
  )
}

function NotFound() {
  return (
    <div>
      <OwlSpot site="not-found" />
      <h3 className="font-serif text-2xl font-bold">Not found</h3>
    </div>
  )
}

function Stage() {
  return (
    <div className="stage-house px-6 py-8 text-center">
      <OwlSpot site="stage" />
      <h3 className="mt-6 font-serif text-2xl font-medium">Nothing is on stage right now.</h3>
    </div>
  )
}

function Record() {
  const owl = useOwlFigure('record', { lantern: 'searching' })
  return (
    <div className="stage-house px-6 py-4 [container-type:inline-size]">
      <SurfaceIntro
        level={1}
        className="grid grid-cols-[auto_1fr] items-center gap-x-[clamp(0.6rem,1.4cqi,1.4rem)] gap-y-[0.3cqi]"
        {...owl}
        heading="“a phrase”"
        lede="A collection"
        headingClassName="col-start-2 row-start-2 font-serif text-[clamp(1.4rem,3.2cqi,3rem)] font-medium leading-[1.05] tracking-tight"
        ledeClassName="col-start-2 row-start-1 self-end font-sans text-xs font-semibold uppercase tracking-[0.18em]"
      />
    </div>
  )
}

const DEMOS: Record<OwlSiteId, () => ReactNode> = {
  hub: () => <Hub />,
  explorer: () => <Explorer />,
  gate: () => <Gate />,
  'not-found': () => <NotFound />,
  stage: () => <Stage />,
  record: () => <Record />,
}

export function SitesSection() {
  const [voice, setVoice] = useState('')
  const [treatment, setTreatment] = useState<TreatmentId | 'voice'>('voice')
  const [occasion, setOccasion] = useState<OccasionId | 'arrival'>('arrival')
  const hold = useMemo(
    () => (voice ? { voice, treatment: treatment === 'voice' ? null : treatment, occasion } : null),
    [voice, treatment, occasion],
  )
  return (
    <VoiceHold.Provider value={hold}>
      <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
        The six sites exactly as the pages mount them. Choose a voice to hold one line in every site at once, so their
        placements can be compared; a site that cannot truthfully report the chosen occasion holds nothing. Placement
        is each site’s entry in <code>SPEECH_SITES</code>; at a narrow window the note narrows, moves to the other
        side, or drops below the owl rather than leave the screen, so resize the window to see that.
      </p>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <Field label="Hold a line in">
          <select className={SELECT_CLASS} value={voice} onChange={(e) => setVoice(e.target.value)}>
            <option value="">none: as the pages behave</option>
            {voiceList().map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Treatment">
          <select
            className={SELECT_CLASS}
            value={treatment}
            disabled={!voice}
            onChange={(e) => setTreatment(e.target.value as TreatmentId | 'voice')}
          >
            <option value="voice">follow the voice</option>
            {treatmentList().map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Occasion">
          <select
            className={SELECT_CLASS}
            value={occasion}
            disabled={!voice}
            onChange={(e) => setOccasion(e.target.value as OccasionId | 'arrival')}
          >
            <option value="arrival">each site’s arrival</option>
            {OCCASIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {(Object.keys(SITES) as OwlSiteId[]).map((id) => (
          <div key={id} className="rounded-md border bg-background p-4" data-owl-lab-site={id}>
            <div className="mb-3 text-xs text-muted-foreground">
              <code>{id}</code> · {SITES[id].label} · {SITES[id].pose}, {SITES[id].lantern}
              {SITES[id].keepsHours ? ', keeps hours' : ''}
            </div>
            {DEMOS[id]()}
          </div>
        ))}
      </div>
    </VoiceHold.Provider>
  )
}
