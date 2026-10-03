import assert from 'node:assert/strict'
import test from 'node:test'
import { changedRecords, flattenData, goalCompleted, inflateRecords, money, parseCategoryLimits, sumMoney, summarizeBalance } from './financeData.ts'
import type { FinanceData } from './types.ts'
import { parsePreferences, parseProfile, profileInitials, profilePhotoSrc, validateProfile } from './userProfile.ts'

test('records split shopping images from lists and only changed items are written', () => {
  const initial: FinanceData = { transactions: [], events: [], goals: [], budgets: [], lists: [{ id: 'list', title: 'Compras', store: '', items: [{ id: 'item', name: 'Pan', done: false, imageUrl: 'data:image/jpeg;base64,abc' }] }] }
  const before = flattenData(initial)
  const next = structuredClone(initial)
  next.lists[0].items[0].done = true
  assert.deepEqual(changedRecords(before, flattenData(next)).map(([key]) => key), ['item_item'])
  assert.deepEqual(inflateRecords(flattenData(next)), next)
})

test('money and category limits reject malformed values', () => {
  assert.equal(sumMoney([0.1, 0.2]), 0.3)
  assert.equal(money(4.565), 4.57)
  assert.deepEqual(parseCategoryLimits('Comida: 350, Hogar: 10.50'), { Comida: 350, Hogar: 10.5 })
  assert.throws(() => parseCategoryLimits('Comida: hola'))
  assert.throws(() => parseCategoryLimits('Comida: 1, Comida: 2'))
})

test('balance includes previous months, ignores future entries and finds the latest income and expense', () => {
  const transaction = { id: 'past', title: 'Movimiento', category: 'Otro', type: 'income' as const, amount: 100, date: '2026-09-01' }
  const entries = [
    transaction,
    { ...transaction, id: 'small', amount: 0.1, date: '2026-10-01' },
    { ...transaction, id: 'spent', type: 'expense' as const, amount: 20.2, date: '2026-10-02' },
    { ...transaction, id: 'latest', amount: 0.2, date: '2026-10-03' },
    { ...transaction, id: 'future', amount: 500, date: '2026-10-04' },
  ]
  const summary = summarizeBalance(entries, '2026-10-03')
  assert.equal(summary.balance, 80.1)
  assert.equal(summary.latestIncome?.id, 'latest')
  assert.equal(summary.latestExpense?.id, 'spent')
  assert.equal(entries[0].id, 'past')
  assert.deepEqual(summarizeBalance([], '2026-10-03'), { balance: 0, latestIncome: undefined, latestExpense: undefined })
  assert.equal(summarizeBalance([entries[2]], '2026-10-03').balance, -20.2)
  assert.equal(summarizeBalance([transaction], '2026-10-03').latestExpense, undefined)
})

test('new goals use a check while legacy goals keep their completed state', () => {
  assert.equal(goalCompleted({ id: 'new', title: 'Mejorar mi físico', completed: false }), false)
  assert.equal(goalCompleted({ id: 'old', title: 'Leer', current: 12, target: 12 }), true)
  assert.equal(goalCompleted({ id: 'old', title: 'Leer', current: 12, target: 12, completed: false }), false)
})

test('profiles validate names and photos; preferences reject unknown values', () => {
  const profile = { displayName: '  André   Rosales  ', photoURL: 'data:image/jpeg;base64,YWJj' }
  assert.deepEqual(validateProfile(profile), { ...profile, displayName: 'André Rosales' })
  assert.equal(profileInitials('André Rosales'), 'AR')
  assert.equal(profileInitials(''), 'M')
  assert.equal(parseProfile({ displayName: 'Nombre', photoURL: null }), null)
  assert.throws(() => validateProfile({ ...profile, displayName: ' ' }))
  assert.throws(() => validateProfile({ ...profile, displayName: 'a'.repeat(51) }))
  assert.throws(() => validateProfile({ ...profile, displayName: 'Nombre\u202e' }))
  for (const photo of ['javascript:alert(1)', 'data:image/svg+xml;base64,YWJj', 'http://example.com/photo.jpg', 'data:image/jpeg;base64,' + 'a'.repeat(140_000)]) {
    assert.equal(profilePhotoSrc(photo), null)
    assert.throws(() => validateProfile({ ...profile, photoURL: photo }))
  }
  assert.equal(profilePhotoSrc('https://example.com/photo.jpg'), 'https://example.com/photo.jpg')
  assert.deepEqual(parsePreferences({ startPage: 'goals', reducedMotion: true }), { startPage: 'goals', reducedMotion: true })
  assert.deepEqual(parsePreferences({ startPage: 'invalid', reducedMotion: 'true' }), { startPage: 'overview', reducedMotion: false })
  assert.deepEqual(parsePreferences(null), { startPage: 'overview', reducedMotion: false })
})
