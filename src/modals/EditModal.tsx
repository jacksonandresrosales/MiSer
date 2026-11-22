import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Check, Copy, CreditCard, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { goalCompleted, money } from '../financeData'
import type { AnnualGoal, Budget, CalendarEvent, ShoppingItem, ShoppingList, Transaction } from '../types'
import type { OpenModal } from '../appTypes'
import type { Notify } from '../components/feedback'
import { isoDate, newId } from '../lib/format'
import { compressImage, shoppingImageSrc, webUrl } from '../lib/image'
import { mediaId } from '../financeMedia'
import { FinanceImage } from '../FinanceImage'
import { ModalShell, fieldError } from './ModalShell'

export type ModalActions = {
  saveTransaction: (item: Transaction) => boolean
  saveEvent: (item: CalendarEvent) => boolean
  saveGoal: (item: AnnualGoal) => boolean
  saveList: (item: ShoppingList) => boolean
  saveShoppingItem: (listId: string, item: ShoppingItem) => boolean
  saveBudget: (item: Budget) => boolean
  deleteTransaction: (id: string) => void
  deleteEvent: (id: string) => void
  deleteGoal: (id: string) => void
  deleteList: (id: string) => void
  deleteShoppingItem: (listId: string, itemId: string) => void
}
type Props = { modal: OpenModal; month: string; onClose: () => void; actions: ModalActions; notify: Notify; onDuplicate: (item: Transaction) => void }

export const expenseCategories = ['Comida', 'Hogar', 'Transporte', 'Salud', 'Educación', 'Ocio', 'Ahorro', 'Otro']
export const incomeCategories = ['Trabajo', 'Extra', 'Regalo', 'Otro']
const amountPattern = /^\d+(?:[.,]\d{1,2})?$/
/** Accepts "12", "12.5" or "12,50". Returns null when the text is not a valid amount. */
export const parseAmount = (text: string) => amountPattern.test(text.trim()) ? money(Number(text.trim().replace(',', '.'))) : null
const yesterday = () => { const date = new Date(); date.setDate(date.getDate() - 1); return isoDate(date) }

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; icon?: ReactNode; tone?: string }[]; onChange: (value: T) => void }) {
  return <div className="segmented" role="radiogroup" aria-label={label}>{options.map(option => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={option.tone} onClick={() => onChange(option.value)}>{option.icon}{option.label}</button>)}</div>
}

function Footer({ editing, saveLabel, busy, onDelete, extra }: { editing: boolean; saveLabel?: string; busy?: boolean; onDelete?: () => void; extra?: ReactNode }) {
  return <div className="sheet-actions">
    {editing && onDelete && <button type="button" className="btn btn-danger-ghost" onClick={onDelete}><Trash2 size={18} aria-hidden="true" /> Eliminar</button>}
    {extra}
    <button className="btn btn-primary sheet-save" disabled={busy}>{busy ? 'Preparando imagen…' : saveLabel ?? (editing ? 'Guardar cambios' : 'Guardar')} <Check size={18} aria-hidden="true" /></button>
  </div>
}

