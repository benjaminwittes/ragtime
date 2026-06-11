import type { DocsEntry } from '../types'

/**
 * Global "Access & Cost" entry. Explains the three access modes (free,
 * BYOK, Lawfare-billed prepaid) and how charges work. The cost language
 * here is corrected from the editorial draft: the markup applies to actual
 * API cost (not estimated), and the courtesy buffer is a small overdraft
 * allowance, not a hard floor that prevents emptying the balance.
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
Your key stays in your browser, and any money exchanged is between you and
your AI provider. The service Lawfare provides is free.

**3. Lawfare-billed (paid).** The only time Lawfare charges you is if you
want the AI features, don't have your own API key, and so want to use
ours — which costs Lawfare money on every API call. You can buy a prepaid
block at fixed dollar values ($5 / $20 / $50), and Lawfare runs the AI for
you on Anthropic models. Each AI action shows an estimated cost before you
run it and the actual cost after; your remaining balance shows in RAGtime's
header. Lawfare charges $1.35 for every $1.00 of actual API cost, solely to
support overhead on the system itself — not to generate revenue.

There's a small courtesy buffer on the paid tier: because cost estimates
are deliberately conservative, the system lets a query finish even if it
lands a few cents past your balance, rather than cutting you off mid-run.
Your next top-up clears the small deficit.

**Why a cost estimate on every AI action?** AI calls over large document
sets cost real money. Showing the estimate up front keeps the tool honest
and lets you narrow the set first if the number looks high.
`.trim(),
}
