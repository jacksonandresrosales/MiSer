import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { emptyData, flattenData, inflateRecords, summarizeBalance } from './financeData.ts'

class Stamp {
  seconds: number
  nanoseconds: number
  constructor(seconds: number, nanoseconds: number) { this.seconds = seconds; this.nanoseconds = nanoseconds }
}
let documents = new Map<string, Record<string, unknown>>()
let metadata: Record<string, unknown> = {}
let reads: unknown[][] = []
let denyMedia = false
mock.module('firebase/firestore/lite', { namedExports: {
  Timestamp: Stamp,
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  doc: (...parts: unknown[]) => parts.filter(part => typeof part === 'string').join('/'),
  documentId: () => 'id', limit: (count: number) => ({ count }), orderBy: (field: string) => ({ order: field }),
  where: (field: string, _op: string, value: Stamp) => ({ field, value }), startAfter: (last: { id: string }) => ({ after: last.id }),
  query: (_path: string, ...constraints: unknown[]) => constraints,
  getDoc: async (path: string) => ({ exists: () => path.includes('/records/') ? documents.has(path.split('/').at(-1)!) : true, data: () => path.includes('/records/') ? documents.get(path.split('/').at(-1)!) : metadata }),
  getDocs: async (constraints: { count?: number; after?: string; field?: string; value?: Stamp }[]) => {
    reads.push(constraints)
    const after = constraints.find(value => value.after)?.after
    const since = constraints.find(value => value.field === 'updatedAt')?.value
    const selected = [...documents].sort(([a], [b]) => a.localeCompare(b)).filter(([key, value]) => (!after || key > after)
      && (!since || value.updatedAt instanceof Stamp && value.updatedAt.seconds >= since.seconds)).slice(0, constraints.find(value => value.count)!.count)
    return { size: selected.length, docs: selected.map(([id, value]) => ({ id, data: () => value })) }
  },
  runTransaction: async (_db: unknown, callback: (txn: unknown) => Promise<unknown>) => callback({
    get: async (path: string) => ({ exists: () => documents.has(path.split('/').at(-1)!), data: () => documents.get(path.split('/').at(-1)!) }),
    set: (path: string, value: Record<string, unknown>) => {
      if (denyMedia && path.includes('/media/')) throw Object.assign(new Error('denied'), { code: 'permission-denied' })
      if (path.includes('/records/')) documents.set(path.split('/').at(-1)!, value)
    },
  }),
  serverTimestamp: () => new Stamp(20, 0), setDoc: async () => {}, writeBatch: () => ({ set() {}, commit: async () => {} }),
} })
const { loadFinanceData, saveFinanceRecord } = await import('./financeStore.ts')
const db = {} as Parameters<typeof loadFinanceData>[0]
const sample = (id: string, amount = 1) => ({ kind: 'transaction', value: { id, title: 'Movimiento', type: 'income', category: 'Trabajo', amount, date: '2026-10-03' }, version: 1, updatedAt: new Stamp(10, 0) })
beforeEach(() => { documents = new Map(); metadata = { schemaVersion: 2, syncProtocol: 1, updatedAt: new Stamp(10, 0) }; reads = []; denyMedia = false })
test('full load is paginated but balance still includes all 501 historical transactions', async () => {
  for (let i = 0; i < 501; i++) { const id = String(i).padStart(4, '0'); documents.set(`transaction_${id}`, sample(id)) }
  const result = await loadFinanceData(db, 'alice')
  assert.equal(reads.length, 3)
  assert.equal(result.records.size, 501)
  assert.equal(summarizeBalance(result.data.transactions, '2026-10-03').balance, 501)
})
test('delta merge retains old balance, includes timestamp boundary and applies deletion versions', async () => {
  const records = flattenData({ ...emptyData(), transactions: [sample('old', 100).value as never, sample('deleted', 10).value as never] })
  const cache = { records, versions: new Map([['transaction_old', 1], ['transaction_deleted', 1]]), profile: null, data: inflateRecords(records), cachedAt: new Date().toISOString(), syncCursor: { seconds: 10, nanoseconds: 0 } }
  documents.set('transaction_new', sample('new', 5))
  documents.set('transaction_deleted', { deleted: true, version: 2, updatedAt: new Stamp(10, 0) })
  const result = await loadFinanceData(db, 'alice', cache, true)
  assert.equal(summarizeBalance(result.data.transactions, '2026-10-03').balance, 105)
  assert.equal(result.versions.get('transaction_deleted'), 2)
  assert.equal(cache.records.size, 2)
})
test('bad cloud data and optimistic conflicts cannot silently overwrite records', async () => {
  documents.set('transaction_bad', { ...sample('bad'), value: { ...sample('bad').value, amount: '1' } })
  await assert.rejects(loadFinanceData(db, 'alice'), /invalid-data/)
  documents.clear(); documents.set('transaction_one', sample('one'))
  const record = { kind: 'transaction' as const, value: { ...sample('one').value, amount: 2 } }
  await assert.rejects(saveFinanceRecord(db, 'alice', 'transaction_one', record, 0), /conflict/)
  const saved = await saveFinanceRecord(db, 'alice', 'transaction_one', record, 1)
  assert.equal(saved.version, 2)
  assert.equal(documents.get('transaction_one')!.value, record.value)
})

test('old rules without media keep inline photos, while conflicts still reject the write', async () => {
  denyMedia = true
  const record = { kind: 'item' as const, value: { id: 'photo', listId: 'list', name: 'Foto', done: false, imageUrl: 'data:image/jpeg;base64,YWJj' } }
  const saved = await saveFinanceRecord(db, 'alice', 'item_photo', record, 0)
  assert.equal(saved.version, 1)
  assert.equal(saved.record?.value.imageUrl, record.value.imageUrl)
  await assert.rejects(saveFinanceRecord(db, 'alice', 'item_photo', record, 0), /conflict/)
})
