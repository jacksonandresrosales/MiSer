import { memo } from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import type { Transaction } from '../types'
import { currency, shortDate } from '../lib/format'

/** One movement. The whole row opens the form, where it can be edited, duplicated or deleted. */
export const TransactionRow = memo(function TransactionRow({ item, onClick, scheduled = false, showDate = true }: { item: Transaction; onClick: () => void; scheduled?: boolean; showDate?: boolean }) {
  const income = item.type === 'income'
  return <button type="button" className="tx-row" onClick={onClick} aria-label={`${item.title}, ${income ? 'ingreso' : 'gasto'} de ${currency(item.amount)}, ${item.category}, ${shortDate(item.date)}${scheduled ? ', programado' : ''}. Editar`}>
    <span className={`tx-icon ${income ? 'tx-icon-income' : 'tx-icon-expense'}`} aria-hidden="true">{income ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
    <span className="tx-main"><strong>{item.title}</strong><small>{item.category}{showDate && ` · ${shortDate(item.date)}`}{scheduled && <span className="chip chip-scheduled">Programado</span>}</small></span>
    <strong className={`tx-amount money ${income ? 'amount-income' : 'amount-expense'}`}>{income ? '+' : '−'}{currency(item.amount)}</strong>
  </button>
})
