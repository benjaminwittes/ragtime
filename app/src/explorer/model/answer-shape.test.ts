import { test } from 'vitest'
import assert from 'node:assert/strict'

import { citationsIn, detectShape, firstCitation, firstNumber, isCitationToken, linkifyCitations, splitListAnswer, titlesIn } from './answer-shape.ts'
import { cents, seconds } from './format.ts'
import { briefJson, mergePinnedCorpora, moveCorpus, normalizeBrief, sameBrief } from './brief.ts'

test('the answer shape presets are detected from free text, narrative by default', () => {
  assert.equal(detectShape('a list of the opinions with dates'), 'list')
  assert.equal(detectShape('A numbered list'), 'list')
  assert.equal(detectShape('a count of the orders'), 'count')
  assert.equal(detectShape('how many cases'), 'count')
  assert.equal(detectShape('the one document that answers this'), 'document')
  assert.equal(detectShape('a short narrative with citations'), 'narrative')
  assert.equal(detectShape(''), 'narrative')
  assert.equal(detectShape(undefined), 'narrative')
})

const listAnswer = [
  'Three OLC opinions speak to emergency powers over communications:',
  '',
  '1. [Legal Authorities Available to the President](rt://olc/867) — the 1979 survey of statutory authorities, including §706 of the Communications Act.',
  '2. **Emergency Statutes That Do Not Require a Declaration** [opinion](rt://olc/112): lists §706 among statutes exercisable without a declared emergency.',
  '   It was reaffirmed in 2001.',
  '3. A memorandum with no citation available in the corpus.',
  '',
  'None addresses internet traffic specifically.',
].join('\n')

test('a list answer splits into a lead, one card per item titled by its citation, and the rest', () => {
  const r = splitListAnswer(listAnswer)
  assert.equal(r.lead, 'Three OLC opinions speak to emergency powers over communications:')
  assert.equal(r.cards.length, 3)
  assert.equal(r.cards[0]?.title, 'Legal Authorities Available to the President')
  assert.equal(r.cards[0]?.path, '/corpus/olc/867')
  assert.match(r.cards[0]?.body ?? '', /^the 1979 survey/)
  assert.equal(r.cards[1]?.title, 'opinion')
  assert.equal(r.cards[1]?.path, '/corpus/olc/112')
  assert.match(r.cards[1]?.body ?? '', /reaffirmed in 2001/)
  assert.equal(r.cards[2]?.path, null)
  assert.match(r.cards[2]?.title ?? '', /^A memorandum/)
  assert.equal(r.rest, 'None addresses internet traffic specifically.')
})

// The shape the research model actually wrote on 2026-09-09: bold title, date,
// then the citation as its own link text, against the prompt's [title](rt://…).
const tokenListAnswer = [
  'Four opinions:',
  '',
  '1. **Presidential Control of Wireless and Cable Information** — June 19, 1941 — [rt://olc/1425](rt://olc/1425). Concludes the President may control radio stations.',
  '2. **Executive Powers Available By Virtue Of The National Emergency** — July 18, 1961 — [rt://olc/2100](rt://olc/2100).',
  '3. [rt://olc/112](rt://olc/112) — a survey of emergency statutes.',
  '4. **[Legal Authorities Supporting the NSA](rt://olc/246)** (January 19, 2006) — Addresses interception, not network control.',
  '',
  'Adjacent: **Review of STELLAR WIND** — June 22, 2004 — [rt://olc/1466](rt://olc/1466)',
].join('\n')

test('a citation that is its own link text: the card is titled by the bold run, the body loses the dangling dash, the title map reads the answer', () => {
  const r = splitListAnswer(tokenListAnswer)
  assert.equal(r.cards.length, 4)
  // A bolded link: the title is the link text as before, and no empty `****` is left in the body.
  assert.equal(r.cards[3]?.title, 'Legal Authorities Supporting the NSA')
  assert.equal(r.cards[3]?.body, '(January 19, 2006) — Addresses interception, not network control.')
  assert.equal(r.cards[0]?.title, 'Presidential Control of Wireless and Cable Information')
  assert.equal(r.cards[0]?.path, '/corpus/olc/1425')
  assert.equal(r.cards[0]?.body, 'June 19, 1941. Concludes the President may control radio stations.')
  assert.equal(r.cards[1]?.title, 'Executive Powers Available By Virtue Of The National Emergency')
  assert.equal(r.cards[1]?.body, 'July 18, 1961.')
  assert.equal(r.cards[2]?.path, '/corpus/olc/112')
  assert.equal(r.cards[2]?.title, 'a survey of emergency statutes.')
  assert.match(r.rest, /^Adjacent/)

  assert.equal(isCitationToken('rt://olc/1425'), true)
  assert.equal(isCitationToken('1425', { slug: 'olc', id: '1425' }), true)
  assert.equal(isCitationToken('olc/1425'), true)
  assert.equal(isCitationToken('Legal Authorities'), false)
  assert.equal(isCitationToken('opinion', { slug: 'olc', id: '112' }), false)

  const titles = titlesIn(tokenListAnswer)
  assert.equal(titles.get('/corpus/olc/1425'), 'Presidential Control of Wireless and Cable Information')
  assert.equal(titles.get('/corpus/olc/1466'), 'Review of STELLAR WIND')
  assert.equal(titles.has('/corpus/olc/112'), false)
  assert.equal(titlesIn(listAnswer).get('/corpus/olc/867'), 'Legal Authorities Available to the President')
})

