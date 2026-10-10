import { test } from 'vitest'
import assert from 'node:assert/strict'

import { beginInteraction, currentInteraction, endInteraction } from './interaction.ts'

test('nothing before the first interaction, then the latest one begun', () => {
  endInteraction()
  assert.equal(currentInteraction(), undefined)
  const first = beginInteraction()
  assert.match(first, /^[0-9a-f-]{36}$/)
  assert.equal(currentInteraction(), first)
  assert.equal(beginInteraction('conv-0001'), 'conv-0001')
  assert.equal(currentInteraction(), 'conv-0001')
  endInteraction()
  assert.equal(currentInteraction(), undefined)
})
