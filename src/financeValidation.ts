import { recordKey, type FinanceRecord } from './financeData.ts'
import { profilePhotoSrc } from './userProfile.ts'
import { mediaId } from './financeMedia.ts'

export const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export const validVersion = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
export const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
// eslint-disable-next-line no-control-regex -- Reject control characters at the storage boundary.
const unsafeText = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u
const text = (value: unknown, max = 200) => typeof value === 'string' && value.length <= max && !unsafeText.test(value)
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000_000
const kinds = ['transaction', 'event', 'goal', 'list', 'item', 'budget'] as const

export function validKey(key: unknown): key is string {
  if (typeof key !== 'string' || key.length > 700) return false
  try {
    const separator = key.indexOf('_')
    const kind = kinds.find(kind => kind === key.slice(0, separator))
    const id = decodeURIComponent(key.slice(separator + 1))
    return !!kind && !!id.trim() && id.length <= 200 && recordKey(kind, id) === key
  } catch { return false }
}

export function validRecord(key: string, record: unknown): record is FinanceRecord {
  if (!validKey(key) || !isObject(record) || !isObject(record.value)) return false
  const kind = kinds.find(kind => kind === record.kind)
  const value = record.value
  const id = kind === 'budget' ? value.month : value.id
  if (!kind || typeof id !== 'string' || !id.trim() || recordKey(kind, id) !== key) return false
  const required = (...fields: string[]) => fields.every(field => text(value[field]) && !!String(value[field]).trim())
  const optionalText = (...fields: string[]) => fields.every(field => value[field] === undefined || text(value[field], field === 'note' || field === 'description' ? 4000 : 200))
  const optionalAmount = (...fields: string[]) => fields.every(field => value[field] === undefined || amount(value[field]))
  const position = value.position === undefined || validVersion(value.position)
  const only = (...fields: string[]) => Object.keys(value).every(field => fields.includes(field))
  switch (kind) {
    case 'transaction': return only('id', 'title', 'category', 'date', 'type', 'amount', 'note') && required('title', 'category')
      && validDate(value.date) && ['income', 'expense'].includes(String(value.type)) && amount(value.amount) && optionalText('note')
    case 'event': return only('id', 'title', 'date', 'kind', 'amount', 'note', 'time', 'location', 'category', 'remind') && required('title')
      && validDate(value.date) && ['event', 'payment'].includes(String(value.kind)) && typeof value.remind === 'boolean'
      && optionalAmount('amount') && optionalText('note', 'location')
      && (value.time === undefined || value.time === '' || typeof value.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))
      && (value.category === undefined || ['personal', 'work', 'health'].includes(String(value.category)))
    case 'goal': return only('id', 'title', 'completed', 'category', 'target', 'current', 'dueDate', 'unit') && required('title')
      && optionalText('category', 'unit') && optionalAmount('target', 'current')
      && (value.dueDate === undefined || value.dueDate === '' || validDate(value.dueDate))
      && (value.completed === undefined || typeof value.completed === 'boolean')
    case 'list': return only('id', 'title', 'store', 'position') && required('title') && text(value.store) && position
    case 'item': return only('id', 'name', 'done', 'description', 'amount', 'quantity', 'imageUrl', 'purchaseLinks', 'listId', 'position')
      && required('name', 'listId') && typeof value.done === 'boolean' && position && optionalText('description', 'quantity') && optionalAmount('amount')
      && (value.imageUrl === undefined || value.imageUrl === '' || typeof value.imageUrl === 'string' && (!!profilePhotoSrc(value.imageUrl) || !!mediaId(value.imageUrl)))
      && (value.purchaseLinks === undefined || Array.isArray(value.purchaseLinks) && value.purchaseLinks.length <= 10
        && value.purchaseLinks.every(link => typeof link === 'string' && link.length <= 2048 && /^https?:\/\//.test(link) && !/\s/u.test(link) && !unsafeText.test(link)))
    case 'budget': return only('month', 'totalLimit', 'categoryLimits') && /^\d{4}-(0[1-9]|1[0-2])$/.test(id)
      && amount(value.totalLimit) && isObject(value.categoryLimits) && Object.keys(value.categoryLimits).length <= 50
      && Object.entries(value.categoryLimits).every(([name, limit]) => text(name) && !!name.trim() && amount(limit))
  }
}

export function parseCloudRecord(key: string, document: unknown): { record: FinanceRecord | null; version: number } {
  if (!validKey(key) || !isObject(document) || !validVersion(document.version) || document.version < 1
    || Object.keys(document).some(field => !['kind', 'value', 'version', 'deleted', 'updatedAt'].includes(field))
    || document.deleted !== undefined && typeof document.deleted !== 'boolean') throw new Error('invalid-data')
  const version = document.version
  if (document.deleted === true) return { record: null, version }
  if (!validRecord(key, document)) throw new Error('invalid-data')
  return { record: { kind: document.kind, value: document.value }, version }
}
