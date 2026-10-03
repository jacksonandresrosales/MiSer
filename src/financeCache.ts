import { inflateRecords, recordKey, type FinanceRecord, type RecordMap } from './financeData.ts'
import type { FinanceData } from './types.ts'
import { parseProfile, type UserProfile } from './userProfile.ts'

type CloudSnapshot = { records: RecordMap; versions: Map<string, number>; profile: UserProfile | null }
export type FinanceCache = CloudSnapshot & { data: FinanceData; cachedAt: string }
export type PendingChange = [string, FinanceRecord | null, number]

const cacheKey = (uid: string) => `miser-finance-cache-${uid}`
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
const version = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const kinds = ['transaction', 'event', 'goal', 'list', 'item', 'budget'] as const

function validKey(key: unknown): key is string {
  if (typeof key !== 'string') return false
  const separator = key.indexOf('_')
  const kind = kinds.find(kind => kind === key.slice(0, separator))
  const id = decodeURIComponent(key.slice(separator + 1))
  return !!kind && nonempty(id) && recordKey(kind, id) === key
}

// financeData only provides flatten/inflate helpers; validate stored records before inflating.
function validRecord(key: string, record: unknown): record is FinanceRecord {
  if (!object(record) || !object(record.value)) return false
  const kind = kinds.find(kind => kind === record.kind)
  const value = record.value
  const id = kind === 'budget' ? value.month : value.id
  if (!kind || !nonempty(id) || recordKey(kind, id) !== key) return false
  const strings = (...fields: string[]) => fields.every(field => typeof value[field] === 'string')
  const optionalStrings = (...fields: string[]) => fields.every(field => value[field] === undefined || typeof value[field] === 'string')
  const optionalAmounts = (...fields: string[]) => fields.every(field => value[field] === undefined || amount(value[field]))
  const position = value.position === undefined || version(value.position)
  switch (kind) {
    case 'transaction':
      return strings('title', 'category') && date(value.date) && ['income', 'expense'].includes(String(value.type)) && amount(value.amount) && optionalStrings('note')
    case 'event':
      return strings('title') && date(value.date) && ['event', 'payment'].includes(String(value.kind)) && typeof value.remind === 'boolean'
        && optionalAmounts('amount') && optionalStrings('note', 'time', 'location')
        && (value.category === undefined || ['personal', 'work', 'health'].includes(String(value.category)))
    case 'goal':
      return strings('title') && optionalStrings('category', 'dueDate', 'unit') && optionalAmounts('target', 'current')
        && (value.completed === undefined || typeof value.completed === 'boolean')
    case 'list':
      return strings('title', 'store') && position && !Object.hasOwn(value, 'items')
    case 'item':
      return strings('name') && nonempty(value.listId) && typeof value.done === 'boolean' && position
        && optionalStrings('description', 'quantity', 'imageUrl') && optionalAmounts('amount')
        && (value.purchaseLinks === undefined || (Array.isArray(value.purchaseLinks) && value.purchaseLinks.every(link => typeof link === 'string')))
    case 'budget':
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(id) && amount(value.totalLimit) && object(value.categoryLimits)
        && Object.values(value.categoryLimits).every(amount)
  }
}

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
  return { records, versions, profile, data: inflateRecords(records), cachedAt: value.cachedAt }
}

/** Call only with a complete successful server load, before merging local pending changes. */
export function writeFinanceCache(uid: string, result: CloudSnapshot): boolean {
  try {
    if (!nonempty(uid) || !(result.records instanceof Map) || !(result.versions instanceof Map)) return false
    const serialized = JSON.stringify({ schemaVersion: 1, uid, cachedAt: new Date().toISOString(),
      records: [...result.records], versions: [...result.versions], profile: result.profile })
    if (!parseSnapshot(uid, JSON.parse(serialized))) return false
    localStorage.setItem(cacheKey(uid), serialized)
    return true
  } catch { return false }
}

/** Local display/recovery only. Even an empty valid snapshot cannot authorize server writes. */
export function readFinanceCache(uid: string): FinanceCache | null {
  try {
    return nonempty(uid) ? parseSnapshot(uid, JSON.parse(localStorage.getItem(cacheKey(uid)) ?? 'null')) : null
  } catch { return null }
}

/** Pending patches are never a complete dataset or proof of a current server baseline. */
export function readPendingChanges(uid: string): PendingChange[] {
  try {
    if (!nonempty(uid)) return []
    const value: unknown = JSON.parse(localStorage.getItem(`miser-pending-${uid}`) ?? 'null')
    if (!object(value) || !Array.isArray(value.changes) || (Object.hasOwn(value, 'uid') && value.uid !== uid)) return []
    const changes: PendingChange[] = []
    const keys = new Set<string>()
    for (const entry of value.changes) {
      if (!Array.isArray(entry) || entry.length !== 3 || !validKey(entry[0]) || !version(entry[2]) || keys.has(entry[0])
        || (entry[1] !== null && !validRecord(entry[0], entry[1]))) return []
      keys.add(entry[0])
      changes.push([entry[0], entry[1], entry[2]])
    }
    return changes
  } catch { return [] }
}
