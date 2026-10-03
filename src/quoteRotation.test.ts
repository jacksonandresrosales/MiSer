import assert from 'node:assert/strict'
import test from 'node:test'
import { nextLocalQuoteIndex } from './quoteRotation.ts'

test('local quotes rotate through unseen entries and restart without repeating the current one', () => {
  assert.deepEqual(nextLocalQuoteIndex(['a', 'b', 'c'], new Set(['a']), 'a'), { index: 1, reset: false })
  assert.deepEqual(nextLocalQuoteIndex(['a', 'b', 'c'], new Set(['a', 'b', 'c']), 'a'), { index: 1, reset: true })
  assert.deepEqual(nextLocalQuoteIndex(['a'], new Set(['a']), 'a'), { index: 0, reset: true })
  assert.equal(nextLocalQuoteIndex([], new Set(), 'a').index, -1)
})
