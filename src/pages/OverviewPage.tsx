import { useMemo } from 'react'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, CreditCard, Plus, Target } from 'lucide-react'
import { goalCompleted, money, summarizeBalance } from '../financeData'
import { latestTransactions, nextEvent } from '../financeSelectors'
import type { Budget, FinanceData, Transaction } from '../types'
import type { Page } from '../appTypes'
import { currency, isoDate, monthName, shortDate } from '../lib/format'
import { EmptyState } from '../components/common'
import { TransactionRow } from '../components/TransactionRow'
import { MotivationCard } from './MotivationCard'

type Props = {
  data: FinanceData
  spending: { spent: number; scheduled: number }
  budget: Budget
  hasBudget: boolean
  onAdd: () => void
  onEditTransaction: (item: Transaction) => void
  onBudget: () => void
  onNavigate: (page: Page) => void
}

export default function OverviewPage({ data, spending, budget, hasBudget, onAdd, onEditTransaction, onBudget, onNavigate }: Props) {
  const now = new Date()
  const today = isoDate(now)
  const { balance, latestIncome, latestExpense } = useMemo(() => summarizeBalance(data.transactions, today), [data.transactions, today])
  const latest = useMemo(() => latestTransactions(data.transactions, 4), [data.transactions])
  const upcoming = useMemo(() => nextEvent(data.events, today), [data.events, today])
  const nextGoal = data.goals.find(item => !goalCompleted(item))
  const { spent, scheduled } = spending
  const limit = budget.totalLimit
  const ratio = limit > 0 ? spent / limit : 0
  return <div className="page-wrap overview-page">
    <section className="hero-card" aria-labelledby="page-title">
      <div className="hero-head">
        <h1 id="page-title" tabIndex={-1}>Saldo disponible</h1>
        <button className="btn btn-primary hero-add" onClick={onAdd}><Plus size={18} aria-hidden="true" /> Añadir movimiento</button>
      </div>
      <strong className="hero-amount money">{currency(balance)}</strong>
      <p className="hero-hint">Ingresos menos gastos registrados hasta hoy.</p>
      <div className="hero-last" aria-label="Último ingreso y último gasto">
        {([{ item: latestIncome, type: 'income', label: 'Último ingreso' }, { item: latestExpense, type: 'expense', label: 'Último gasto' }] as const).map(({ item, type, label }) => (
          <button key={type} type="button" className={`hero-last-item hero-last-${type}`} onClick={() => item ? onEditTransaction(item) : onAdd()} aria-label={item ? `${label}: ${item.title}, ${currency(item.amount)}, ${shortDate(item.date)}. Editar` : `${label}: sin registrar. Añadir movimiento`}>
            <span className="hero-last-label">{type === 'income' ? <ArrowDownLeft size={16} aria-hidden="true" /> : <ArrowUpRight size={16} aria-hidden="true" />}{label}</span>
            <strong className="money">{item ? `${type === 'income' ? '+' : '−'}${currency(item.amount)}` : 'Añadir'}</strong>
            <span className="hero-last-detail">{item ? `${item.title} · ${shortDate(item.date)}` : 'Aún no hay registros'}</span>
          </button>
        ))}
      </div>
    </section>

    <section className="card budget-card" aria-labelledby="budget-title">
      <div className="card-head"><h2 id="budget-title">Gastos de {monthName(now)}</h2><strong className="money">{currency(spent)}</strong></div>
      {hasBudget && limit > 0 ? <>
        <div className={`meter ${ratio >= 1 ? 'meter-over' : ratio >= 0.8 ? 'meter-warn' : ''}`}><progress max={limit} value={Math.min(spent, limit)} aria-label="Presupuesto mensual utilizado" /></div>
        <p className="budget-status">{spent < limit ? <>Te quedan <strong className="money">{currency(money(limit - spent))}</strong> de {currency(limit)}</> : spent === limit ? 'Llegaste a tu límite del mes' : <>Superaste tu límite por <strong className="money">{currency(money(spent - limit))}</strong></>}</p>
      </> : <p className="budget-status">Aún no tienes un límite para este mes. <button type="button" className="link-button" onClick={onBudget}>Configurar presupuesto</button></p>}
      {scheduled > 0 && <p className="budget-scheduled">Además hay {currency(scheduled)} en gastos programados para este mes.</p>}
    </section>

    <section className="overview-grid">
      <article className="card recent-card">
        <div className="card-head"><h2>Movimientos recientes</h2><button className="link-button" onClick={() => onNavigate('activity')}>Ver todo <ArrowRight size={16} aria-hidden="true" /></button></div>
        {latest.length ? <ul className="transaction-list">{latest.map(item => <li key={item.id}><TransactionRow item={item} scheduled={item.date > today} onClick={() => onEditTransaction(item)} /></li>)}</ul>
          : <EmptyState icon={<CreditCard size={22} />} title="Sin movimientos aún" text="Registra tu primer ingreso o gasto para ver tu saldo." action={<button className="btn btn-primary" onClick={onAdd}><Plus size={18} aria-hidden="true" /> Añadir movimiento</button>} />}
      </article>
      <article className="card next-card">
        <div className="card-head"><h2>Próximamente</h2></div>
        <button className="next-row" onClick={() => onNavigate('calendar')}><span className="next-icon"><CalendarDays size={20} aria-hidden="true" /></span><span className="next-copy"><small>Tu agenda</small><strong>{upcoming?.title ?? 'Sin eventos próximos'}</strong><span>{upcoming ? `${shortDate(upcoming.date)}${upcoming.time ? ` · ${upcoming.time}` : ''}` : 'Ver calendario'}</span></span><ArrowRight size={18} aria-hidden="true" /></button>
        <button className="next-row" onClick={() => onNavigate('goals')}><span className="next-icon next-icon-goal"><Target size={20} aria-hidden="true" /></span><span className="next-copy"><small>Tu objetivo</small><strong>{nextGoal?.title ?? (data.goals.length ? 'Todos cumplidos' : 'Aún no tienes objetivos')}</strong><span>{nextGoal ? 'Pendiente' : 'Ver objetivos'}</span></span><ArrowRight size={18} aria-hidden="true" /></button>
      </article>
    </section>
    <MotivationCard />
  </div>
}
