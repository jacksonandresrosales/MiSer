import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, CreditCard, Plus } from 'lucide-react'
import type { CalendarEvent, FinanceData } from './types'
import { currency, isoDate, localDate, longDate, monthYear, shortDate } from './lib/format'
import { eventsByDate } from './financeSelectors'
import { EmptyState } from './components/common'
import './CalendarPage.css'

type CalendarPageProps = {
  data: FinanceData
  onAdd: (date: string) => void
  onEdit: (item: CalendarEvent) => void
  onDelete: (id: string) => void
}

const weekdayFormatter = new Intl.DateTimeFormat('es-EC', { weekday: 'short' })
const eventCategory = (event: CalendarEvent) => event.kind === 'payment' ? 'payment' : event.category ?? 'personal'
const categoryLabels = { personal: 'Personal', work: 'Trabajo', health: 'Salud', payment: 'Pago' }
// The view and selected day survive switching tabs.
const memory: { view: 'week' | 'month'; selected: string | null } = { view: 'week', selected: null }

export function CalendarPage({ data, onAdd, onEdit }: CalendarPageProps) {
  const today = isoDate(new Date())
  const [view, setViewState] = useState(memory.view)
  const [selected, setSelectedState] = useState(memory.selected ?? today)
  const anchorDate = localDate(selected)
  const setSelected = (date: string) => { memory.selected = date; setSelectedState(date) }
  const setView = (next: 'week' | 'month') => { memory.view = next; setViewState(next) }

  const monday = new Date(anchorDate)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(monday); day.setDate(day.getDate() + index); return day })
  const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 12)
  const monthOffset = (firstOfMonth.getDay() + 6) % 7
  const monthLength = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0).getDate()
  const monthDays = Array.from({ length: Math.ceil((monthOffset + monthLength) / 7) * 7 }, (_, index) => new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1 - monthOffset + index, 12))

  const sorted = useMemo(() => [...data.events].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')), [data.events])
  const byDate = useMemo(() => eventsByDate(sorted), [sorted])
  const selectedEvents = byDate.get(selected) ?? []
  const upcoming = useMemo(() => sorted.filter(event => event.date >= today).slice(0, 5), [sorted, today])
  const heading = view === 'month' ? monthYear(firstOfMonth) : `${shortDate(days[0])} – ${shortDate(days[6])}`

  const move = (direction: number) => setSelected(isoDate(view === 'month'
    ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() + direction, 1, 12)
    : new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + direction * 7, 12)))
  const dayLabel = (day: Date, count: number) => `${longDate(day)}${isoDate(day) === today ? ', hoy' : ''}, ${count ? `${count} ${count === 1 ? 'evento' : 'eventos'}` : 'sin eventos'}`
  const dots = (key: string) => <span className="day-dots" aria-hidden="true">{(byDate.get(key) ?? []).slice(0, 3).map(event => <i key={event.id} className={`dot-${eventCategory(event)}`} />)}</span>

  return <div className="page-wrap calendar-page">
    <div className="page-heading">
      <div><h1 id="page-title" tabIndex={-1}>Calendario</h1><p className="calendar-range" aria-live="polite">{heading}</p></div>
      <button type="button" className="btn btn-primary page-action" onClick={() => onAdd(selected)} aria-label={`Añadir evento el ${longDate(selected)}`}><Plus size={18} aria-hidden="true" /> Añadir</button>
    </div>

    <div className="calendar-toolbar">
      <div className="segmented" role="radiogroup" aria-label="Vista del calendario">
        <button type="button" role="radio" aria-checked={view === 'week'} onClick={() => setView('week')}>Semana</button>
        <button type="button" role="radio" aria-checked={view === 'month'} onClick={() => setView('month')}>Mes</button>
      </div>
      <div className="calendar-arrows">
        <button type="button" className="icon-button" aria-label={view === 'month' ? 'Mes anterior' : 'Semana anterior'} onClick={() => move(-1)}><ArrowLeft size={18} aria-hidden="true" /></button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => setSelected(today)}>Hoy</button>
        <button type="button" className="icon-button" aria-label={view === 'month' ? 'Mes siguiente' : 'Semana siguiente'} onClick={() => move(1)}><ArrowRight size={18} aria-hidden="true" /></button>
      </div>
    </div>

    <div className="calendar-layout">
      <section className="card calendar-card" aria-label={view === 'week' ? 'Semana' : 'Mes'}>
        {view === 'week' ? <div className="week-strip">{days.map(day => {
          const key = isoDate(day)
          return <button type="button" key={key} className={`day-cell ${key === today ? 'is-today' : ''}`} aria-pressed={key === selected} aria-current={key === today ? 'date' : undefined} aria-label={dayLabel(day, byDate.get(key)?.length ?? 0)} onClick={() => setSelected(key)}>
            <span className="day-name">{weekdayFormatter.format(day).replace('.', '')}</span><strong>{day.getDate()}</strong>{dots(key)}
          </button>
        })}</div> : <div className="month-grid">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(name => <span key={name} className="day-name" aria-hidden="true">{name}</span>)}
          {monthDays.map(day => {
            const key = isoDate(day)
            return <button type="button" key={key} className={`day-cell ${day.getMonth() !== firstOfMonth.getMonth() ? 'is-outside' : ''} ${key === today ? 'is-today' : ''}`} aria-pressed={key === selected} aria-current={key === today ? 'date' : undefined} aria-label={dayLabel(day, byDate.get(key)?.length ?? 0)} onClick={() => setSelected(key)}>
              <strong>{day.getDate()}</strong>{dots(key)}
            </button>
          })}
        </div>}
        <div className="calendar-legend">{Object.entries(categoryLabels).map(([category, label]) => <span key={category}><i className={`dot-${category}`} aria-hidden="true" />{label}</span>)}</div>
      </section>

      <section className="card agenda-card" aria-labelledby="agenda-title">
        <h2 id="agenda-title" aria-live="polite">{selected === today ? 'Hoy' : longDate(selected)}</h2>
        {selectedEvents.length ? <ul className="agenda-list">{selectedEvents.map(event => <li key={event.id}>
          <button type="button" className={`agenda-item agenda-${eventCategory(event)}`} onClick={() => onEdit(event)} aria-label={`${event.title}. Editar o eliminar`}>
            <span className="agenda-icon" aria-hidden="true">{event.kind === 'payment' ? <CreditCard size={18} /> : <CalendarDays size={18} />}</span>
            <span className="agenda-copy"><strong>{event.title}</strong><small>{categoryLabels[eventCategory(event)]} · {event.time || 'Sin hora'}{event.location ? ` · ${event.location}` : ''}</small>{event.note && <small>{event.note}</small>}</span>
            {event.kind === 'payment' && <strong className="money">{currency(event.amount ?? 0)}</strong>}
          </button>
        </li>)}</ul> : <EmptyState icon={<CalendarDays size={22} />} title="Un día libre" text="No hay nada agendado para este día." action={<button type="button" className="btn btn-secondary" onClick={() => onAdd(selected)}><Plus size={18} aria-hidden="true" /> Añadir a este día</button>} />}
        <h3 className="upcoming-title">Próximos</h3>
        {upcoming.length ? <ul className="upcoming-list">{upcoming.map(event => <li key={event.id}><button type="button" onClick={() => { setSelected(event.date); onEdit(event) }} aria-label={`${event.title}, ${longDate(event.date)}${event.time ? `, ${event.time}` : ''}. Editar`}>
          <span className="upcoming-date">{shortDate(event.date)}</span><span className="agenda-copy"><strong>{event.title}</strong><small>{categoryLabels[eventCategory(event)]}{event.time ? ` · ${event.time}` : ''}{event.kind === 'payment' ? ` · ${currency(event.amount ?? 0)}` : ''}</small></span><ArrowRight size={18} aria-hidden="true" />
        </button></li>)}</ul> : <p className="muted-note">Tu agenda está despejada.</p>}
      </section>
    </div>
  </div>
}

export default CalendarPage
