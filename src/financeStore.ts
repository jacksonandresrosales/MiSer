import { collection, doc, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore'
import { changedRecords, flattenData, inflateRecords, type FinanceRecord, type RecordMap } from './financeData'
import type { FinanceData } from './types'

const recordsPath = (db: Firestore, uid: string) => collection(db, 'finance_data', uid, 'records')

export async function loadFinanceData(db: Firestore, uid: string): Promise<{ data: FinanceData; records: RecordMap; versions: Map<string, number> }> {
  const root = doc(db, 'finance_data', uid)
  const [legacy, snapshot] = await Promise.all([getDocFromServer(root), getDocsFromServer(recordsPath(db, uid))])
  if (legacy.data()?.data && legacy.data()?.schemaVersion !== 2) {
    const old = flattenData(legacy.data()!.data as FinanceData)
    const existing = new Set(snapshot.docs.map(entry => entry.id))
    const missing = [...old].filter(([key]) => !existing.has(key))
    for (let start = 0; start < missing.length; start += 400) {
      const batch = writeBatch(db)
      for (const [key, record] of missing.slice(start, start + 400)) batch.set(doc(recordsPath(db, uid), key), { ...record, version: 1 })
      await batch.commit()
    }
    await runTransaction(db, async transaction => {
      const current = await transaction.get(root)
      if (current.data()?.schemaVersion !== 2) transaction.set(root, { schemaVersion: 2, migratedAt: serverTimestamp() }, { merge: true })
    })
    return loadFinanceData(db, uid)
  }
  const records: RecordMap = new Map()
  const versions = new Map<string, number>()
  for (const entry of snapshot.docs) {
    const value = entry.data() as FinanceRecord & { version?: number; deleted?: boolean }
    versions.set(entry.id, value.version ?? 0)
    if (!value.deleted) records.set(entry.id, { kind: value.kind, value: value.value })
  }
  return { data: inflateRecords(records), records, versions }
}

export async function saveFinanceRecord(db: Firestore, uid: string, key: string, record: FinanceRecord | null, expectedVersion: number): Promise<number> {
  const reference = doc(recordsPath(db, uid), key)
  return runTransaction(db, async transaction => {
    const current = await transaction.get(reference)
    if ((current.data()?.version ?? 0) !== expectedVersion) throw new Error('conflict')
    const version = expectedVersion + 1
    transaction.set(reference, record ? { ...record, version } : { deleted: true, version })
    return version
  })
}

export { changedRecords, flattenData }
