import { useDeferredValue, useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { activitySummary, filterTransactions, groupByDay, searchIndex } from '../financeSelectors'
import type { FinanceData, Transaction } from '../types'
import { currency, dayHeading, isoDate } from '../lib/format'
import { EmptyState, PageHeading } from '../components/common'
import { TransactionRow } from '../components/TransactionRow'

// Kept between visits to the tab so the search and loaded length survive navigation.
const memory = { query: '', limit: 50 }

export default function ActivityPage({ data, onAdd, onEdit }: { data: FinanceData; onAdd: () => void; onEdit: (item: Transaction) => void }) {
  const [query, setQuery] = useState(memory.query)
  const [limit, setLimit] = useState(memory.limit)
  const deferredQuery = useDeferredValue(query)
  const today = isoDate(new Date())
  const summary = useMemo(() => activitySummary(data.transactions, today), [data.transactions, today])
  const index = useMemo(() => searchIndex(data.transactions), [data.transactions])
  const { items, subtotal } = useMemo(() => filterTransactions(index, deferredQuery), [index, deferredQuery])
  const groups = useMemo(() => groupByDay(items.slice(0, limit)), [items, limit])
  const changeQuery = (value: string) => { setQuery(value); setLimit(50); memory.query = value; memory.limit = 50 }
  const more = () => setLimit(value => { memory.limit = value + 50; return value + 50 })
  return <div className="page-wrap activity-page">
    <PageHeading title="Movimientos" subtitle="Tus ingresos y gastos, día a día." action={<button className="btn btn-primary page-action" onClick={onAdd}><Plus size={18} aria-hidden="true" /> Añadir</button>} />
    <dl className="stat-grid">
      <div className="stat"><dt>Ingresos hasta hoy</dt><dd className="money amount-income">+{currency(summary.income)}</dd></div>
      <div className="stat"><dt>Gastos hasta hoy</dt><dd className="money amount-expense">−{currency(summary.expense)}</dd></div>
      <div className="stat stat-wide"><dt>Saldo disponible</dt><dd className="money">{currency(summary.balance)}</dd></div>
    </dl>
    <div className="search-field">
      <Search size={18} aria-hidden="true" />
      <input type="search" aria-label="Buscar por concepto o categoría" placeholder="Buscar por concepto o categoría" value={query} onChange={event => changeQuery(event.target.value)} enterKeyHint="search" />
      {query && <button type="button" className="icon-button" onClick={() => changeQuery('')} aria-label="Limpiar búsqueda"><X size={18} /></button>}
    </div>
    {query && <p className="search-subtotal" role="status">{items.length} {items.length === 1 ? 'resultado' : 'resultados'} · Subtotal {currency(subtotal)}. No cambia tu saldo.</p>}
    {items.length ? <>
      {groups.map(group => <section key={group.date} className="day-group" aria-label={dayHeading(group.date)}>
        <h2 className="day-heading">{group.date === today ? 'Hoy' : dayHeading(group.date)}</h2>
        <ul className="card transaction-list">{group.items.map(item => <li key={item.id}><TransactionRow item={item} showDate={false} scheduled={item.date > today} onClick={() => onEdit(item)} /></li>)}</ul>
      </section>)}
      {items.length > limit && <button className="btn btn-secondary full" onClick={more}>Ver más movimientos ({items.length - limit})</button>}
    </> : <div className="card"><EmptyState icon={<Search size={22} />} title={query ? 'No encontramos movimientos' : 'Sin movimientos aún'} text={query ? 'Prueba con otra palabra.' : 'Registra un ingreso o un gasto para empezar.'} action={query ? undefined : <button className="btn btn-primary" onClick={onAdd}><Plus size={18} aria-hidden="true" /> Añadir movimiento</button>} /></div>}
    <p className="page-footnote">El saldo incluye los movimientos hasta hoy. Los programados aparecen en la lista, pero aún no cuentan.</p>
  </div>
}
