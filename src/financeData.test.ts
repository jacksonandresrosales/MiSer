import assert from 'node:assert/strict'
import test from 'node:test'
import { changedRecords, flattenData, goalCompleted, inflateRecords, money, parseCategoryLimits, sumMoney } from './financeData.ts'
import type { FinanceData } from './types.ts'

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

test('new goals use a check while legacy goals keep their completed state', () => {
  assert.equal(goalCompleted({ id: 'new', title: 'Mejorar mi físico', completed: false }), false)
  assert.equal(goalCompleted({ id: 'old', title: 'Leer', current: 12, target: 12 }), true)
  assert.equal(goalCompleted({ id: 'old', title: 'Leer', current: 12, target: 12, completed: false }), false)
})
