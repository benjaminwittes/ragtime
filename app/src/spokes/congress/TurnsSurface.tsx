import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  type CongressTurn,
  type CongressTurnsFields,
  runCongressTurns,
} from '@/lib/worker-client'
import type { AuthArg } from '@/lib/auth-arg'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { isBioguideId, speakerTypeTone } from './congress-format'

/** A hearing pre-filter handed down from the hearing detail sheet's
 * "Explore turns" button. */
export type TurnsHearingScope = { sourceKey: string; title: string | null }

/**
 * "Who said what" — the hearings collection's speaker-turn sub-pane
 * (brief #13; the presidential clemency sub-surface pattern).
 *
 * ~7M attributed turns across ~35k hearing transcripts. Inputs: a
 * witness/member name box (a bioguide-shaped entry like 'R000584' routes to
 * the exact member-id filter; anything else matches witness names), a topic
 * search, a speaker-type browse (including 'ambiguous' — attribution is
 * flagged, never guessed), and the Q→A toggle that pairs each answer with
 * the question it responds to.
 *
 * Results render as Q/A cards: question speaker + excerpt above, answer
 * speaker + excerpt below, hearing title/committee/date footer.
 */
export function TurnsSurface({
  auth,
  hearingScope,
  onClearHearingScope,
}: {
  auth: AuthArg | null
  hearingScope: TurnsHearingScope | null
  onClearHearingScope: () => void
}) {
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [speakerType, setSpeakerType] = useState('')
  const [withQuestion, setWithQuestion] = useState(true)

  const [turns, setTurns] = useState<CongressTurn[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [capped, setCapped] = useState(false)
  const [pairedResult, setPairedResult] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  async function run(fields: CongressTurnsFields) {
    setLoading(true)
    setError(undefined)
    setHasRun(true)
    try {
      const r = await runCongressTurns(fields)
      setTurns(r.turns)
      setCount(r.count)
      setCapped(r.capped)
      setPairedResult(r.with_question)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'congress-turns',
          mode: 'manual_filter',
          question:
            fields.search ??
            fields.witnessName ??
            fields.bioguideId ??
            '(turn browse)',
          plan: { fields, generated_sql: r.generated_sql },
          cited_ids: r.turns.map((t) => t.id),
        },
        auth,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setTurns([])
      setCount(0)
    } finally {
      setLoading(false)
    }
  }

  function buildFields(): CongressTurnsFields {
    const fields: CongressTurnsFields = {}
    const n = name.trim()
    if (n) {
      if (isBioguideId(n)) fields.bioguideId = n
      else fields.witnessName = n
    }
    if (topic.trim()) fields.search = topic.trim()
    if (speakerType) fields.speakerType = speakerType
    if (hearingScope) fields.hearingSourceKey = hearingScope.sourceKey
    if (withQuestion) fields.withQuestion = true
    return fields
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fields = buildFields()
    if (Object.keys(fields).length === (fields.withQuestion ? 1 : 0)) {
      setError(
        'Give the search something to hold on to — a name, a topic, or a hearing.',
      )
      setHasRun(true)
      setTurns([])
      setCount(0)
      return
    }
    void run(fields)
  }

  // "Explore turns" from a hearing detail sheet: auto-run scoped to it.
  const lastScopeKey = useRef<string | null>(null)
  useEffect(() => {
    if (!hearingScope || hearingScope.sourceKey === lastScopeKey.current) return
    lastScopeKey.current = hearingScope.sourceKey
    void run({
      hearingSourceKey: hearingScope.sourceKey,
      ...(withQuestion ? { withQuestion: true } : {}),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hearingScope])

  return (
    <div>
      <form
        onSubmit={handleSubmit}
        className="space-y-4 border-b border-border bg-card px-6 py-5"
      >
        <p className="text-xs text-muted-foreground">
          Who said what, across ~7 million attributed hearing turns. Ambiguous
          speakers are flagged, never guessed.
        </p>
        {hearingScope && (
          <div className="flex items-center gap-2">
            <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs text-primary">
              <span className="truncate">
                Hearing: {hearingScope.title ?? hearingScope.sourceKey}
              </span>
              <button
                type="button"
                onClick={() => {
                  lastScopeKey.current = null
                  onClearHearingScope()
                }}
                aria-label="Clear the hearing scope"
                className="shrink-0 font-bold hover:opacity-70"
              >
                ×
              </button>
            </span>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Witness or member"
            hint="Witness name — or a bioguide ID (e.g. R000584) for a member"
          >
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Comey — or R000584"
              disabled={loading}
            />
          </Field>
          <Field label="Topic" hint="Search the turn text">
            <Input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. surveillance"
              disabled={loading}
            />
          </Field>
          <Field label="Speaker type">
            <select
              value={speakerType}
              onChange={(e) => setSpeakerType(e.target.value)}
              disabled={loading}
              className={cn(
                'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-primary/40',
                loading && 'cursor-not-allowed opacity-60',
              )}
            >
              <option value="">— Any —</option>
              <option value="member">Members</option>
              <option value="witness">Witnesses</option>
              <option value="ambiguous">Ambiguous attribution</option>
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={withQuestion}
              onChange={(e) => setWithQuestion(e.target.checked)}
              disabled={loading}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Pair with the question asked (Q→A)
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Find turns'}
          </Button>
        </div>
      </form>

      <TurnsResults
        turns={turns}
        count={count}
        capped={capped}
        paired={pairedResult}
        loading={loading}
        error={error}
        hasRun={hasRun}
      />
    </div>
  )
}

function TurnsResults({
  turns,
  count,
  capped,
  paired,
  loading,
  error,
  hasRun,
}: {
  turns: CongressTurn[] | undefined
  count: number | undefined
  capped: boolean
  paired: boolean
  loading: boolean
  error: string | undefined
  hasRun: boolean
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Name a witness, a member, or a topic — see every time it came up,
          question by answer.
        </p>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Searching turns…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-destructive">Turn search failed: {error}</p>
      </div>
    )
  }
  if (!turns || turns.length === 0) {
    return (
      <div className="px-6 py-8">
        <p className="text-center text-sm text-muted-foreground">
          No turns matched. Witness names match the resolved roster (86% of
          turns are attributed; ~94% in the modern era) — try a last name, a
          broader topic, or the ambiguous-attribution browse.
        </p>
      </div>
    )
  }
  return (
    <div className="px-6 py-4">
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {(count ?? turns.length).toLocaleString()} turn
        {(count ?? turns.length) === 1 ? '' : 's'} · showing first{' '}
        {turns.length.toLocaleString()}
        {capped ? ' (capped)' : ''}
      </p>
      <ol className="space-y-3">
        {turns.map((t) => (
          <TurnCard key={t.id} turn={t} paired={paired} />
        ))}
      </ol>
    </div>
  )
}

function TurnCard({ turn, paired }: { turn: CongressTurn; paired: boolean }) {
  const hasQuestion = paired && !!turn.question_excerpt
  return (
    <li className="rounded-lg border border-border bg-card">
      {hasQuestion && (
        <div className="border-b border-dashed border-border px-4 py-3">
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Q
            </span>
            <span className="text-sm font-medium text-foreground">
              {turn.question_speaker ?? turn.question_speaker_raw ?? '—'}
            </span>
            <SpeakerTypeBadge type={turn.question_speaker_type ?? null} />
          </p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            {turn.question_excerpt}
          </p>
        </div>
      )}
      <div className="px-4 py-3">
        <p className="flex flex-wrap items-baseline gap-2">
          {hasQuestion && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              A
            </span>
          )}
          <span className="text-sm font-medium text-foreground">
            {turn.resolved_name ?? turn.speaker_raw ?? '—'}
          </span>
          <SpeakerTypeBadge type={turn.speaker_type} />
          {turn.party && (
            <span className="font-mono text-[10px] text-muted-foreground">
              ({turn.party})
            </span>
          )}
          {turn.affiliation && (
            <span className="text-xs text-muted-foreground">
              {turn.affiliation}
            </span>
          )}
        </p>
        <p className="mt-1 text-sm leading-snug text-foreground/90">
          {turn.excerpt}
        </p>
      </div>
      <footer className="border-t border-border px-4 py-2 font-mono text-[11px] text-muted-foreground">
        {[
          turn.hearing_title,
          turn.hearing_committees?.join(' · '),
          turn.held_date,
        ]
          .filter(Boolean)
          .join(' · ')}
      </footer>
    </li>
  )
}

/**
 * Speaker-attribution badge. Member/witness are affirmative; everything
 * else renders the muted "flagged" register — the corpus's attribution
 * candor rule (ambiguous speakers are flagged, never guessed).
 */
function SpeakerTypeBadge({ type }: { type: string | null }) {
  if (!type) return null
  const tone = speakerTypeTone(type)
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider',
        tone === 'member' && 'bg-primary/10 text-primary',
        tone === 'witness' &&
          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        tone === 'flagged' && 'bg-muted text-muted-foreground',
      )}
      title={
        tone === 'flagged'
          ? 'Attribution is ambiguous for this speaker — flagged, never guessed'
          : undefined
      }
    >
      {type}
    </span>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && (
          <span className="ml-2 normal-case text-[10px] text-muted-foreground/70">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}
