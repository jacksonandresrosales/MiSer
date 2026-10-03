import assert from 'node:assert/strict'
import test from 'node:test'
import { backDestination } from './mobileNavigation.ts'

test('Android back dismisses the active layer before navigating or exiting', () => {
  assert.equal(backDestination({ modal: true, page: 'calendar' }), 'modal')
  assert.equal(backDestination({ modal: false, page: 'settings' }), 'overview')
  assert.equal(backDestination({ modal: false, page: 'calendar' }), 'overview')
  assert.equal(backDestination({ modal: false, page: 'overview' }), 'exit')
})
