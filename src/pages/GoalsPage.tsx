import { Pencil, Plus, Target } from 'lucide-react'
import { goalCompleted } from '../financeData'
import type { AnnualGoal, FinanceData } from '../types'
import { EmptyState, PageHeading } from '../components/common'

type Props = { data: FinanceData; onAdd: () => void; onEdit: (goal: AnnualGoal) => void; onToggle: (goal: AnnualGoal) => void; onDelete: (id: string) => void }

export default function GoalsPage({ data, onAdd, onEdit, onToggle }: Props) {
  const completed = data.goals.filter(goalCompleted).length
  const total = data.goals.length
  return <div className="page-wrap goals-page">
    <PageHeading title="Objetivos" subtitle="Escribe un propósito y márcalo cuando lo cumplas." action={<button className="btn btn-primary page-action" onClick={onAdd}><Plus size={18} aria-hidden="true" /> Nuevo</button>} />
    {total ? <>
      <section className="card goal-progress" aria-label="Progreso de tus objetivos">
        <div className="card-head"><h2>{completed} de {total} cumplidos</h2><span className="money">{Math.round(completed / total * 100)} %</span></div>
        <div className="meter meter-success"><progress max={total} value={completed} aria-label={`${completed} de ${total} objetivos cumplidos`} /></div>
      </section>
      <ul className="card goal-list">{data.goals.map(goal => {
        const done = goalCompleted(goal)
        return <li key={goal.id} className={`goal-row ${done ? 'is-done' : ''}`}>
          <input id={`goal-${goal.id}`} className="check" type="checkbox" checked={done} onChange={() => onToggle(goal)} />
          <label htmlFor={`goal-${goal.id}`}>{goal.title}</label>
          <button className="icon-button" type="button" onClick={() => onEdit(goal)} aria-label={`Editar o eliminar ${goal.title}`}><Pencil size={18} /></button>
        </li>
      })}</ul>
    </> : <div className="card"><EmptyState icon={<Target size={22} />} title="Empieza con un propósito" text="Por ejemplo: ahorrar para un viaje o leer más." action={<button className="btn btn-primary" onClick={onAdd}><Plus size={18} aria-hidden="true" /> Crear objetivo</button>} /></div>}
  </div>
}
