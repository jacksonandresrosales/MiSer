import { Check, Ellipsis, Link2, ListChecks, Pencil, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import type { FinanceData, ShoppingItem, ShoppingList } from './types'
import { FinanceImage } from './FinanceImage'
import { currency } from './lib/format'
import { webUrl } from './lib/image'
import { EmptyState, PageHeading } from './components/common'

type ShoppingPageProps = {
  data: FinanceData
  modify: (fn: (old: FinanceData) => FinanceData) => boolean
  onAdd: () => void
  onEdit: (list: ShoppingList) => void
  onDelete: (id: string) => void
  onAddItem: (listId: string) => void
  onEditItem: (listId: string, item: ShoppingItem) => void
}

const linkLabel = (value: string) => new URL(value).hostname.replace(/^www\./, '')
const closeMenu = (element: Element) => { const menu = element.closest('details'); if (menu) menu.open = false }

export default function ShoppingPage({ data, modify, onAdd, onEdit, onDelete, onAddItem, onEditItem }: ShoppingPageProps) {
  const toggleItem = (listId: string, itemId: string) => modify(old => ({
    ...old,
    lists: old.lists.map(list => list.id === listId ? { ...list, items: list.items.map(item => item.id === itemId ? { ...item, done: !item.done } : item) } : list),
  }))

  return <div className="page-wrap shopping-page">
    <PageHeading title="Compras" subtitle="Ideas, detalles y enlaces para cuando llegue el momento." action={<button className="btn btn-primary page-action" type="button" onClick={onAdd}><Plus size={18} aria-hidden="true" /> Nueva lista</button>} />
    {data.lists.length ? <div className="shopping-grid">{data.lists.map(list => {
      const done = list.items.filter(item => item.done).length
      return <article className="card shopping-card" key={list.id} aria-labelledby={`list-${list.id}`}>
        <header className="shopping-card-head">
          <span className="next-icon" aria-hidden="true"><ShoppingBag size={20} /></span>
          <div className="shopping-title"><h2 id={`list-${list.id}`}>{list.title}</h2><p>{list.store || 'Sin tienda'} · {done} de {list.items.length} listos</p></div>
          <details className="menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }} onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }
          }}>
            <summary className="icon-button" aria-label={`Opciones de la lista ${list.title}`}><Ellipsis size={20} aria-hidden="true" /></summary>
            <div className="menu-panel">
              <button type="button" onClick={event => { closeMenu(event.currentTarget); onEdit(list) }}><Pencil size={18} aria-hidden="true" /> Editar lista</button>
              <button className="menu-danger" type="button" onClick={event => { closeMenu(event.currentTarget); onDelete(list.id) }}><Trash2 size={18} aria-hidden="true" /> Eliminar lista</button>
            </div>
          </details>
        </header>
        <div className="meter meter-success meter-thin"><progress max={Math.max(1, list.items.length)} value={done} aria-label={`${done} de ${list.items.length} artículos comprados`} /></div>
        {list.items.length ? <ul className="shopping-items">{list.items.map(item => {
          const links = (item.purchaseLinks ?? []).flatMap(link => { const href = webUrl(link); return href ? [href] : [] })
          return <li className={`shopping-item ${item.done ? 'is-done' : ''}`} key={item.id}>
            <button className="round-check" type="button" aria-pressed={item.done} onClick={() => toggleItem(list.id, item.id)} aria-label={item.done ? `Marcar ${item.name} como pendiente` : `Marcar ${item.name} como comprado`}><span>{item.done && <Check size={16} aria-hidden="true" />}</span></button>
            <div className="shopping-item-copy">
              <button className="shopping-item-name" type="button" onClick={() => onEditItem(list.id, item)} aria-label={`Editar o eliminar ${item.name}`}><span>{item.name}</span><Pencil size={16} aria-hidden="true" /></button>
              {(item.imageUrl || item.description || item.quantity || item.amount !== undefined) && <div className="shopping-item-details">
                <FinanceImage className="shopping-image" source={item.imageUrl} alt={`Imagen de ${item.name}`} />
                <div>{item.description && <p>{item.description}</p>}{(item.quantity || item.amount !== undefined) && <small className="money">{[item.quantity, item.amount !== undefined ? currency(item.amount) : ''].filter(Boolean).join(' · ')}</small>}</div>
              </div>}
              {links.length > 0 && <div className="shopping-links">{links.map((href, linkIndex) => <a key={`${href}-${linkIndex}`} href={href} target="_blank" rel="noopener noreferrer" title={href}><Link2 size={16} aria-hidden="true" /><span>{linkLabel(href)}</span></a>)}</div>}
            </div>
          </li>
        })}</ul> : <p className="muted-note">Todavía no hay artículos en esta lista.</p>}
        <button className="btn btn-ghost add-row" type="button" onClick={() => onAddItem(list.id)}><Plus size={18} aria-hidden="true" /> Añadir artículo</button>
      </article>
    })}</div> : <div className="card"><EmptyState icon={<ListChecks size={22} />} title="Tus listas empiezan aquí" text="Crea una lista para la semana, una tienda o un proyecto." action={<button className="btn btn-primary" type="button" onClick={onAdd}><Plus size={18} aria-hidden="true" /> Crear lista</button>} /></div>}
  </div>
}