function TransactionForm({ item, copy, onClose, actions, notify, onDuplicate }: { item?: Transaction; copy?: boolean } & Omit<Props, 'modal' | 'month'>) {
  const editing = !!item && !copy
  const [type, setType] = useState<Transaction['type']>(item?.type ?? 'expense')
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  const [category, setCategory] = useState(item?.category ?? 'Comida')
  const [title, setTitle] = useState(item?.title ?? '')
  const [date, setDate] = useState(copy ? isoDate(new Date()) : item?.date ?? isoDate(new Date()))
  const [note, setNote] = useState(item?.note ?? '')
  const [error, setError] = useState<string>()
  const [initial] = useState(() => JSON.stringify([type, amount, category, title, date, note]))
  const dirty = copy || JSON.stringify([type, amount, category, title, date, note]) !== initial
  const base = type === 'income' ? incomeCategories : expenseCategories
  const categories = base.includes(category) ? base : [...base, category]
  const changeType = (next: Transaction['type']) => { setType(next); if (!(next === 'income' ? incomeCategories : expenseCategories).includes(category)) setCategory(next === 'income' ? 'Trabajo' : 'Comida') }
  const amountError = fieldError('tx-amount', error)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = parseAmount(amount)
    if (!value) { setError('Escribe un monto mayor que cero, con hasta dos decimales.'); return }
    const saved = actions.saveTransaction({ id: editing ? item.id : newId(), title: title.trim() || category, type, amount: value, category, date, note: note.trim() || undefined })
    if (saved) { notify(`${type === 'income' ? 'Ingreso' : 'Gasto'} ${editing ? 'actualizado' : 'guardado'}`); onClose() }
  }
  const today = isoDate(new Date())
  return <ModalShell title={editing ? 'Editar movimiento' : copy ? 'Duplicar movimiento' : 'Nuevo movimiento'} dirty={dirty} onClose={onClose}>
    <form className="form" onSubmit={submit} noValidate>
      <Segmented label="Tipo de movimiento" value={type} onChange={changeType} options={[{ value: 'expense', label: 'Gasto', icon: <ArrowUpRight size={18} aria-hidden="true" />, tone: 'tone-expense' }, { value: 'income', label: 'Ingreso', icon: <ArrowDownLeft size={18} aria-hidden="true" />, tone: 'tone-income' }]} />
      <label className="amount-field">Monto
        <span className="amount-input"><span aria-hidden="true">$</span><input data-autofocus inputMode="decimal" enterKeyHint="next" autoComplete="off" value={amount} onChange={event => { setAmount(event.target.value); setError(undefined) }} placeholder="0,00" {...amountError.input} /></span>
      </label>
      {amountError.message}
      <fieldset className="chip-field"><legend>Categoría</legend><div className="chips">{categories.map(value => <button key={value} type="button" className="chip-option" aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div></fieldset>
      <label>Concepto <span className="optional">opcional</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder={type === 'income' ? 'Ej. Sueldo' : 'Ej. Supermercado'} aria-describedby="tx-title-help" maxLength={80} /></label><p id="tx-title-help" className="form-help">Si lo dejas vacío, se usa la categoría.</p>
      <fieldset className="chip-field"><legend>Fecha</legend><div className="chips">
        <button type="button" className="chip-option" aria-pressed={date === today} onClick={() => setDate(today)}>Hoy</button>
        <button type="button" className="chip-option" aria-pressed={date === yesterday()} onClick={() => setDate(yesterday())}>Ayer</button>
        <input className="date-input" type="date" aria-label="Otra fecha" required value={date} onChange={event => event.target.value && setDate(event.target.value)} />
      </div></fieldset>
      <label>Nota <span className="optional">opcional</span><textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Un detalle para recordar…" rows={2} /></label>
      <Footer editing={editing} onDelete={() => { actions.deleteTransaction(item!.id); onClose() }} extra={editing && <button type="button" className="btn btn-secondary" onClick={() => onDuplicate(item!)}><Copy size={18} aria-hidden="true" /> Duplicar</button>} />
    </form>
  </ModalShell>
}

function EventForm({ item, date: initialDate, onClose, actions, notify }: { item?: CalendarEvent; date?: string } & Omit<Props, 'modal' | 'month' | 'onDuplicate'>) {
  const [kind, setKind] = useState<CalendarEvent['kind']>(item?.kind ?? 'event')
  const [title, setTitle] = useState(item?.title ?? '')
  const [amount, setAmount] = useState(item?.amount !== undefined ? String(item.amount) : '')
  const [date, setDate] = useState(item?.date ?? initialDate ?? isoDate(new Date()))
  const [time, setTime] = useState(item?.time ?? '')
  const [category, setCategory] = useState<NonNullable<CalendarEvent['category']>>(item?.category ?? 'personal')
  const [location, setLocation] = useState(item?.location ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  const [remind, setRemind] = useState(item?.remind ?? true)
  const [errors, setErrors] = useState<{ title?: string; amount?: string }>({})
  const [initial] = useState(() => JSON.stringify([kind, title, amount, date, time, category, location, note, remind]))
  const dirty = JSON.stringify([kind, title, amount, date, time, category, location, note, remind]) !== initial
  const titleError = fieldError('event-title', errors.title)
  const amountError = fieldError('event-amount', errors.amount)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = amount ? parseAmount(amount) : 0
    const next = { title: title.trim() ? undefined : 'Escribe un nombre.', amount: kind === 'payment' && value === null ? 'Escribe un monto válido, con hasta dos decimales.' : undefined }
    setErrors(next)
    if (next.title || next.amount) return
    if (actions.saveEvent({ id: item?.id ?? newId(), title: title.trim(), date, kind, ...(kind === 'payment' ? { amount: value ?? 0 } : {}), note: note.trim() || undefined, remind, time: time || undefined, location: location.trim() || undefined, category })) { notify(item ? 'Cambios guardados' : 'Añadido al calendario'); onClose() }
  }
  return <ModalShell title={item ? 'Editar en el calendario' : 'Añadir al calendario'} dirty={dirty} onClose={onClose}>
    <form className="form" onSubmit={submit} noValidate>
      <Segmented label="Tipo" value={kind} onChange={setKind} options={[{ value: 'event', label: 'Evento', icon: <CalendarDays size={18} aria-hidden="true" /> }, { value: 'payment', label: 'Pago', icon: <CreditCard size={18} aria-hidden="true" />, tone: 'tone-payment' }]} />
      <label>Nombre<input data-autofocus value={title} onChange={event => setTitle(event.target.value)} placeholder={kind === 'payment' ? 'Ej. Pago de luz' : 'Ej. Cita médica'} maxLength={80} {...titleError.input} /></label>{titleError.message}
      {kind === 'payment' && <><label>Monto<span className="amount-input amount-input-small"><span aria-hidden="true">$</span><input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" {...amountError.input} /></span></label>{amountError.message}</>}
      <div className="form-row"><label>Fecha<input type="date" required value={date} onChange={event => event.target.value && setDate(event.target.value)} /></label><label>Hora <span className="optional">opcional</span><input type="time" value={time} onChange={event => setTime(event.target.value)} /></label></div>
      {kind === 'event' && <fieldset className="chip-field"><legend>Categoría</legend><div className="chips">{([['personal', 'Personal'], ['work', 'Trabajo'], ['health', 'Salud']] as const).map(([value, label]) => <button key={value} type="button" className={`chip-option chip-${value}`} aria-pressed={category === value} onClick={() => setCategory(value)}>{label}</button>)}</div></fieldset>}
      <label>Lugar <span className="optional">opcional</span><input value={location} onChange={event => setLocation(event.target.value)} /></label>
      <label>Nota <span className="optional">opcional</span><textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Añade un detalle…" rows={2} /></label>
      <label className="switch-row"><span><strong>Mostrar en recordatorios</strong><small>Aparece en la campana de MiSer. No envía alertas al teléfono.</small></span><input type="checkbox" role="switch" className="switch" checked={remind} onChange={event => setRemind(event.target.checked)} /></label>
      <Footer editing={!!item} onDelete={() => { actions.deleteEvent(item!.id); onClose() }} />
    </form>
  </ModalShell>
}

function GoalForm({ item, onClose, actions, notify }: { item?: AnnualGoal } & Omit<Props, 'modal' | 'month' | 'onDuplicate'>) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [error, setError] = useState<string>()
  const titleError = fieldError('goal-title', error)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) { setError('Escribe tu objetivo.'); return }
    if (actions.saveGoal({ ...item, id: item?.id ?? newId(), title: title.trim(), completed: item ? goalCompleted(item) : false })) { notify(item ? 'Objetivo actualizado' : 'Objetivo creado'); onClose() }
  }
  return <ModalShell title={item ? 'Editar objetivo' : 'Nuevo objetivo'} dirty={title !== (item?.title ?? '')} onClose={onClose}>
    <form className="form" onSubmit={submit} noValidate>
      <label>Tu objetivo<input data-autofocus maxLength={120} value={title} onChange={event => { setTitle(event.target.value); setError(undefined) }} placeholder="Ej. Ahorrar para un viaje" {...titleError.input} /></label>{titleError.message}
      <Footer editing={!!item} onDelete={() => { actions.deleteGoal(item!.id); onClose() }} />
    </form>
  </ModalShell>
}

