import type { OwlVoice } from '../types'

/**
 * The site speaking for itself, in the first person, as the front page does: "I am
 * RAGtime." Plain and a little dry; it says what it holds and what it is doing, and it
 * does not perform. Typed, because it is a note in the margin of a record.
 *
 * The hub's line is the front page's sentence (Ben Wittes, 2026-09-30) cut to the part the
 * owl says; the rest is draft copy for editorial review. Tone is not settled
 * (`lab/v2` sets five side by side).
 */
export default {
  id: 'ragtime',
  label: 'I am RAGtime',
  note: 'First person, plain and a little dry. The owl is the site, and says so.',
  treatment: 'typed',
  lines: {
    // One line, not varied: it is the sentence the owl was ratified to say.
    'arrive-hub': ['I am RAGtime. I hold tens of millions of records, and I know where each one is shelved. Ask me anything.'],
    'arrive-gate': ['I am RAGtime. I keep the door. The access code, please.', 'I am RAGtime. This beta is closed. Enter the access code.'],
    'explorer-empty': ['I am RAGtime. Ask in plain words, and I will look through the record.', 'I am RAGtime. What do you want to know?'],
    'stage-quiet': ['Nothing is showing. I will keep the room until someone presents.', 'The room is empty. I am keeping it.'],
    'not-found': ['That page is not on any shelf I know. Try the search.', 'No page here. I looked.'],
    searching: ['Looking. The lantern is out.', 'I am reading the record for it.'],
    'search-empty': ['Nothing came back. Try other words, or fewer.', 'No record matched. Try a broader phrase.'],
    'search-results': ['I found some. The counts are below.', 'There is something here. The counts are below.'],
    working: ['Reading. This takes a moment.', 'I am working through the record.'],
    answered: ['That is what the record says. The sources are below.', 'I have an answer. The sources are below.'],
    'wrong-code': ['That is not the code. Try again.', 'The code was refused. Try once more.'],
    night: ['It is late. I keep the lamp lit.', 'Late hour. I am still reading.'],
    idle: ['Still here. Ask me anything.', 'Quiet. I am here when you want me.'],
    poke: ['Yes? Ask me anything.', 'I am listening.'],
  },
} satisfies OwlVoice
