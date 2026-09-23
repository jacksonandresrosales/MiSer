export type Transaction = {
  id: string
  title: string
  type: 'income' | 'expense'
  amount: number
  category: string
  date: string
  note?: string
}

export type CalendarEvent = {
  id: string
  title: string
  date: string
  kind: 'event' | 'payment'
  amount?: number
  note?: string
  time?: string
  location?: string
  category?: 'personal' | 'work' | 'health'
  remind: boolean
}

export type AnnualGoal = {
  id: string
  title: string
  category: string
  target: number
  current: number
  dueDate: string
  unit: string
}

export type ShoppingItem = {
  id: string
  name: string
  done: boolean
  description?: string
  amount?: number
  quantity?: string
  imageUrl?: string
  purchaseLinks?: string[]
}
export type ShoppingList = { id: string; title: string; store: string; items: ShoppingItem[] }

export type Budget = {
  month: string
  totalLimit: number
  categoryLimits: Record<string, number>
}

export type FinanceData = {
  transactions: Transaction[]
  events: CalendarEvent[]
  goals: AnnualGoal[]
  lists: ShoppingList[]
  budgets: Budget[]
}
