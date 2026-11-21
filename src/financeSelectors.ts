import { sumMoney } from './financeData.ts'
import type { Budget, CalendarEvent, FinanceData, Transaction } from './types.ts'

const byDateDesc = (a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date)

export const monthTransactions = (transactions: Transaction[], month: string) => transactions.filter(item => item.date.startsWith(month))

/** Expenses of the month that already happened. Scheduled (future) expenses are reported apart. */
export function monthSpending(transactions: Transaction[], month: string, today: string) {
  const expenses = monthTransactions(transactions, month).filter(item => item.type === 'expense')
  return {
    spent: sumMoney(expenses.filter(item => item.date <= today).map(item => item.amount)),
    scheduled: sumMoney(expenses.filter(item => item.date > today).map(item => item.amount)),
  }
}

export const findBudget = (budgets: Budget[], month: string) => budgets.find(item => item.month === month)

/** The latest budget before `month`, used to prefill a new month. */
export const previousBudget = (budgets: Budget[], month: string) => budgets.filter(item => item.month < month).sort((a, b) => b.month.localeCompare(a.month))[0]

export const upcomingReminders = (events: CalendarEvent[], today: string) => events.filter(event => event.remind && event.date >= today).length

export const nextEvent = (events: CalendarEvent[], today: string) => events.filter(event => event.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]

export const latestTransactions = (transactions: Transaction[], count: number) => [...transactions].sort(byDateDesc).slice(0, count)

export function eventsByDate(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const list = map.get(event.date)
    if (list) list.push(event)
    else map.set(event.date, [event])
  }
  return map
}

export function activitySummary(transactions: Transaction[], today: string) {
  const recorded = transactions.filter(item => item.date <= today)
  const income = sumMoney(recorded.filter(item => item.type === 'income').map(item => item.amount))
  const expense = sumMoney(recorded.filter(item => item.type === 'expense').map(item => item.amount))
  return { income, expense, balance: sumMoney([income, -expense]) }
}

/** Pre-lowercased search index so typing does not re-normalize every row. */
export const searchIndex = (transactions: Transaction[]) => transactions.map(item => ({ item, text: `${item.title} ${item.category}`.toLocaleLowerCase('es') })).sort((a, b) => byDateDesc(a.item, b.item))

export function filterTransactions(index: ReturnType<typeof searchIndex>, query: string) {
  const needle = query.trim().toLocaleLowerCase('es')
  const items = needle ? index.filter(entry => entry.text.includes(needle)).map(entry => entry.item) : index.map(entry => entry.item)
  return { items, subtotal: sumMoney(items.map(item => item.type === 'income' ? item.amount : -item.amount)) }
}

/** Groups transactions (already sorted newest first) by day for section headings. */
export function groupByDay(transactions: Transaction[]) {
  const groups: { date: string; items: Transaction[] }[] = []
  for (const item of transactions) {
    const last = groups.at(-1)
    if (last?.date === item.date) last.items.push(item)
    else groups.push({ date: item.date, items: [item] })
  }
  return groups
}

export const emptyFinance = (data: FinanceData) => !data.transactions.length && !data.events.length && !data.goals.length && !data.lists.length