function ListForm({ item, onClose, actions, notify }: { item?: ShoppingList } & Omit<Props, 'modal' | 'month' | 'onDuplicate'>) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [store, setStore] = useState(item?.store ?? '')
  const [error, setError] = useState<string>()
  const titleError = fieldError('list-title', error)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) { setError('Escribe un nombre para la lista.'); return }
    if (actions.saveList({ id: item?.id ?? newId(), title: title.trim(), store: store.trim(), items: item?.items ?? [] })) { notify(item ? 'Lista actualizada' : 'Lista creada'); onClose() }
  }
  return <ModalShell title={item ? 'Editar lista' : 'Nueva lista'} dirty={title !== (item?.title ?? '') || store !== (item?.store ?? '')} onClose={onClose}>
    <form className="form" onSubmit={submit} noValidate>
      <label>Nombre de la lista<input data-autofocus value={title} onChange={event => { setTitle(event.target.value); setError(undefined) }} placeholder="Ej. Compra de la semana" maxLength={80} {...titleError.input} /></label>{titleError.message}
      <label>Tienda o categoría <span className="optional">opcional</span><input value={store} onChange={event => setStore(event.target.value)} placeholder="Ej. Supermercado" /></label>
      {item && <p className="form-help">Los artículos de esta lista se conservan al editarla.</p>}
      <Footer editing={!!item} onDelete={() => { actions.deleteList(item!.id); onClose() }} />
    </form>
  </ModalShell>
}

