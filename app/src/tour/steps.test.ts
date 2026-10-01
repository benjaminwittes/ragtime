import { test } from 'vitest'
import assert from 'node:assert/strict'

import { GAP, MARGIN, STEPS, TOUR, inView, isTall, placeCard, tourRequested, withoutTour } from './steps.ts'

const DESK = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const CARD = { width: 352, height: 180 }

/** Every word a reader can be shown by a step. */
const wordsOf = (step: (typeof STEPS)[number]) => [step.title, ...step.body, step.link?.label ?? ''].join(' ')

test('a link can ask for the tour, and anything but 0 is asking', () => {
  assert.equal(tourRequested('?tour=1'), true)
  assert.equal(tourRequested('?tour'), true)
  assert.equal(tourRequested('?q=habeas&tour=start'), true)
  assert.equal(tourRequested('?tour=0'), false)
  assert.equal(tourRequested('?q=tour'), false)
  assert.equal(tourRequested(''), false)
})

test('ending the tour takes the request out of the address and leaves the rest', () => {
  assert.equal(withoutTour('?tour=1'), '')
  assert.equal(withoutTour('?q=habeas&tour=1'), '?q=habeas')
  assert.equal(withoutTour('?q=habeas'), '?q=habeas')
  assert.equal(withoutTour(''), '')
})

test('every step has a name of its own, a title and something to say', () => {
  const ids = STEPS.map((step) => step.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const step of STEPS) {
    assert.ok(step.title.trim(), `${step.id}: no title`)
    assert.ok(step.body.length >= 1 && step.body.length <= 2, `${step.id}: one or two sentences`)
    for (const line of step.body) assert.ok(line.trim(), `${step.id}: an empty line`)
  }
})

test('the tour opens with what this is and closes with where else to use it', () => {
  assert.equal(STEPS[0].id, 'welcome')
  assert.equal(STEPS[0].target, undefined)
  const last = STEPS[STEPS.length - 1]
  assert.equal(last.id, 'claude')
  assert.deepEqual(last.link, { label: 'How to connect', docs: 'connecting-claude' })
})

test('the hub steps name the hub, so the tour can start from any page', () => {
  for (const id of ['search', 'modes', 'collections']) {
    assert.equal(STEPS.find((step) => step.id === id)?.route, '/', id)
  }
  // The site bar is on every route; a step about it must not move the reader.
  for (const id of ['access', 'docs', 'feedback']) {
    const step = STEPS.find((s) => s.id === id)
    assert.equal(step?.route, undefined, id)
    assert.ok(step?.target, id)
  }
})

test('no step types a figure: a count is read from the worker or not stated', () => {
  for (const step of STEPS) assert.equal(/\d/.test(wordsOf(step)), false, `${step.id}: ${wordsOf(step)}`)
})

test('the tour says collection, and never the word the reader has not met', () => {
  for (const step of STEPS) assert.equal(/\bcorp(us|ora)\b/i.test(wordsOf(step)), false, step.id)
})

test('the counter counts from one', () => {
  assert.equal(TOUR.position(1, STEPS.length), `1 of ${STEPS.length}`)
})

test('with nothing to point at, the card is in the middle', () => {
  assert.deepEqual(placeCard(null, CARD, DESK), { top: 360, left: 544 })
})

test('the card goes under its target when there is room', () => {
  const box = { top: 540, left: 336, width: 768, height: 62 }
  assert.deepEqual(placeCard(box, CARD, DESK), { top: 540 + 62 + GAP, left: 336 })
})

test('and above it when there is not', () => {
  const box = { top: 760, left: 100, width: 300, height: 62 }
  assert.deepEqual(placeCard(box, CARD, DESK), { top: 760 - GAP - CARD.height, left: 100 })
})

test('a target taller than the window puts the card at the foot of the window', () => {
  const box = { top: 24, left: 24, width: 342, height: 2400 }
  assert.deepEqual(placeCard(box, CARD, PHONE), { top: PHONE.height - CARD.height - MARGIN, left: 24 })
})

test('a control at the right of the bar pushes the card back inside the window', () => {
  const box = { top: 14, left: 1068, width: 84, height: 28 }
  const at = placeCard(box, CARD, DESK)
  assert.equal(at.left, 1068)
  const onPhone = placeCard({ top: 14, left: 306, width: 70, height: 28 }, CARD, PHONE)
  assert.equal(onPhone.left, PHONE.width - CARD.width - MARGIN)
  assert.ok(onPhone.left >= MARGIN)
})

test('a card wider or taller than the window is held at the margin, not off the far edge', () => {
  const at = placeCard(null, { width: 500, height: 1000 }, PHONE)
  assert.deepEqual(at, { top: MARGIN, left: MARGIN })
})

test('a control is in view when all of it is; a tall thing when its top is near the top', () => {
  assert.equal(inView({ top: 14, left: 0, width: 80, height: 28 }, DESK), true)
  assert.equal(inView({ top: -40, left: 0, width: 80, height: 28 }, DESK), false)
  assert.equal(inView({ top: 880, left: 0, width: 80, height: 28 }, DESK), false)
  const ledger = { top: 24, left: 0, width: 1000, height: 1600 }
  assert.equal(isTall(ledger, DESK), true)
  assert.equal(inView(ledger, DESK), true)
  assert.equal(inView({ ...ledger, top: 700 }, DESK), false)
  assert.equal(inView({ ...ledger, top: -300 }, DESK), false)
})
