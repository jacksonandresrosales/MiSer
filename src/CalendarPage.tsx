import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, CreditCard, Pencil, Plus, X } from 'lucide-react'
import type { CalendarEvent, FinanceData } from './types'
import './CalendarPage.css'

type CalendarPageProps = {
  data: FinanceData
  onAdd: (date: string) => void
  onEdit: (item: CalendarEvent) => void
  onDelete: (id: string) => void
}

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const localDate = (date: string) => new Date(`${date}T12:00:00`)
const longDate = (date: Date) => new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
const shortDate = (date: Date) => new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short' }).format(date)
const currency = (value: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
const eventCategory = (event: CalendarEvent) => event.kind === 'payment' ? 'payment' : event.category ?? 'personal'
const categoryLabels = { personal: 'Personal', work: 'Trabajo', health: 'Salud', payment: 'Pago' }

export function CalendarPage({ data, onAdd, onEdit, onDelete }: CalendarPageProps) {
  const today = isoDate(new Date())
  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(today)
  const [selected, setSelected] = useState(today)
  const anchorDate = localDate(anchor)
  const monday = new Date(anchorDate)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday)
    day.setDate(day.getDate() + index)
    return day
  })
  const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 12)
  const monthOffset = (firstOfMonth.getDay() + 6) % 7
  const monthLength = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0).getDate()
  const monthDays = Array.from({ length: Math.ceil((monthOffset + monthLength) / 7) * 7 }, (_, index) =>
    new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1 - monthOffset + index, 12))
  const events = useMemo(() => [...data.events].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')), [data.events])
  const selectedEvents = events.filter(event => event.date === selected)
  const upcoming = events.filter(event => event.date >= today).slice(0, 5)
  const monthLabel = new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric' }).format(firstOfMonth)
  const range = `${shortDate(days[0])} — ${new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', year: 'numeric' }).format(days[6])}`

  const selectDate = (date: string) => { setSelected(date); setAnchor(date) }
  const changeView = (next: 'week' | 'month') => { setView(next); setAnchor(selected) }
  const navigate = (direction: number) => selectDate(isoDate(view === 'month'
    ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() + direction, 1, 12)
    : new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + direction * 7, 12)))
  const dayLabel = (day: Date, count: number) => `${longDate(day)}${isoDate(day) === today ? ', hoy' : ''}, ${count ? `${count} ${count === 1 ? 'evento' : 'eventos'}` : 'sin eventos'}`

  return <div className="page-wrap miser-calendar">
    <div className="page-heading">
      <div><h1>Tu calendario</h1><p>Ten a la vista los eventos y pagos que vienen.</p></div>
      <button type="button" className="btn btn-primary" onClick={() => onAdd(selected)} aria-label={`Añadir evento el ${longDate(localDate(selected))}`}><Plus size={17} aria-hidden="true" /> Añadir evento</button>
    </div>

    <div className="calendar-week-toolbar">
      <h2 className="month-heading" aria-live="polite">{view === 'month' ? monthLabel : range}</h2>
      <div className="calendar-toolbar-actions">
        <div className="calendar-view-toggle" role="group" aria-label="Vista del calendario">
          <button type="button" className={view === 'week' ? 'active' : ''} aria-pressed={view === 'week'} onClick={() => changeView('week')}>Semana</button>
          <button type="button" className={view === 'month' ? 'active' : ''} aria-pressed={view === 'month'} onClick={() => changeView('month')}>Mes</button>
        </div>
        <div className="month-arrows">
          <button type="button" className="icon-button pale-icon" aria-label={view === 'month' ? 'Mes anterior' : 'Semana anterior'} onClick={() => navigate(-1)}><ArrowLeft size={17} aria-hidden="true" /></button>
          <button type="button" className="btn btn-quiet calendar-today" onClick={() => selectDate(today)}>Hoy</button>
          <button type="button" className="icon-button pale-icon" aria-label={view === 'month' ? 'Mes siguiente' : 'Semana siguiente'} onClick={() => navigate(1)}><ArrowRight size={17} aria-hidden="true" /></button>
        </div>
      </div>
    </div>

    <div className={`calendar-layout ${view === 'week' ? 'weekly-calendar-layout' : 'monthly-calendar-layout'}`}>
      <section className="panel calendar-panel" aria-label={view === 'week' ? 'Calendario semanal' : 'Calendario mensual'}>
        {view === 'week' ? <div className="week-calendar-scroll"><div className="week-calendar">
          {days.map(day => {
            const key = isoDate(day)
            const dayEvents = events.filter(event => event.date === key)
            return <div className={`week-day-column ${key === selected ? 'week-day-selected' : ''} ${key === today ? 'week-today' : ''}`} key={key}>
              <button type="button" className="week-day-heading" aria-pressed={key === selected} aria-current={key === today ? 'date' : undefined} aria-label={dayLabel(day, dayEvents.length)} onClick={() => selectDate(key)}>
                <span>{new Intl.DateTimeFormat('es-EC', { weekday: 'short' }).format(day).replace('.', '')}</span><strong>{day.getDate()}</strong>
                <span className="calendar-strip-dots month-day-dots" aria-hidden="true">{dayEvents.slice(0, 3).map(event => <i key={event.id} className={`month-dot-${eventCategory(event)}`} />)}</span>
              </button>
              <button type="button" className="week-add-day" onClick={() => { selectDate(key); onAdd(key) }} aria-label={`Añadir evento el ${longDate(day)}`}><Plus size={15} aria-hidden="true" /></button>
              <div className="week-events">{dayEvents.map(event => <button type="button" className={`schedule-event schedule-${eventCategory(event)}`} key={event.id} aria-label={`Editar ${event.title}`} onClick={() => { selectDate(key); onEdit(event) }}>
                <span>{event.time || categoryLabels[eventCategory(event)]}</span><strong>{event.title}</strong>
                {event.location && <small>{event.location}</small>}
                {event.kind === 'payment' && <small>Pago · {currency(event.amount ?? 0)}</small>}
              </button>)}</div>
            </div>
          })}
        </div></div> : <div className="month-calendar">
          <div className="calendar-grid calendar-weekdays" aria-hidden="true">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid month-calendar-grid">{monthDays.map(day => {
            const key = isoDate(day)
            const dayEvents = events.filter(event => event.date === key)
            return <button type="button" key={key} className={`calendar-cell month-day ${day.getMonth() !== firstOfMonth.getMonth() ? 'month-outside' : ''} ${key === selected ? 'selected-day' : ''} ${key === today ? 'today-day' : ''}`}
              aria-pressed={key === selected} aria-current={key === today ? 'date' : undefined} aria-label={dayLabel(day, dayEvents.length)} onClick={() => selectDate(key)}>
              <strong className="month-day-number">{day.getDate()}</strong>
              <span className="month-day-events">{dayEvents.slice(0, 2).map(event => <span key={event.id} className={`month-event-chip month-event-${eventCategory(event)}`} title={event.title}>{event.title}</span>)}{dayEvents.length > 2 && <small className="month-more">+{dayEvents.length - 2} más</small>}</span>
              <span className="month-day-dots" aria-hidden="true">{dayEvents.slice(0, 3).map(event => <i key={event.id} className={`month-dot-${eventCategory(event)}`} />)}</span>
            </button>
          })}</div>
        </div>}
        <div className="calendar-legend">{Object.entries(categoryLabels).map(([category, label]) => <span key={category}><i className={category === 'payment' ? 'payment-dot' : `legend-${category}`} aria-hidden="true" />{label}</span>)}</div>
      </section>

      <aside className="panel day-panel" aria-label="Agenda del día seleccionado">
        <div className="day-panel-heading">
          <h2 aria-live="polite">{longDate(localDate(selected))}{selected === today && <span className="calendar-today-label">Hoy</span>}</h2>
          <button type="button" className="icon-button pale-icon" onClick={() => onAdd(selected)} aria-label={`Añadir evento el ${longDate(localDate(selected))}`}><Plus size={17} aria-hidden="true" /></button>
        </div>
        {selectedEvents.length ? <div className="day-events">{selectedEvents.map(event => <div className={`day-event calendar-agenda-${eventCategory(event)}`} key={event.id}>
          <span className="day-event-icon" aria-hidden="true">{event.kind === 'payment' ? <CreditCard size={18} /> : <CalendarDays size={18} />}</span>
          <span className="day-event-copy"><strong>{event.title}</strong><small>{categoryLabels[eventCategory(event)]} · {event.time || 'Sin hora'}{event.location ? ` · ${event.location}` : ''}</small>
            {event.kind === 'payment' && <small>{currency(event.amount ?? 0)}</small>}{event.note && <small>{event.note}</small>}
          </span>
          <div className="calendar-event-actions">
            <button type="button" className="delete-mini" onClick={() => onEdit(event)} aria-label={`Editar ${event.title}`}><Pencil size={17} aria-hidden="true" /></button>
            <button type="button" className="delete-mini" onClick={() => onDelete(event.id)} aria-label={`Eliminar ${event.title}`}><X size={18} aria-hidden="true" /></button>
          </div>
        </div>)}</div> : <div className="empty-state"><span><CalendarDays size={22} aria-hidden="true" /></span><strong>Un día para ti</strong><p>No hay nada agendado. Puedes dejarlo así o añadir un recordatorio.</p></div>}
        <button type="button" className="btn btn-soft full" onClick={() => onAdd(selected)}><Plus size={17} aria-hidden="true" /> Agregar a este día</button>
        <div className="upcoming-month"><h3>Próximos eventos</h3>{upcoming.length ? upcoming.map(event => <button type="button" key={event.id} aria-label={`Editar ${event.title}, ${longDate(localDate(event.date))}${event.time ? `, ${event.time}` : ''}`} onClick={() => { selectDate(event.date); onEdit(event) }}>
          <span className="upcoming-date-small">{shortDate(localDate(event.date))}</span><span className="calendar-upcoming-copy"><strong>{event.title}</strong><small>{categoryLabels[eventCategory(event)]}{event.time ? ` · ${event.time}` : ''}{event.kind === 'payment' ? ` · ${currency(event.amount ?? 0)}` : ''}</small></span><ArrowRight size={16} aria-hidden="true" />
        </button>) : <p className="muted">Tu agenda está despejada.</p>}</div>
      </aside>
    </div>
  </div>
}

export default CalendarPage
