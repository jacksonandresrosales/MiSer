import assert from 'node:assert/strict'
import test from 'node:test'
import { backDestination } from './mobileNavigation.ts'

test('Android back dismisses the active layer before navigating or exiting', () => {
  assert.equal(backDestination({ modal: true, menu: true, page: 'calendar' }), 'modal')
  assert.equal(backDestination({ modal: false, menu: true, page: 'calendar' }), 'menu')
  assert.equal(backDestination({ modal: false, menu: false, page: 'calendar' }), 'overview')
  assert.equal(backDestination({ modal: false, menu: false, page: 'overview' }), 'exit')
})
