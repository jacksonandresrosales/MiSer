import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { readFinanceCache, readPendingChanges, writeFinanceCache, type PendingChange } from './financeCache.ts'
import { emptyData, flattenData, recordKey, type FinanceRecord } from './financeData.ts'
import type { FinanceData } from './types.ts'

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const stored = new Map<string, string>()
const storage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value) },
}
beforeEach(() => {
  stored.clear()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
})
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

const data: FinanceData = {
  transactions: [{ id: 'income / ñ', title: 'Salario', type: 'income', amount: 0.1, category: 'Trabajo', date: '2026-10-03', note: '' }],
  events: [{ id: 'event', title: 'Pago', kind: 'payment', amount: 20, date: '2026-10-04', remind: true, time: '09:00', category: 'personal' }],
  goals: [{ id: 'goal', title: 'Leer', completed: false }, { id: 'legacy', title: 'Ahorrar', current: 2, target: 10, unit: '$' }],
  lists: [{ id: 'list', title: 'Compras', store: '', items: [{ id: 'item', name: 'Pan', done: false, quantity: 'x2', imageUrl: 'data:image/jpeg;base64,YWJj', purchaseLinks: ['https://example.com'] }] }],
  budgets: [{ month: '2026-10', totalLimit: 100, categoryLimits: { Comida: 50 } }],
}
const profile = { displayName: 'André Rosales', photoURL: 'https://example.com/photo.jpg' }
const cacheKey = 'miser-finance-cache-alice'
const pendingKey = 'miser-pending-alice'
function snapshot() {
  const records = flattenData(data)
  const versions = new Map([...records.keys()].map(key => [key, 3]))
  versions.set('transaction_deleted', 7)
  return { records, versions, profile }
}
function changes(): PendingChange[] {
  return [...snapshot().records].map(([key, record]) => [key, record, 3] as PendingChange).concat([['transaction_deleted', null, 7]])
}

test('cache and recovery reject invalid calendar dates rather than crashing the UI', () => {
  for (const date of ['not-a-date', '2026-02-30', '2026-13-01']) {
    const invalid = snapshot()
    invalid.records.get(recordKey('transaction', data.transactions[0].id))!.value.date = date
    assert.equal(writeFinanceCache('alice', invalid), false)
    stored.set(pendingKey, JSON.stringify({ changes: [[...invalid.records][0][0], [...invalid.records][0][1], 3] }))
    // A pending envelope must contain tuples, not a flattened tuple.
    assert.deepEqual(readPendingChanges('alice'), [])
    stored.set(pendingKey, JSON.stringify({ changes: [[[...invalid.records][0][0], [...invalid.records][0][1], 3]] }))
    assert.deepEqual(readPendingChanges('alice'), [])
  }
})

test('cache roundtrip preserves every record kind, profile, positions and tombstone versions', () => {
  const input = snapshot()
  assert.equal(writeFinanceCache('alice', input), true)
  const restored = readFinanceCache('alice')!
  assert.deepEqual(restored.data, data)
  assert.deepEqual(restored.records, input.records)
  assert.deepEqual(restored.versions, input.versions)
  assert.deepEqual(restored.profile, profile)
  assert.equal(new Date(restored.cachedAt).toISOString(), restored.cachedAt)
  assert.equal(restored.versions.get('transaction_deleted'), 7)
  assert.equal(restored.records.has('transaction_deleted'), false)
  restored.records.clear()
  input.versions.clear()
  assert.deepEqual(readFinanceCache('alice')!.data, data)
  assert.equal(readFinanceCache('alice')!.versions.get('transaction_deleted'), 7)
  const serialized = JSON.parse(stored.get(cacheKey)!)
  assert.deepEqual(Object.keys(serialized).sort(), ['cachedAt', 'profile', 'records', 'schemaVersion', 'uid', 'versions'])
  assert.ok(Array.isArray(serialized.records) && Array.isArray(serialized.versions))
  assert.equal(Object.hasOwn(serialized, 'data'), false)
})

