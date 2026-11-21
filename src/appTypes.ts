import type { AnnualGoal, Budget, CalendarEvent, ShoppingItem, ShoppingList, Transaction } from './types'

export type Page = 'overview' | 'activity' | 'calendar' | 'goals' | 'shopping' | 'settings'
export type Modal =
  | { kind: 'transaction'; item?: Transaction; copy?: boolean }
  | { kind: 'event'; item?: CalendarEvent; date?: string }
  | { kind: 'goal'; item?: AnnualGoal }
  | { kind: 'list'; item?: ShoppingList }
  | { kind: 'shoppingItem'; listId: string; item?: ShoppingItem }
  | { kind: 'budget'; item?: Budget; inherited?: boolean }
  | null
export type OpenModal = Exclude<Modal, null>
export type SessionUser = { id: string; email?: string; verified: boolean; passwordAccount: boolean }
export type Session = { user: SessionUser } | null
export type SyncStatus = 'saved' | 'pending' | 'saving' | 'error'
