import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

const encrypted = new Map<string, string>()
const legacy = new Map<string, string>()
let failWrites = false
mock.module('@capacitor/core', { namedExports: { Capacitor: { getPlatform: () => 'android' }, registerPlugin: () => ({
  get: async ({ key }: { key: string }) => ({ value: encrypted.get(key) ?? null }),
  set: async ({ key, value }: { key: string; value: string }) => { if (failWrites) throw new Error('disk full'); encrypted.set(key, value) },
  remove: async ({ key }: { key: string }) => { encrypted.delete(key) },
}) } })
const { privateStorage, preparePrivateStorage, flushPrivateStorage, clearPrivateCache, forgetPrivateMemory } = await import('./privateStorage.ts')
beforeEach(async () => {
  failWrites = false
  await flushPrivateStorage()
  forgetPrivateMemory(); encrypted.clear(); legacy.clear()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => legacy.get(key) ?? null, removeItem: (key: string) => { legacy.delete(key) },
  } })
})
test('Android migrates plaintext only after a successful vault write and isolates accounts', async () => {
  const key = 'miser-finance-cache-alice'
  legacy.set(key, 'recovery')
  await preparePrivateStorage('alice')
  assert.equal(encrypted.get(key), 'recovery')
  assert.equal(legacy.has(key), false)
  assert.equal(privateStorage.getItem(key), 'recovery')
  await preparePrivateStorage('bob')
  assert.equal(privateStorage.getItem('miser-finance-cache-bob'), null)
  forgetPrivateMemory()
  await preparePrivateStorage('alice')
  assert.equal(privateStorage.getItem(key), 'recovery')
})
test('failed migration keeps the plaintext; conflicting pending copies are never overwritten', async () => {
  const key = 'miser-pending-alice'
  legacy.set(key, 'pending')
  failWrites = true
  await assert.rejects(preparePrivateStorage('alice'))
  assert.equal(legacy.get(key), 'pending')
  failWrites = false
  encrypted.set(key, 'different pending')
  await assert.rejects(preparePrivateStorage('alice'), /dos copias/)
  assert.equal(legacy.get(key), 'pending')
  assert.equal(encrypted.get(key), 'different pending')
})
test('pending writes are durable before cloud sync and prevent clearing recovery', async () => {
  const key = 'miser-pending-alice'
  privateStorage.setItem(key, 'pending')
  await flushPrivateStorage()
  assert.equal(encrypted.get(key), 'pending')
  await assert.rejects(clearPrivateCache('alice'), /pendientes/)
  privateStorage.removeItem(key)
  privateStorage.setItem('miser-finance-cache-alice', 'cache')
  await flushPrivateStorage()
  await clearPrivateCache('alice')
  assert.equal(encrypted.size, 0)
})

test('a failed encrypted write can be retried without replacing its pending data', async () => {
  const key = 'miser-pending-alice'
  failWrites = true
  privateStorage.setItem(key, 'unsent changes')
  await assert.rejects(flushPrivateStorage(), /recuperación cifrada/)
  assert.equal(privateStorage.getItem(key), 'unsent changes')
  assert.equal(encrypted.has(key), false)
  failWrites = false
  await flushPrivateStorage()
  assert.equal(encrypted.get(key), 'unsent changes')
})
