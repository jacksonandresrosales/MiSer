import { Check, Ellipsis, Link2, ListChecks, Pencil, Plus, ShoppingBag, X } from 'lucide-react'
import type { FinanceData, ShoppingItem, ShoppingList } from './types'
import './ShoppingPage.css'
import { FinanceImage } from './FinanceImage'

type ShoppingPageProps = {
  data: FinanceData
  modify: (fn: (old: FinanceData) => FinanceData) => void
  onAdd: () => void
  onEdit: (list: ShoppingList) => void
  onDelete: (id: string) => void
  onAddItem: (listId: string) => void
  onEditItem: (listId: string, item: ShoppingItem) => void
}

const currency = (value: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
const webUrl = (value: string) => {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch { return null }
}
const linkLabel = (value: string) => new URL(value).hostname.replace(/^www\./, '')

export default function ShoppingPage({ data, modify, onAdd, onEdit, onDelete, onAddItem, onEditItem }: ShoppingPageProps) {
  const toggleItem = (listId: string, itemId: string) => modify(old => ({
    ...old,
    lists: old.lists.map(list => list.id === listId ? {
      ...list, items: list.items.map(item => item.id === itemId ? { ...item, done: !item.done } : item),
    } : list),
  }))
  const removeItem = (listId: string, itemId: string) => {
    if (window.confirm('¿Eliminar este artículo? Esta acción no se puede deshacer.')) modify(old => ({
      ...old,
      lists: old.lists.map(list => list.id === listId ? { ...list, items: list.items.filter(item => item.id !== itemId) } : list),
    }))
  }

  return <div className="page-wrap miser-shopping">
    <header className="miser-shopping-heading">
      <div><h1>Listas de compras</h1><p>Guarda ideas, detalles y enlaces para cuando llegue el momento de comprar.</p></div>
      <button className="miser-shopping-create" type="button" onClick={onAdd}><Plus size={18} aria-hidden="true" /> Crear lista</button>
    </header>
    {data.lists.length ? <>
      <div className="miser-shopping-grid">{data.lists.map((list, index) => {
        const done = list.items.filter(item => item.done).length
        return <article className="miser-shopping-card" key={list.id}>
          <header className="miser-shopping-card-head">
            <span className={`miser-shopping-symbol miser-shopping-symbol-${index % 3}`} aria-hidden="true"><ShoppingBag size={21} /></span>
            <div className="miser-shopping-list-title"><h2>{list.title}</h2><p>{list.store || 'Sin tienda'} · {done}/{list.items.length} listos</p></div>
            <details className="miser-shopping-menu" onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
            }} onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.currentTarget.open = false
                event.currentTarget.querySelector('summary')?.focus()
              }
            }}>
              <summary aria-label={`Opciones de la lista ${list.title}`}><Ellipsis size={20} aria-hidden="true" /></summary>
              <div className="miser-shopping-menu-actions">
                <button type="button" onClick={event => { event.currentTarget.closest('details')!.open = false; onEdit(list) }}><Pencil size={16} aria-hidden="true" /> Editar lista</button>
                <button className="miser-shopping-danger" type="button" onClick={event => { event.currentTarget.closest('details')!.open = false; onDelete(list.id) }}><X size={16} aria-hidden="true" /> Eliminar lista</button>
              </div>
            </details>
          </header>
          <div className="miser-shopping-progress" aria-hidden="true"><span style={{ width: `${list.items.length ? done / list.items.length * 100 : 0}%` }} /></div>
          {list.items.length ? <ul className="miser-shopping-items">{list.items.map(item => {
            const links = (item.purchaseLinks ?? []).flatMap(link => { const href = webUrl(link); return href ? [href] : [] })
            return <li className={`miser-shopping-item ${item.done ? 'miser-shopping-item-done' : ''}`} key={item.id}>
              <button className="miser-shopping-check" type="button" aria-pressed={item.done} onClick={() => toggleItem(list.id, item.id)} aria-label={item.done ? `Marcar ${item.name} pendiente` : `Marcar ${item.name} comprado`}><span>{item.done && <Check size={15} aria-hidden="true" />}</span></button>
              <div className="miser-shopping-item-copy">
                <button className="miser-shopping-item-name" type="button" onClick={() => onEditItem(list.id, item)} aria-label={`Editar ${item.name}`}><span>{item.name}</span><Pencil size={14} aria-hidden="true" /></button>
                <div className="miser-shopping-item-details">
                  <FinanceImage className="miser-shopping-image" source={item.imageUrl} alt={`Imagen de ${item.name}`} />
                  <div>{item.description && <p>{item.description}</p>}{(item.quantity || item.amount !== undefined) && <small>{[item.quantity, item.amount !== undefined ? currency(item.amount) : ''].filter(Boolean).join(' · ')}</small>}</div>
                </div>
                {links.length > 0 && <div className="miser-shopping-links">{links.map((href, linkIndex) => <a key={`${href}-${linkIndex}`} href={href} target="_blank" rel="noopener noreferrer" title={href}><Link2 size={14} aria-hidden="true" /><span>{linkLabel(href)}</span></a>)}</div>}
              </div>
              <button className="miser-shopping-remove" type="button" onClick={() => removeItem(list.id, item.id)} aria-label={`Eliminar ${item.name}`}><X size={18} aria-hidden="true" /></button>
            </li>
          })}</ul> : <p className="miser-shopping-list-empty">Todavía no hay artículos en esta lista.</p>}
          <footer className="miser-shopping-card-foot"><button className="miser-shopping-add-item" type="button" onClick={() => onAddItem(list.id)}><Plus size={16} aria-hidden="true" /> Añadir artículo</button></footer>
        </article>
      })}</div>
      <button className="miser-shopping-create-another" type="button" onClick={onAdd}><Plus size={18} aria-hidden="true" /> Crear otra lista</button>
    </> : <section className="miser-shopping-empty">
      <ListChecks size={28} aria-hidden="true" /><h2>Tus listas empiezan aquí</h2><p>Crea una lista para la semana, una tienda o un proyecto.</p>
      <button className="miser-shopping-create" type="button" onClick={onAdd}><Plus size={18} aria-hidden="true" /> Crear lista</button>
    </section>}
  </div>
}
