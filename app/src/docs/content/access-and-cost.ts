import type { DocsEntry } from '../types'

/**
 * Global "Access & Cost" entry. Explains the three access modes (free,
 * BYOK, Lawfare-billed prepaid) and how charges work.
 *
 * Two things the app owns and this file must follow. The balance is read
 * inside the AI access sheet (`llm/AccessSettings.tsx` SignedInView), not in
 * the site bar — the bar carries only a status pip and the words "AI access"
 * (`components/SiteBar.tsx`). And the 1.35x figure appears nowhere in this
 * repo: it is a Worker-side billing fact, so it is repeated here as given and
 * must not be "corrected" from anything in the frontend.
 *
 * The courtesy buffer is REAL — `legal/terms-of-service-content.ts` states it
 * — so do not cut it again as unsupported. A pass on 2026-09-18 grepped the
 * spoke code for "buffer", found nothing, and deleted it; the ToS had it all
 * along. It does not contradict the pre-flight paragraph: the pre-flight
 * refuses a query ESTIMATED to go below zero, while the buffer lets one
 * ALREADY RUNNING overshoot slightly.
 */
export const accessAndCostEntry: DocsEntry = {
  slug: 'access-and-cost',
  title: 'Access & Cost',
  summary: 'Free search, bring-your-own-key, or a Lawfare-billed prepaid balance — and how charges work.',
  scope: { kind: 'global' },
  order: 4,
  content: `
RAGtime has three access modes, side by side. You pick one in **AI access**
(top right). To be clear, Lawfare is not seeking to monetize RAGtime — we
want it available for free to everyone doing research for any reason. But
it costs real money to run every AI-enabled search, to maintain and develop
the databases and search infrastructure that make them powerful, and to
improve the system over time. The cost structure here is meant to keep the
system as widely available and as low-cost as possible while letting
Lawfare recoup what it spends to support it.

**1. The free tier.** Keyword search and structured metadata filtering on
every corpus are free. No account, key, or credit card. This is the full
search-and-filter surface, not a teaser — any search you can do locally
against the database, do as much as you want. We will not charge you a dime.

**2. Bring your own key (BYOK).** We also won't charge you a dime to use
the AI features with your own API key. Paste a key from Anthropic, OpenAI,
or Google into the BYOK option to unlock the AI modes (Ask, synthesis,
read, analyze). API calls bill to your provider account, not to Lawfare.
The key is stored in this browser; RAGtime's Worker forwards it to your
provider on each call and keeps no copy. Any money exchanged is between you
and your AI provider. The service Lawfare provides is free.

**3. Lawfare-billed (paid).** The only time Lawfare charges you is if you
want the AI features, don't have your own API key, and so want to use
ours — which costs Lawfare money on every API call. You can buy a prepaid
block at fixed dollar values ($5 / $20 / $50), and Lawfare runs the AI for
you on Anthropic models. Each AI action shows an estimated cost before you
run it and the running cost as it executes. Your balance, and the per-query
cap that goes with it, are in the **AI access** panel — open it from the bar
and they are at the top of the paid tab, with a *refresh* beside them. The
bar itself shows only a coloured dot, so a balance you want to watch is one
click away rather than always on screen. Lawfare charges $1.35 for every
$1.00 of actual API cost, solely to support overhead on the system itself —
not to generate revenue.

**Estimates are estimates, and the balance is the floor.** The planning step
guesses before the work happens, so the number in the pre-flight can be high
or low. If the estimate is over your balance the modal says so and lets you
proceed anyway — the query often lands cheaper — but if execution would take
the balance below zero the Worker stops it there. If the estimate is over
your per-query cap, refine the question or proceed once as an override.

There is also a small **courtesy buffer** on the paid tier: a query already
under way can finish even if it lands a little past your balance, and new
paid queries pause until you add credit. The Terms of Service state the
commitment.

**Why a cost estimate on every AI action?** AI calls over large document
sets cost real money. Showing the estimate up front keeps the tool honest
and lets you narrow the set first if the number looks high.

## The Explorer's two limits

The Explorer has two separate limits, and they are easy to mistake for each
other.

**The conversation cap.** One conversation spends at most 25¢. This is a
cap on the thread you are in, not on your day — start over and you get a
fresh one.

**The daily allowance.** A number of model calls per day — sixty, as this
build is written, and the Worker's own figure wins once a turn has reported
one. It is counted per network address rather than per tab, so another tab,
or another person on the same network, draws on the same pool. It resets at
00:00 UTC.

The allowance does not apply to a paid balance, which is metered on the
balance itself — so a signed-in paid reader never sees the allowance panel.

Both numbers live in the **trail** — the control in the site bar while you
are on the Explorer, which also lists every tool call and what it cost. The
control appears once there is a conversation to have a trail about. They are
kept there rather than on screen at all times so that a page you are reading
is the thing you asked for. The control names the number itself when a
limit is close, and a turn that is refused says which limit refused it.
`.trim(),
}
