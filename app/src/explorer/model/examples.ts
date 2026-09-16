/**
 * The empty state (design item 10): three questions that each orient
 * straight into a brief — one per answer shape, each naming its ground so
 * orient has nothing to ask — plus the registry's corpus chips, which the
 * page reads live.
 */

export type ExampleQuestion = { text: string; shape: 'list' | 'count' | 'narrative' }

export const EXAMPLE_QUESTIONS: readonly ExampleQuestion[] = [
  {
    text: 'What has the Office of Legal Counsel said about presidential emergency powers over communications networks? List the opinions.',
    shape: 'list',
  },
  {
    text: 'How many executive orders since January 2025 invoke the International Emergency Economic Powers Act?',
    shape: 'count',
  },
  {
    text: 'How have federal courts handled habeas petitions from immigration detainees since January 2025? A short narrative with citations.',
    shape: 'narrative',
  },
]
