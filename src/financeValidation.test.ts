import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCloudRecord, validKey, validRecord } from './financeValidation.ts'
import { separateRecordImage, mediaId } from './financeMedia.ts'
import { shouldCheckUpdate, UPDATE_CHECK_INTERVAL_MS } from './updateCooldown.ts'

const record = { kind: 'transaction' as const, value: { id: 'one', title: 'Salario', type: 'income', amount: 100, category: 'Trabajo', date: '2026-10-03' } }
test('cloud boundary rejects malformed records before rendering and retains tombstones', () => {
  assert.deepEqual(parseCloudRecord('transaction_one', { ...record, version: 1 }), { record, version: 1 })
  assert.deepEqual(parseCloudRecord('transaction_one', { deleted: true, version: 2 }), { record: null, version: 2 })
  for (const entry of [null, {}, { ...record, version: '1' }, { ...record, version: 1, extra: true }, { ...record, version: 1, value: { ...record.value, date: '2026-02-30' } }]) {
    assert.throws(() => parseCloudRecord('transaction_one', entry), /invalid-data/)
  }
  assert.equal(validKey('transaction_%'), false)
  assert.equal(validRecord('transaction_one', { ...record, value: { ...record.value, amount: Infinity } }), false)
})
test('automatic update checks have a cooldown; manual requests and clock rollback bypass it', () => {
  assert.equal(shouldCheckUpdate(false, null, 0), true)
  assert.equal(shouldCheckUpdate(false, 0, 1000), false)
  assert.equal(shouldCheckUpdate(false, 0, UPDATE_CHECK_INTERVAL_MS), true)
  assert.equal(shouldCheckUpdate(true, 0, 1000), true)
  assert.equal(shouldCheckUpdate(false, 1000, 0), true)
})
test('inline shopping photos become stable content-addressed references without mutating input', async () => {
  const original = { kind: 'item' as const, value: { id: 'one', name: 'Pan', listId: 'list', done: false, imageUrl: 'data:image/jpeg;base64,YWJj' } }
  const separated = await separateRecordImage(original)
  assert.equal(mediaId(separated.record?.value.imageUrl), separated.media?.id)
  assert.equal(validRecord('item_one', separated.record), true)
  assert.equal(original.value.imageUrl, 'data:image/jpeg;base64,YWJj')
  assert.deepEqual(await separateRecordImage(original), separated)
  assert.equal((await separateRecordImage(separated.record)).media, null)
  assert.equal(mediaId('miser-media:wrong'), null)
})
