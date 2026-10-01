/**
 * Did an Explorer turn end in an answer? The one state the chat owl's `answered` line is
 * true of, kept here as a plain function so it can be tested without the page.
 *
 * Not every turn that ends has answered: one that stopped on a question for the reader, one
 * that ended in a proposed brief, one that ran into a cap, and one that failed have each
 * ended without an answer, and a line saying the answer is in would be about something the
 * page is not showing. Only `end_turn` is a turn that finished what it set out to do.
 */
export function landed(turn: {
  running: boolean
  error: unknown
  stop: string | null
  question: string | null
  brief: unknown
  answer: string
}): boolean {
  return !turn.running && !turn.error && turn.stop === 'end_turn' && !turn.question && !turn.brief && turn.answer !== ''
}
