import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import * as lite from 'firebase/firestore/lite'
import { loadFinanceData, saveFinanceRecord } from '../src/financeStore.ts'

let environment
const projectId = 'demo-miser'
const movement = { kind: 'transaction', value: { id: 'one', title: 'Salario', type: 'income', amount: 110, category: 'Trabajo', date: '2026-10-03' }, version: 1 }
const account = (uid = 'alice', verified = true) => environment.authenticatedContext(uid, { email_verified: verified }).firestore()
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Ejecuta con el emulador, nunca contra Firebase de producción.')
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } })
})
beforeEach(async () => { await environment.clearFirestore() })
after(async () => { await environment?.cleanup() })
function write(db, value = movement, key = 'transaction_one', uid = 'alice') {
  const batch = writeBatch(db)
  batch.set(doc(db, 'finance_data', uid), { schemaVersion: 2, syncProtocol: 1, updatedAt: serverTimestamp() }, { merge: true })
  batch.set(doc(db, 'finance_data', uid, 'records', key), { ...value, updatedAt: serverTimestamp() })
  return batch.commit()
}

test('verified owner may write and read; anonymous, unverified and other accounts cannot', async () => {
  await assertSucceeds(write(account()))
  await assertSucceeds(getDoc(doc(account(), 'finance_data/alice/records/transaction_one')))
  for (const db of [environment.unauthenticatedContext().firestore(), account('alice', false), account('bob')]) {
    await assertFails(getDoc(doc(db, 'finance_data/alice/records/transaction_one')))
    await assertFails(write(db))
  }
})
test('schema rejects incorrect amount, unknown fields, oversized text and timestamp bypass', async () => {
  for (const patch of [{ amount: '110' }, { amount: -1 }, { amount: NaN }, { amount: Infinity }, { date: 'yesterday' }, { date: '2026-02-30' }, { date: '2026-04-31' }, { title: 'x'.repeat(201) }, { admin: true }]) {
    await assertFails(write(account(), { ...movement, value: { ...movement.value, ...patch } }))
  }
  await assertFails(write(account(), { ...movement, version: 2 }))
  await assertFails(setDoc(doc(account(), 'finance_data/alice/records/transaction_one'), movement))
})
test('versions advance exactly once and deletion is a versioned tombstone', async () => {
  const db = account()
  await assertSucceeds(write(db))
  await assertFails(write(db))
  await assertFails(write(db, { ...movement, version: 3 }))
  await assertSucceeds(write(db, { deleted: true, version: 2 }))
  await assertFails(deleteDoc(doc(db, 'finance_data/alice/records/transaction_one')))
  await assertSucceeds(write(db, { ...movement, version: 3 }))
})
test('profile changes preserve legacy backup and cannot alter arbitrary root fields', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'finance_data/alice'), { schemaVersion: 1, data: { backup: true } })
  })
  const db = account()
  await assertSucceeds(setDoc(doc(db, 'finance_data/alice'), { profile: { displayName: 'André Rosales', photoURL: '' } }, { merge: true }))
  await assertSucceeds(write(db))
  await assertFails(setDoc(doc(db, 'finance_data/alice'), { data: {} }, { merge: true }))
  await assertFails(setDoc(doc(db, 'finance_data/alice'), { profile: { displayName: 'x', photoURL: '' } }, { merge: true }))
  await assertFails(setDoc(doc(db, 'finance_data/alice'), { profile: { displayName: 'André', photoURL: 'javascript:alert(1)' } }, { merge: true }))
})
test('every record kind and bounded dynamic category limits are validated', async () => {
  const db = account()
  for (const [kind, value, key] of [
    ['event', { id: 'event', title: 'Pago', kind: 'payment', date: '2026-10-04', remind: true, amount: 10, time: '09:00' }, 'event_event'],
    ['goal', { id: 'goal', title: 'Leer', completed: false }, 'goal_goal'],
    ['list', { id: 'list', title: 'Compras', store: '', position: 0 }, 'list_list'],
    ['item', { id: 'item', name: 'Pan', listId: 'list', done: false, purchaseLinks: ['https://example.com'] }, 'item_item'],
    ['budget', { month: '2026-10', totalLimit: 100, categoryLimits: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Categoría ${i}`, i + 0.1])) }, 'budget_2026-10'],
  ]) await assertSucceeds(write(db, { kind, value, version: 1 }, key)).catch(error => { error.message = `${kind}: ${error.message}`; throw error })
  await assertFails(write(db, { kind: 'budget', value: { month: '2026-11', totalLimit: 100, categoryLimits: { Comida: '10' } }, version: 1 }, 'budget_2026-11'))
  await assertFails(write(db, { kind: 'item', value: { id: 'bad', name: 'Pan', listId: 'list', done: false, purchaseLinks: [true] }, version: 1 }, 'item_bad'))
})
test('media is private and allows only bounded JPEG images with server timestamps', async () => {
  const db = account()
  const path = `finance_data/alice/media/${'a'.repeat(64)}`
  await assertSucceeds(setDoc(doc(db, path), { imageUrl: 'data:image/jpeg;base64,YWJj', updatedAt: serverTimestamp() }))
  await assertFails(getDoc(doc(account('bob'), path)))
  await assertFails(setDoc(doc(db, path), { imageUrl: 'javascript:alert(1)', updatedAt: serverTimestamp() }))
})

test('the actual Lite client saves photos, detects conflicts and merges incremental tombstones', async () => {
  const app = initializeApp({ projectId, apiKey: 'demo' }, 'lite-integration')
  const db = lite.getFirestore(app)
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  lite.connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: 'alice', email_verified: true } })
  try {
    const record = { kind: movement.kind, value: movement.value }
    await saveFinanceRecord(db, 'alice', 'transaction_one', record, 0)
    await saveFinanceRecord(db, 'alice', 'list_list', { kind: 'list', value: { id: 'list', title: 'Compras', store: '', position: 0 } }, 0)
    const photo = await saveFinanceRecord(db, 'alice', 'item_item', { kind: 'item', value: { id: 'item', name: 'Pan', listId: 'list', done: false, imageUrl: 'data:image/jpeg;base64,YWJj' } }, 0)
    assert.match(photo.record.value.imageUrl, /^miser-media:[a-f0-9]{64}$/)
    const media = await lite.getDoc(lite.doc(db, 'finance_data/alice/media', photo.record.value.imageUrl.slice(12)))
    assert.equal(media.data().imageUrl, 'data:image/jpeg;base64,YWJj')
    const initial = await loadFinanceData(db, 'alice')
    assert.equal(initial.data.transactions[0].amount, 110)
    await assert.rejects(saveFinanceRecord(db, 'alice', 'transaction_one', record, 0), /conflict/)
    await saveFinanceRecord(db, 'alice', 'transaction_one', null, 1)
    const merged = await loadFinanceData(db, 'alice', { ...initial, cachedAt: new Date().toISOString() }, true)
    assert.equal(merged.data.transactions.length, 0)
    assert.equal(merged.data.lists.length, 1)
    assert.equal(merged.versions.get('transaction_one'), 2)
    assert.equal(initial.data.transactions.length, 1)
  } finally { await deleteApp(app) }
})
