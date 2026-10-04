import { collection, doc, documentId, getDoc as getDocFromServer, getDocs as getDocsFromServer, limit, orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, Timestamp, where, writeBatch, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore/lite'
import { changedRecords, flattenData, inflateRecords, type FinanceRecord, type RecordMap } from './financeData.ts'
import type { FinanceData } from './types'
import { parseProfile, validateProfile, type UserProfile } from './userProfile.ts'
import { parseCloudRecord, validKey, validRecord, validVersion } from './financeValidation.ts'
import type { FinanceCache, SyncCursor } from './financeCache'
import { separateRecordImage } from './financeMedia.ts'

const recordsPath = (db: Firestore, uid: string) => collection(db, 'finance_data', uid, 'records')

export async function loadFinanceData(db: Firestore, uid: string, cache: FinanceCache | null = null, allowIncremental = import.meta.env?.VITE_FIRESTORE_INCREMENTAL_SYNC === 'true'): Promise<{ data: FinanceData; records: RecordMap; versions: Map<string, number>; profile: UserProfile | null; syncCursor: SyncCursor | null }> {
  const root = doc(db, 'finance_data', uid)
  const legacy = await getDocFromServer(root)
  // Delta reads are opt-in until updated rules reject legacy clients that omit timestamps.
  const watermark = legacy.data()?.updatedAt
  const cursor = cache?.syncCursor
  const incremental = allowIncremental && cursor && legacy.data()?.syncProtocol === 1 && watermark instanceof Timestamp
    && (watermark.seconds > cursor.seconds || watermark.seconds === cursor.seconds && watermark.nanoseconds >= cursor.nanoseconds)
  const records: RecordMap = incremental ? new Map(cache.records) : new Map()
  const versions = incremental ? new Map(cache.versions) : new Map<string, number>()
  const syncCursor = watermark instanceof Timestamp ? { seconds: watermark.seconds, nanoseconds: watermark.nanoseconds } : null
  let last: QueryDocumentSnapshot | undefined
  do {
    const constraints = incremental ? [where('updatedAt', '>=', new Timestamp(cache.syncCursor!.seconds, cache.syncCursor!.nanoseconds)), orderBy('updatedAt'), orderBy(documentId())] : [orderBy(documentId())]
    const snapshot = await getDocsFromServer(query(recordsPath(db, uid), ...constraints, ...(last ? [startAfter(last)] : []), limit(250)))
    for (const entry of snapshot.docs) {
      const parsed = parseCloudRecord(entry.id, entry.data())
      versions.set(entry.id, parsed.version)
      if (parsed.record) records.set(entry.id, parsed.record)
      else records.delete(entry.id)
    }
    last = snapshot.size === 250 ? snapshot.docs.at(-1) : undefined
  } while (last)
  if (legacy.data()?.data && legacy.data()?.schemaVersion !== 2) {
    const old = flattenData(legacy.data()!.data as FinanceData)
    for (const [key, value] of old) if (!validRecord(key, value)) throw new Error('invalid-data')
    const existing = new Set(versions.keys())
    const missing = [...old].filter(([key]) => !existing.has(key))
    for (let start = 0; start < missing.length; start += 400) {
      const batch = writeBatch(db)
      for (const [key, record] of missing.slice(start, start + 400)) batch.set(doc(recordsPath(db, uid), key), { ...record, version: 1, updatedAt: serverTimestamp() })
      batch.set(root, { updatedAt: serverTimestamp() }, { merge: true })
      await batch.commit()
    }
    await runTransaction(db, async transaction => {
      const current = await transaction.get(root)
      if (current.data()?.schemaVersion !== 2) transaction.set(root, { schemaVersion: 2, syncProtocol: 1, migratedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })
    })
    return loadFinanceData(db, uid, null, allowIncremental)
  }
  for (const record of records.values()) if (record.kind === 'item' && !records.has(`list_${encodeURIComponent(String(record.value.listId))}`)) throw new Error('invalid-data')
  return { data: inflateRecords(records), records, versions, profile: parseProfile(legacy.data()?.profile), syncCursor }
}

export async function saveUserProfile(db: Firestore, uid: string, profile: UserProfile): Promise<void> {
  // Merge only the profile: finance records and the legacy backup stay untouched.
  await setDoc(doc(db, 'finance_data', uid), { profile: validateProfile(profile) }, { merge: true })
}

export async function saveFinanceRecord(db: Firestore, uid: string, key: string, record: FinanceRecord | null, expectedVersion: number): Promise<{ version: number; record: FinanceRecord | null }> {
  if (!validKey(key) || !validVersion(expectedVersion) || expectedVersion >= Number.MAX_SAFE_INTEGER || record !== null && !validRecord(key, record)) throw new Error('invalid-data')
  if (record?.kind === 'budget' && Object.keys(record.value.categoryLimits as object).length > 10) throw new Error('Usa como máximo 10 categorías por presupuesto.')
  const reference = doc(recordsPath(db, uid), key)
  const separated = await separateRecordImage(record)
  const commit = (prepared: typeof separated) => runTransaction(db, async transaction => {
    const current = await transaction.get(reference)
    if (current.exists()) parseCloudRecord(key, current.data())
    if ((current.data()?.version ?? 0) !== expectedVersion) throw new Error('conflict')
    const version = expectedVersion + 1
    if (prepared.media && current.data()?.value?.imageUrl !== prepared.record?.value.imageUrl) {
      transaction.set(doc(db, 'finance_data', uid, 'media', prepared.media.id), { imageUrl: prepared.media.imageUrl, updatedAt: serverTimestamp() })
    }
    transaction.set(reference, prepared.record ? { ...prepared.record, version, updatedAt: serverTimestamp() } : { deleted: true, version, updatedAt: serverTimestamp() })
    transaction.set(doc(db, 'finance_data', uid), { schemaVersion: 2, syncProtocol: 1, updatedAt: serverTimestamp() }, { merge: true })
    return { version, record: prepared.record }
  })
  try { return await commit(separated) }
  catch (error) {
    // Older deployed rules have no media collection. The rejected transaction is atomic;
    // retry the supported inline format without changing ownership or version checks.
    if (separated.media && error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') return commit({ record, media: null })
    throw error
  }
}

export { changedRecords, flattenData }
