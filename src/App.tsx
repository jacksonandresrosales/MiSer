import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check,
  CheckCircle2, ChevronDown, CircleHelp, CreditCard, Download, Ellipsis, Heart,
  ExternalLink, ImagePlus, LayoutDashboard, Link2, ListChecks, LogOut, Menu, Pencil,
  Moon, Plus, Quote, RefreshCw, Search, Settings, ShoppingBag, Sparkles, Sun, Target, TrendingUp,
  Wallet, X,
} from 'lucide-react'
import { supabase, supabaseConfigured } from './supabase'
import { demoData } from './demoData'
import { philosophyQuotes } from './quotes'
import type { AnnualGoal, Budget, CalendarEvent, FinanceData, ShoppingItem, ShoppingList, Transaction } from './types'
import './MiSer.css'

type Page = 'overview' | 'activity' | 'calendar' | 'goals' | 'shopping' | 'settings'
type Modal = { kind: 'transaction'; item?: Transaction } | { kind: 'event'; item?: CalendarEvent; date?: string } | { kind: 'goal'; item?: AnnualGoal } | { kind: 'list'; item?: ShoppingList } | { kind: 'shoppingItem'; listId: string; item?: ShoppingItem } | { kind: 'budget'; item?: Budget } | null
type Session = { user: { id: string; email?: string } } | null
type MotivationQuote = { text: string; author: string; work?: string; source: string; sourceLabel?: string; translation?: boolean }

const currency = (value: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
const shortDate = (value: string) => new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`))
const longDate = (value: Date) => new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long' }).format(value)
const monthId = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const id = () => crypto.randomUUID()
const blankData: FinanceData = { transactions: [], events: [], goals: [], lists: [], budgets: [] }
const localMotivationQuotes = philosophyQuotes as readonly MotivationQuote[]
const demoStorageKey = 'miser-demo'
const previousDemoStorageKey = 'brisa-demo'
const seenMotivationQuotesKey = 'miser-seen-motivation-quotes'
const dailyMotivationQuoteKey = 'miser-daily-motivation-quote'

const normalizeQuotePart = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').replace(/[\p{P}\p{S}\s]+/gu, '')
const quoteIdentity = (quote: MotivationQuote) => normalizeQuotePart(quote.text)
const readSeenMotivationQuotes = () => {
  try {
    const value = JSON.parse(localStorage.getItem(seenMotivationQuotesKey) ?? '[]')
    return new Set<string>(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item: string) => {
      const separator = item.indexOf('|')
      return separator < 0 ? normalizeQuotePart(item) : normalizeQuotePart(item.slice(separator + 1))
    }) : [])
  }
  catch { return new Set<string>() }
}
const saveSeenMotivationQuote = (quote: MotivationQuote) => {
  try { const seen = readSeenMotivationQuotes(); seen.add(quoteIdentity(quote)); localStorage.setItem(seenMotivationQuotesKey, JSON.stringify([...seen])) }
  catch { /* The quote remains visible if browser storage is unavailable. */ }
}
const getLocalDateId = () => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` }
const readDailyMotivationQuote = (): MotivationQuote | null => {
  try {
    const value = JSON.parse(localStorage.getItem(dailyMotivationQuoteKey) ?? 'null') as { date?: string; quote?: MotivationQuote } | null
    return value?.date === getLocalDateId() && value.quote?.text && value.quote.author ? value.quote : null
  } catch { return null }
}
const saveDailyMotivationQuote = (quote: MotivationQuote) => {
  try { localStorage.setItem(dailyMotivationQuoteKey, JSON.stringify({ date: getLocalDateId(), quote })) }
  catch { /* Daily display still works for this session. */ }
}
async function requestApiQuote(): Promise<MotivationQuote | null> {
  const response = await fetch('/api/quote?language=es', { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error('No se pudo consultar la API de frases.')
  const result: unknown = await response.json()
  if (!result || typeof result !== 'object') return null
  const entry = result as { quote?: unknown; author?: unknown }
  if (typeof entry.quote !== 'string' || !entry.quote.trim() || typeof entry.author !== 'string' || !entry.author.trim()) return null
  return { text: entry.quote.trim(), author: entry.author.trim(), source: 'https://github.com/gpalleschi/quotes_api', sourceLabel: 'Base de frases' }
}

const webUrl = (value: string) => {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch { return null }
}
const shoppingImageSrc = (value?: string) => value?.startsWith('data:image/jpeg;base64,') ? value : value ? webUrl(value) : null
const linkLabel = (value: string) => new URL(value).hostname.replace(/^www\./, '')

async function compressShoppingImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error('Usa una imagen JPG, PNG, WebP o AVIF.')
  if (file.size > 10 * 1024 * 1024) throw new Error('La imagen debe pesar menos de 10 MB.')
  const bitmap = await createImageBitmap(file)
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const scale = Math.min(1, 760 * Math.pow(0.78, attempt) / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No se pudo preparar la imagen.')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const result = canvas.toDataURL('image/jpeg', Math.max(0.48, 0.78 - attempt * 0.08))
      if (result.length <= 140_000) return result
    }
    throw new Error('La imagen sigue siendo demasiado grande. Prueba con otra.')
  } finally { bitmap.close() }
}

function BrandMark() {
  return <span className="brand-mark"><img src="/favicon.svg" alt="" /></span>
}

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { id: 'activity', label: 'Movimientos', icon: CreditCard },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'goals', label: 'Mis objetivos', icon: Target },
  { id: 'shopping', label: 'Listas de compras', icon: ShoppingBag },
]

function AuthScreen() {
  const [register, setRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setMessage('')
    const result = register
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (result.error) setMessage(result.error.message)
    else if (register && !result.data.session) setMessage('Revisa tu correo para confirmar la cuenta y luego inicia sesión.')
  }
  return <main className="auth-screen">
    <div className="auth-art"><div className="auth-art-brand"><BrandMark /> <span>MiSer</span></div><div className="auth-quote"><span className="eyebrow light">TUS FINANZAS, CON CALMA</span><h1>Un poquito<br />más claro,<br /><em>cada día.</em></h1><p>Un espacio para cuidar tu dinero y tus planes.</p><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-flower">✳</div></div><span className="auth-art-footer">Tu espacio personal · USD</span></div>
    <div className="auth-form-wrap"><div className="auth-form"><div className="mobile-brand"><BrandMark /> MiSer</div><span className="eyebrow">BIENVENIDA A TU ESPACIO</span><h2>{register ? 'Crea tu cuenta' : 'Qué bueno verte'}</h2><p className="muted">{register ? 'Empieza a ordenar tus ideas y tu dinero.' : 'Inicia sesión para ver tu mundo financiero.'}</p><form onSubmit={submit} className="stack-form"><label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" /></label><label>Contraseña<input type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Al menos 6 caracteres" /></label>{message && <div className="inline-message">{message}</div>}<button className="btn btn-primary full" disabled={busy}>{busy ? 'Un momento…' : register ? 'Crear cuenta' : 'Iniciar sesión'} <ArrowRight size={16} /></button></form><p className="auth-switch">{register ? '¿Ya tienes cuenta?' : '¿Es tu primera vez?'} <button onClick={() => { setRegister(!register); setMessage('') }}>{register ? 'Inicia sesión' : 'Crea una cuenta'}</button></p><div className="auth-privacy"><Heart size={15} /> Tu información es privada y solo tú puedes verla.</div></div></div>
  </main>
}

