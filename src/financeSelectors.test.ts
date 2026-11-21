import assert from 'node:assert/strict'
import test from 'node:test'
import { activitySummary, eventsByDate, filterTransactions, groupByDay, latestTransactions, monthSpending, previousBudget, searchIndex, upcomingReminders } from './financeSelectors.ts'
import type { CalendarEvent, Transaction } from './types.ts'

const tx = (id: string, date: string, type: Transaction['type'], amount: number, title = id, category = 'Comida'): Transaction => ({ id, date, type, amount, title, category })

test('month spending separates what already happened from scheduled expenses', () => {
  const items = [tx('a', '2026-11-02', 'expense', 10.1), tx('b', '2026-11-20', 'expense', 0.2), tx('c', '2026-11-28', 'expense', 50), tx('d', '2026-11-03', 'income', 99), tx('e', '2026-10-30', 'expense', 7)]
  assert.deepEqual(monthSpending(items, '2026-11', '2026-11-21'), { spent: 10.3, scheduled: 50 })
})

test('activity summary only counts records up to today', () => {
  const items = [tx('a', '2026-11-01', 'income', 100), tx('b', '2026-11-02', 'expense', 30.3), tx('c', '2026-12-01', 'expense', 500)]
  assert.deepEqual(activitySummary(items, '2026-11-21'), { income: 100, expense: 30.3, balance: 69.7 })
})

test('search is case and accent tolerant by locale lowercasing, newest first, with a signed subtotal', () => {
  const index = searchIndex([tx('a', '2026-11-01', 'expense', 5, 'Café'), tx('b', '2026-11-05', 'income', 20, 'CAFÉ extra'), tx('c', '2026-11-03', 'expense', 1, 'Pan', 'Hogar')])
  const result = filterTransactions(index, '  café ')
  assert.deepEqual(result.items.map(item => item.id), ['b', 'a'])
  assert.equal(result.subtotal, 15)
  assert.equal(filterTransactions(index, '').items.length, 3)
})

test('groups, latest items and reminders', () => {
  const sorted = [tx('a', '2026-11-05', 'expense', 1), tx('b', '2026-11-05', 'expense', 1), tx('c', '2026-11-01', 'expense', 1)]
  assert.deepEqual(groupByDay(sorted).map(group => [group.date, group.items.length]), [['2026-11-05', 2], ['2026-11-01', 1]])
  assert.deepEqual(latestTransactions([sorted[2], sorted[0]], 1).map(item => item.id), ['a'])
  const events: CalendarEvent[] = [{ id: '1', title: 'x', date: '2026-11-21', kind: 'event', remind: true }, { id: '2', title: 'y', date: '2026-11-20', kind: 'event', remind: true }, { id: '3', title: 'z', date: '2026-11-21', kind: 'payment', remind: false }]
  assert.equal(upcomingReminders(events, '2026-11-21'), 1)
  assert.equal(eventsByDate(events).get('2026-11-21')?.length, 2)
})

test('previous budget picks the latest earlier month', () => {
  const budgets = [{ month: '2026-09', totalLimit: 1, categoryLimits: {} }, { month: '2026-10', totalLimit: 2, categoryLimits: {} }, { month: '2026-12', totalLimit: 3, categoryLimits: {} }]
  assert.equal(previousBudget(budgets, '2026-11')?.totalLimit, 2)
  assert.equal(previousBudget(budgets, '2026-09'), undefined)
})
