import type { AnnualGoal, Budget, CalendarEvent, FinanceData, ShoppingItem, ShoppingList, Transaction } from './types'

export type RecordKind = 'transaction' | 'event' | 'goal' | 'list' | 'item' | 'budget'
export type FinanceRecord = { kind: RecordKind; value: Record<string, unknown> }
export type RecordMap = Map<string, FinanceRecord>

export const emptyData = (): FinanceData => ({ transactions: [], events: [], goals: [], lists: [], budgets: [] })
export const recordKey = (kind: RecordKind, id: string) => `${kind}_${encodeURIComponent(id)}`
export const cents = (amount: number) => Math.round(amount * 100)
export const money = (amount: number) => cents(amount) / 100
export const sumMoney = (amounts: number[]) => amounts.reduce((sum, amount) => sum + cents(amount), 0) / 100
export const goalCompleted = (goal: AnnualGoal) => goal.completed ?? (goal.current !== undefined && goal.target !== undefined && goal.current >= goal.target)

export function summarizeBalance(transactions: Transaction[], throughDate: string) {
  const recorded = transactions.filter(item => item.date <= throughDate).sort((a, b) => b.date.localeCompare(a.date))
  return {
    balance: sumMoney(recorded.map(item => item.type === 'income' ? item.amount : -item.amount)),
    latestIncome: recorded.find(item => item.type === 'income'),
    latestExpense: recorded.find(item => item.type === 'expense'),
  }
}

export function parseCategoryLimits(text: string): Record<string, number> {
  const limits: Record<string, number> = {}
  if (!text.trim()) return limits
  for (const entry of text.split(',')) {
    const match = /^([^:]+):\s*(\d+(?:\.\d{1,2})?)$/.exec(entry.trim())
    if (!match) throw new Error('Escribe los límites como “Categoría: 350, Otra: 100”.')
    const name = match[1].trim()
    const amount = Number(match[2])
    if (!name || !Number.isFinite(amount) || Object.hasOwn(limits, name)) throw new Error('Revisa las categorías repetidas o los montos inválidos.')
    limits[name] = money(amount)
    if (Object.keys(limits).length > 10) throw new Error('Usa como máximo 10 categorías por presupuesto.')
  }
  return limits
}

export function flattenData(data: FinanceData): RecordMap {
  const records: RecordMap = new Map()
  const add = (kind: RecordKind, id: string, value: object) => records.set(recordKey(kind, id), { kind, value: { ...value } as Record<string, unknown> })
  data.transactions.forEach(value => add('transaction', value.id, value))
  data.events.forEach(value => add('event', value.id, value))
  data.goals.forEach(value => add('goal', value.id, value))
  data.lists.forEach(({ items, ...list }, position) => {
    add('list', list.id, { ...list, position })
    items.forEach((item, itemPosition) => add('item', item.id, { ...item, listId: list.id, position: itemPosition }))
  })
  data.budgets.forEach(value => add('budget', value.month, value))
  return records
}

export function inflateRecords(records: RecordMap): FinanceData {
  const data = emptyData()
  const lists = new Map<string, ShoppingList>()
  const positions = new Map<string, number>()
  for (const record of records.values()) {
    const value = record.value
    if (record.kind === 'transaction') data.transactions.push(value as Transaction)
    else if (record.kind === 'event') data.events.push(value as CalendarEvent)
    else if (record.kind === 'goal') data.goals.push(value as AnnualGoal)
    else if (record.kind === 'budget') data.budgets.push(value as Budget)
    else if (record.kind === 'list') {
      const { position, ...details } = value
      const list = { ...details, items: [] } as unknown as ShoppingList
      positions.set(list.id, Number(position ?? 0))
      lists.set(list.id, list)
      data.lists.push(list)
    }
  }
  for (const record of records.values()) {
    if (record.kind !== 'item') continue
    const { listId, position, ...item } = record.value
    positions.set(String(item.id), Number(position ?? 0))
    lists.get(String(listId))?.items.push(item as ShoppingItem)
  }
  data.lists.sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0))
  data.lists.forEach(list => list.items.sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0)))
  return data
}

export function changedRecords(before: RecordMap, after: RecordMap): [string, FinanceRecord | null][] {
  const changes: [string, FinanceRecord | null][] = []
  for (const [key, value] of after) {
    if (JSON.stringify(before.get(key)?.value) !== JSON.stringify(value.value)) changes.push([key, value])
  }
  for (const key of before.keys()) if (!after.has(key)) changes.push([key, null])
  return changes
}
