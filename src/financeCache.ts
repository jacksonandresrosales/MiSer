import { inflateRecords, recordKey, type FinanceRecord, type RecordMap } from './financeData.ts'
import type { FinanceData } from './types.ts'
import { parseProfile, type UserProfile } from './userProfile.ts'
import { isObject as object, validKey, validRecord, validVersion as version } from './financeValidation.ts'
import { privateStorage } from './privateStorage.ts'

export type SyncCursor = { seconds: number; nanoseconds: number }
type CloudSnapshot = { records: RecordMap; versions: Map<string, number>; profile: UserProfile | null; syncCursor?: SyncCursor | null }
export type FinanceCache = CloudSnapshot & { data: FinanceData; cachedAt: string }
export type PendingChange = [string, FinanceRecord | null, number]

const cacheKey = (uid: string) => `miser-finance-cache-${uid}`
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim()

function parseSnapshot(uid: string, value: unknown): FinanceCache | null {
  if (!object(value) || value.schemaVersion !== 1 || value.uid !== uid || typeof value.cachedAt !== 'string'
    || !Number.isFinite(Date.parse(value.cachedAt)) || new Date(value.cachedAt).toISOString() !== value.cachedAt
    || !Array.isArray(value.records) || !Array.isArray(value.versions) || !Object.hasOwn(value, 'profile')) return null
  const profile = value.profile === null ? null : parseProfile(value.profile)
  if (value.profile !== null && !profile) return null
  const records: RecordMap = new Map()
  const versions = new Map<string, number>()
  for (const entry of value.versions) {
    if (!Array.isArray(entry) || entry.length !== 2 || !validKey(entry[0]) || !version(entry[1]) || versions.has(entry[0])) return null
    versions.set(entry[0], entry[1])
  }
  for (const entry of value.records) {
    if (!Array.isArray(entry) || entry.length !== 2 || !validKey(entry[0]) || !validRecord(entry[0], entry[1])
      || records.has(entry[0]) || !versions.has(entry[0])) return null
    records.set(entry[0], entry[1])
  }
  for (const record of records.values()) {
    if (record.kind === 'item' && !records.has(recordKey('list', String(record.value.listId)))) return null
  }
  const cursor = value.syncCursor
  const syncCursor = object(cursor) && Number.isSafeInteger(cursor.seconds) && Number.isInteger(cursor.nanoseconds)
    && Number(cursor.nanoseconds) >= 0 && Number(cursor.nanoseconds) < 1_000_000_000
    ? { seconds: Number(cursor.seconds), nanoseconds: Number(cursor.nanoseconds) } : null
  return { records, versions, profile, data: inflateRecords(records), cachedAt: value.cachedAt, syncCursor }
}

/** Call only with a complete successful server load, before merging local pending changes. */
export function writeFinanceCache(uid: string, result: CloudSnapshot): boolean {
  try {
    if (!nonempty(uid) || !(result.records instanceof Map) || !(result.versions instanceof Map)) return false
    const snapshot = { schemaVersion: 1, uid, cachedAt: new Date().toISOString(),
      records: [...result.records], versions: [...result.versions], profile: result.profile, ...(result.syncCursor ? { syncCursor: result.syncCursor } : {}) }
    if (!parseSnapshot(uid, snapshot)) return false
    privateStorage.setItem(cacheKey(uid), JSON.stringify(snapshot))
    return true
  } catch { return false }
}

/** Local display/recovery only. Even an empty valid snapshot cannot authorize server writes. */
export function readFinanceCache(uid: string): FinanceCache | null {
  try {
    return nonempty(uid) ? parseSnapshot(uid, JSON.parse(privateStorage.getItem(cacheKey(uid)) ?? 'null')) : null
  } catch { return null }
}

/** Pending patches are never a complete dataset or proof of a current server baseline. */
export function parsePendingChanges(uid: string, raw: string | null): PendingChange[] | null {
  try {
    if (!nonempty(uid)) return null
    if (raw === null) return []
    const value: unknown = JSON.parse(raw)
    if (!object(value) || !Array.isArray(value.changes) || (Object.hasOwn(value, 'uid') && value.uid !== uid)) return null
    const changes: PendingChange[] = []
    const keys = new Set<string>()
    for (const entry of value.changes) {
      if (!Array.isArray(entry) || entry.length !== 3 || !validKey(entry[0]) || !version(entry[2]) || keys.has(entry[0])
        || (entry[1] !== null && !validRecord(entry[0], entry[1]))) return null
      keys.add(entry[0])
      changes.push([entry[0], entry[1], entry[2]])
    }
    return changes
  } catch { return null }
}

export function readPendingChanges(uid: string): PendingChange[] {
  try { return parsePendingChanges(uid, privateStorage.getItem(`miser-pending-${uid}`)) ?? [] }
  catch { return [] }
}