test('cache isolates uids and checks the stored owner; missing cache returns null', () => {
  assert.equal(readFinanceCache('alice'), null)
  assert.equal(writeFinanceCache('alice', snapshot()), true)
  assert.equal(readFinanceCache('bob'), null)
  stored.set('miser-finance-cache-bob', stored.get(cacheKey)!)
  assert.equal(readFinanceCache('bob'), null)
  assert.equal(writeFinanceCache('bob', { records: new Map(), versions: new Map(), profile: null }), true)
  assert.deepEqual(readFinanceCache('bob')!.data, emptyData())
  assert.deepEqual(readFinanceCache('alice')!.data, data)
  assert.equal(writeFinanceCache('', snapshot()), false)
  assert.equal(readFinanceCache(''), null)
})

test('cache rejects corrupt JSON, partial snapshots, invalid profile, records and versions as a whole', () => {
  writeFinanceCache('alice', snapshot())
  const valid = stored.get(cacheKey)!
  for (const corrupt of ['{', 'null', '[]', '{}']) {
    stored.set(cacheKey, corrupt)
    assert.equal(readFinanceCache('alice'), null)
  }
  for (const field of ['schemaVersion', 'uid', 'cachedAt', 'records', 'versions', 'profile']) {
    const value = JSON.parse(valid)
    delete value[field]
    stored.set(cacheKey, JSON.stringify(value))
    assert.equal(readFinanceCache('alice'), null, field)
  }
  const invalidValues = [
    { schemaVersion: 2 }, { cachedAt: 'invalid' }, { cachedAt: '2026-10-03' },
    { records: {} }, { versions: {} }, { profile: { displayName: 'x', photoURL: '' } },
    { profile: { ...profile, photoURL: 'javascript:alert(1)' } },
    { versions: [] }, { versions: [['transaction_deleted', -1]] },
  ]
  for (const invalid of invalidValues) {
    stored.set(cacheKey, JSON.stringify({ ...JSON.parse(valid), ...invalid }))
    assert.equal(readFinanceCache('alice'), null)
  }
  stored.set(cacheKey, valid)
  const input = snapshot()
  for (const invalidVersion of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '3', null]) {
    input.versions.set('transaction_deleted', invalidVersion as number)
    assert.equal(writeFinanceCache('alice', input), false)
  }
  input.versions.set('transaction_deleted', 7)
  input.versions.delete(recordKey('transaction', 'income / ñ'))
  assert.equal(writeFinanceCache('alice', input), false)
  assert.equal(stored.get(cacheKey), valid)
  for (const entries of [
    [...snapshot().records, [...snapshot().records][0]],
    [['transaction_wrong', [...snapshot().records.values()][0]]],
    [['transaction_%', [...snapshot().records.values()][0]]],
    [['transaction_bad', { kind: 'transaction', value: { id: 'bad', title: 'Mal', amount: '2' } }]],
    [['item_item', snapshot().records.get('item_item')]],
  ]) {
    stored.set(cacheKey, JSON.stringify({ ...JSON.parse(valid), records: entries }))
    assert.equal(readFinanceCache('alice'), null)
  }
  const duplicated = JSON.parse(valid)
  duplicated.versions.push(duplicated.versions[0])
  stored.set(cacheKey, JSON.stringify(duplicated))
  assert.equal(readFinanceCache('alice'), null)
})

test('pending restores sparse patches with original expected versions and deletion tombstones', () => {
  const input = changes()
  stored.set(pendingKey, JSON.stringify({ changes: input }))
  assert.deepEqual(readPendingChanges('alice'), input)
  assert.equal(readFinanceCache('alice'), null)
  const itemChange = input.find(([key]) => key === 'item_item')!
  stored.set(pendingKey, JSON.stringify({ changes: [itemChange] }))
  assert.deepEqual(readPendingChanges('alice'), [itemChange])
  const newRecord = input[0]
  stored.set(pendingKey, JSON.stringify({ changes: [[newRecord[0], newRecord[1], 0]] }))
  assert.equal(readPendingChanges('alice')[0][2], 0)
})

