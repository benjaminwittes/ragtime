import type { OwlVoice } from '../types'

/**
 * The reading-room archivist: clipped, institutional, a little stern. Short imperatives
 * and plain statements of fact, as on a sign above a desk. Draft copy for editorial
 * review; nothing here is final until the owner says so.
 */
export default {
  id: 'archivist',
  label: 'Reading-room archivist',
  note: 'Terse and institutional. Says what the desk would say, and no more.',
  treatment: 'stamp',
  lines: {
    'arrive-hub': ['Reading room open.', 'Pencils only.', 'Search below.'],
    'arrive-gate': ['Access code, please.', 'Code at the door.', 'Members only.'],
    'explorer-empty': ['State the question.', 'Ask in plain words.', 'One question at a time.'],
    'stage-quiet': ['The stage is empty.', 'Stand by.', 'Nothing is showing.'],
    'not-found': ['No such page.', 'Not on this shelf.', 'Not at that address.'],
    searching: ['Looking.', 'Request is out.', 'One moment.'],
    'search-empty': ['Nothing returned.', 'No results.', 'The search returned nothing.'],
    'search-results': ['Results below.', 'Returned. See below.', 'Results are in.'],
    working: ['In progress.', 'Stand by.', 'Request pending.'],
    answered: ['Answer is in.', 'Done.', 'Reply entered.'],
    'wrong-code': ['That is not the code.', 'Refused.', 'Try again.'],
    night: ['After hours.', 'Lamp is lit.', 'Late hour.'],
    idle: ['Still here.', 'Quiet in the stacks.', 'No hurry.'],
    poke: ['Yes?', 'Desk is attended.', 'Next.'],
  },
} satisfies OwlVoice
