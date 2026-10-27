import { test } from 'vitest'
import assert from 'node:assert/strict'

import { selectedFirst } from './court-order.ts'

// UI/UX live doc, 2026-10-27: filtering by district or circuit court should put the
// selected courts at the top and the deselected at the bottom.

const COURTS = ['ca1', 'ca2', 'dcd', 'nysd', 'cand']

test('selected courts come first, each group in facet order', () => {
  assert.deepEqual(selectedFirst(COURTS, new Set(['nysd', 'ca2'])), [
    'ca2',
    'nysd',
    'ca1',
    'dcd',
    'cand',
  ])
})

test('all or none selected leaves the facet order alone', () => {
  assert.deepEqual(selectedFirst(COURTS, new Set(COURTS)), COURTS)
  assert.deepEqual(selectedFirst(COURTS, new Set()), COURTS)
})
