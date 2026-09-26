import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check,
  CheckCircle2, ChevronDown, CircleHelp, CreditCard, Download, Ellipsis, Heart,
  ExternalLink, Eye, EyeOff, ImagePlus, LayoutDashboard, Link2, ListChecks, LogOut, Menu, Pencil,
  Moon, Plus, Quote, RefreshCw, Search, Settings, ShoppingBag, Sparkles, Sun, Target,
  Wallet, X,
} from 'lucide-react'
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, reload,
  sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { firebaseAuth, firebaseConfigured, firebaseMisconfigured, firestore } from './firebase'
import { changedRecords, flattenData, loadFinanceData, saveFinanceRecord } from './financeStore'
import { goalCompleted, inflateRecords, money, parseCategoryLimits, sumMoney, type FinanceRecord, type RecordMap } from './financeData'
import { demoData } from './demoData'
import { philosophyQuotes } from './quotes'
import type { AnnualGoal, Budget, CalendarEvent, FinanceData, ShoppingItem, ShoppingList, Transaction } from './types'
import './MiSer.css'

type Page = 'overview' | 'activity' | 'calendar' | 'goals' | 'shopping' | 'settings'
type Modal = { kind: 'transaction'; item?: Transaction } | { kind: 'event'; item?: CalendarEvent; date?: string } | { kind: 'goal'; item?: AnnualGoal } | { kind: 'list'; item?: ShoppingList } | { kind: 'shoppingItem'; listId: string; item?: ShoppingItem } | { kind: 'budget'; item?: Budget } | null
type Session = { user: { id: string; email?: string; verified: boolean } } | null
type MotivationQuote = { text: string; author: string; work?: string; source: string; sourceLabel?: string; translation?: boolean }

const currency = (value: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
const shortDate = (value: string) => new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`))
const longDate = (value: Date) => new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long' }).format(value)
const monthId = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const id = () => crypto.randomUUID()
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

type AuthMode = 'login' | 'register' | 'recover'

function AuthScreen({ preview = false, onOpenDemo }: { preview?: boolean; onOpenDemo?: () => void }) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const switchMode = (next: AuthMode) => {
    setMode(next)
    setMessage(null)
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!firebaseAuth || busy) return
    if (mode === 'register' && password.length < 12) {
      setMessage({ kind: 'error', text: 'La contraseña debe tener al menos 12 caracteres.' })
      return
    }
    if (mode === 'register' && password !== confirmPassword) {
      setMessage({ kind: 'error', text: 'Las contraseñas no coinciden.' })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'recover') {
        await sendPasswordResetEmail(firebaseAuth, email.trim())
        setMessage({ kind: 'success', text: 'Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.' })
      } else if (mode === 'register') {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password)
        await sendEmailVerification(credential.user)
        setPassword('')
        setConfirmPassword('')
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password)
        setPassword('')
      }
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      const text = code === 'auth/too-many-requests'
        ? 'Demasiados intentos. Espera un momento antes de volver a probar.'
        : code === 'auth/weak-password' ? 'Elige una contraseña más segura.'
          : code === 'auth/email-already-in-use' ? 'Ya existe una cuenta con ese correo.'
          : mode === 'login' ? 'No se pudo iniciar sesión. Revisa el correo y la contraseña.'
            : 'No se pudo completar la solicitud. Revisa tu conexión e inténtalo otra vez.'
      setMessage({ kind: 'error', text })
    } finally {
      setBusy(false)
    }
  }
  const signInWithGoogle = async () => {
    if (!firebaseAuth || busy) return
    setBusy(true)
    setMessage(null)
    try {
      await signInWithPopup(firebaseAuth, new GoogleAuthProvider())
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        const text = code === 'auth/popup-blocked' ? 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e inténtalo de nuevo.'
          : code === 'auth/unauthorized-domain' ? 'Este dominio no está autorizado. Agrégalo en Firebase Authentication → Configuración → Dominios autorizados.'
            : code === 'auth/operation-not-allowed' ? 'Activa Google en Firebase Authentication → Proveedores de acceso.'
              : code === 'auth/account-exists-with-different-credential' ? 'Ya existe una cuenta con ese correo. Inicia sesión con tu método anterior.'
                : 'No se pudo acceder con Google. Revisa tu conexión e inténtalo de nuevo.'
        setMessage({ kind: 'error', text })
      }
    } finally {
      setBusy(false)
    }
  }
  const title = mode === 'register' ? 'Crea tu cuenta' : mode === 'recover' ? 'Recupera tu acceso' : 'Qué bueno verte'
  const subtitle = mode === 'register' ? 'Un espacio privado para cuidar tu dinero y tus planes.' : mode === 'recover' ? 'Firebase te enviará un enlace para cambiar tu contraseña.' : 'Inicia sesión para ver tu mundo financiero.'
  return <main className="auth-screen">
    <div className="auth-art"><div className="auth-art-brand"><BrandMark /> <span>MiSer</span></div><div className="auth-quote"><span className="eyebrow light">TUS FINANZAS, CON CALMA</span><h1>Un poquito<br />más claro,<br /><em>cada día.</em></h1><p>Un espacio para cuidar tu dinero y tus planes.</p><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-flower">✳</div></div><span className="auth-art-footer">Tu espacio personal · USD</span></div>
    <div className="auth-form-wrap"><div className="auth-form"><div className="mobile-brand"><BrandMark /> MiSer</div><span className="eyebrow">TU ESPACIO PERSONAL</span><h2>{title}</h2><p className="muted">{subtitle}</p>{preview && <div className="auth-preview-note" role="status"><Sparkles size={16} /><span>Vista previa del acceso. Conecta Firebase para crear una cuenta e iniciar sesión.</span></div>}<form onSubmit={submit} className="stack-form">
       <label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" disabled={busy || preview} /></label>
       {mode !== 'recover' && <label>Contraseña<div className="auth-password-field"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? undefined : 12} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'login' ? 'Tu contraseña' : 'Al menos 12 caracteres'} disabled={busy || preview} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} disabled={busy || preview}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>}
       {mode === 'register' && <><label>Confirmar contraseña<input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={12} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repite la contraseña" disabled={busy || preview} /></label><small className="auth-field-help">Usa al menos 12 caracteres. Puedes combinar palabras para recordarla.</small></>}
      {mode === 'login' && <button className="auth-forgot" type="button" onClick={() => switchMode('recover')}>¿Olvidaste tu contraseña?</button>}
      {message && <div className={`inline-message ${message.kind === 'success' ? 'inline-message-success' : ''}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</div>}
       <button className="btn btn-primary full" disabled={busy || preview}>{busy ? 'Un momento…' : mode === 'register' ? 'Crear cuenta' : mode === 'recover' ? 'Enviar enlace' : 'Iniciar sesión'} <ArrowRight size={16} /></button>
     </form>{mode === 'login' && <><div className="auth-separator">o</div><button className="btn btn-google" type="button" disabled={busy || preview} onClick={() => void signInWithGoogle()}><img src="/google-g.png" alt="" width="20" height="20" />Iniciar sesión con Google</button></>}{preview && <button className="btn btn-soft full auth-demo-button" type="button" onClick={onOpenDemo}>Explorar demostración <ArrowRight size={16} /></button>}<p className="auth-switch">{mode === 'register' ? '¿Ya tienes cuenta?' : mode === 'recover' ? '¿Recordaste tu contraseña?' : '¿Es tu primera vez?'} <button type="button" disabled={busy} onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Crea una cuenta' : 'Inicia sesión'}</button></p><div className="auth-privacy"><Heart size={15} /> {preview ? 'La demostración guarda los cambios solo en este navegador.' : 'Acceso protegido para tus datos personales.'}</div></div></div>
  </main>
}