function App() {
  const [page, setPage] = useState<Page>('overview')
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('miser-theme') === 'dark' } catch { return false }
  })
  const [data, setData] = useState<FinanceData | null>(supabaseConfigured ? null : (() => {
    try { const stored = localStorage.getItem(demoStorageKey) ?? localStorage.getItem(previousDemoStorageKey); return stored ? JSON.parse(stored) as FinanceData : demoData } catch { return demoData }
  })())
  const [session, setSession] = useState<Session>(null)
  const [loaded, setLoaded] = useState(!supabaseConfigured)
  const [modal, setModal] = useState<Modal>(null)
  const [toast, setToast] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const userId = session?.user.id

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data: result }) => setSession(result.session as Session))
    const { data: auth } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next as Session)
      if (!next) { setData(null); setLoaded(false) }
    })
    return () => auth.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client || !userId) return
    let active = true
    client.from('finance_data').select('data').eq('user_id', userId).maybeSingle().then(({ data: result, error }) => {
      if (!active) return
      if (error) showToast('No se pudo cargar tu información. Revisa la configuración de Supabase.')
      const saved = result?.data as FinanceData | undefined
      setData(saved ? { ...blankData, ...saved } : blankData)
      setLoaded(true)
    })
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (!data || !loaded) return
    if (!supabaseConfigured) {
      try { localStorage.setItem(demoStorageKey, JSON.stringify(data)) }
      catch { showToast('No hay espacio suficiente en este navegador para guardar los cambios.') }
      return
    }
    const client = supabase
    if (!client || !userId) return
    const timer = window.setTimeout(async () => {
      const { error } = await client.from('finance_data').upsert({ user_id: userId, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) showToast('No se pudo sincronizar. Vuelve a intentarlo cuando tengas conexión.')
    }, 450)
    return () => window.clearTimeout(timer)
  }, [data, loaded, userId])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#10131b' : '#f8f7f2')
    try { localStorage.setItem('miser-theme', darkMode ? 'dark' : 'light') } catch { /* Theme still applies for this session. */ }
  }, [darkMode])

  function showToast(message: string) { setToast(message) }
  const today = new Date()
  const currentMonth = monthId(today)
  const monthBudget = data?.budgets.find(b => b.month === currentMonth) ?? { month: currentMonth, totalLimit: 1200, categoryLimits: { Comida: 350, Hogar: 600, Transporte: 100, Salud: 150 } }
  const monthTransactions = (data?.transactions ?? []).filter(t => t.date.startsWith(currentMonth))
  const income = monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  const expenses = monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
  const remaining = monthBudget.totalLimit - expenses

  const modify = (fn: (old: FinanceData) => FinanceData) => setData(old => old ? fn(old) : old)
  const signOut = async () => { await supabase?.auth.signOut(); setPage('overview') }
  const saveTransaction = (item: Transaction) => modify(old => ({ ...old, transactions: [item, ...old.transactions.filter(t => t.id !== item.id)] }))
  const saveEvent = (item: CalendarEvent) => modify(old => ({ ...old, events: [...old.events.filter(e => e.id !== item.id), item].sort((a, b) => a.date.localeCompare(b.date)) }))
  const saveGoal = (item: AnnualGoal) => modify(old => ({ ...old, goals: [...old.goals.filter(g => g.id !== item.id), item] }))
  const saveList = (item: ShoppingList) => modify(old => ({ ...old, lists: [...old.lists.filter(l => l.id !== item.id), item] }))
  const saveShoppingItem = (listId: string, item: ShoppingItem) => modify(old => ({ ...old, lists: old.lists.map(list => list.id === listId ? { ...list, items: list.items.some(entry => entry.id === item.id) ? list.items.map(entry => entry.id === item.id ? item : entry) : [...list.items, item] } : list) }))
  const saveBudget = (item: Budget) => modify(old => ({ ...old, budgets: [...old.budgets.filter(b => b.month !== item.month), item] }))
  const deleteTransaction = (key: string) => modify(old => ({ ...old, transactions: old.transactions.filter(t => t.id !== key) }))
  const deleteEvent = (key: string) => modify(old => ({ ...old, events: old.events.filter(e => e.id !== key) }))
  const deleteGoal = (key: string) => modify(old => ({ ...old, goals: old.goals.filter(g => g.id !== key) }))
  const deleteList = (key: string) => modify(old => ({ ...old, lists: old.lists.filter(l => l.id !== key) }))

  if (supabaseConfigured && !session) return <AuthScreen />
  if (!data || !loaded) return <div className="loading-screen"><BrandMark /><span>Cargando tu espacio…</span></div>

  const title = navItems.find(item => item.id === page)?.label ?? 'Ajustes'
  const isDemo = !supabaseConfigured
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><BrandMark /><span>MiSer</span><button className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={18} /></button></div>
      <div className="sidebar-label">ESPACIO PERSONAL</div>
      <nav className="main-nav">{navItems.map(item => { const Icon = item.id === 'activity' ? Wallet : item.id === 'shopping' ? ListChecks : item.icon; return <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => { setPage(item.id); setMenuOpen(false) }}><Icon size={18} strokeWidth={1.8} /><span>{item.id === 'activity' ? 'Finanzas' : item.id === 'goals' ? 'Objetivos' : item.id === 'shopping' ? 'Compras' : item.label}</span>{item.id === 'shopping' && <span className="nav-count">{data.lists.length}</span>}</button>})}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><div className="note-icon"><Sparkles size={16} /></div><strong>Pequeños pasos.</strong><span>Grandes cambios para tu día a día.</span><button onClick={() => setPage('goals')}>Ver mis objetivos <ArrowRight size={13} /></button></div><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><Settings size={18} strokeWidth={1.8} /><span>Ajustes</span></button><div className="profile"><span className="avatar">{isDemo ? 'M' : (session?.user.email?.[0] ?? 'T').toUpperCase()}</span><span className="profile-name">{isDemo ? 'Mi espacio' : session?.user.email}</span>{isDemo ? <span className="demo-dot" title="Modo de demostración" /> : <button className="icon-button" onClick={signOut} aria-label="Cerrar sesión"><LogOut size={16} /></button>}</div></div>
    </aside>
    {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />}
    <main className="main-content">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button><div className="breadcrumb"><span>{new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long' }).format(today)}</span><strong>{page === 'overview' ? 'Hola, qué bueno verte ✦' : title}</strong></div><div className="topbar-actions"><button className="icon-button notification-button" onClick={() => { setPage('calendar'); showToast('Aquí verás tus eventos y próximos pagos.') }} aria-label="Ver recordatorios"><Bell size={18} /><i /></button><button className="icon-button theme-quick-toggle" type="button" onClick={() => setDarkMode(value => !value)} aria-label={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'} title={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button><span className="top-avatar">{isDemo ? 'M' : (session?.user.email?.[0] ?? 'T').toUpperCase()}</span><span className="profile-name top-profile-name">{isDemo ? 'Mi espacio' : session?.user.email}</span></div></header>
      {isDemo && <div className="demo-banner"><span><Sparkles size={14} /> Estás explorando el modo de demostración. Tus cambios se guardan solo en este navegador.</span><button onClick={() => setPage('settings')}>Configurar sincronización <ArrowRight size={13} /></button></div>}
      {page === 'overview' && <Overview data={data} income={income} expenses={expenses} remaining={remaining} budget={monthBudget} currentMonth={currentMonth} onAdd={() => setModal({ kind: 'transaction' })} onAddEvent={() => setModal({ kind: 'event', date: isoDate(today) })} onEditTransaction={item => setModal({ kind: 'transaction', item })} onNavigate={setPage} />}
      {page === 'activity' && <Activity data={data} query={search} setQuery={setSearch} onAdd={() => setModal({ kind: 'transaction' })} onEdit={item => setModal({ kind: 'transaction', item })} onDelete={deleteTransaction} />}
      {page === 'calendar' && <CalendarPage data={data} onAdd={date => setModal({ kind: 'event', date })} onEdit={item => setModal({ kind: 'event', item })} onDelete={deleteEvent} onNotice={showToast} />}
      {page === 'goals' && <GoalsPage data={data} onAdd={() => setModal({ kind: 'goal' })} onEdit={item => setModal({ kind: 'goal', item })} onDelete={deleteGoal} />}
      {page === 'shopping' && <ShoppingPage data={data} modify={modify} onAdd={() => setModal({ kind: 'list' })} onEdit={item => setModal({ kind: 'list', item })} onDelete={deleteList} onAddItem={listId => setModal({ kind: 'shoppingItem', listId })} onEditItem={(listId, item) => setModal({ kind: 'shoppingItem', listId, item })} />}
      {page === 'settings' && <SettingsPage isDemo={isDemo} email={session?.user.email ?? ''} darkMode={darkMode} onDarkModeChange={setDarkMode} onBudget={() => setModal({ kind: 'budget', item: monthBudget })} onLogout={signOut} />}
    </main>
    {modal && <EditModal modal={modal} month={currentMonth} onClose={() => setModal(null)} onSaveTransaction={saveTransaction} onSaveEvent={saveEvent} onSaveGoal={saveGoal} onSaveList={saveList} onSaveShoppingItem={saveShoppingItem} onSaveBudget={saveBudget} />}
    {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
  </div>
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="muted">{subtitle}</p></div>{action}</div>
}

function Overview({ data, income, expenses, remaining, budget, currentMonth, onAdd, onAddEvent, onEditTransaction, onNavigate }: { data: FinanceData; income: number; expenses: number; remaining: number; budget: Budget; currentMonth: string; onAdd: () => void; onAddEvent: () => void; onEditTransaction: (item: Transaction) => void; onNavigate: (page: Page) => void }) {
  const now = new Date()
  const latest = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
  const upcoming = data.events.filter(e => e.date >= isoDate(now)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2)
  const goal = data.goals[0]
  const totalItems = data.lists.reduce((n, list) => n + list.items.length, 0)
  const doneItems = data.lists.reduce((n, list) => n + list.items.filter(item => item.done).length, 0)
  const balance = income - expenses
  const monthLabel = new Intl.DateTimeFormat('es-EC', { month: 'long' }).format(now)
  const days = Array.from({ length: 10 }, (_, i) => {
    const firstDay = Math.floor(i * now.getDate() / 10)
    const lastDay = Math.floor((i + 1) * now.getDate() / 10)
    return data.transactions.filter(t => t.type === 'expense' && t.date.startsWith(currentMonth) && Number(t.date.slice(-2)) > firstDay && Number(t.date.slice(-2)) <= lastDay).reduce((sum, t) => sum + t.amount, 0)
  })
  const max = Math.max(1, ...days)
  const nextEvent = upcoming[0]
  return <div className="page-wrap miser-dashboard">
    <section className="dashboard-hero-grid">
      <article className="miser-balance-card"><div className="balance-orbit orbit-a"/><div className="balance-orbit orbit-b"/><div className="balance-card-inner"><div className="balance-label-row"><span>Balance del mes</span><span className="hero-month">{monthLabel} <ChevronDown size={13}/></span></div><strong className="hero-balance">{currency(balance)}</strong><div className="balance-compare"><span><TrendingUp size={14}/> {balance >= 0 ? 'Vas por buen camino' : 'Revisa tu presupuesto'}</span><small>movimiento neto este mes</small></div><div className="hero-income-expense"><div><small>Ingresos</small><strong>{currency(income)}</strong></div><div><small>Gastos</small><strong>{currency(expenses)}</strong></div><div><small>Disponible</small><strong>{currency(remaining)}</strong></div></div></div></article>
      <article className="panel flow-card"><div className="flow-head"><div><span>Flujo mensual</span><strong>{currency(balance)}</strong></div><button className="flow-icon" onClick={onAdd} aria-label="Añadir movimiento"><Plus size={19}/></button></div><div className="flow-chart" aria-label="Gastos agrupados por periodos del mes">{days.map((amount, i) => <span key={i} className={i === days.length - 1 ? 'flow-bar flow-today' : 'flow-bar'} style={{height: `${Math.max(8, amount / max * 100)}%`}}/> )}</div><div className="flow-labels"><span>01 {monthLabel.slice(0,3)}</span><span>10 {monthLabel.slice(0,3)}</span><span>20 {monthLabel.slice(0,3)}</span><span>HOY</span></div><p className="flow-caption">Gastos agrupados por periodos del mes</p></article>
    </section>
    <section className="quick-links">
      <button className="quick-card quick-finance" onClick={() => onNavigate('activity')}><span className="quick-icon"><Wallet size={20}/></span><ArrowUpRight className="quick-arrow" size={17}/><small>Finanzas</small><span className="quick-sub">Controla tus gastos</span><strong>{currency(expenses)}</strong><span className="quick-foot">{budget.totalLimit ? Math.round(expenses / budget.totalLimit * 100) : 0}% del presupuesto</span></button>
      <button className="quick-card quick-goals" onClick={() => onNavigate('goals')}><span className="quick-icon"><Target size={20}/></span><ArrowUpRight className="quick-arrow" size={17}/><small>Objetivos</small><span className="quick-sub">{goal?.title ?? 'A tu ritmo'}</span><strong>{goal ? `${Math.round(goal.current / Math.max(1, goal.target) * 100)}%` : 'Empieza hoy'}</strong>{goal && <span className="quick-track"><i style={{width:`${Math.min(100,goal.current / Math.max(1,goal.target)*100)}%`}}/></span>}</button>
      <button className="quick-card quick-shopping" onClick={() => onNavigate('shopping')}><span className="quick-icon"><ShoppingBag size={20}/></span><ArrowUpRight className="quick-arrow" size={17}/><small>Lista de compras</small><span className="quick-sub">Para esta semana</span><strong>{totalItems} artículos</strong><span className="quick-foot">{doneItems} listos</span></button>
      <button className="quick-card quick-calendar" onClick={() => onNavigate('calendar')}><span className="quick-icon"><CalendarDays size={20}/></span><ArrowUpRight className="quick-arrow" size={17}/><small>Calendario</small><span className="quick-sub">Próximo evento</span><strong>{nextEvent?.title ?? 'Agenda despejada'}</strong><span className="quick-foot">{nextEvent ? `${shortDate(nextEvent.date)}${nextEvent.time ? ` · ${nextEvent.time}` : ''}` : 'Añade una fecha'}</span></button>
    </section>
    <MotivationCard />
    <section className="dashboard-lower-grid"><article className="panel recent-card"><div className="panel-heading"><div><h2>Movimientos recientes</h2><p>Tus últimas transacciones</p></div><button className="text-button" onClick={() => onNavigate('activity')}>Ver todo <ArrowRight size={14}/></button></div>{latest.length ? <div className="transaction-list">{latest.map(item => <TransactionRow key={item.id} item={item} onClick={() => onEditTransaction(item)}/>)}</div> : <EmptyState icon={<CreditCard size={20}/>} title="Sin movimientos aún" text="Añade un ingreso o gasto para comenzar."/>}</article><article className="week-card"><span className="week-deco"/><div className="week-card-content"><div className="week-top"><h2>Tu semana</h2><span>{new Intl.DateTimeFormat('es-EC',{day:'numeric',month:'short'}).format(now)}</span></div><p>Un paso a la vez, cada día cuenta.</p><div className="week-progress-copy"><div><small>Eventos próximos</small><strong>{upcoming.length} <i>en agenda</i></strong></div><div className="week-ring" style={{'--progress': `${Math.min(100, data.events.filter(e => e.date >= isoDate(now) && e.date <= isoDate(new Date(now.getTime()+6*86400000))).length * 22)}%`} as React.CSSProperties}><span>{Math.min(100, data.events.filter(e => e.date >= isoDate(now) && e.date <= isoDate(new Date(now.getTime()+6*86400000))).length * 22)}%</span></div></div><button onClick={onAddEvent}>Añadir recordatorio <ArrowRight size={15}/></button></div></article></section>
  </div>
}
function MotivationCard() {
  const [quote, setQuote] = useState<MotivationQuote>(() => {
    const cached = readDailyMotivationQuote()
    if (cached) return cached
    const today = new Date()
    return philosophyQuotes[(today.getFullYear() * 372 + today.getMonth() * 31 + today.getDate()) % philosophyQuotes.length]
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const seenQuotes = useRef(readSeenMotivationQuotes())
  const initialized = useRef(false)
  const markSeen = useCallback((item: MotivationQuote) => { const key = quoteIdentity(item); seenQuotes.current.add(key); saveSeenMotivationQuote(item) }, [])
  const inFlight = useRef(false)
  const nextQuote = useCallback(async (initial = false) => {
    if (inFlight.current) return
    inFlight.current = true
    await Promise.resolve()
    setLoading(true); setMessage('')
    try {
      if (initial) markSeen(quote)
      let apiFailed = false
      try {
        for (let attempt = 0; attempt < 8; attempt++) {
          const candidate = await requestApiQuote()
          if (!candidate) continue
          const key = quoteIdentity(candidate)
          if (seenQuotes.current.has(key)) continue
          markSeen(candidate); saveDailyMotivationQuote(candidate); setQuote(candidate); return
        }
      } catch { apiFailed = true }
      const fallback = localMotivationQuotes.find(item => !seenQuotes.current.has(quoteIdentity(item)))
      if (fallback) {
        markSeen(fallback); saveDailyMotivationQuote(fallback); setQuote(fallback)
        setMessage(apiFailed ? 'La API no respondió; usamos una frase guardada.' : 'No llegó una frase nueva de la API; usamos una frase guardada.')
      } else {
        setMessage('Ya se mostraron las frases disponibles. Prueba más tarde para consultar la API de nuevo.')
      }
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [markSeen, quote])
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const cached = readDailyMotivationQuote()
    if (cached) { markSeen(cached); return }
    void nextQuote(true)
  }, [markSeen, nextQuote])
  return <aside className="motivation-card" aria-label="Frase para hoy">
    <span className="motivation-icon"><Quote size={20} /></span>
    <div className="motivation-copy"><span className="eyebrow">UNA IDEA PARA HOY</span><blockquote>“{quote.text}”</blockquote><div className="motivation-credit"><strong>{quote.author}</strong>{quote.work && <span>· {quote.work}</span>}{quote.translation && <span>· versión libre</span>}<a href={quote.source} target="_blank" rel="noopener noreferrer">{quote.sourceLabel ?? 'Fuente'} <ExternalLink size={12} /></a></div>{message && <small className="motivation-message" role="status">{message}</small>}</div>
    <button className="motivation-next" type="button" onClick={() => void nextQuote()} disabled={loading} aria-label={loading ? 'Buscando otra frase' : 'Ver otra frase'} title={loading ? 'Buscando otra frase' : 'Ver otra frase'}><RefreshCw size={16} className={loading ? 'motivation-spinning' : ''} /></button>
  </aside>
}function TransactionRow({ item, onClick }: { item: Transaction; onClick: () => void }) {
  const icon = item.type === 'income' ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />
  return <button className="transaction-row" onClick={onClick}><span className={`transaction-icon ${item.type === 'income' ? 'transaction-income' : 'transaction-expense'}`}>{icon}</span><span className="transaction-main"><strong>{item.title}</strong><small>{item.category} · {shortDate(item.date)}</small></span><strong className={`transaction-value ${item.type === 'income' ? 'value-income' : ''}`}>{item.type === 'income' ? '+' : '−'}{currency(item.amount)}</strong><Ellipsis className="row-more" size={17} /></button>
}

function Activity({ data, query, setQuery, onAdd, onEdit, onDelete }: { data: FinanceData; query: string; setQuery: (value: string) => void; onAdd: () => void; onEdit: (item: Transaction) => void; onDelete: (id: string) => void }) {
  const filtered = data.transactions.filter(t => `${t.title} ${t.category}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date))
  const sumIn = filtered.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0)
  const sumOut = filtered.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
  return <div className="page-wrap"><PageHeading eyebrow="TU DINERO, MOVIMIENTO A MOVIMIENTO" title="Movimientos" subtitle="Todos tus ingresos y gastos en un mismo lugar." action={<button className="btn btn-primary" onClick={onAdd}><Plus size={17} /> Añadir movimiento</button>} /><div className="activity-stats"><div><span>Ingresos registrados</span><strong className="value-income">+{currency(sumIn)}</strong></div><div><span>Gastos registrados</span><strong>−{currency(sumOut)}</strong></div><div><span>Balance</span><strong>{currency(sumIn - sumOut)}</strong></div></div><section className="panel activity-panel"><div className="activity-toolbar"><div className="search-box"><Search size={16} /><input placeholder="Buscar movimiento o categoría" value={query} onChange={e => setQuery(e.target.value)} /></div><button className="select-button" onClick={() => setQuery('')}>Todos los movimientos <ChevronDown size={14} /></button></div>{filtered.length ? <div className="transaction-list">{filtered.map(item => <div className="activity-item" key={item.id}><TransactionRow item={item} onClick={() => onEdit(item)} /><button className="delete-mini" title="Eliminar movimiento" onClick={() => onDelete(item.id)}><X size={15} /></button></div>)}</div> : <EmptyState icon={<Search size={20} />} title="No encontramos movimientos" text="Prueba otra búsqueda o añade un movimiento nuevo." />}</section><p className="page-footnote">Los movimientos son privados y se muestran según la información de tu espacio.</p></div>
}

function CalendarPage({ data, onAdd, onEdit, onDelete, onNotice }: { data: FinanceData; onAdd: (date: string) => void; onEdit: (item: CalendarEvent) => void; onDelete: (id: string) => void; onNotice: (message: string) => void }) {
  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(isoDate(new Date()))
  const [selected, setSelected] = useState(isoDate(new Date()))
  const today = new Date()
  const anchorDate = new Date(`${anchor}T12:00:00`)
  const monday = new Date(anchorDate)
  monday.setDate(anchorDate.getDate() - ((anchorDate.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setDate(monday.getDate() + index); return date })
  const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 12)
  const monthGridStart = new Date(firstOfMonth)
  monthGridStart.setDate(1 - ((firstOfMonth.getDay() + 6) % 7))
  const monthGridLength = Math.ceil((((firstOfMonth.getDay() + 6) % 7) + new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate()) / 7) * 7
  const monthDays = Array.from({ length: monthGridLength }, (_, index) => { const date = new Date(monthGridStart); date.setDate(monthGridStart.getDate() + index); return date })
  const selectedEvents = data.events.filter(event => event.date === selected).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  const upcoming = data.events.filter(event => event.date >= isoDate(today)).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')).slice(0, 5)
  const range = `${new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short' }).format(days[0])} — ${new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', year: 'numeric' }).format(days[6])}`
  const monthLabel = new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric' }).format(firstOfMonth)
  const changeView = (nextView: 'week' | 'month') => { setView(nextView); setAnchor(selected) }
  const navigate = (direction: number) => {
    const next = view === 'month'
      ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() + direction, 1, 12)
      : new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + direction * 7, 12)
    const key = isoDate(next)
    setAnchor(key)
    setSelected(key)
  }
  const requestNotice = async () => {
    if (!('Notification' in window)) { onNotice('Este navegador no admite notificaciones. Tus eventos seguirán visibles en el calendario.'); return }
    const permission = await Notification.requestPermission()
    onNotice(permission === 'granted' ? 'Permiso de avisos activado. Tus próximos eventos siguen visibles en el calendario.' : 'Puedes permitir avisos desde la configuración de tu navegador.')
  }
  return <div className="page-wrap"><PageHeading eyebrow="FECHAS IMPORTANTES" title="Tu calendario" subtitle="Ten a la vista los eventos y pagos que vienen." action={<div className="heading-actions"><button className="btn btn-soft" onClick={requestNotice}><Bell size={16}/> Activar avisos</button><button className="btn btn-primary" onClick={() => onAdd(selected)}><Plus size={17}/> Añadir evento</button></div>} />
    <div className="calendar-week-toolbar"><div><span className="eyebrow">TU AGENDA</span><h2 className={view === 'month' ? 'month-heading' : undefined}>{view === 'month' ? `${monthLabel[0].toUpperCase()}${monthLabel.slice(1)}` : range}</h2></div><div className="calendar-toolbar-actions"><div className="calendar-view-toggle" role="group" aria-label="Vista del calendario"><button type="button" className={view === 'week' ? 'active' : ''} aria-pressed={view === 'week'} onClick={() => changeView('week')}>Semana</button><button type="button" className={view === 'month' ? 'active' : ''} aria-pressed={view === 'month'} onClick={() => changeView('month')}>Mes</button></div><div className="month-arrows"><button className="icon-button pale-icon" aria-label={view === 'month' ? 'Mes anterior' : 'Semana anterior'} onClick={() => navigate(-1)}><ArrowLeft size={16}/></button><button className="icon-button pale-icon" aria-label={view === 'month' ? 'Mes siguiente' : 'Semana siguiente'} onClick={() => navigate(1)}><ArrowRight size={16}/></button></div></div></div>
    <div className={`calendar-layout ${view === 'week' ? 'weekly-calendar-layout' : 'monthly-calendar-layout'}`}><section className="panel calendar-panel">
      {view === 'week' ? <div className="week-calendar-scroll"><div className="week-calendar">{days.map(day => { const key = isoDate(day); const dayEvents = data.events.filter(event => event.date === key).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')); return <div className={`week-day-column ${key === selected ? 'week-day-selected' : ''} ${key === isoDate(today) ? 'week-today' : ''}`} key={key}><button className="week-day-heading" onClick={() => setSelected(key)}><span>{new Intl.DateTimeFormat('es-EC', { weekday: 'short' }).format(day).replace('.', '')}</span><strong>{day.getDate()}</strong></button><button className="week-add-day" onClick={() => { setSelected(key); onAdd(key) }} aria-label={`Añadir evento ${key}`}><Plus size={13}/></button><div className="week-events">{dayEvents.map(event => <button className={`schedule-event ${event.kind === 'payment' ? 'schedule-payment' : `schedule-${event.category ?? 'personal'}`}`} key={event.id} onClick={() => { setSelected(key); onEdit(event) }}><span>{event.time || (event.kind === 'payment' ? 'Pago' : 'Evento')}</span><strong>{event.title}</strong>{event.location && <small>{event.location}</small>}{event.kind === 'payment' && <small>{currency(event.amount ?? 0)}</small>}</button>)}</div></div> })}</div></div> : <div className="month-calendar"><div className="calendar-grid calendar-weekdays">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid month-calendar-grid">{monthDays.map(day => { const key = isoDate(day); const dayEvents = data.events.filter(event => event.date === key).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')); return <button type="button" key={key} className={`calendar-cell month-day ${monthId(day) !== monthId(firstOfMonth) ? 'month-outside' : ''} ${key === selected ? 'selected-day' : ''} ${key === isoDate(today) ? 'today-day' : ''}`} aria-pressed={key === selected} aria-label={`${longDate(day)}${dayEvents.length ? `, ${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventos'}` : ', sin eventos'}`} onClick={() => { setSelected(key); if (monthId(day) !== monthId(firstOfMonth)) setAnchor(key) }}><strong className="month-day-number">{day.getDate()}</strong><span className="month-day-events">{dayEvents.slice(0, 2).map(event => <span key={event.id} className={`month-event-chip month-event-${event.kind === 'payment' ? 'payment' : event.category ?? 'personal'}`} title={event.title}>{event.title}</span>)}{dayEvents.length > 2 && <small className="month-more">+{dayEvents.length - 2} más</small>}</span><span className="month-day-dots" aria-hidden="true">{dayEvents.slice(0, 3).map(event => <i key={event.id} className={`month-dot-${event.kind === 'payment' ? 'payment' : event.category ?? 'personal'}`} />)}</span></button> })}</div></div>}
      <div className="calendar-legend"><span><i className="legend-personal"/>Personal</span><span><i className="legend-work"/>Trabajo</span><span><i className="legend-health"/>Salud</span><span><i className="payment-dot"/>Pago</span></div></section>
      <aside className="panel day-panel"><div className="day-panel-heading"><div><span className="eyebrow">DÍA SELECCIONADO</span><h2>{longDate(new Date(`${selected}T12:00:00`))}</h2></div><button className="icon-button pale-icon" onClick={() => onAdd(selected)} aria-label="Añadir a este día"><Plus size={17}/></button></div>{selectedEvents.length ? <div className="day-events">{selectedEvents.map(event => <div className={`day-event ${event.kind === 'payment' ? 'day-event-payment' : ''}`} key={event.id}><span className="day-event-icon">{event.kind === 'payment' ? <CreditCard size={17}/> : <CalendarDays size={17}/>}</span><span className="day-event-copy"><strong>{event.title}</strong><small>{event.time || 'Sin hora'}{event.location ? ` · ${event.location}` : ''}</small>{event.kind === 'payment' && <small>Pago · {currency(event.amount ?? 0)}</small>}{event.note && <small>{event.note}</small>}</span><button className="delete-mini" onClick={() => onEdit(event)} aria-label="Editar evento"><Ellipsis size={16}/></button><button className="delete-mini" onClick={() => onDelete(event.id)} aria-label="Eliminar evento"><X size={15}/></button></div>)}</div> : <EmptyState icon={<CalendarDays size={20}/>} title="Un día para ti" text="No hay nada agendado. Puedes dejarlo así o añadir un recordatorio."/>}<button className="btn btn-soft full" onClick={() => onAdd(selected)}><Plus size={16}/> Agregar a este día</button><div className="upcoming-month"><h3>Próximos eventos</h3>{upcoming.length ? upcoming.map(event => <button key={event.id} onClick={() => { setSelected(event.date); onEdit(event) }}><span className="upcoming-date-small">{shortDate(event.date)}</span><span>{event.title}</span><ArrowRight size={13}/></button>) : <p className="muted">Tu agenda está despejada.</p>}</div></aside>
    </div></div>
}
function GoalsPage({ data, onAdd, onEdit, onDelete }: { data: FinanceData; onAdd: () => void; onEdit: (goal: AnnualGoal) => void; onDelete: (id: string) => void }) {
  const total = data.goals.length
  const completed = data.goals.filter(g => g.current >= g.target).length
  return <div className="page-wrap"><PageHeading eyebrow="TU AÑO, A TU MANERA" title="Objetivos que te mueven" subtitle="Define lo que quieres lograr y celebra cada pequeño avance." action={<button className="btn btn-primary" onClick={onAdd}><Plus size={17} /> Nuevo objetivo</button>} /><div className="goal-intro"><span className="goal-intro-star"><Sparkles size={20} /></span><div><strong>Vas construyendo tu año a tu ritmo.</strong><span>{completed} de {total} objetivos completados · cada paso cuenta.</span></div><div className="goal-intro-deco">✳</div></div>{data.goals.length ? <div className="goals-grid">{data.goals.map((goal, index) => { const percent = Math.min(100, Math.round(goal.current / Math.max(1, goal.target) * 100)); const colors = ['goal-peach', 'goal-lilac', 'goal-sage', 'goal-yellow']; return <article className={`goal-card ${colors[index % colors.length]}`} key={goal.id}><div className="goal-card-top"><span className="goal-category">{goal.category}</span><button className="icon-button" onClick={() => onEdit(goal)} aria-label="Editar objetivo"><Ellipsis size={18} /></button></div><h2>{goal.title}</h2><div className="goal-card-progress"><div className="goal-numbers"><strong>{goal.unit === 'USD' ? currency(goal.current) : `${goal.current} ${goal.unit}`}</strong><span>de {goal.unit === 'USD' ? currency(goal.target) : `${goal.target} ${goal.unit}`}</span></div><div className="goal-track"><i style={{ width: `${percent}%` }} /></div><div className="goal-progress-foot"><span>{percent}% completado</span><span>Meta: {shortDate(goal.dueDate)}</span></div></div><div className="goal-card-actions"><button onClick={() => onEdit(goal)}><Plus size={14} /> Actualizar progreso</button><button className="delete-goal" onClick={() => onDelete(goal.id)} aria-label="Eliminar objetivo"><X size={15} /></button></div></article> })}</div> : <div className="panel"><EmptyState icon={<Target size={22} />} title="Empieza con una idea" text="Un viaje, un ahorro, un hábito. Tu siguiente objetivo puede ser pequeño." /><button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> Crear objetivo</button></div>}</div>
}

function ShoppingPage({ data, modify, onAdd, onEdit, onDelete, onAddItem, onEditItem }: { data: FinanceData; modify: (fn: (old: FinanceData) => FinanceData) => void; onAdd: () => void; onEdit: (list: ShoppingList) => void; onDelete: (id: string) => void; onAddItem: (listId: string) => void; onEditItem: (listId: string, item: ShoppingItem) => void }) {
  const toggleItem = (listId: string, itemId: string) => modify(old => ({ ...old, lists: old.lists.map(list => list.id === listId ? { ...list, items: list.items.map(item => item.id === itemId ? { ...item, done: !item.done } : item) } : list) }))
  const removeItem = (listId: string, itemId: string) => modify(old => ({ ...old, lists: old.lists.map(list => list.id === listId ? { ...list, items: list.items.filter(item => item.id !== itemId) } : list) }))
  return <div className="page-wrap">
    <PageHeading eyebrow="PARA QUE NADA SE QUEDE EN EL CARRITO" title="Listas de compras" subtitle="Guarda ideas, detalles y enlaces para cuando llegue el momento de comprar." action={<button className="btn btn-primary" onClick={onAdd}><Plus size={17} /> Nueva lista</button>} />
    {data.lists.length ? <div className="shopping-grid">{data.lists.map((list, index) => {
      const done = list.items.filter(item => item.done).length
      return <article className="panel shopping-card" key={list.id}>
        <div className="shopping-card-head"><span className={`shopping-illustration illustration-${index % 3}`}><ShoppingBag size={21} /></span><div className="shopping-list-title"><h2>{list.title}</h2><span>{list.store || 'Sin tienda'} · {done}/{list.items.length} listos</span></div><button className="icon-button pale-icon" onClick={() => onEdit(list)} aria-label={`Editar lista ${list.title}`}><Ellipsis size={18} /></button></div>
        <div className="shopping-progress"><span style={{ width: `${list.items.length ? done / list.items.length * 100 : 0}%` }} /></div>
        <div className="shopping-items">{list.items.map(item => {
          const imageSrc = shoppingImageSrc(item.imageUrl)
          return <div className={`shopping-item shopping-item-detailed ${item.done ? 'item-done' : ''}`} key={item.id}>
            <button className={`check-circle ${item.done ? 'checked' : ''}`} onClick={() => toggleItem(list.id, item.id)} aria-label={item.done ? `Marcar ${item.name} pendiente` : `Marcar ${item.name} comprado`}>{item.done && <Check size={13} />}</button>
            {imageSrc && <img className="shopping-item-image" src={imageSrc} alt={`Imagen de ${item.name}`} loading="lazy" />}
            <div className="shopping-item-copy"><button className="shopping-item-name" onClick={() => onEditItem(list.id, item)}>{item.name}</button>{item.description && <p>{item.description}</p>}{(item.quantity || item.amount !== undefined) && <small>{[item.quantity, item.amount !== undefined ? currency(item.amount) : ''].filter(Boolean).join(' · ')}</small>}{item.purchaseLinks?.length ? <div className="shopping-item-links">{item.purchaseLinks.map((link, linkIndex) => { const href = webUrl(link); return href ? <a key={`${link}-${linkIndex}`} href={href} target="_blank" rel="noopener noreferrer" title={href}><Link2 size={12} /> {linkLabel(href)}</a> : null })}</div> : null}</div>
            <button className="delete-mini" onClick={() => onEditItem(list.id, item)} aria-label={`Editar ${item.name}`}><Pencil size={14} /></button><button className="delete-mini" onClick={() => removeItem(list.id, item.id)} aria-label={`Eliminar ${item.name}`}><X size={14} /></button>
          </div>
        })}</div>
        <button className="shopping-add-detail" onClick={() => onAddItem(list.id)}><Plus size={15} /> Añadir artículo con detalles</button>
        <button className="delete-list" onClick={() => onDelete(list.id)}>Eliminar lista</button>
      </article>
    })}<button className="new-list-card" onClick={onAdd}><span><Plus size={20} /></span><strong>Crear otra lista</strong><small>Por tienda, ocasión o como prefieras</small></button></div> : <div className="panel"><EmptyState icon={<ListChecks size={21} />} title="Tus listas empiezan aquí" text="Crea una lista para la semana, una tienda o un proyecto." /><button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> Crear lista</button></div>}
  </div>
}function SettingsPage({ isDemo, email, darkMode, onDarkModeChange, onBudget, onLogout }: { isDemo: boolean; email: string; darkMode: boolean; onDarkModeChange: (enabled: boolean) => void; onBudget: () => void; onLogout: () => void }) {
  return <div className="page-wrap"><PageHeading eyebrow="TU ESPACIO, TUS PREFERENCIAS" title="Ajustes" subtitle="Administra tu presupuesto y la forma en que guardas tus datos." /><div className="settings-layout"><section className="panel settings-panel"><div className="settings-section"><div className="settings-section-icon">{darkMode ? <Moon size={18} /> : <Sun size={18} />}</div><div className="settings-copy"><h2>Modo oscuro</h2><p>Reduce el brillo de MiSer. Esta preferencia se guarda en este navegador.</p></div><button className={`theme-toggle ${darkMode ? 'theme-toggle-on' : ''}`} type="button" role="switch" aria-checked={darkMode} aria-label="Activar modo oscuro" onClick={() => onDarkModeChange(!darkMode)}><span /></button><span className="setting-value theme-value">{darkMode ? 'Activado' : 'Desactivado'}</span></div><div className="settings-section"><div className="settings-section-icon"><Wallet size={18} /></div><div className="settings-copy"><h2>Presupuesto mensual</h2><p>Configura tu límite general y los límites de cada categoría.</p></div><button className="btn btn-soft" onClick={onBudget}>Editar presupuesto</button></div><div className="settings-section"><div className="settings-section-icon"><Heart size={18} /></div><div className="settings-copy"><h2>Moneda principal</h2><p>Todos los importes se registran en dólares estadounidenses.</p></div><span className="setting-value">USD · $</span></div><div className="settings-section"><div className="settings-section-icon"><Download size={18} /></div><div className="settings-copy"><h2>Privacidad y almacenamiento</h2><p>{isDemo ? 'Modo demostración: los cambios se guardan solo en este navegador.' : `Sincronización en la nube activa para ${email}.`}</p></div><span className={`connection-badge ${isDemo ? 'connection-demo' : ''}`}><i />{isDemo ? 'Solo local' : 'Sincronizado'}</span></div>{!isDemo && <div className="settings-section"><div className="settings-section-icon"><LogOut size={18} /></div><div className="settings-copy"><h2>Sesión</h2><p>Cierra sesión en este dispositivo.</p></div><button className="btn btn-soft" onClick={onLogout}>Cerrar sesión</button></div>}</section><aside className="setup-card"><div className="setup-icon"><CircleHelp size={18} /></div><span className="eyebrow">TU INFORMACIÓN</span><h2>{isDemo ? '¿Quieres sincronizar?' : 'Todo en su lugar.'}</h2><p>{isDemo ? 'Conecta un proyecto de Supabase para habilitar cuentas privadas y ver tus datos en otros dispositivos. Sigue los pasos de la guía de configuración.' : 'Tu información se guarda en tu cuenta privada. Solo tú tienes acceso.'}</p><span className="setup-foot"><CheckCircle2 size={15} /> {isDemo ? 'Tus datos de muestra se quedan aquí' : 'Acceso protegido por tu cuenta'}</span></aside></div><div className="settings-tip"><Sparkles size={16} /><span><strong>Un consejo:</strong> reserva un momento al final de cada semana para revisar tus movimientos y actualizar tus objetivos.</span></div></div>
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{text}</p></div> }

function EditModal({ modal, month, onClose, onSaveTransaction, onSaveEvent, onSaveGoal, onSaveList, onSaveShoppingItem, onSaveBudget }: { modal: Exclude<Modal, null>; month: string; onClose: () => void; onSaveTransaction: (item: Transaction) => void; onSaveEvent: (item: CalendarEvent) => void; onSaveGoal: (item: AnnualGoal) => void; onSaveList: (item: ShoppingList) => void; onSaveShoppingItem: (listId: string, item: ShoppingItem) => void; onSaveBudget: (item: Budget) => void }) {
  const editing = 'item' in modal ? modal.item : undefined
  const [title, setTitle] = useState<string>(editing && 'title' in editing && typeof editing.title === 'string' ? editing.title : editing && 'name' in editing ? editing.name : '')
  const [type, setType] = useState<'income' | 'expense'>(editing && 'type' in editing ? editing.type : 'expense')
  const [amount, setAmount] = useState(editing && 'amount' in editing && editing.amount !== undefined ? String(editing.amount) : modal.kind === 'budget' && modal.item ? String(modal.item.totalLimit) : '')
  const [category, setCategory] = useState<string>(editing && 'category' in editing && typeof editing.category === 'string' ? editing.category : 'Comida')
  const [date, setDate] = useState(editing && 'date' in editing ? editing.date : ('date' in modal && modal.date) || isoDate(new Date()))
  const [note, setNote] = useState(editing && 'note' in editing ? editing.note ?? '' : '')
  const [time, setTime] = useState(editing && 'time' in editing ? editing.time ?? '' : '')
  const [location, setLocation] = useState(editing && 'location' in editing ? editing.location ?? '' : '')
  const [eventCategory, setEventCategory] = useState<'personal' | 'work' | 'health'>(editing && 'category' in editing && (editing.category === 'work' || editing.category === 'health') ? editing.category : 'personal')
  const [kind, setKind] = useState<'event' | 'payment'>(editing && 'kind' in editing ? editing.kind : 'event')
  const [remind, setRemind] = useState(editing && 'remind' in editing ? editing.remind : true)
  const [target, setTarget] = useState(editing && 'target' in editing ? String(editing.target) : '')
  const [current, setCurrent] = useState(editing && 'current' in editing ? String(editing.current) : '0')
  const goalUnits = ['USD', 'libros', 'veces', 'km', 'días']
  const [unit, setUnit] = useState(editing && 'unit' in editing ? editing.unit : 'USD')
  const [customUnit, setCustomUnit] = useState(editing && 'unit' in editing && !goalUnits.includes(editing.unit) ? editing.unit : '')
  const [store, setStore] = useState(editing && 'store' in editing ? editing.store : '')
  const [description, setDescription] = useState(editing && 'description' in editing ? editing.description ?? '' : '')
  const [quantity, setQuantity] = useState(editing && 'quantity' in editing ? editing.quantity ?? '' : '')
  const [imageUrl, setImageUrl] = useState(editing && 'imageUrl' in editing ? editing.imageUrl ?? '' : '')
  const [purchaseLinksText, setPurchaseLinksText] = useState(editing && 'purchaseLinks' in editing ? editing.purchaseLinks?.join('\n') ?? '' : '')
  const [imageBusy, setImageBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [limitsText, setLimitsText] = useState(editing && 'categoryLimits' in editing ? Object.entries(editing.categoryLimits).map(([name, value]) => `${name}: ${value}`).join(', ') : 'Comida: 350, Hogar: 600, Transporte: 100, Salud: 150')
  const heading = modal.kind === 'transaction' ? editing ? 'Editar movimiento' : 'Nuevo movimiento' : modal.kind === 'event' ? editing ? 'Editar en el calendario' : 'Añadir al calendario' : modal.kind === 'goal' ? editing ? 'Editar objetivo' : 'Nuevo objetivo' : modal.kind === 'list' ? editing ? 'Editar lista' : 'Nueva lista' : modal.kind === 'shoppingItem' ? editing ? 'Editar artículo' : 'Nuevo artículo' : 'Presupuesto mensual'
  const uploadImage = async (file?: File) => {
    if (!file) return
    setImageBusy(true); setFormError('')
    try { setImageUrl(await compressShoppingImage(file)) }
    catch (error) { setFormError(error instanceof Error ? error.message : 'No se pudo cargar la imagen.') }
    finally { setImageBusy(false) }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (modal.kind === 'shoppingItem') {
      const links = purchaseLinksText.split(/\r?\n/).map(link => link.trim()).filter(Boolean)
      if (links.some(link => !webUrl(link))) { setFormError('Cada enlace de compra debe comenzar con https:// o http://.'); return }
      if (imageUrl && !shoppingImageSrc(imageUrl)) { setFormError('El enlace de la imagen debe comenzar con https:// o http://.'); return }
      onSaveShoppingItem(modal.listId, { id: (editing as ShoppingItem | undefined)?.id ?? id(), name: title.trim(), done: (editing as ShoppingItem | undefined)?.done ?? false, description: description.trim() || undefined, quantity: quantity.trim() || undefined, amount: amount ? Number(amount) : undefined, imageUrl: imageUrl || undefined, purchaseLinks: links })
      onClose()
      return
    }
    if (modal.kind === 'transaction') onSaveTransaction({ id: (editing as Transaction | undefined)?.id ?? id(), title, type, amount: Number(amount), category, date, note })
    if (modal.kind === 'event') onSaveEvent({ id: (editing as CalendarEvent | undefined)?.id ?? id(), title, date, kind, ...(kind === 'payment' ? { amount: Number(amount) || 0 } : {}), note, remind, time, location, category: eventCategory })
    if (modal.kind === 'goal') onSaveGoal({ id: (editing as AnnualGoal | undefined)?.id ?? id(), title, category: category || 'Personal', target: Number(target), current: Number(current), dueDate: date, unit })
    if (modal.kind === 'list') onSaveList({ id: (editing as ShoppingList | undefined)?.id ?? id(), title, store, items: (editing as ShoppingList | undefined)?.items ?? [] })
    if (modal.kind === 'budget') { const categoryLimits: Record<string, number> = {}; limitsText.split(',').forEach(entry => { const [name, value] = entry.split(':').map(part => part.trim()); if (name && Number(value) >= 0) categoryLimits[name] = Number(value) }); onSaveBudget({ month, totalLimit: Number(amount), categoryLimits }) }
    onClose()
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="eyebrow">{modal.kind === 'budget' ? 'ORGANIZA TU MES' : 'TU ESPACIO PERSONAL'}</span><h2 id="modal-title">{heading}</h2></div><button className="icon-button pale-icon" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div><form className="stack-form modal-form" onSubmit={submit}>
    {modal.kind === 'transaction' && <><div className="segmented-control"><button type="button" className={type === 'expense' ? 'selected' : ''} onClick={() => setType('expense')}><ArrowUpRight size={15} /> Gasto</button><button type="button" className={type === 'income' ? 'selected income-selected' : ''} onClick={() => setType('income')}><ArrowDownLeft size={15} /> Ingreso</button></div><label>¿En qué fue?<input autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Supermercado" /></label><div className="form-row"><label>Monto (USD)<input type="number" step="0.01" min="0.01" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label><label>Categoría<select value={category} onChange={e => setCategory(e.target.value)}>{['Comida', 'Hogar', 'Transporte', 'Salud', 'Educación', 'Ocio', 'Trabajo', 'Extra', 'Ahorro', 'Otro'].map(value => <option key={value}>{value}</option>)}</select></label></div><label>Fecha<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label><label>Nota <span className="optional">· opcional</span><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Un detalle para recordar…" rows={2} /></label></>}
    {modal.kind === 'event' && <><div className="segmented-control"><button type="button" className={kind === 'event' ? 'selected' : ''} onClick={() => setKind('event')}><CalendarDays size={15} /> Evento</button><button type="button" className={kind === 'payment' ? 'selected selected-payment' : ''} onClick={() => setKind('payment')}><CreditCard size={15} /> Pago</button></div><label>Nombre<input autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === 'payment' ? 'Ej. Pago de luz' : 'Ej. Cita médica'} /></label>{kind === 'payment' && <label>Monto (USD)<input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>}<div className="form-row"><label>Fecha<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label><label>Hora<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label></div><div className="form-row"><label>Categoría<select value={eventCategory} onChange={e => setEventCategory(e.target.value as 'personal' | 'work' | 'health')}><option value="personal">Personal</option><option value="work">Trabajo</option><option value="health">Salud</option></select></label><label>Lugar<input value={location} onChange={e => setLocation(e.target.value)} placeholder="Opcional" /></label></div><label>Nota <span className="optional">· opcional</span><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Añade un detalle…" rows={2} /></label><label className="check-setting"><input type="checkbox" checked={remind} onChange={e => setRemind(e.target.checked)} /><span><strong>Recordarme</strong><small>Verás este evento en tus próximos recordatorios.</small></span></label></>}
    {modal.kind === 'goal' && <><label>¿Qué quieres lograr?<input autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Ahorrar para un viaje" /></label><div className="form-row"><label>Tipo<select value={category} onChange={e => setCategory(e.target.value)}>{['Ahorro', 'Experiencias', 'Personal', 'Salud', 'Hogar', 'Educación', 'Otro'].map(value => <option key={value}>{value}</option>)}</select></label><label>Unidad<select value={goalUnits.includes(unit) ? unit : 'custom'} onChange={e => { if (e.target.value === 'custom') setUnit(customUnit); else setUnit(e.target.value) }}>{goalUnits.map(value => <option key={value} value={value}>{value}</option>)}<option value="custom">Personalizada…</option></select></label></div>{!goalUnits.includes(unit) && <label>Unidad personalizada<input required maxLength={24} value={customUnit} onChange={e => { setCustomUnit(e.target.value); setUnit(e.target.value.trim()) }} placeholder="Ej. sesiones, páginas, kilómetros" /></label>}<div className="form-row"><label>Meta<input type="number" min="1" required value={target} onChange={e => setTarget(e.target.value)} /></label><label>Progreso actual<input type="number" min="0" value={current} onChange={e => setCurrent(e.target.value)} /></label></div><label>Fecha objetivo<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label></>}
    {modal.kind === 'list' && <><label>Nombre de la lista<input autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Compra de la semana" /></label><label>Tienda o categoría <span className="optional">· opcional</span><input value={store} onChange={e => setStore(e.target.value)} placeholder="Ej. Supermercado" /></label>{editing && <p className="modal-help">Los artículos de esta lista se conservan al editarla.</p>}</>}
    {modal.kind === 'shoppingItem' && <>
      <label>Nombre del artículo<input autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Teclado mecánico" /></label>
      <label>Descripción y detalles <span className="optional">· opcional</span><textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Modelo, color, características o por qué te interesa…" /></label>
      <div className="form-row"><label>Cantidad <span className="optional">· opcional</span><input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Ej. 1 unidad" /></label><label>Precio estimado (USD) <span className="optional">· opcional</span><input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label></div>
      <div className="shopping-image-field"><span><ImagePlus size={16} /> Imagen de referencia</span>{shoppingImageSrc(imageUrl) && <div className="shopping-image-preview"><img src={shoppingImageSrc(imageUrl)!} alt="Vista previa del artículo" /><button type="button" onClick={() => setImageUrl('')}>Quitar imagen</button></div>}<label>Subir imagen desde el dispositivo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={imageBusy} onChange={e => { void uploadImage(e.target.files?.[0]); e.target.value = '' }} /></label><label>O pegar enlace de imagen<input type="url" value={imageUrl.startsWith('data:') ? '' : imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://tienda.com/imagen.jpg" /></label><small>Las imágenes subidas se reducen para ocupar menos espacio.</small></div>
      <label>Enlaces de compra <span className="optional">· opcional</span><textarea rows={3} value={purchaseLinksText} onChange={e => setPurchaseLinksText(e.target.value)} placeholder={'https://tienda.com/producto\nhttps://otra-tienda.com/producto'} /></label><p className="modal-help">Pega un enlace por línea. Podrás abrirlos desde la lista cuando quieras comparar opciones.</p>
    </>}
    {modal.kind === 'budget' && <><label>Límite total del mes (USD)<input type="number" min="0" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></label><label>Límites por categoría <span className="optional">· separados por coma</span><textarea rows={3} value={limitsText} onChange={e => setLimitsText(e.target.value)} placeholder="Comida: 350, Hogar: 600" /></label><p className="modal-help">Escribe cada categoría como <strong>Nombre: monto</strong>. Se guardará para el mes actual.</p></>}
    {formError && <p className="shopping-form-error" role="alert">{formError}</p>}
    <div className="modal-actions"><button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={imageBusy}>{imageBusy ? 'Preparando imagen…' : editing ? 'Guardar cambios' : modal.kind === 'budget' ? 'Guardar presupuesto' : 'Guardar'} <Check size={15} /></button></div>
  </form></section></div>
}

export default App
