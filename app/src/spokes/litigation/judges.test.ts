import { test } from 'vitest'
import assert from 'node:assert/strict'

import { judgeField, judgeLabel, splitJudges } from './judges.ts'

// Site feedback, 2026-10-01: "allow people to filter on more than one judge at a time".
// CourtListener has no judge pick-list, so the Judge field is a text box; several names
// go in separated by commas or semicolons.

test('one name is one name', () => {
  assert.deepEqual(splitJudges('Boasberg'), ['Boasberg'])
  assert.deepEqual(splitJudges('  James E. Boasberg  '), ['James E. Boasberg'])
})

test('commas and semicolons separate names; blanks and repeats fall out', () => {
  assert.deepEqual(splitJudges('Boasberg, Chutkan; Howell'), ['Boasberg', 'Chutkan', 'Howell'])
  assert.deepEqual(splitJudges('Boasberg,, Boasberg ;'), ['Boasberg'])
  assert.deepEqual(splitJudges(''), [])
  assert.deepEqual(splitJudges(' , ; '), [])
})

test('the wire field is a string for one judge (as the worker always took) and a list for several', () => {
  assert.deepEqual(judgeField('Boasberg'), { judge: 'Boasberg' })
  assert.deepEqual(judgeField('Boasberg, Chutkan'), { judge: ['Boasberg', 'Chutkan'] })
  assert.deepEqual(judgeField('  '), {})
})

test('the page label names every judge, in the order typed', () => {
  assert.equal(judgeLabel('Boasberg'), 'Boasberg')
  assert.equal(judgeLabel(['Boasberg', 'Chutkan']), 'Boasberg, Chutkan')
  assert.equal(judgeLabel(undefined), '')
  assert.equal(judgeLabel([]), '')
})