test('pending isolates uids and rejects corrupt envelopes, tuples, duplicates and bad versions atomically', () => {
  assert.deepEqual(readPendingChanges('alice'), [])
  stored.set(pendingKey, JSON.stringify({ changes: changes() }))
  assert.deepEqual(readPendingChanges('bob'), [])
  assert.deepEqual(readPendingChanges(''), [])
  stored.set('miser-pending-bob', JSON.stringify({ uid: 'alice', changes: changes() }))
  assert.deepEqual(readPendingChanges('bob'), [])
  for (const corrupt of ['{', 'null', '[]', '{}', '{"changes":{}}']) {
    stored.set(pendingKey, corrupt)
    assert.deepEqual(readPendingChanges('alice'), [])
  }
  const first = changes()[0]
  for (const invalid of [
    [first[0], first[1]], [...first, 'extra'], [first[0], first[1], -1],
    [first[0], first[1], 0.5], [first[0], first[1], '3'], [first[0], first[1], null],
    [first[0], first[1], Number.MAX_SAFE_INTEGER + 1],
    ['transaction_%', null, 1], ['unknown_deleted', null, 1],
    ['transaction_wrong', first[1], 3], [first[0], { kind: 'unknown', value: {} }, 3],
    [first[0], { ...first[1], value: { ...first[1]!.value, amount: '1' } }, 3],
    [first[0], { ...first[1], value: [] }, 3],
  ]) {
    stored.set(pendingKey, JSON.stringify({ changes: [changes()[1], invalid] }))
    assert.deepEqual(readPendingChanges('alice'), [])
  }
  stored.set(pendingKey, JSON.stringify({ changes: [first, first] }))
  assert.deepEqual(readPendingChanges('alice'), [])
})

test('record validators cover every kind and optional field in both storage paths', () => {
  const invalidRecords: [string, FinanceRecord][] = [
    ['event_event', { kind: 'event', value: { id: 'event', title: 'Evento', date: '2026-10-03', kind: 'event', remind: 'true' } }],
    ['goal_goal', { kind: 'goal', value: { id: 'goal', title: 'Leer', completed: 'false' } }],
    ['list_list', { kind: 'list', value: { id: 'list', title: 'Compras', store: '', items: [], position: 0 } }],
    ['item_item', { kind: 'item', value: { id: 'item', name: 'Pan', listId: 'list', done: false, purchaseLinks: [2] } }],
    ['budget_2026-10', { kind: 'budget', value: { month: '2026-10', totalLimit: 10, categoryLimits: { Comida: '2' } } }],
  ]
  for (const [key, record] of invalidRecords) {
    const input = snapshot()
    input.records.set(key, record)
    assert.equal(writeFinanceCache('alice', input), false, key)
    stored.set(pendingKey, JSON.stringify({ changes: [[key, record, 3]] }))
    assert.deepEqual(readPendingChanges('alice'), [], key)
  }
})

test('quota, denied access and unavailable storage fail safely and preserve the last good snapshot', context => {
  assert.equal(writeFinanceCache('alice', snapshot()), true)
  const previous = stored.get(cacheKey)
  context.mock.method(storage, 'setItem', () => { throw new Error('QuotaExceededError') })
  assert.equal(writeFinanceCache('alice', snapshot()), false)
  assert.equal(stored.get(cacheKey), previous)
  assert.deepEqual(readFinanceCache('alice')!.data, data)
  context.mock.method(storage, 'getItem', () => { throw new Error('SecurityError') })
  assert.equal(readFinanceCache('alice'), null)
  assert.deepEqual(readPendingChanges('alice'), [])
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError') } })
  assert.equal(writeFinanceCache('alice', snapshot()), false)
  assert.equal(readFinanceCache('alice'), null)
  assert.deepEqual(readPendingChanges('alice'), [])
  Reflect.deleteProperty(globalThis, 'localStorage')
  assert.equal(writeFinanceCache('alice', snapshot()), false)
  assert.equal(readFinanceCache('alice'), null)
  assert.deepEqual(readPendingChanges('alice'), [])
})
