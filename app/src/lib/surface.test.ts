import { test } from 'vitest'
import assert from 'node:assert/strict'

import { surfaceOf } from './surface.ts'

test('the hub, the explorer, collections and the demo are named', () => {
  assert.equal(surfaceOf('/'), 'hub')
  assert.equal(surfaceOf(''), 'hub')
  assert.equal(surfaceOf('/explorer'), 'explorer')
  assert.equal(surfaceOf('/explorer/'), 'explorer')
  assert.equal(surfaceOf('/collections/habeas-2026'), 'collections')
  assert.equal(surfaceOf('/demo/deck'), 'demo')
  assert.equal(surfaceOf('/present/'), 'present')
})

test('a spoke is its slug, with a collection qualifier kept', () => {
  assert.equal(surfaceOf('/corpus/usc'), 'usc')
  assert.equal(surfaceOf('/corpus/usc/42-1983'), 'usc')
  assert.equal(surfaceOf('/corpus/congress:laws/9246'), 'congress:laws')
  assert.equal(surfaceOf('/corpus/litigation?q=habeas#top'), 'litigation')
})

test('a page with no corpus of its own is the site', () => {
  assert.equal(surfaceOf('/privacy'), 'site')
  assert.equal(surfaceOf('/no-such-page'), 'site')
  assert.equal(surfaceOf('/corpus/'), 'site')
})