function ShoppingItemForm({ listId, item, onClose, actions, notify }: { listId: string; item?: ShoppingItem } & Omit<Props, 'modal' | 'month' | 'onDuplicate'>) {
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [quantity, setQuantity] = useState(item?.quantity ?? '')
  const [amount, setAmount] = useState(item?.amount !== undefined ? String(item.amount) : '')
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '')
  const [linksText, setLinksText] = useState(item?.purchaseLinks?.join('\n') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [initial] = useState(() => JSON.stringify([name, description, quantity, amount, imageUrl, linksText]))
  const dirty = JSON.stringify([name, description, quantity, amount, imageUrl, linksText]) !== initial
  const uploadImage = async (file?: File) => {
    if (!file) return
    setBusy(true); setError(undefined)
    try { setImageUrl(await compressImage(file)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cargar la imagen.') }
    finally { setBusy(false) }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) { setError('Escribe el nombre del artículo.'); return }
    const price = amount ? parseAmount(amount) : undefined
    if (price === null) { setError('Escribe un precio válido, con hasta dos decimales.'); return }
    const links = linksText.split(/\r?\n/).map(link => link.trim()).filter(Boolean)
    if (links.some(link => !webUrl(link))) { setError('Cada enlace de compra debe empezar con https:// o http://.'); return }
    if (imageUrl && !shoppingImageSrc(imageUrl) && !mediaId(imageUrl)) { setError('El enlace de la imagen debe empezar con https://.'); return }
    if (actions.saveShoppingItem(listId, { id: item?.id ?? newId(), name: name.trim(), done: item?.done ?? false, description: description.trim() || undefined, quantity: quantity.trim() || undefined, amount: price, imageUrl: imageUrl || undefined, purchaseLinks: links })) { notify(item ? 'Artículo actualizado' : 'Artículo añadido'); onClose() }
  }
  return <ModalShell title={item ? 'Editar artículo' : 'Nuevo artículo'} dirty={dirty} busy={busy} onBusyClose={() => setError('Espera a que termine de prepararse la imagen.')} onClose={onClose}>
    <form className="form" onSubmit={submit} noValidate>
      <label>Nombre del artículo<input data-autofocus value={name} onChange={event => setName(event.target.value)} placeholder="Ej. Teclado mecánico" maxLength={120} /></label>
      <div className="form-row"><label>Cantidad <span className="optional">opcional</span><input value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="Ej. 2 unidades" /></label><label>Precio estimado <span className="optional">opcional</span><span className="amount-input amount-input-small"><span aria-hidden="true">$</span><input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" /></span></label></div>
      <label>Detalles <span className="optional">opcional</span><textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} placeholder="Modelo, color o por qué te interesa…" /></label>
      <fieldset className="image-field"><legend><ImagePlus size={18} aria-hidden="true" /> Imagen de referencia <span className="optional">opcional</span></legend>
        {(shoppingImageSrc(imageUrl) || mediaId(imageUrl)) && <div className="image-preview"><FinanceImage source={imageUrl} alt="Vista previa del artículo" size={96} /><button type="button" className="btn btn-ghost btn-small" onClick={() => setImageUrl('')}><X size={16} aria-hidden="true" /> Quitar</button></div>}
        <label className="file-button btn btn-secondary"><Plus size={18} aria-hidden="true" /> Subir desde el dispositivo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={event => { void uploadImage(event.target.files?.[0]); event.target.value = '' }} /></label>
        <label>O pega un enlace<input type="url" inputMode="url" value={imageUrl.startsWith('data:') || mediaId(imageUrl) ? '' : imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="https://tienda.com/imagen.jpg" /></label>
      </fieldset>
      <label>Enlaces de compra <span className="optional">uno por línea</span><textarea rows={2} value={linksText} onChange={event => setLinksText(event.target.value)} placeholder={'https://tienda.com/producto'} /></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <Footer editing={!!item} busy={busy} onDelete={() => { actions.deleteShoppingItem(listId, item!.id); onClose() }} />
    </form>
  </ModalShell>
}

function BudgetForm({ item, inherited, month, onClose, actions, notify }: { item?: Budget; inherited?: boolean; month: string } &Omit<Props, 'modal' | 'month' | 'onDuplicate'>) {
  const [total, setTotal] = useState(item?.totalLimit ? String(item.totalLimit) : '')
  const [rows, setRows] = useState(() => Object.entries(item?.categoryLimits ?? {}).map(([category, value]) => ({ key: newId(), category, amount: String(value) })))
  const [error, setError] = useState<string>()
  const [initial] = useState(() => JSON.stringify([total, rows.map(row => [row.category, row.amount])]))
  const dirty = JSON.stringify([total, rows.map(row => [row.category, row.amount])]) !== initial
  const used = new Set(rows.map(row => row.category))
  const free = expenseCategories.filter(category => !used.has(category))
  const update = (key: string, patch: Partial<{ category: string; amount: string }>) => setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row))
  const totalError = fieldError('budget-total', error)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const totalLimit = parseAmount(total)
    if (totalLimit === null) { setError('Escribe el límite del mes, con hasta dos decimales.'); return }
    const categoryLimits: Record<string, number> = {}
    for (const row of rows) {
      if (!row.amount.trim()) continue
      const value = parseAmount(row.amount)
      if (value === null) { setError(`Revisa el monto de ${row.category}.`); return }
      categoryLimits[row.category] = value
    }
    if (actions.saveBudget({ month, totalLimit, categoryLimits })) { notify('Presupuesto guardado'); onClose() }
  }
  return <ModalShell title="Presupuesto del mes" dirty={dirty} onClose={onClose}>
    <form className="form" onSubmit={submit} noValidate>
      {inherited && <p className="form-help">Partimos del presupuesto de tu último mes. Ajústalo si lo necesitas.</p>}
      <label className="amount-field">Límite total del mes<span className="amount-input"><span aria-hidden="true">$</span><input data-autofocus inputMode="decimal" value={total} onChange={event => { setTotal(event.target.value); setError(undefined) }} placeholder="0,00" {...totalError.input} /></span></label>{totalError.message}
      <fieldset className="budget-rows"><legend>Límites por categoría <span className="optional">opcional</span></legend>
        {rows.map(row => <div className="budget-row" key={row.key}>
          <select aria-label="Categoría" value={row.category} onChange={event => update(row.key, { category: event.target.value })}>{[row.category, ...free].map(category => <option key={category}>{category}</option>)}</select>
          <span className="amount-input amount-input-small"><span aria-hidden="true">$</span><input inputMode="decimal" aria-label={`Límite de ${row.category}`} value={row.amount} onChange={event => update(row.key, { amount: event.target.value })} placeholder="0,00" /></span>
          <button type="button" className="icon-button" aria-label={`Quitar ${row.category}`} onClick={() => setRows(current => current.filter(entry => entry.key !== row.key))}><X size={18} /></button>
        </div>)}
        {free.length > 0 && <button type="button" className="btn btn-ghost add-row" onClick={() => setRows(current => [...current, { key: newId(), category: free[0], amount: '' }])}><Plus size={18} aria-hidden="true" /> Añadir categoría</button>}
      </fieldset>
      <Footer editing={false} saveLabel="Guardar presupuesto" />
    </form>
  </ModalShell>
}

export default function EditModal({ modal, month, ...rest }: Props) {
  const { onDuplicate: _onDuplicate, ...common } = rest
  void _onDuplicate
  switch (modal.kind) {
    case 'transaction': return <TransactionForm key={`${modal.item?.id ?? 'new'}-${modal.copy ? 'copy' : ''}`} item={modal.item} copy={modal.copy} {...rest} />
    case 'event': return <EventForm item={modal.item} date={modal.date} {...common} />
    case 'goal': return <GoalForm item={modal.item} {...common} />
    case 'list': return <ListForm item={modal.item} {...common} />
    case 'shoppingItem': return <ShoppingItemForm listId={modal.listId} item={modal.item} {...common} />
    case 'budget': return <BudgetForm item={modal.item} inherited={modal.inherited} month={month} {...common} />
  }
}
