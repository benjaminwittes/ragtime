import type { OwlVoice } from '../types'

/**
 * Marginalia: the dry annotations of someone who has read too many dockets. Parentheses,
 * abbreviations and the occasional borrowed legal phrase, none of it a claim about any
 * document. Draft copy for editorial review.
 */
export default {
  id: 'marginalia',
  label: 'Marginalia',
  note: 'Dry notes in the margin of a docket. Parenthetical, abbreviated, faintly weary.',
  treatment: 'typed',
  lines: {
    'arrive-hub': ['N.B. Begin with the box below.', 'Cf. the box below.', 'Query below. Footnotes to follow.'],
    'arrive-gate': ['Restricted. See access code.', 'Admission by code only.', 'Code required. Cf. above.'],
    'explorer-empty': ['Question presented: (blank).', 'Issue: unstated.', 'Begin where the question begins.'],
    'stage-quiet': ['Recess.', 'Adjourned, or not yet begun.', 'Nothing on the stage.'],
    'not-found': ['Not of record.', 'No such entry. See index.', 'Not on the docket.'],
    searching: ['Pending.', 'Search pending.', 'Hold for return.'],
    'search-empty': ['Nothing responsive.', 'Zero hits.', 'No hits. Other terms, perhaps.'],
    'search-results': ['Responsive. See below.', 'Hits, below.', 'Returned: see below.'],
    working: ['Under advisement.', 'Pending.', 'Held for reply.'],
    answered: ['Answer entered.', 'So noted.', 'Reply filed below.'],
    'wrong-code': ['Denied, without prejudice.', 'Code not accepted.', 'Not that one.'],
    night: ['Night session.', 'After hours. Lamp on.', 'Late sitting.'],
    idle: ['[No input.]', 'Sub silentio.', '(Still waiting.)'],
    poke: ['Noted.', '[Tapped.]', 'See above.'],
  },
} satisfies OwlVoice