function VerifyEmailScreen({ email, onVerified, onLogout }: { email: string; onVerified: () => void; onLogout: () => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const verify = async () => {
    const user = firebaseAuth?.currentUser
    if (!user) return
    setBusy(true); setMessage('')
    try {
      await reload(user)
      if (!user.emailVerified) { setMessage('El correo aún no está confirmado. Abre el enlace que recibiste y vuelve a comprobar.'); return }
      await user.getIdToken(true)
      onVerified()
    } catch { setMessage('No se pudo comprobar la cuenta. Revisa tu conexión e inténtalo de nuevo.') }
    finally { setBusy(false) }
  }
  const resend = async () => {
    const user = firebaseAuth?.currentUser
    if (!user) return
    setBusy(true); setMessage('')
    try { await sendEmailVerification(user); setMessage('Te enviamos un nuevo enlace. Revisa también la carpeta de spam.') }
    catch { setMessage('No se pudo enviar el correo. Espera un momento e inténtalo de nuevo.') }
    finally { setBusy(false) }
  }
  return <main className="load-error-screen"><div className="load-error-card"><BrandMark /><h1>Confirma tu correo</h1><p>Abre el enlace enviado a {email} para proteger tu espacio. No se cargará información hasta que confirmes la cuenta.</p>{message && <p role="status">{message}</p>}<div className="load-error-actions"><button className="btn btn-primary" disabled={busy} onClick={() => void verify()}>Ya confirmé mi correo</button><button className="btn btn-soft" disabled={busy} onClick={() => void resend()}>Reenviar enlace</button><button className="btn btn-quiet" disabled={busy} onClick={onLogout}>Cerrar sesión</button></div></div></main>
}

function App() {
  const [page, setPage] = useState<Page>('overview')
  const [demoEntryOpen, setDemoEntryOpen] = useState(!firebaseConfigured && !firebaseMisconfigured)
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('miser-theme') === 'dark' } catch { return false }
  })
  const [data, setData] = useState<FinanceData | null>(firebaseConfigured || firebaseMisconfigured ? null : (() => {
    try { const stored = localStorage.getItem(demoStorageKey) ?? localStorage.getItem(previousDemoStorageKey); return stored ? JSON.parse(stored) as FinanceData : demoData } catch { return demoData }
  })())
  const [session, setSession] = useState<Session>(null)
  const [authReady, setAuthReady] = useState(!firebaseConfigured)
  const [loaded, setLoaded] = useState(!firebaseConfigured && !firebaseMisconfigured)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveAttempt, setSaveAttempt] = useState(0)
  const [syncStatus, setSyncStatus] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved')
  const [syncMessage, setSyncMessage] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const [toast, setToast] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const userId = session?.user.id
  const dataRef = useRef(data)
  const remoteRecords = useRef<RecordMap>(new Map())
  const versions = useRef(new Map<string, number>())
  const expectedVersions = useRef(new Map<string, number>())
  const flushing = useRef(false)

  useEffect(() => {
    if (!firebaseAuth) return
    return onAuthStateChanged(firebaseAuth, next => {
      setSession(next ? { user: { id: next.uid, email: next.email ?? undefined, verified: next.emailVerified } } : null)
      setAuthReady(true)
      if (!next) { dataRef.current = null; setData(null); setLoaded(false); setLoadedUserId(null) }
    })
  }, [])

  useEffect(() => {
    const db = firestore
    if (!db || !userId || !session?.user.verified) return
    let active = true
    setLoaded(false)
    setLoadedUserId(null)
    setLoadError('')
    loadFinanceData(db, userId).then(result => {
      if (!active) return
      remoteRecords.current = result.records
      versions.current = result.versions
      expectedVersions.current = new Map()
      const restored = new Map(result.records)
      try {
        const pending = JSON.parse(localStorage.getItem(`miser-pending-${userId}`) ?? 'null') as { changes?: [string, FinanceRecord | null, number][] } | null
        for (const [key, record, version] of pending?.changes ?? []) {
          if (record) restored.set(key, record)
          else restored.delete(key)
          expectedVersions.current.set(key, version)
        }
      } catch { /* Invalid local recovery data is ignored; cloud data stays untouched. */ }
      const restoredData = inflateRecords(restored)
      dataRef.current = restoredData
      setData(restoredData)
      setSyncStatus(changedRecords(result.records, restored).length ? 'pending' : 'saved')
      setSyncMessage('')
      setLoadedUserId(userId)
      setLoaded(true)
    }).catch((error: unknown) => {
      if (!active) return
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      setLoadError(code === 'permission-denied'
        ? 'Firestore denegó el acceso. Publica las reglas actualizadas de firestore.rules en Firebase Console → Firestore → Reglas y comprueba que tu correo esté verificado.'
        : code === 'unavailable' ? 'Firestore no está disponible. Revisa tu conexión e inténtalo de nuevo.'
          : `No se pudo cargar tu información${code ? ` (${code})` : ''}. Revisa tu conexión y la configuración de Firebase.`)
    })
    return () => { active = false }
  }, [userId, session?.user.verified, loadAttempt])

  useEffect(() => {
    if (!data || !loaded) return
    if (!firebaseConfigured) {
      try { localStorage.setItem(demoStorageKey, JSON.stringify(data)) }
      catch { showToast('No hay espacio suficiente en este navegador para guardar los cambios.') }
      return
    }
    const db = firestore
    if (!db || !userId || loadedUserId !== userId) return
    const changes = changedRecords(remoteRecords.current, flattenData(data))
    if (!changes.length) return
    try {
      localStorage.setItem(`miser-pending-${userId}`, JSON.stringify({ changes: changes.map(([key, record]) => [key, record, expectedVersions.current.get(key) ?? versions.current.get(key) ?? 0]) }))
    } catch { setSyncMessage('No se pudo guardar una copia local de los cambios pendientes. Exporta tus datos antes de cerrar.') }
    const timer = window.setTimeout(async () => {
      if (flushing.current) return
      flushing.current = true
      setSyncStatus('saving')
      try {
        while (dataRef.current) {
          const next = changedRecords(remoteRecords.current, flattenData(dataRef.current))[0]
          if (!next) break
          const [key, record] = next
          const version = await saveFinanceRecord(db, userId, key, record, expectedVersions.current.get(key) ?? versions.current.get(key) ?? 0)
          if (record) remoteRecords.current.set(key, record)
          else remoteRecords.current.delete(key)
          versions.current.set(key, version)
          expectedVersions.current.delete(key)
        }
        localStorage.removeItem(`miser-pending-${userId}`)
        setSyncStatus('saved')
        setSyncMessage('')
      } catch (error) {
        setSyncStatus('error')
        setSyncMessage(error instanceof Error && error.message === 'conflict' ? 'Otro dispositivo cambió el mismo registro. Exporta tus datos y recarga antes de continuar.' : 'No se pudieron guardar todos los cambios. Revisa tu conexión y vuelve a intentar.')
      } finally { flushing.current = false }
    }, 450)
    return () => window.clearTimeout(timer)
  }, [data, loaded, userId, loadedUserId, saveAttempt])

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
  const expenses = sumMoney(monthTransactions.filter(t => t.type === 'expense').map(t => t.amount))

  const modify = (fn: (old: FinanceData) => FinanceData) => {
    if (!dataRef.current) return
    const next = fn(dataRef.current)
    dataRef.current = next
    setData(next)
    if (firebaseConfigured) setSyncStatus('pending')
  }
  const exportData = () => {
    if (!dataRef.current) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(dataRef.current, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `miser-${isoDate(new Date())}.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const confirmDelete = (label: string, action: () => void) => { if (window.confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) action() }
  const signOut = async () => {
    if (!firebaseAuth) return
    try { await firebaseSignOut(firebaseAuth); setPage('overview') }
    catch { showToast('No se pudo cerrar sesión. Revisa tu conexión e inténtalo de nuevo.') }
  }
  const leaveDemo = () => { setDemoEntryOpen(true); setPage('overview'); setMenuOpen(false); setModal(null) }
  const saveTransaction = (item: Transaction) => modify(old => ({ ...old, transactions: [item, ...old.transactions.filter(t => t.id !== item.id)] }))
  const saveEvent = (item: CalendarEvent) => modify(old => ({ ...old, events: [...old.events.filter(e => e.id !== item.id), item].sort((a, b) => a.date.localeCompare(b.date)) }))
  const saveGoal = (item: AnnualGoal) => modify(old => ({ ...old, goals: old.goals.some(goal => goal.id === item.id) ? old.goals.map(goal => goal.id === item.id ? item : goal) : [...old.goals, item] }))
  const saveList = (item: ShoppingList) => modify(old => ({ ...old, lists: [...old.lists.filter(l => l.id !== item.id), item] }))
  const saveShoppingItem = (listId: string, item: ShoppingItem) => modify(old => ({ ...old, lists: old.lists.map(list => list.id === listId ? { ...list, items: list.items.some(entry => entry.id === item.id) ? list.items.map(entry => entry.id === item.id ? item : entry) : [...list.items, item] } : list) }))
  const saveBudget = (item: Budget) => modify(old => ({ ...old, budgets: [...old.budgets.filter(b => b.month !== item.month), item] }))
  const deleteTransaction = (key: string) => confirmDelete('este movimiento', () => modify(old => ({ ...old, transactions: old.transactions.filter(t => t.id !== key) })))
  const deleteEvent = (key: string) => confirmDelete('este evento', () => modify(old => ({ ...old, events: old.events.filter(e => e.id !== key) })))
  const deleteGoal = (key: string) => confirmDelete('este objetivo', () => modify(old => ({ ...old, goals: old.goals.filter(g => g.id !== key) })))
  const deleteList = (key: string) => confirmDelete('esta lista y sus artículos', () => modify(old => ({ ...old, lists: old.lists.filter(l => l.id !== key) })))

  if (firebaseMisconfigured) return <main className="load-error-screen"><div className="load-error-card"><BrandMark /><h1>Falta configurar Firebase</h1><p>Completa las variables VITE_FIREBASE_* en .env.local para activar el acceso privado.</p></div></main>
   if (firebaseConfigured && !authReady) return <div className="loading-screen"><BrandMark /><span>Preparando tu espacio…</span></div>
   if (firebaseConfigured && !session) return <AuthScreen />
   if (firebaseConfigured && session && !session.user.verified) return <VerifyEmailScreen email={session.user.email ?? ''} onVerified={() => setSession({ user: { ...session.user, verified: true } })} onLogout={signOut} />
  if (demoEntryOpen) return <AuthScreen preview onOpenDemo={() => setDemoEntryOpen(false)} />
  if (firebaseConfigured && loadError) return <main className="load-error-screen"><div className="load-error-card"><BrandMark /><h1>No pudimos abrir tu espacio</h1><p>{loadError} Tus datos no se han reemplazado.</p><div className="load-error-actions"><button className="btn btn-primary" onClick={() => setLoadAttempt(value => value + 1)}>Intentar de nuevo</button><button className="btn btn-soft" onClick={signOut}>Cerrar sesión</button></div></div></main>
  if (!data || !loaded || (firebaseConfigured && loadedUserId !== userId)) return <div className="loading-screen"><BrandMark /><span>Cargando tu espacio…</span></div>

  const title = navItems.find(item => item.id === page)?.label ?? 'Ajustes'
  const isDemo = !firebaseConfigured
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><BrandMark /><span>MiSer</span><button className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={18} /></button></div>
      <div className="sidebar-label">ESPACIO PERSONAL</div>
      <nav className="main-nav">{navItems.map(item => { const Icon = item.id === 'activity' ? Wallet : item.id === 'shopping' ? ListChecks : item.icon; return <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => { setPage(item.id); setMenuOpen(false) }}><Icon size={18} strokeWidth={1.8} /><span>{item.id === 'activity' ? 'Finanzas' : item.id === 'goals' ? 'Objetivos' : item.id === 'shopping' ? 'Compras' : item.label}</span>{item.id === 'shopping' && <span className="nav-count">{data.lists.length}</span>}</button>})}</nav>
      <div className="sidebar-bottom"><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><Settings size={18} strokeWidth={1.8} /><span>Ajustes</span></button><div className="profile"><span className="avatar">{isDemo ? 'M' : (session?.user.email?.[0] ?? 'T').toUpperCase()}</span><span className="profile-name">{isDemo ? 'Mi espacio' : session?.user.email}</span>{isDemo ? <button className="demo-exit" onClick={leaveDemo}><LogOut size={14} /> Salir</button> : <button className="icon-button" onClick={signOut} aria-label="Cerrar sesión"><LogOut size={16} /></button>}</div></div>
    </aside>
    {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />}
    <main className="main-content">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button><div className="breadcrumb"><span>{new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long' }).format(today)}</span><strong>{page === 'overview' ? 'Hola, qué bueno verte ✦' : title}</strong></div><div className="topbar-actions"><button className="icon-button notification-button" onClick={() => { setPage('calendar'); showToast('Aquí verás tus eventos y próximos pagos.') }} aria-label="Ver recordatorios"><Bell size={18} /><i /></button><button className="icon-button theme-quick-toggle" type="button" onClick={() => setDarkMode(value => !value)} aria-label={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'} title={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button><span className="top-avatar">{isDemo ? 'M' : (session?.user.email?.[0] ?? 'T').toUpperCase()}</span><span className="profile-name top-profile-name">{isDemo ? 'Mi espacio' : session?.user.email}</span></div></header>
      {isDemo && <div className="demo-banner"><span><Sparkles size={14} /> Estás explorando el modo de demostración. Tus cambios se guardan solo en este navegador.</span><button onClick={leaveDemo}>Ver acceso <ArrowRight size={13} /></button></div>}
      {!isDemo && syncStatus !== 'saved' && <div className={`sync-banner ${syncStatus === 'error' ? 'sync-banner-error' : ''}`} role={syncStatus === 'error' ? 'alert' : 'status'}><span>{syncStatus === 'error' ? syncMessage : syncStatus === 'saving' ? 'Guardando cambios…' : 'Cambios pendientes de guardar…'}</span>{syncStatus === 'error' && <div><button onClick={() => setSaveAttempt(value => value + 1)}>Reintentar</button><button onClick={exportData}>Exportar copia</button></div>}</div>}
      {page === 'overview' && <Overview data={data} expenses={expenses} currentMonth={currentMonth} onAdd={() => setModal({ kind: 'transaction' })} onEditTransaction={item => setModal({ kind: 'transaction', item })} onNavigate={setPage} />}
      {page === 'activity' && <Activity data={data} query={search} setQuery={setSearch} onAdd={() => setModal({ kind: 'transaction' })} onEdit={item => setModal({ kind: 'transaction', item })} onDelete={deleteTransaction} />}
       {page === 'calendar' && <CalendarPage data={data} onAdd={date => setModal({ kind: 'event', date })} onEdit={item => setModal({ kind: 'event', item })} onDelete={deleteEvent} />}
       {page === 'goals' && <GoalsPage data={data} onAdd={() => setModal({ kind: 'goal' })} onEdit={item => setModal({ kind: 'goal', item })} onToggle={item => saveGoal({ ...item, completed: !goalCompleted(item) })} onDelete={deleteGoal} />}
      {page === 'shopping' && <ShoppingPage data={data} modify={modify} onAdd={() => setModal({ kind: 'list' })} onEdit={item => setModal({ kind: 'list', item })} onDelete={deleteList} onAddItem={listId => setModal({ kind: 'shoppingItem', listId })} onEditItem={(listId, item) => setModal({ kind: 'shoppingItem', listId, item })} />}
       {page === 'settings' && <SettingsPage isDemo={isDemo} email={session?.user.email ?? ''} syncStatus={syncStatus} syncMessage={syncMessage} onRetry={() => setSaveAttempt(value => value + 1)} onExport={exportData} darkMode={darkMode} onDarkModeChange={setDarkMode} onBudget={() => setModal({ kind: 'budget', item: monthBudget })} onLogout={signOut} onExitDemo={leaveDemo} />}
    </main>
    {modal && <EditModal modal={modal} month={currentMonth} onClose={() => setModal(null)} onSaveTransaction={saveTransaction} onSaveEvent={saveEvent} onSaveGoal={saveGoal} onSaveList={saveList} onSaveShoppingItem={saveShoppingItem} onSaveBudget={saveBudget} />}
     {toast && <div className="toast" role="status"><CheckCircle2 size={17} />{toast}</div>}
  </div>
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1><p className="muted">{subtitle}</p></div>{action}</div>
}

function Overview({ data, expenses, currentMonth, onAdd, onEditTransaction, onNavigate }: { data: FinanceData; expenses: number; currentMonth: string; onAdd: () => void; onEditTransaction: (item: Transaction) => void; onNavigate: (page: Page) => void }) {
  const now = new Date()
  const latest = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
  const nextEvent = data.events.filter(e => e.date >= isoDate(now)).sort((a, b) => a.date.localeCompare(b.date))[0]
  const nextGoal = data.goals.find(item => !goalCompleted(item))
  const budget = data.budgets.find(item => item.month === currentMonth)
  const monthLabel = new Intl.DateTimeFormat('es-EC', { month: 'long' }).format(now)
  return <div className="page-wrap miser-dashboard">
    <section className="overview-spend" aria-labelledby="overview-spend-title">
      <div className="overview-spend-head"><div><h1 id="overview-spend-title">Gastos de {monthLabel}</h1><strong>{currency(expenses)}</strong></div><button className="btn btn-primary overview-add" onClick={onAdd}><Plus size={17} /> Añadir movimiento</button></div>
      {budget && budget.totalLimit > 0 ? <div className="overview-budget"><progress max={budget.totalLimit} value={Math.min(expenses, budget.totalLimit)} aria-label="Presupuesto mensual utilizado" /><div><span>Presupuesto: {currency(budget.totalLimit)}</span><strong>{expenses < budget.totalLimit ? `Te quedan ${currency(money(budget.totalLimit - expenses))}` : expenses === budget.totalLimit ? 'Llegaste a tu límite' : `Superaste el límite por ${currency(money(expenses - budget.totalLimit))}`}</strong></div></div> : <p className="overview-budget-empty">Sin límite mensual configurado. Puedes añadirlo en Ajustes.</p>}
    </section>
    <MotivationCard />
    <section className="overview-bottom">
      <article className="panel overview-next"><div className="panel-heading"><h2>Próximamente</h2></div>
        <button className="overview-next-row" onClick={() => onNavigate('calendar')}><span className="overview-next-icon"><CalendarDays size={19} /></span><span className="overview-next-copy"><small>Tu agenda</small><strong>{nextEvent?.title ?? 'Sin eventos próximos'}</strong><span>{nextEvent ? `${shortDate(nextEvent.date)}${nextEvent.time ? ` · ${nextEvent.time}` : ''}` : 'Ver calendario'}</span></span><ArrowRight size={16} /></button>
        <button className="overview-next-row" onClick={() => onNavigate('goals')}><span className="overview-next-icon overview-next-goal"><Target size={19} /></span><span className="overview-next-copy"><small>Tu objetivo</small><strong>{nextGoal?.title ?? (data.goals.length ? 'Todos cumplidos' : 'Aún no tienes objetivos')}</strong><span>{nextGoal ? 'Pendiente' : 'Ver objetivos'}</span></span><ArrowRight size={16} /></button>
      </article>
      <article className="panel recent-card"><div className="panel-heading"><h2>Movimientos recientes</h2><button className="text-button" onClick={() => onNavigate('activity')}>Ver todo <ArrowRight size={14}/></button></div>{latest.length ? <div className="transaction-list">{latest.map(item => <TransactionRow key={item.id} item={item} onClick={() => onEditTransaction(item)}/>)}</div> : <EmptyState icon={<CreditCard size={20}/>} title="Sin movimientos aún" text="Añade un ingreso o gasto para comenzar."/>}</article>
    </section>
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
  return <div className="page-wrap"><PageHeading eyebrow="TU DINERO, MOVIMIENTO A MOVIMIENTO" title="Movimientos" subtitle="Todos tus ingresos y gastos en un mismo lugar." action={<button className="btn btn-primary" onClick={onAdd}><Plus size={17} /> Añadir movimiento</button>} /><div className="activity-stats"><div><span>Ingresos registrados</span><strong className="value-income">+{currency(sumIn)}</strong></div><div><span>Gastos registrados</span><strong>−{currency(sumOut)}</strong></div><div><span>Balance</span><strong>{currency(money(sumIn - sumOut))}</strong></div></div><section className="panel activity-panel"><div className="activity-toolbar"><div className="search-box"><Search size={16} /><input aria-label="Buscar movimiento o categoría" placeholder="Buscar movimiento o categoría" value={query} onChange={e => setQuery(e.target.value)} /></div><button className="select-button" onClick={() => setQuery('')}>Todos los movimientos <ChevronDown size={14} /></button></div>{filtered.length ? <div className="transaction-list">{filtered.map(item => <div className="activity-item" key={item.id}><TransactionRow item={item} onClick={() => onEdit(item)} /><button className="delete-mini" aria-label={`Eliminar ${item.title}` } title="Eliminar movimiento" onClick={() => onDelete(item.id)}><X size={15} /></button></div>)}</div> : <EmptyState icon={<Search size={20} />} title="No encontramos movimientos" text="Prueba otra búsqueda o añade un movimiento nuevo." />}</section><p className="page-footnote">Los movimientos son privados y se muestran según la información de tu espacio.</p></div>
}

function CalendarPage({ data, onAdd, onEdit, onDelete }: { data: FinanceData; onAdd: (date: string) => void; onEdit: (item: CalendarEvent) => void; onDelete: (id: string) => void }) {
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
   return <div className="page-wrap"><PageHeading eyebrow="FECHAS IMPORTANTES" title="Tu calendario" subtitle="Ten a la vista los eventos y pagos que vienen." action={<button className="btn btn-primary" onClick={() => onAdd(selected)}><Plus size={17}/> Añadir evento</button>} />
    <div className="calendar-week-toolbar"><div><span className="eyebrow">TU AGENDA</span><h2 className={view === 'month' ? 'month-heading' : undefined}>{view === 'month' ? `${monthLabel[0].toUpperCase()}${monthLabel.slice(1)}` : range}</h2></div><div className="calendar-toolbar-actions"><div className="calendar-view-toggle" role="group" aria-label="Vista del calendario"><button type="button" className={view === 'week' ? 'active' : ''} aria-pressed={view === 'week'} onClick={() => changeView('week')}>Semana</button><button type="button" className={view === 'month' ? 'active' : ''} aria-pressed={view === 'month'} onClick={() => changeView('month')}>Mes</button></div><div className="month-arrows"><button className="icon-button pale-icon" aria-label={view === 'month' ? 'Mes anterior' : 'Semana anterior'} onClick={() => navigate(-1)}><ArrowLeft size={16}/></button><button className="icon-button pale-icon" aria-label={view === 'month' ? 'Mes siguiente' : 'Semana siguiente'} onClick={() => navigate(1)}><ArrowRight size={16}/></button></div></div></div>
    <div className={`calendar-layout ${view === 'week' ? 'weekly-calendar-layout' : 'monthly-calendar-layout'}`}><section className="panel calendar-panel">
      {view === 'week' ? <div className="week-calendar-scroll"><div className="week-calendar">{days.map(day => { const key = isoDate(day); const dayEvents = data.events.filter(event => event.date === key).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')); return <div className={`week-day-column ${key === selected ? 'week-day-selected' : ''} ${key === isoDate(today) ? 'week-today' : ''}`} key={key}><button className="week-day-heading" onClick={() => setSelected(key)}><span>{new Intl.DateTimeFormat('es-EC', { weekday: 'short' }).format(day).replace('.', '')}</span><strong>{day.getDate()}</strong></button><button className="week-add-day" onClick={() => { setSelected(key); onAdd(key) }} aria-label={`Añadir evento ${key}`}><Plus size={13}/></button><div className="week-events">{dayEvents.map(event => <button className={`schedule-event ${event.kind === 'payment' ? 'schedule-payment' : `schedule-${event.category ?? 'personal'}`}`} key={event.id} onClick={() => { setSelected(key); onEdit(event) }}><span>{event.time || (event.kind === 'payment' ? 'Pago' : 'Evento')}</span><strong>{event.title}</strong>{event.location && <small>{event.location}</small>}{event.kind === 'payment' && <small>{currency(event.amount ?? 0)}</small>}</button>)}</div></div> })}</div></div> : <div className="month-calendar"><div className="calendar-grid calendar-weekdays">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid month-calendar-grid">{monthDays.map(day => { const key = isoDate(day); const dayEvents = data.events.filter(event => event.date === key).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')); return <button type="button" key={key} className={`calendar-cell month-day ${monthId(day) !== monthId(firstOfMonth) ? 'month-outside' : ''} ${key === selected ? 'selected-day' : ''} ${key === isoDate(today) ? 'today-day' : ''}`} aria-pressed={key === selected} aria-label={`${longDate(day)}${dayEvents.length ? `, ${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventos'}` : ', sin eventos'}`} onClick={() => { setSelected(key); if (monthId(day) !== monthId(firstOfMonth)) setAnchor(key) }}><strong className="month-day-number">{day.getDate()}</strong><span className="month-day-events">{dayEvents.slice(0, 2).map(event => <span key={event.id} className={`month-event-chip month-event-${event.kind === 'payment' ? 'payment' : event.category ?? 'personal'}`} title={event.title}>{event.title}</span>)}{dayEvents.length > 2 && <small className="month-more">+{dayEvents.length - 2} más</small>}</span><span className="month-day-dots" aria-hidden="true">{dayEvents.slice(0, 3).map(event => <i key={event.id} className={`month-dot-${event.kind === 'payment' ? 'payment' : event.category ?? 'personal'}`} />)}</span></button> })}</div></div>}
      <div className="calendar-legend"><span><i className="legend-personal"/>Personal</span><span><i className="legend-work"/>Trabajo</span><span><i className="legend-health"/>Salud</span><span><i className="payment-dot"/>Pago</span></div></section>
      <aside className="panel day-panel"><div className="day-panel-heading"><div><span className="eyebrow">DÍA SELECCIONADO</span><h2>{longDate(new Date(`${selected}T12:00:00`))}</h2></div><button className="icon-button pale-icon" onClick={() => onAdd(selected)} aria-label="Añadir a este día"><Plus size={17}/></button></div>{selectedEvents.length ? <div className="day-events">{selectedEvents.map(event => <div className={`day-event ${event.kind === 'payment' ? 'day-event-payment' : ''}`} key={event.id}><span className="day-event-icon">{event.kind === 'payment' ? <CreditCard size={17}/> : <CalendarDays size={17}/>}</span><span className="day-event-copy"><strong>{event.title}</strong><small>{event.time || 'Sin hora'}{event.location ? ` · ${event.location}` : ''}</small>{event.kind === 'payment' && <small>Pago · {currency(event.amount ?? 0)}</small>}{event.note && <small>{event.note}</small>}</span><button className="delete-mini" onClick={() => onEdit(event)} aria-label="Editar evento"><Ellipsis size={16}/></button><button className="delete-mini" onClick={() => onDelete(event.id)} aria-label="Eliminar evento"><X size={15}/></button></div>)}</div> : <EmptyState icon={<CalendarDays size={20}/>} title="Un día para ti" text="No hay nada agendado. Puedes dejarlo así o añadir un recordatorio."/>}<button className="btn btn-soft full" onClick={() => onAdd(selected)}><Plus size={16}/> Agregar a este día</button><div className="upcoming-month"><h3>Próximos eventos</h3>{upcoming.length ? upcoming.map(event => <button key={event.id} onClick={() => { setSelected(event.date); onEdit(event) }}><span className="upcoming-date-small">{shortDate(event.date)}</span><span>{event.title}</span><ArrowRight size={13}/></button>) : <p className="muted">Tu agenda está despejada.</p>}</div></aside>
    </div></div>
}
function GoalsPage({ data, onAdd, onEdit, onToggle, onDelete }: { data: FinanceData; onAdd: () => void; onEdit: (goal: AnnualGoal) => void; onToggle: (goal: AnnualGoal) => void; onDelete: (id: string) => void }) {
  const completed = data.goals.filter(goalCompleted).length
  return <div className="page-wrap">
    <PageHeading title="Objetivos del año" subtitle="Escribe un objetivo y márcalo cuando lo cumplas." action={<button className="btn btn-primary goal-add-button" onClick={onAdd}><Plus size={17} /> Nuevo objetivo</button>} />
    {data.goals.length ? <>
      <p className="goal-summary" role="status">{completed} de {data.goals.length} cumplidos</p>
      <ul className="goal-list">{data.goals.map(goal => <li key={goal.id} className={`goal-list-item ${goalCompleted(goal) ? 'goal-is-done' : ''}`}>
        <div className="goal-check"><input id={`goal-${goal.id}`} type="checkbox" checked={goalCompleted(goal)} onChange={() => onToggle(goal)} aria-label={`Marcar ${goal.title} como ${goalCompleted(goal) ? 'pendiente' : 'cumplido'}`} /><label htmlFor={`goal-${goal.id}`}>{goal.title}</label></div>
        <div className="goal-actions"><button className="icon-button pale-icon" type="button" onClick={() => onEdit(goal)} aria-label={`Editar ${goal.title}`}><Pencil size={16} /></button><button className="icon-button pale-icon" type="button" onClick={() => onDelete(goal.id)} aria-label={`Eliminar ${goal.title}`}><X size={16} /></button></div>
      </li>)}</ul>
    </> : <div className="panel"><EmptyState icon={<Target size={22} />} title="Empieza con un propósito" text="Por ejemplo: mejorar mi físico o leer más." /><button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> Crear objetivo</button></div>}
  </div>
}

function ShoppingPage({ data, modify, onAdd, onEdit, onDelete, onAddItem, onEditItem }: { data: FinanceData; modify: (fn: (old: FinanceData) => FinanceData) => void; onAdd: () => void; onEdit: (list: ShoppingList) => void; onDelete: (id: string) => void; onAddItem: (listId: string) => void; onEditItem: (listId: string, item: ShoppingItem) => void }) {
  const toggleItem = (listId: string, itemId: string) => modify(old => ({ ...old, lists: old.lists.map(list => list.id === listId ? { ...list, items: list.items.map(item => item.id === itemId ? { ...item, done: !item.done } : item) } : list) }))
   const removeItem = (listId: string, itemId: string) => { if (window.confirm('¿Eliminar este artículo? Esta acción no se puede deshacer.')) modify(old => ({ ...old, lists: old.lists.map(list => list.id === listId ? { ...list, items: list.items.filter(item => item.id !== itemId) } : list) })) }
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
}
function SettingsPage({ isDemo, email, syncStatus, syncMessage, onRetry, onExport, darkMode, onDarkModeChange, onBudget, onLogout, onExitDemo }: { isDemo: boolean; email: string; syncStatus: 'saved' | 'pending' | 'saving' | 'error'; syncMessage: string; onRetry: () => void; onExport: () => void; darkMode: boolean; onDarkModeChange: (enabled: boolean) => void; onBudget: () => void; onLogout: () => void; onExitDemo: () => void }) {
  const statusLabel = isDemo ? 'Solo local' : syncStatus === 'saved' ? 'Sincronizado' : syncStatus === 'saving' ? 'Guardando…' : syncStatus === 'pending' ? 'Pendiente' : 'Sin guardar'
  return <div className="page-wrap">
    <PageHeading eyebrow="TU ESPACIO, TUS PREFERENCIAS" title="Ajustes" subtitle="Administra tu presupuesto y la forma en que guardas tus datos." />
    <div className="settings-layout"><section className="panel settings-panel">
      <div className="settings-section"><div className="settings-section-icon">{darkMode ? <Moon size={18} /> : <Sun size={18} />}</div><div className="settings-copy"><h2>Modo oscuro</h2><p>Reduce el brillo de MiSer. Esta preferencia se guarda en este navegador.</p></div><button className={`theme-toggle ${darkMode ? 'theme-toggle-on' : ''}`} type="button" role="switch" aria-checked={darkMode} aria-label="Activar modo oscuro" onClick={() => onDarkModeChange(!darkMode)}><span /></button><span className="setting-value theme-value">{darkMode ? 'Activado' : 'Desactivado'}</span></div>
      <div className="settings-section"><div className="settings-section-icon"><Wallet size={18} /></div><div className="settings-copy"><h2>Presupuesto mensual</h2><p>Configura tu límite general y los límites de cada categoría.</p></div><button className="btn btn-soft" onClick={onBudget}>Editar presupuesto</button></div>
      <div className="settings-section"><div className="settings-section-icon"><Heart size={18} /></div><div className="settings-copy"><h2>Moneda principal</h2><p>Todos los importes se registran en dólares estadounidenses.</p></div><span className="setting-value">USD · $</span></div>
      <div className="settings-section"><div className="settings-section-icon"><Download size={18} /></div><div className="settings-copy"><h2>Privacidad y almacenamiento</h2><p>{isDemo ? 'Modo demostración: los cambios se guardan solo en este navegador.' : `Datos de ${email}. Los cambios se guardan por separado en Firestore.`}</p>{syncMessage && <p className="sync-message" role="alert">{syncMessage}</p>}</div><div className="storage-actions"><span className={`connection-badge ${isDemo ? 'connection-demo' : ''} ${syncStatus === 'error' ? 'connection-error' : ''}`} role="status"><i />{statusLabel}</span><button className="btn btn-soft" onClick={onExport}><Download size={15} /> Exportar JSON</button>{syncStatus === 'error' && <button className="btn btn-primary" onClick={onRetry}>Reintentar</button>}</div></div>
      <div className="settings-section"><div className="settings-section-icon"><LogOut size={18} /></div><div className="settings-copy"><h2>{isDemo ? 'Demostración' : 'Sesión'}</h2><p>{isDemo ? 'Vuelve a la vista previa del acceso.' : 'Cierra sesión en este dispositivo.'}</p></div><button className="btn btn-soft" onClick={isDemo ? onExitDemo : onLogout}>{isDemo ? 'Salir del demo' : 'Cerrar sesión'}</button></div>
    </section><aside className="setup-card"><div className="setup-icon"><CircleHelp size={18} /></div><span className="eyebrow">TU INFORMACIÓN</span><h2>{isDemo ? '¿Quieres sincronizar?' : 'Todo en su lugar.'}</h2><p>{isDemo ? 'Conecta un proyecto de Firebase para habilitar cuentas privadas y ver tus datos en otros dispositivos. Configura las variables y reglas del proyecto.' : 'Tus registros están protegidos por tu cuenta.'}</p><span className="setup-foot"><CheckCircle2 size={15} /> {isDemo ? 'Tus datos de muestra se quedan aquí' : 'Acceso protegido por tu cuenta'}</span></aside></div>
    <div className="settings-tip"><Sparkles size={16} /><span><strong>Un consejo:</strong> reserva un momento al final de cada semana para revisar tus movimientos y actualizar tus objetivos.</span></div>
  </div>
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{text}</p></div> }

function EditModal({ modal, month, onClose, onSaveTransaction, onSaveEvent, onSaveGoal, onSaveList, onSaveShoppingItem, onSaveBudget }: { modal: Exclude<Modal, null>; month: string; onClose: () => void; onSaveTransaction: (item: Transaction) => void; onSaveEvent: (item: CalendarEvent) => void; onSaveGoal: (item: AnnualGoal) => void; onSaveList: (item: ShoppingList) => void; onSaveShoppingItem: (listId: string, item: ShoppingItem) => void; onSaveBudget: (item: Budget) => void }) {
   const dialogRef = useRef<HTMLElement>(null)
   useEffect(() => {
     const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
     dialogRef.current?.querySelector<HTMLElement>('form input, form textarea, form select')?.focus()
     return () => opener?.focus()
   }, [])
   const onDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
     if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
     if (event.key !== 'Tab' || !dialogRef.current) return
     const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]')]
     if (!focusable.length) return
     if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus() }
     else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus() }
   }
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
     if (modal.kind !== 'budget' && !title.trim()) { setFormError('Escribe un nombre antes de guardar.'); return }
     const numericAmount = amount ? Number(amount) : 0
     if (amount && !/^\d+(?:\.\d{1,2})?$/.test(amount)) { setFormError('Escribe un monto válido con hasta dos decimales.'); return }
     if (modal.kind === 'shoppingItem') {
      const links = purchaseLinksText.split(/\r?\n/).map(link => link.trim()).filter(Boolean)
      if (links.some(link => !webUrl(link))) { setFormError('Cada enlace de compra debe comenzar con https:// o http://.'); return }
      if (imageUrl && !shoppingImageSrc(imageUrl)) { setFormError('El enlace de la imagen debe comenzar con https:// o http://.'); return }
       onSaveShoppingItem(modal.listId, { id: (editing as ShoppingItem | undefined)?.id ?? id(), name: title.trim(), done: (editing as ShoppingItem | undefined)?.done ?? false, description: description.trim() || undefined, quantity: quantity.trim() || undefined, amount: amount ? money(numericAmount) : undefined, imageUrl: imageUrl || undefined, purchaseLinks: links })
      onClose()
      return
    }
     if (modal.kind === 'transaction') onSaveTransaction({ id: (editing as Transaction | undefined)?.id ?? id(), title: title.trim(), type, amount: money(numericAmount), category, date, note })
     if (modal.kind === 'event') onSaveEvent({ id: (editing as CalendarEvent | undefined)?.id ?? id(), title: title.trim(), date, kind, ...(kind === 'payment' ? { amount: money(numericAmount) } : {}), note, remind, time, location, category: eventCategory })
     if (modal.kind === 'goal') { const existing = editing as AnnualGoal | undefined; onSaveGoal({ ...existing, id: existing?.id ?? id(), title: title.trim(), completed: existing ? goalCompleted(existing) : false }) }
     if (modal.kind === 'list') onSaveList({ id: (editing as ShoppingList | undefined)?.id ?? id(), title: title.trim(), store, items: (editing as ShoppingList | undefined)?.items ?? [] })
     if (modal.kind === 'budget') {
       try { onSaveBudget({ month, totalLimit: money(numericAmount), categoryLimits: parseCategoryLimits(limitsText) }) }
       catch (error) { setFormError(error instanceof Error ? error.message : 'Revisa los límites por categoría.'); return }
     }
     onClose()
   }
   return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section ref={dialogRef} className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={onDialogKeyDown}><div className="modal-heading"><div><span className="eyebrow">{modal.kind === 'budget' ? 'ORGANIZA TU MES' : 'TU ESPACIO PERSONAL'}</span><h2 id="modal-title">{heading}</h2></div><button className="icon-button pale-icon" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div><form className="stack-form modal-form" onSubmit={submit}>
    {modal.kind === 'transaction' && <><div className="segmented-control"><button type="button" className={type === 'expense' ? 'selected' : ''} onClick={() => setType('expense')}><ArrowUpRight size={15} /> Gasto</button><button type="button" className={type === 'income' ? 'selected income-selected' : ''} onClick={() => setType('income')}><ArrowDownLeft size={15} /> Ingreso</button></div><label>¿En qué fue?<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Supermercado" /></label><div className="form-row"><label>Monto (USD)<input type="number" step="0.01" min="0.01" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label><label>Categoría<select value={category} onChange={e => setCategory(e.target.value)}>{['Comida', 'Hogar', 'Transporte', 'Salud', 'Educación', 'Ocio', 'Trabajo', 'Extra', 'Ahorro', 'Otro'].map(value => <option key={value}>{value}</option>)}</select></label></div><label>Fecha<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label><label>Nota <span className="optional">· opcional</span><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Un detalle para recordar…" rows={2} /></label></>}
    {modal.kind === 'event' && <><div className="segmented-control"><button type="button" className={kind === 'event' ? 'selected' : ''} onClick={() => setKind('event')}><CalendarDays size={15} /> Evento</button><button type="button" className={kind === 'payment' ? 'selected selected-payment' : ''} onClick={() => setKind('payment')}><CreditCard size={15} /> Pago</button></div><label>Nombre<input required value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === 'payment' ? 'Ej. Pago de luz' : 'Ej. Cita médica'} /></label>{kind === 'payment' && <label>Monto (USD)<input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>}<div className="form-row"><label>Fecha<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label><label>Hora<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label></div><div className="form-row"><label>Categoría<select value={eventCategory} onChange={e => setEventCategory(e.target.value as 'personal' | 'work' | 'health')}><option value="personal">Personal</option><option value="work">Trabajo</option><option value="health">Salud</option></select></label><label>Lugar<input value={location} onChange={e => setLocation(e.target.value)} placeholder="Opcional" /></label></div><label>Nota <span className="optional">· opcional</span><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Añade un detalle…" rows={2} /></label><label className="check-setting"><input type="checkbox" checked={remind} onChange={e => setRemind(e.target.checked)} /><span><strong>Recordarme</strong><small>Verás este evento en tus próximos recordatorios.</small></span></label></>}
    {modal.kind === 'goal' && <label>Tu objetivo<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Mejorar mi físico" /></label>}
    {modal.kind === 'list' && <><label>Nombre de la lista<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Compra de la semana" /></label><label>Tienda o categoría <span className="optional">· opcional</span><input value={store} onChange={e => setStore(e.target.value)} placeholder="Ej. Supermercado" /></label>{editing && <p className="modal-help">Los artículos de esta lista se conservan al editarla.</p>}</>}
    {modal.kind === 'shoppingItem' && <>
      <label>Nombre del artículo<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Teclado mecánico" /></label>
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
