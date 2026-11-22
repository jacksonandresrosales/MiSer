import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'
import { Bell, CalendarDays, CreditCard, LayoutDashboard, LogOut, Moon, Plus, RefreshCw, Settings, ShoppingBag, Sparkles, Sun, Target, X } from 'lucide-react'
import { firebaseConfigured, firebaseMisconfigured } from './firebase'
import { goalCompleted } from './financeData'
import { findBudget, monthSpending, previousBudget, upcomingReminders } from './financeSelectors'
import type { AnnualGoal, Budget, CalendarEvent, FinanceData, ShoppingItem, ShoppingList, Transaction } from './types'
import type { Modal, OpenModal, Page } from './appTypes'
import { backDestination } from './mobileNavigation'
import { useCompactLayout } from './useCompactLayout'
import { DeviceSecurityGate } from './DeviceSecurity'
import { AndroidUpdatesProvider } from './AndroidUpdates'
import { isoDate, monthId, stamp, todayLabel } from './lib/format'
import { calendarMemory } from './lib/calendarMemory'
import { BrandMark, ProfileAvatar } from './components/common'
import { ConfirmDialog, ToastRegion, useConfirm, useToast } from './components/feedback'
import { useAuthSession } from './hooks/useAuthSession'
import { useAppPreferences } from './hooks/useAppPreferences'
import { useFinanceSync } from './hooks/useFinanceSync'
import { AuthScreen } from './screens/AuthScreen'
import { VerifyEmailScreen } from './screens/VerifyEmailScreen'
import './styles/tokens.css'
import './styles/app.css'

const pageModules = {
  overview: () => import('./pages/OverviewPage'),
  activity: () => import('./pages/ActivityPage'),
  calendar: () => import('./CalendarPage'),
  goals: () => import('./pages/GoalsPage'),
  shopping: () => import('./ShoppingPage'),
  settings: () => import('./pages/SettingsPage'),
} satisfies Record<Page, () => Promise<unknown>>
const OverviewPage = lazy(pageModules.overview)
const ActivityPage = lazy(pageModules.activity)
const CalendarPage = lazy(pageModules.calendar)
const GoalsPage = lazy(pageModules.goals)
const ShoppingPage = lazy(pageModules.shopping)
const SettingsPage = lazy(pageModules.settings)
const loadEditModal = () => import('./modals/EditModal')
const EditModal = lazy(loadEditModal)

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { id: 'activity', label: 'Movimientos', icon: CreditCard },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'goals', label: 'Objetivos', icon: Target },
  { id: 'shopping', label: 'Compras', icon: ShoppingBag },
]
const pageTitle = (page: Page) => navItems.find(item => item.id === page)?.label ?? 'Ajustes'

