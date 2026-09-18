import type { DocsEntry } from '../types'

/**
 * Global "Access & Cost" entry.
 *
 * Two facts not to "correct" from the frontend: the balance lives inside the
 * AI access sheet (`llm/AccessSettings.tsx`), not the site bar, and the 1.35x
 * markup is a Worker-side billing fact that appears nowhere in this repo.
 *
 * The courtesy buffer is REAL — `legal/terms-of-service-content.ts` states
 * it. A pass on 2026-09-18 grepped the spoke code, found nothing and cut it.
 * It does not contradict the pre-flight: that refuses a query ESTIMATED to go
 * below zero, the buffer lets one ALREADY RUNNING overshoot.
 */
export const accessAndCostEntry: DocsEntry = {
  slug: 'access-and-cost',
  title: 'Access & Cost',
  summary: 'Free search, bring-your-own-key, or a Lawfare-billed prepaid balance — and how charges work.',
  scope: { kind: 'global' },
  order: 4,
  content: `
Three access modes, chosen in **AI access**. Lawfare is not trying to make
money here: the billing exists to recoup what the system costs to run.

**1. Free.** Keyword search and structured metadata filtering on every
corpus. No account, no key, no card, and no cap on how much you search.

**2. Your own key.** Paste an Anthropic, OpenAI or Google key to unlock the
AI modes. Those calls bill to your provider, not to Lawfare. The key stays in
this browser; the Worker forwards it on each call and keeps no copy.

**3. Lawfare-billed.** With no key of your own, buy a prepaid block ($5 /
$20 / $50) and Lawfare runs Anthropic models for you, charging $1.35 for
every $1.00 of actual API cost. Your balance and your per-query cap are at
the top of the paid tab in **AI access**.

**Estimates are estimates; the balance is the floor.** Every AI action is
priced before it runs, by a planning step that guesses, so the figure can be
high or low. An estimate over your balance is a warning you can override, and
the query often lands cheaper; execution that would take the balance below
zero is stopped there. An estimate over your per-query cap can be overridden
once. A small **courtesy buffer** lets a query already under way finish a
little past your balance, and new paid queries pause until you add credit.
The Terms of Service state that commitment.

**The Explorer has two limits of its own.** One conversation spends at most
25¢; start a new one for a fresh 25¢. And a daily allowance — sixty model
calls as this build is written, counted per network address rather than per
tab, resetting at 00:00 UTC, with the Worker's own figure winning once a turn
has reported one. A paid balance is metered on the balance instead and has no
allowance. Both numbers live in the **trail**, with every tool call and what
it cost, and a turn that is refused says which limit refused it.
`.trim(),
}