// The narrative answer's forms on 2026-09-09: a bracketed token, several ids in one bracket, a naked token.
test('bare citations become links, one per id, titled from the map else slug/id; real links are untouched', () => {
  const prose = [
    'Ruiz v. ICE (N.D. Cal.) [rt://litigation/71906132], Bonilla Alvarez v. Noem [rt://litigation/71324797].',
    'Related: United States v. SPLC [rt://litigation/73223865, 73223872] and [rt://litigation/1, rt://olc/2].',
    'See also rt://olc/112. The 1941 opinion, [Presidential Control](rt://olc/1425), and [rt://olc/2100](rt://olc/2100) stand.',
  ].join('\n')
  const titles = new Map([['/corpus/litigation/71906132', 'Ruiz v. ICE']])
  const out = linkifyCitations(prose, titles)
  assert.match(out, /\[Ruiz v\. ICE\]\(rt:\/\/litigation\/71906132\), Bonilla Alvarez v\. Noem \[litigation\/71324797\]\(rt:\/\/litigation\/71324797\)\./)
  assert.match(out, /\[litigation\/73223865\]\(rt:\/\/litigation\/73223865\), \[litigation\/73223872\]\(rt:\/\/litigation\/73223872\) and \[litigation\/1\]\(rt:\/\/litigation\/1\), \[olc\/2\]\(rt:\/\/olc\/2\)\./)
  assert.match(out, /See also \[olc\/112\]\(rt:\/\/olc\/112\)\. The 1941 opinion, \[Presidential Control\]\(rt:\/\/olc\/1425\), and \[rt:\/\/olc\/2100\]\(rt:\/\/olc\/2100\) stand\./)
  assert.equal(citationsIn(out).length, 9)
  assert.equal(linkifyCitations('nothing to do [here](https://x.y) or here'), 'nothing to do [here](https://x.y) or here')
})

test('prose with fewer than two items is not a list: no cards, the whole text is the lead', () => {
  const r = splitListAnswer('Only one thing to say: [X](rt://olc/1) covers it.\n\n- a lone bullet')
  assert.equal(r.cards.length, 0)
  assert.match(r.lead, /^Only one thing/)
})

test('citations are read through the one resolver; the first number ignores ids', () => {
  const c = citationsIn('see [A](rt://olc/867) and [B](rt://congress:hearings/CHRG-1) and [not one](https://x.y/z)')
  assert.deepEqual(c.map((x) => [x.slug, x.id, x.path]), [['olc', '867', '/corpus/olc/867'], ['congress:hearings', 'CHRG-1', '/corpus/congress:hearings/CHRG-1']])
  assert.equal(firstCitation('nothing here'), null)
  assert.equal(firstNumber('There are 1,204 orders since [EO 14000](rt://presidential/13087).'), '1,204')
  assert.equal(firstNumber('Fourteen orders, per [the list](rt://presidential/13087).'), null)
  assert.equal(firstNumber('About 14 orders cite it.'), '14')
})

test('cents read with one decimal and never dollars; seconds round', () => {
  assert.equal(cents(10.28), '10.3¢')
  assert.equal(cents(0.9458), '0.9¢')
  assert.equal(cents(4), '4¢')
  assert.equal(cents(0.02), '<0.1¢')
  assert.equal(cents(0), '0¢')
  assert.equal(seconds(31900), '32 s')
  assert.equal(seconds(800), '0.8 s')
})

test('a brief normalizes, pins the empty-state corpora first, and knows when it changed', () => {
  const b = normalizeBrief({ goal: ' Find them ', corpora: ['olc', 'olc', ' presidential '], answer_shape: ' a list ', constraints: [' 2025 ', ''] })
  assert.deepEqual(b, { goal: 'Find them', corpora: ['olc', 'presidential'], answer_shape: 'a list', constraints: ['2025'] })
  assert.deepEqual(mergePinnedCorpora(b, ['usc', 'olc']).corpora, ['usc', 'olc', 'presidential'])
  assert.equal(sameBrief(b, { ...b, constraints: ['2025'] }), true)
  assert.equal(sameBrief(b, { ...b, goal: 'Find those' }), false)
  assert.match(briefJson(b), /"goal": "Find them"/)
  assert.deepEqual(moveCorpus(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b'])
  assert.deepEqual(moveCorpus(['a', 'b', 'c'], 0, 5), ['a', 'b', 'c'])
})