function App() {
  const { toast, notify, dismiss } = useToast()
  const { request: confirmRequest, ask, answer } = useConfirm()
  const { preferences, changePreferences, darkMode, setDarkMode } = useAppPreferences(useCallback(message => notify(message, 'error'), [notify]))
  const { session, setSession, authReady, profile, setProfile } = useAuthSession()
  const [demoMode, setDemoMode] = useState(false)
  const sync = useFinanceSync({ session, profile, setProfile, notify, demo: demoMode && !session })
  const { data, modify, offlineSince } = sync
  const [page, setPageState] = useState<Page>(preferences.startPage)
  const [history, setHistory] = useState<Page[]>([])
  const [modal, setModal] = useState<Modal>(null)
  const [demoEntryOpen, setDemoEntryOpen] = useState(!firebaseConfigured && !firebaseMisconfigured)
  const [demoBannerHidden, setDemoBannerHidden] = useState(false)
  const compactLayout = useCompactLayout()
  const scrollPositions = useRef(new Map<Page, number>())
  const modalOpener = useRef<HTMLElement | null>(null)
  const userId = session?.user.id

  const navigate = useCallback((next: Page, { back = false } = {}) => {
    setPageState(current => {
      if (current === next) return current
      scrollPositions.current.set(current, window.scrollY)
      if (!back) setHistory(stack => [...stack.filter(entry => entry !== next), current].slice(-8))
      return next
    })
  }, [])

  // Restore the scroll position each tab had, and move focus to the new screen for keyboard and screen reader users.
  useEffect(() => {
    window.scrollTo({ top: scrollPositions.current.get(page) ?? 0, behavior: 'instant' })
    document.getElementById('page-title')?.focus({ preventScroll: true })
  }, [page])

  // Warm the other screens once the first one is on screen.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1200))
    idle(() => { Object.values(pageModules).forEach(load => void load()); void loadEditModal() })
  }, [])

  const backState = useRef({ modal: false, page, history })
  useEffect(() => { backState.current = { modal: !!modal || !!confirmRequest, page, history } })
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return
    const listener = NativeApp.addListener('backButton', () => {
      const state = backState.current
      switch (backDestination(state)) {
        case 'modal': window.dispatchEvent(new Event('miser-close-modal')); break
        case 'previous': { const previous = state.history.at(-1)!; setHistory(stack => stack.slice(0, -1)); navigate(previous, { back: true }); break }
        case 'overview': navigate('overview', { back: true }); break
        case 'exit': void NativeApp.exitApp(); break
      }
    })
    return () => { void listener.then(handle => handle.remove()) }
  }, [navigate])

  useEffect(() => {
    if (!modal) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [modal])

  const today = new Date()
  const todayId = isoDate(today)
  const currentMonth = monthId(today)
  const spending = useMemo(() => monthSpending(data?.transactions ?? [], currentMonth, todayId), [data?.transactions, currentMonth, todayId])
  const reminders = useMemo(() => upcomingReminders(data?.events ?? [], todayId), [data?.events, todayId])
  const monthBudget: Budget = useMemo(() => {
    const budgets = data?.budgets ?? []
    const current = findBudget(budgets, currentMonth)
    if (current) return current
    const previous = previousBudget(budgets, currentMonth)
    return { month: currentMonth, totalLimit: previous?.totalLimit ?? 0, categoryLimits: previous?.categoryLimits ?? {} }
  }, [data?.budgets, currentMonth])

  const openModal = useCallback((next: OpenModal) => {
    if (offlineSince) { notify('Vuelve a conectarte para editar. Puedes consultar y exportar tu copia local.', 'error'); return }
    if (sync.refreshing) { notify('Sincronizando con la nube. Podrás editar en un momento.', 'error'); return }
    modalOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setModal(next)
  }, [offlineSince, sync.refreshing, notify])
  const closeModal = useCallback(() => { setModal(null); requestAnimationFrame(() => modalOpener.current?.focus()) }, [])
  const hasBudget = !!findBudget(data?.budgets ?? [], currentMonth)
  const openBudget = useCallback(() => openModal({ kind: 'budget', item: monthBudget, inherited: !hasBudget && monthBudget.totalLimit > 0 }), [openModal, monthBudget, hasBudget])

  /** Deletes right away and offers to undo for a few seconds. */
  const removeWithUndo = useCallback(<T,>(label: string, take: (old: FinanceData) => [FinanceData, T | undefined], restore: (old: FinanceData, removed: T) => FinanceData) => {
    let removed: T | undefined
    const done = modify(old => { const [next, item] = take(old); removed = item; return next })
    if (done && removed !== undefined) { const item = removed; notify(`${label} eliminado`, 'success', { label: 'Deshacer', run: () => { modify(old => restore(old, item)) } }) }
  }, [modify, notify])

  const actions = useMemo(() => ({
    saveTransaction: (item: Transaction) => modify(old => ({ ...old, transactions: [item, ...old.transactions.filter(t => t.id !== item.id)] })),
    saveEvent: (item: CalendarEvent) => modify(old => ({ ...old, events: [...old.events.filter(e => e.id !== item.id), item].sort((a, b) => a.date.localeCompare(b.date)) })),
    saveGoal: (item: AnnualGoal) => modify(old => ({ ...old, goals: old.goals.some(goal => goal.id === item.id) ? old.goals.map(goal => goal.id === item.id ? item : goal) : [...old.goals, item] })),
    saveList: (item: ShoppingList) => modify(old => ({ ...old, lists: [...old.lists.filter(l => l.id !== item.id), item] })),
    saveShoppingItem: (listId: string, item: ShoppingItem) => modify(old => ({ ...old, lists: old.lists.map(list => list.id === listId ? { ...list, items: list.items.some(entry => entry.id === item.id) ? list.items.map(entry => entry.id === item.id ? item : entry) : [...list.items, item] } : list) })),
    saveBudget: (item: Budget) => modify(old => ({ ...old, budgets: [...old.budgets.filter(b => b.month !== item.month), item] })),
    deleteTransaction: (key: string) => removeWithUndo<Transaction>('Movimiento', old => [{ ...old, transactions: old.transactions.filter(t => t.id !== key) }, old.transactions.find(t => t.id === key)], (old, item) => ({ ...old, transactions: [item, ...old.transactions] })),
    deleteEvent: (key: string) => removeWithUndo<CalendarEvent>('Evento', old => [{ ...old, events: old.events.filter(e => e.id !== key) }, old.events.find(e => e.id === key)], (old, item) => ({ ...old, events: [...old.events, item].sort((a, b) => a.date.localeCompare(b.date)) })),
    deleteGoal: (key: string) => removeWithUndo<AnnualGoal>('Objetivo', old => [{ ...old, goals: old.goals.filter(g => g.id !== key) }, old.goals.find(g => g.id === key)], (old, item) => ({ ...old, goals: [...old.goals, item] })),
    deleteList: (key: string) => removeWithUndo<ShoppingList>('Lista', old => [{ ...old, lists: old.lists.filter(l => l.id !== key) }, old.lists.find(l => l.id === key)], (old, item) => ({ ...old, lists: [...old.lists, item] })),
    deleteShoppingItem: (listId: string, itemId: string) => removeWithUndo<ShoppingItem>('Artículo', old => [{ ...old, lists: old.lists.map(list => list.id === listId ? { ...list, items: list.items.filter(item => item.id !== itemId) } : list) }, old.lists.find(list => list.id === listId)?.items.find(item => item.id === itemId)], (old, item) => ({ ...old, lists: old.lists.map(list => list.id === listId ? { ...list, items: [...list.items, item] } : list) })),
  }), [modify, removeWithUndo])

  const signOut = useCallback(async () => {
    if (sync.hasPending() && !await ask({ title: '¿Cerrar sesión?', text: 'Quedan cambios sin sincronizar. Se conservarán en este dispositivo para enviarlos cuando vuelvas.', confirmLabel: 'Cerrar sesión', danger: true })) return
    try { await sync.signOut(); setHistory([]); setPageState('overview') }
    catch { notify('No se pudo cerrar sesión. Revisa tu conexión e inténtalo de nuevo.', 'error') }
  }, [sync, ask, notify])
  const clearLocalData = useCallback(async () => {
    if (!await ask({ title: '¿Borrar la copia local?', text: 'Se cerrará la sesión en este dispositivo. Tus datos en la nube se conservan.', confirmLabel: 'Borrar y salir', danger: true })) return
    await sync.clearLocalData()
  }, [sync, ask])
  const exportData = useCallback(async () => {
    if (await ask({ title: 'Exportar una copia', text: 'El archivo contiene tu información financiera sin cifrar. Guárdalo o compártelo solo en un lugar de confianza.', confirmLabel: 'Exportar' })) await sync.exportData()
  }, [sync, ask])
  const exportRecovery = useCallback(async () => {
    if (await ask({ title: 'Exportar recuperación', text: 'El archivo contiene tu información financiera sin cifrar. Guárdalo o compártelo solo en un lugar de confianza.', confirmLabel: 'Exportar' })) await sync.exportRecovery()
  }, [sync, ask])
  const leaveDemo = useCallback(() => { if (firebaseConfigured) setDemoMode(false); else setDemoEntryOpen(true); setPageState('overview'); setHistory([]); setModal(null) }, [])

  const overlays = <><ToastRegion toast={toast} onDismiss={dismiss} /><ConfirmDialog request={confirmRequest} onAnswer={answer} /></>

  if (firebaseMisconfigured) return <main className="load-error-screen"><div className="load-error-card"><BrandMark /><h1>Falta configurar Firebase</h1><p>Completa las variables VITE_FIREBASE_* en .env.local para activar el acceso privado.</p></div></main>
  if (firebaseConfigured && !authReady) return <div className="loading-screen" role="status"><BrandMark /><span>Preparando tu espacio…</span></div>
  if (firebaseConfigured && !session && !demoMode) return <AuthScreen onOpenDemo={() => setDemoMode(true)} />
  if (firebaseConfigured && session && !session.user.verified) return <VerifyEmailScreen email={session.user.email ?? ''} onVerified={() => setSession({ user: { ...session.user, verified: true } })} onLogout={() => void signOut()} />
  if (demoEntryOpen) return <AuthScreen preview onOpenDemo={() => setDemoEntryOpen(false)} />
  if (firebaseConfigured && sync.loadError) return <main className="load-error-screen"><div className="load-error-card"><BrandMark /><h1>No pudimos abrir tu espacio</h1><p>{sync.loadError} Tus datos no se han reemplazado.</p><div className="load-error-actions"><button className="btn btn-primary" onClick={sync.retryLoad}>Intentar de nuevo</button><button className="btn btn-soft" onClick={() => void exportRecovery()}>Exportar recuperación local</button><button className="btn btn-soft" onClick={() => void signOut()}>Cerrar sesión</button></div></div>{overlays}</main>
  if (!data || !sync.loaded || (firebaseConfigured && !demoMode && sync.loadedUserId !== userId)) return <div className="loading-screen" role="status"><BrandMark /><span>Cargando tu espacio…</span></div>

  const title = pageTitle(page)
  const isDemo = !firebaseConfigured || (demoMode && !session)
  const blocked = !!modal || !!confirmRequest
  const addAction = page === 'calendar' ? { label: 'Añadir evento', run: () => openModal({ kind: 'event', date: calendarMemory.selected ?? todayId }) }
    : page === 'goals' ? { label: 'Nuevo objetivo', run: () => openModal({ kind: 'goal' }) }
      : page === 'shopping' ? { label: 'Nueva lista', run: () => openModal({ kind: 'list' }) }
        : { label: 'Añadir movimiento', run: () => openModal({ kind: 'transaction' }) }
  const sideItems = [...navItems, { id: 'settings' as const, label: 'Ajustes', icon: Settings }]
  return <div className="app-shell">
    {!compactLayout && <aside className="sidebar" inert={blocked}>
      <div className="sidebar-brand"><BrandMark size={40} /><span>MiSer</span></div>
      <button type="button" className="btn btn-primary sidebar-add" onClick={addAction.run}><Plus size={18} aria-hidden="true" /> {addAction.label}</button>
      <nav className="side-nav" aria-label="Secciones">{sideItems.map(item => { const Icon = item.icon; return <button type="button" key={item.id} className="side-link" aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><Icon size={20} aria-hidden="true" /><span>{item.label}</span>{item.id === 'shopping' && data.lists.length > 0 && <span className="count">{data.lists.length}</span>}</button> })}</nav>
      <div className="sidebar-profile"><ProfileAvatar profile={profile} /><span>{profile.displayName}</span>{isDemo ? <button type="button" className="btn btn-ghost btn-small" onClick={leaveDemo}>Salir</button> : <button type="button" className="icon-button" onClick={() => void signOut()} aria-label="Cerrar sesión"><LogOut size={18} /></button>}</div>
    </aside>}

    <main className="main" inert={blocked}>
      <header className="topbar">
        <div className="topbar-title">{compactLayout && <BrandMark size={32} />}<div><span>{todayLabel(today)}</span>{page === 'overview' && <strong>{profile.displayName === 'Mi espacio' ? 'Hola' : `Hola, ${profile.displayName}`}</strong>}</div></div>
        <div className="topbar-actions">
          <button type="button" className="icon-button bell" onClick={() => { navigate('calendar'); notify(reminders ? `${reminders} ${reminders === 1 ? 'recordatorio próximo' : 'recordatorios próximos'} en tu agenda.` : 'No tienes recordatorios próximos.') }} aria-label={`Ver agenda: ${reminders} recordatorios próximos`}><Bell size={20} />{reminders > 0 && <i aria-hidden="true" />}</button>
          <button type="button" className="icon-button" onClick={() => setDarkMode(value => !value)} aria-label={darkMode ? 'Usar tema claro' : 'Usar tema oscuro'} title={darkMode ? 'Usar tema claro' : 'Usar tema oscuro'}>{darkMode ? <Sun size={20} /> : <Moon size={20} />}</button>
          {compactLayout && <button type="button" className="avatar-button" onClick={() => navigate('settings')} aria-label="Ajustes y perfil" aria-current={page === 'settings' ? 'page' : undefined}><ProfileAvatar profile={profile} /></button>}
        </div>
      </header>
      <div className="status-region" aria-live="polite">
        {isDemo && !demoBannerHidden && <div className="banner banner-demo"><Sparkles size={18} aria-hidden="true" /><span>Modo demostración: los cambios se guardan solo en este navegador.</span><button type="button" className="link-button" onClick={leaveDemo}>Crear cuenta</button><button type="button" className="icon-button" onClick={() => setDemoBannerHidden(true)} aria-label="Ocultar aviso"><X size={18} /></button></div>}
        {sync.refreshing && <div className="banner banner-info"><RefreshCw size={18} className="spin" aria-hidden="true" /><span>Sincronizando con la nube…</span></div>}
        {offlineSince && <div className="banner banner-warn"><span>Sin conexión. Ves tu copia del {stamp(offlineSince)}; los cambios pendientes se conservan.</span><button type="button" className="link-button" onClick={sync.retryLoad}>Reconectar</button><button type="button" className="link-button" onClick={() => void exportData()}>Exportar</button></div>}
        {!isDemo && !offlineSince && !sync.refreshing && sync.syncStatus !== 'saved' && <div className={`banner ${sync.syncStatus === 'error' ? 'banner-error' : 'banner-info'}`} role={sync.syncStatus === 'error' ? 'alert' : undefined}><span>{sync.syncStatus === 'error' ? sync.syncMessage : sync.syncStatus === 'saving' ? 'Guardando cambios…' : 'Cambios pendientes de guardar…'}</span>{sync.syncStatus === 'error' && <>{sync.syncConflict ? <><button type="button" className="link-button" onClick={() => void sync.resolveConflict('cloud')}>Usar la de la nube</button><button type="button" className="link-button" onClick={() => void sync.resolveConflict('mine')}>Conservar la mía</button></> : <button type="button" className="link-button" onClick={sync.retrySave}>Reintentar</button>}<button type="button" className="link-button" onClick={() => void exportData()}>Exportar</button></>}</div>}
      </div>
      <div key={page} className="page-enter" aria-label={title}>
        <Suspense fallback={<div className="page-wrap" role="status" aria-label="Cargando pantalla"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-hero" /><div className="skeleton skeleton-card" /></div>}>
          {page === 'overview' && <OverviewPage data={data} spending={spending} budget={monthBudget} hasBudget={hasBudget} onAdd={() => openModal({ kind: 'transaction' })} onEditTransaction={item => openModal({ kind: 'transaction', item })} onBudget={openBudget} onNavigate={navigate} />}
          {page === 'activity' && <ActivityPage data={data} onAdd={() => openModal({ kind: 'transaction' })} onEdit={item => openModal({ kind: 'transaction', item })} />}
          {page === 'calendar' && <CalendarPage data={data} onAdd={date => openModal({ kind: 'event', date })} onEdit={item => openModal({ kind: 'event', item })} onDelete={actions.deleteEvent} />}
          {page === 'goals' && <GoalsPage data={data} onAdd={() => openModal({ kind: 'goal' })} onEdit={item => openModal({ kind: 'goal', item })} onToggle={item => actions.saveGoal({ ...item, completed: !goalCompleted(item) })} />}
          {page === 'shopping' && <ShoppingPage data={data} modify={modify} onAdd={() => openModal({ kind: 'list' })} onEdit={item => openModal({ kind: 'list', item })} onDelete={actions.deleteList} onAddItem={listId => openModal({ kind: 'shoppingItem', listId })} onEditItem={(listId, item) => openModal({ kind: 'shoppingItem', listId, item })} />}
          {page === 'settings' && <SettingsPage key={userId ?? 'demo'} isDemo={isDemo} email={session?.user.email ?? ''} profile={profile} onSaveProfile={sync.saveProfile} preferences={preferences} onPreferencesChange={changePreferences} passwordAccount={session?.user.passwordAccount ?? false} syncStatus={sync.syncStatus} syncMessage={sync.syncMessage} onRetry={offlineSince ? sync.retryLoad : sync.retrySave} onExport={() => void exportData()} darkMode={darkMode} onDarkModeChange={setDarkMode} onBudget={openBudget} onLogout={() => void signOut()} onExitDemo={leaveDemo} onClearLocal={clearLocalData} />}
        </Suspense>
      </div>
    </main>
    {compactLayout && <>
      <button type="button" className="fab" onClick={addAction.run} aria-label={addAction.label} inert={blocked}><Plus size={26} aria-hidden="true" /></button>
      <nav className="tabbar" aria-label="Navegación principal" inert={blocked}>{navItems.map(item => { const Icon = item.icon; return <button type="button" key={item.id} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><Icon size={22} aria-hidden="true" /><span>{item.label}</span></button> })}</nav>
    </>}
    {modal && <Suspense fallback={null}><EditModal modal={modal} month={currentMonth} onClose={closeModal} actions={actions} notify={notify} onDuplicate={item => setModal({ kind: 'transaction', item, copy: true })} /></Suspense>}
    {overlays}
  </div>
}

export default function MiSerApp() {
  return <DeviceSecurityGate><AndroidUpdatesProvider><App /></AndroidUpdatesProvider></DeviceSecurityGate>
}
