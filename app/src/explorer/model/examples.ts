/**
 * The empty state (design item 10): three questions that each orient
 * straight into a brief — one per answer shape, each naming its ground so
 * orient has nothing to ask — plus the registry's corpus chips, which the
 * page reads live.
 *
 * **These three are copied word for word into the hub's rotation** as the
 * `'all'` set in `hub/samples.ts`, so a reader who crosses from the hub with one
 * of them finds this surface saying the same thing rather than a paraphrase.
 * Edit one side and the other goes stale silently — nothing checks it. The tone
 * rule that governs both lives in that file's header: the register is topical
 * and institutional about it, so the subject may be today's headline as long as
 * the question asks what an authority requires, what a court ordered, or what
 * the record shows — never a verdict on a person or a party.
 */

export type ExampleQuestion = { text: string; shape: 'list' | 'count' | 'narrative' }

export const EXAMPLE_QUESTIONS: readonly ExampleQuestion[] = [
  {
    text: 'What has the Office of Legal Counsel said about the Freedom of Information Act’s exemptions? List the opinions.',
    shape: 'list',
  },
  {
    text: 'How many rules and proposed rules about artificial intelligence has the Federal Register published since 1994?',
    shape: 'count',
  },
  {
    text: 'How have federal courts handled challenges to agency rulemaking since January 2025? A short narrative with citations.',
    shape: 'narrative',
  },
]
