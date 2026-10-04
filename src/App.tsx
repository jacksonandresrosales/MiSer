import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check,
  CheckCircle2, CreditCard, Download, Ellipsis, Heart,
  ExternalLink, Eye, EyeOff, ImagePlus, LayoutDashboard, LogOut, Pencil,
  Moon, Plus, Quote, RefreshCw, Search, Settings, ShoppingBag, Sparkles, Sun, Target,
  ShieldCheck, UserRound, Wallet, X,
} from 'lucide-react'
import {
  createUserWithEmailAndPassword, onAuthStateChanged, reload,
  sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { firebaseAuth, firebaseConfigured, firebaseMisconfigured, firestore } from './firebase'
import { signInWithGoogleAccount } from './googleAuth'
import { changedRecords, flattenData, loadFinanceData, saveFinanceRecord, saveUserProfile } from './financeStore'
import { goalCompleted, inflateRecords, money, parseCategoryLimits, sumMoney, summarizeBalance, type RecordMap } from './financeData'
import { demoData } from './demoData'
import { philosophyQuotes } from './quotes'
import type { AnnualGoal, Budget, CalendarEvent, FinanceData, ShoppingItem, ShoppingList, Transaction } from './types'
import { defaultPreferences, parsePreferences, parseProfile, profileInitials, profilePhotoSrc, validateProfile, type Preferences, type UserProfile } from './userProfile'
import { backDestination } from './mobileNavigation'
import { useCompactLayout } from './useCompactLayout'
import { nextLocalQuoteIndex } from './quoteRotation'
import { parsePendingChanges, readFinanceCache, readPendingChanges, writeFinanceCache } from './financeCache'
import { clearPrivateCache, flushPrivateStorage, forgetPrivateMemory, preparePrivateStorage, privateStorage } from './privateStorage'
import { DeviceSecurityGate, DeviceSecuritySettings } from './DeviceSecurity'
import { FinanceImage } from './FinanceImage'
import { mediaId } from './financeMedia'
const CalendarPage = lazy(() => import('./CalendarPage'))
const ShoppingPage = lazy(() => import('./ShoppingPage'))
import { AndroidUpdatesProvider, AndroidUpdateSettings } from './AndroidUpdates'
import './MiSer.css'
import './mobile-ux.css'
import './page-transitions.css'

type Page = 'overview' | 'activity' | 'calendar' | 'goals' | 'shopping' | 'settings'
type Modal = { kind: 'transaction'; item?: Transaction } | { kind: 'event'; item?: CalendarEvent; date?: string } | { kind: 'goal'; item?: AnnualGoal } | { kind: 'list'; item?: ShoppingList } | { kind: 'shoppingItem'; listId: string; item?: ShoppingItem } | { kind: 'budget'; item?: Budget } | null
type Session = { user: { id: string; email?: string; verified: boolean; passwordAccount: boolean } } | null
type MotivationQuote = { text: string; author: string; work?: string; source: string; sourceLabel?: string; translation?: boolean }

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const dateFormatter = new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short' })
const currency = (value: number) => currencyFormatter.format(value)
const shortDate = (value: string) => dateFormatter.format(new Date(`${value}T12:00:00`))
const monthId = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const id = () => crypto.randomUUID()
const localMotivationQuotes = philosophyQuotes as readonly MotivationQuote[]
const demoStorageKey = 'miser-demo'
const previousDemoStorageKey = 'brisa-demo'
const seenMotivationQuotesKey = 'miser-seen-motivation-quotes'
const dailyMotivationQuoteKey = 'miser-daily-motivation-quote'
const demoProfileKey = 'miser-demo-profile'
const preferencesKey = 'miser-preferences'
const emptyProfile: UserProfile = { displayName: 'Mi espacio', photoURL: '' }
const readPreferences = () => {
  try { return parsePreferences(JSON.parse(localStorage.getItem(preferencesKey) ?? 'null')) }
  catch { return defaultPreferences }
}

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
  if (Capacitor.isNativePlatform()) return null // Android uses the bundled quotes; /api is hosted only on the web.
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
const shoppingImageSrc = (value?: string) => profilePhotoSrc(value ?? '')

async function compressImage(file: File, avatar = false): Promise<string> {
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error('Usa una imagen JPG, PNG, WebP o AVIF.')
  if (file.size > 10 * 1024 * 1024) throw new Error('La imagen debe pesar menos de 10 MB.')
  const bitmap = await createImageBitmap(file, { resizeWidth: avatar ? 512 : 1024, resizeQuality: 'high' }).catch(() => { throw new Error('No se pudo leer la imagen. Prueba con otro archivo JPG, PNG, WebP o AVIF.') })
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const edge = (avatar ? 256 : 760) * Math.pow(0.78, attempt)
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = avatar ? Math.round(edge) : Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = avatar ? Math.round(edge) : Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No se pudo preparar la imagen.')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      if (avatar) {
        const crop = Math.min(bitmap.width, bitmap.height)
        context.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, canvas.width, canvas.height)
      } else context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('No se pudo reducir la imagen.')), 'image/jpeg', Math.max(0.48, 0.78 - attempt * 0.08)))
      const result = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('No se pudo leer la imagen reducida.')); reader.readAsDataURL(blob) })
      if (result.length <= 140_000) return result
    }
    throw new Error('La imagen sigue siendo demasiado grande. Prueba con otra.')
  } finally { bitmap.close() }
}

function BrandMark() {
  return <span className="brand-mark"><img src="/favicon.svg" alt="" /></span>
}

function ProfileAvatar({ profile, className = 'avatar' }: { profile: UserProfile; className?: string }) {
  const src = profilePhotoSrc(profile.photoURL)
  return <span className={className} aria-hidden="true">{profileInitials(profile.displayName)}{src && <img key={src} src={src} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} />}</span>
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
      await signInWithGoogleAccount(firebaseAuth)
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      const cancelled = code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
        || (Capacitor.isNativePlatform() && error instanceof Error && /cancel/i.test(error.message))
      if (!cancelled) {
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
  const [preferences, setPreferences] = useState<Preferences>(readPreferences)
  const [page, setPage] = useState<Page>(preferences.startPage)
  const [profile, setProfile] = useState<UserProfile>(() => {
    if (firebaseConfigured) return emptyProfile
    try { return parseProfile(JSON.parse(localStorage.getItem(demoProfileKey) ?? 'null')) ?? emptyProfile }
    catch { return emptyProfile }
  })
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
  const compactLayout = useCompactLayout()
  const [offlineSince, setOfflineSince] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const userId = session?.user.id
  const dataRef = useRef(data)
  const remoteRecords = useRef<RecordMap>(new Map())
  const versions = useRef(new Map<string, number>())
  const syncCursor = useRef<import('./financeCache').SyncCursor | null>(null)
  const expectedVersions = useRef(new Map<string, number>())
  const flushing = useRef(false)
  const modalOpener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return
    const listener = NativeApp.addListener('backButton', () => {
      switch (backDestination({ modal: !!modal, page })) {
        case 'modal': window.dispatchEvent(new Event('miser-close-modal')); break
        case 'overview': setPage('overview'); break
        case 'exit': void NativeApp.exitApp(); break
      }
    })
    return () => { void listener.then(handle => handle.remove()) }
  }, [modal, page])

  useEffect(() => {
    if (!modal) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [modal])

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [page])

  useEffect(() => {
    if (!firebaseAuth) return
    return onAuthStateChanged(firebaseAuth, next => {
      setSession(next ? { user: { id: next.uid, email: next.email ?? undefined, verified: next.emailVerified, passwordAccount: next.providerData.some(provider => provider.providerId === 'password') } } : null)
      setProfile(next ? { displayName: next.displayName?.trim() || 'Mi espacio', photoURL: profilePhotoSrc(next.photoURL ?? '') ?? '' } : emptyProfile)
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
    preparePrivateStorage(userId).then(() => {
      if (!active) return null
      return loadFinanceData(db, userId, readFinanceCache(userId))
    }).then(async result => {
      if (!result) return
      if (!active) return
      const pending = parsePendingChanges(userId, privateStorage.getItem(`miser-pending-${userId}`))
      if (!pending) throw new Error('invalid-pending')
      if (!writeFinanceCache(userId, result)) throw new Error('cache-failed')
      await flushPrivateStorage()
      if (!active) return
      syncCursor.current = result.syncCursor
      setOfflineSince(null)
      remoteRecords.current = result.records
      versions.current = result.versions
      expectedVersions.current = new Map()
      const restored = new Map(result.records)
        for (const [key, record, version] of pending) {
          if (JSON.stringify(record?.value) === JSON.stringify(result.records.get(key)?.value)) continue
          if (record) restored.set(key, record)
          else restored.delete(key)
          expectedVersions.current.set(key, version)
        }
      const restoredData = inflateRecords(restored)
      if (!expectedVersions.current.size && pending.length) {
        privateStorage.removeItem(`miser-pending-${userId}`)
        await flushPrivateStorage()
        if (!active) return
      }
      dataRef.current = restoredData
      setData(restoredData)
      if (result.profile) setProfile(result.profile)
      setSyncStatus(changedRecords(result.records, restored).length ? 'pending' : 'saved')
      setSyncMessage('')
      setLoadedUserId(userId)
      setLoaded(true)
    }).catch((error: unknown) => {
      if (!active) return
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      const cache = code !== 'permission-denied' && code !== 'unauthenticated' && (code === 'unavailable' || !navigator.onLine) ? readFinanceCache(userId) : null
      if (cache) {
        const recovered = new Map(cache.records)
        for (const [key, record] of readPendingChanges(userId)) {
          if (record) recovered.set(key, record)
          else recovered.delete(key)
        }
        dataRef.current = inflateRecords(recovered)
        setData(dataRef.current)
        if (cache.profile) setProfile(cache.profile)
        setOfflineSince(cache.cachedAt)
        setLoadedUserId(userId)
        setLoaded(true)
        setSyncStatus('error')
        setSyncMessage('Sin conexión. Consulta o exporta tu copia local; reconecta antes de editar.')
        return
      }
      setLoadError(code === 'permission-denied'
        ? 'Firestore denegó el acceso. Publica las reglas actualizadas de firestore.rules en Firebase Console → Firestore → Reglas y comprueba que tu correo esté verificado.'
        : code === 'unavailable' ? 'Firestore no está disponible. Revisa tu conexión e inténtalo de nuevo.'
          : error instanceof Error && error.message === 'invalid-pending' ? 'La recuperación de cambios está dañada. No la hemos reemplazado. Exporta la recuperación antes de continuar.'
            : error instanceof Error && error.message === 'invalid-data' ? 'Hay un registro con formato inválido. Tus datos no se han reemplazado. Exporta la recuperación y revisa ese registro antes de continuar.'
            : error instanceof Error && error.message === 'cache-failed' ? 'No se pudo guardar una recuperación local segura. Revisa el espacio disponible; tus datos de Firebase siguen intactos.'
              : `No se pudo cargar tu información${code ? ` (${code})` : ''}. Revisa tu conexión y la configuración de Firebase.`)
    })
    return () => { active = false }
  }, [userId, session?.user.verified, loadAttempt])

  useEffect(() => {
    if (!data || !loaded || offlineSince) return
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
      privateStorage.setItem(`miser-pending-${userId}`, JSON.stringify({ uid: userId, changes: changes.map(([key, record]) => [key, record, expectedVersions.current.get(key) ?? versions.current.get(key) ?? 0]) }))
    } catch { setSyncMessage('No se pudo guardar una copia local de los cambios pendientes. Exporta tus datos antes de cerrar.') }
    const timer = window.setTimeout(async () => {
      if (flushing.current) return
      flushing.current = true
      let completed = false
      setSyncStatus('saving')
      try {
        while (dataRef.current) {
          if (firebaseAuth?.currentUser?.uid !== userId) return
          const batchData = dataRef.current
          const batchChanges = changedRecords(remoteRecords.current, flattenData(batchData))
          if (!batchChanges.length) break
          privateStorage.setItem(`miser-pending-${userId}`, JSON.stringify({ uid: userId, changes: batchChanges.map(([key, record]) => [key, record, expectedVersions.current.get(key) ?? versions.current.get(key) ?? 0]) }))
          await flushPrivateStorage()
          for (const [key, record] of batchChanges) {
            if (firebaseAuth?.currentUser?.uid !== userId) return
            const saved = await saveFinanceRecord(db, userId, key, record, expectedVersions.current.get(key) ?? versions.current.get(key) ?? 0)
            if (firebaseAuth?.currentUser?.uid !== userId) return
            if (saved.record) remoteRecords.current.set(key, saved.record)
            else remoteRecords.current.delete(key)
            versions.current.set(key, saved.version)
            expectedVersions.current.delete(key)
            if (record?.kind === 'item' && saved.record?.value.imageUrl !== record.value.imageUrl && dataRef.current) {
              const next: FinanceData = { ...dataRef.current, lists: dataRef.current.lists.map(list => ({ ...list, items: list.items.map(item =>
                item.id === record.value.id && item.imageUrl === record.value.imageUrl ? { ...item, imageUrl: String(saved.record!.value.imageUrl) } : item) })) }
              dataRef.current = next
              setData(next)
            }
          }
          if (batchData === dataRef.current) break
        }
        const committedData = dataRef.current
        if (!writeFinanceCache(userId, { records: remoteRecords.current, versions: versions.current, profile, syncCursor: syncCursor.current })) throw new Error('cache-failed')
        await flushPrivateStorage()
        if (dataRef.current === committedData) {
          privateStorage.removeItem(`miser-pending-${userId}`)
          await flushPrivateStorage()
        }
        setSyncStatus('saved')
        setSyncMessage('')
        completed = true
      } catch (error) {
        setSyncStatus('error')
        setSyncMessage(error instanceof Error && error.message === 'conflict' ? 'Otro dispositivo cambió el mismo registro. Exporta tus datos y recarga antes de continuar.' : 'No se pudieron guardar todos los cambios. Revisa tu conexión y vuelve a intentar.')
      } finally {
        if (firebaseAuth?.currentUser?.uid === userId && dataRef.current) {
          const remaining = changedRecords(remoteRecords.current, flattenData(dataRef.current))
          try {
            if (remaining.length) { privateStorage.setItem(`miser-pending-${userId}`, JSON.stringify({ uid: userId, changes: remaining.map(([key, record]) => [key, record, expectedVersions.current.get(key) ?? versions.current.get(key) ?? 0]) })); await flushPrivateStorage() }
            if (completed && remaining.length) { setSyncStatus('pending'); setSaveAttempt(value => value + 1) }
          } catch { setSyncMessage('Exporta tus datos antes de cerrar: no se pudo conservar la recuperación local.') }
        }
        flushing.current = false
      }
    }, 450)
    return () => window.clearTimeout(timer)
  }, [data, loaded, userId, loadedUserId, saveAttempt, offlineSince, profile])

  useEffect(() => {
    if (!offlineSince) return
    const reconnect = () => setLoadAttempt(value => value + 1)
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [offlineSince])

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

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(preferences.reducedMotion)
  }, [preferences.reducedMotion])

  function showToast(message: string) { setToast(message) }
  const today = new Date()
  const currentMonth = monthId(today)
  const monthBudget = data?.budgets.find(b => b.month === currentMonth) ?? { month: currentMonth, totalLimit: 1200, categoryLimits: { Comida: 350, Hogar: 600, Transporte: 100, Salud: 150 } }
  const monthTransactions = useMemo(() => (data?.transactions ?? []).filter(t => t.date.startsWith(currentMonth)), [data?.transactions, currentMonth])
  const expenses = sumMoney(monthTransactions.filter(t => t.type === 'expense').map(t => t.amount))

  const modify = (fn: (old: FinanceData) => FinanceData) => {
    if (offlineSince) { showToast('Estás viendo una copia local. Reconecta antes de editar.'); return }
    if (!dataRef.current) return
    const next = fn(dataRef.current)
    dataRef.current = next
    setData(next)
    if (firebaseConfigured) setSyncStatus('pending')
  }
  const exportPayload = async (payload: unknown, prefix = 'miser') => {
    if (!window.confirm('Esta copia contiene información financiera sin cifrar. Compártela solo con una aplicación o ubicación de confianza. ¿Continuar?')) return
    const json = JSON.stringify(payload, null, 2)
    if (Capacitor.isNativePlatform()) {
      try {
        const file = await Filesystem.writeFile({ path: `exports/${prefix}-${isoDate(new Date())}-${id()}.json`, data: json, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true })
        await Share.share({ title: 'Copia de MiSer', files: [file.uri], dialogTitle: 'Guardar o compartir copia' })
      } catch { showToast('No se completó la exportación. Tus datos siguen en MiSer; vuelve a intentarlo.') }
      return
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${prefix}-${isoDate(new Date())}.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const exportData = () => dataRef.current && exportPayload(dataRef.current)
  const exportRecovery = async () => {
    if (!userId) return
    let pendingRaw: string | null = null
    try { pendingRaw = privateStorage.getItem(`miser-pending-${userId}`) ?? localStorage.getItem(`miser-pending-${userId}`) } catch { /* Export any valid cache that is still accessible. */ }
    const cache = readFinanceCache(userId)
    let legacyCacheRaw: string | null = null
    try { legacyCacheRaw = localStorage.getItem(`miser-finance-cache-${userId}`) } catch { /* Never delete inaccessible recovery data. */ }
    if (!cache && !pendingRaw && !legacyCacheRaw) { showToast('No hay una copia de recuperación en este dispositivo.'); return }
    await exportPayload({ uid: userId, exportedAt: new Date().toISOString(), cachedData: cache?.data ?? null, cachedAt: cache?.cachedAt ?? null, changes: readPendingChanges(userId), pendingRaw, legacyCacheRaw }, 'miser-recuperacion')
  }
  const confirmDelete = (label: string, action: () => void) => { if (window.confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) action() }
  const signOut = async () => {
    if (!firebaseAuth) return
    if ((flushing.current || userId && privateStorage.getItem(`miser-pending-${userId}`)) && !window.confirm('Quedan cambios sin sincronizar. La recuperación se conservará en este dispositivo. ¿Cerrar sesión?')) return
    try {
      await flushPrivateStorage()
      const previousUid = userId
      await firebaseSignOut(firebaseAuth)
      if (previousUid && !privateStorage.getItem(`miser-pending-${previousUid}`)) await clearPrivateCache(previousUid)
      forgetPrivateMemory()
      setPage('overview')
    }
    catch { showToast('No se pudo cerrar sesión. Revisa tu conexión e inténtalo de nuevo.') }
  }
  const leaveDemo = () => { setDemoEntryOpen(true); setPage('overview'); setModal(null) }
  const saveProfile = async (draft: UserProfile) => {
    if (offlineSince) throw new Error('Reconecta antes de editar tu perfil.')
    const next = validateProfile(draft)
    if (firebaseConfigured) {
      if (!firestore || !userId || firebaseAuth?.currentUser?.uid !== userId || loadedUserId !== userId) throw new Error('Tu sesión cambió. Vuelve a iniciar sesión antes de guardar.')
      await saveUserProfile(firestore, userId, next)
      if (firebaseAuth.currentUser?.uid !== userId) throw new Error('El perfil se guardó, pero tu sesión cambió. Vuelve a iniciar sesión.')
      const cache = readFinanceCache(userId)
      if (cache) { if (!writeFinanceCache(userId, { ...cache, profile: next })) throw new Error('No se pudo guardar la copia local del perfil.'); await flushPrivateStorage() }
    } else {
      try { localStorage.setItem(demoProfileKey, JSON.stringify(next)) }
      catch { throw new Error('No hay espacio para guardar el perfil en este navegador. Prueba con una foto más pequeña.') }
    }
    setProfile(next)
    return next
  }
  const changePreferences = (next: Preferences) => {
    try { localStorage.setItem(preferencesKey, JSON.stringify(next)); setPreferences(next) }
    catch { showToast('No se pudieron guardar las preferencias en este dispositivo.') }
  }
  const requestPasswordChange = async () => {
    if (!firebaseAuth || !session?.user.email || firebaseAuth.currentUser?.uid !== userId) throw new Error('Vuelve a iniciar sesión antes de solicitar el enlace.')
    await sendPasswordResetEmail(firebaseAuth, session.user.email)
  }
  const clearLocalData = async () => {
    if (!userId || !firebaseAuth) throw new Error('Esta opción requiere una cuenta conectada.')
    if (flushing.current || dataRef.current && changedRecords(remoteRecords.current, flattenData(dataRef.current)).length || readPendingChanges(userId).length) throw new Error('Hay cambios pendientes. Sincroniza o exporta antes de borrar la copia local.')
    if (!window.confirm('¿Borrar la copia local y cerrar sesión? Tus datos de Firebase se conservarán.')) return
    await clearPrivateCache(userId)
    await firebaseSignOut(firebaseAuth)
    forgetPrivateMemory()
  }
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
  if (firebaseConfigured && loadError) return <main className="load-error-screen"><div className="load-error-card"><BrandMark /><h1>No pudimos abrir tu espacio</h1><p>{loadError} Tus datos no se han reemplazado.</p>{toast && <p role="status">{toast}</p>}<div className="load-error-actions"><button className="btn btn-primary" onClick={() => setLoadAttempt(value => value + 1)}>Intentar de nuevo</button><button className="btn btn-soft" onClick={() => void exportRecovery()}>Exportar recuperación local</button><button className="btn btn-soft" onClick={signOut}>Cerrar sesión</button></div></div></main>
  if (!data || !loaded || (firebaseConfigured && loadedUserId !== userId)) return <div className="loading-screen"><BrandMark /><span>Cargando tu espacio…</span></div>

  const title = navItems.find(item => item.id === page)?.label ?? 'Ajustes'
  const isDemo = !firebaseConfigured
  const reminders = data.events.filter(event => event.remind && event.date >= isoDate(today)).length
  const openModal = (next: Exclude<Modal, null>) => {
    if (offlineSince) { showToast('Reconecta para editar. Puedes consultar y exportar tu copia local.'); return }
    modalOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setModal(next)
  }
  const closeModal = () => { setModal(null); requestAnimationFrame(() => modalOpener.current?.focus()) }
  return <div className={`app-shell ${page === 'overview' ? 'on-overview' : ''}`}>
    {!compactLayout && <aside className="sidebar" inert={!!modal}>
      <div className="sidebar-brand"><BrandMark /><span>MiSer</span></div>
      <nav className="main-nav" aria-label="Secciones">{navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => { setPage(item.id) }}><Icon size={18} strokeWidth={1.8} /><span>{item.id === 'goals' ? 'Objetivos' : item.id === 'shopping' ? 'Compras' : item.label}</span>{item.id === 'shopping' && <span className="nav-count">{data.lists.length}</span>}</button>})}</nav>
      <div className="sidebar-bottom"><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => { setPage('settings') }}><Settings size={18} strokeWidth={1.8} /><span>Ajustes</span></button><div className="profile"><ProfileAvatar profile={profile} /><span className="profile-name">{profile.displayName}</span>{isDemo ? <button className="demo-exit" onClick={leaveDemo}><LogOut size={14} /> Salir</button> : <button className="icon-button" onClick={signOut} aria-label="Cerrar sesión"><LogOut size={16} /></button>}</div></div>
    </aside>}

    <main className="main-content" inert={!!modal}>
      <header className="topbar"><div className="breadcrumb"><span>{new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long' }).format(today)}</span><strong>{page === 'overview' ? 'Hola, qué bueno verte ✦' : title}</strong></div><div className="topbar-actions"><button className="icon-button notification-button" onClick={() => { setPage('calendar'); showToast(reminders ? `${reminders} recordatorios próximos en tu agenda. No son notificaciones del teléfono.` : 'No tienes recordatorios próximos.') }} aria-label={`Ver agenda: ${reminders} recordatorios próximos`}><Bell size={18} />{reminders > 0 && <i />}</button><button className="icon-button theme-quick-toggle" type="button" onClick={() => setDarkMode(value => !value)} aria-label={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'} title={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button><button className="top-profile-button" type="button" onClick={() => { setPage('settings') }} aria-label={`Editar perfil de ${profile.displayName}`}><ProfileAvatar profile={profile} className="top-avatar" /><span className="profile-name top-profile-name">{profile.displayName}</span></button></div></header>
      {isDemo && <div className="demo-banner"><span><Sparkles size={14} /> Estás explorando el modo de demostración. Tus cambios se guardan solo en este navegador.</span><button onClick={leaveDemo}>Ver acceso <ArrowRight size={13} /></button></div>}
      {offlineSince && <div className="sync-banner offline-banner" role="status"><span>Copia local del {new Intl.DateTimeFormat('es-EC', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(offlineSince))}. Solo consulta; los cambios pendientes se conservan.</span><div><button onClick={() => setLoadAttempt(value => value + 1)}>Reconectar</button><button onClick={() => void exportData()}>Exportar copia</button></div></div>}
      {!isDemo && syncStatus !== 'saved' && <div className={`sync-banner ${syncStatus === 'error' ? 'sync-banner-error' : ''}`} role={syncStatus === 'error' ? 'alert' : 'status'}><span>{syncStatus === 'error' ? syncMessage : syncStatus === 'saving' ? 'Guardando cambios…' : 'Cambios pendientes de guardar…'}</span>{syncStatus === 'error' && <div><button onClick={() => setSaveAttempt(value => value + 1)}>Reintentar</button><button onClick={exportData}>Exportar copia</button></div>}</div>}
      <div key={page} className="t-page-slide app-page-transition" data-page="1">
        <section className="t-page" data-page-id="1" aria-label={title}>
        <Suspense fallback={<div className="page-wrap" role="status">Cargando pantalla…</div>}>
      {page === 'overview' && <Overview data={data} expenses={expenses} currentMonth={currentMonth} onAdd={() => openModal({ kind: 'transaction' })} onEditTransaction={item => openModal({ kind: 'transaction', item })} onNavigate={setPage} />}
      {page === 'activity' && <Activity data={data} query={search} setQuery={setSearch} onAdd={() => openModal({ kind: 'transaction' })} onEdit={item => openModal({ kind: 'transaction', item })} onDelete={deleteTransaction} />}
       {page === 'calendar' && <CalendarPage data={data} onAdd={date => openModal({ kind: 'event', date })} onEdit={item => openModal({ kind: 'event', item })} onDelete={deleteEvent} />}
       {page === 'goals' && <GoalsPage data={data} onAdd={() => openModal({ kind: 'goal' })} onEdit={item => openModal({ kind: 'goal', item })} onToggle={item => saveGoal({ ...item, completed: !goalCompleted(item) })} onDelete={deleteGoal} />}
      {page === 'shopping' && <ShoppingPage data={data} modify={modify} onAdd={() => openModal({ kind: 'list' })} onEdit={item => openModal({ kind: 'list', item })} onDelete={deleteList} onAddItem={listId => openModal({ kind: 'shoppingItem', listId })} onEditItem={(listId, item) => openModal({ kind: 'shoppingItem', listId, item })} />}
       {page === 'settings' && <SettingsPage key={userId ?? 'demo'} isDemo={isDemo} email={session?.user.email ?? ''} profile={profile} onSaveProfile={saveProfile} preferences={preferences} onPreferencesChange={changePreferences} passwordAccount={session?.user.passwordAccount ?? false} onPasswordChange={requestPasswordChange} syncStatus={syncStatus} syncMessage={syncMessage} onRetry={() => offlineSince ? setLoadAttempt(value => value + 1) : setSaveAttempt(value => value + 1)} onExport={exportData} darkMode={darkMode} onDarkModeChange={setDarkMode} onBudget={() => openModal({ kind: 'budget', item: monthBudget })} onLogout={signOut} onExitDemo={leaveDemo} onClearLocal={clearLocalData} />}
        </Suspense></section>
      </div>
    </main>
    {compactLayout && <nav className="mobile-navigation" aria-label="Navegación principal" inert={!!modal}>{navItems.map(item => { const Icon = item.icon; return <button type="button" key={item.id} aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}><Icon size={21} aria-hidden="true" /><span>{item.id === 'shopping' ? 'Compras' : item.id === 'goals' ? 'Objetivos' : item.id === 'activity' ? 'Movimientos' : item.label}</span></button> })}</nav>}
    {modal && <EditModal modal={modal} month={currentMonth} onClose={closeModal} onSaveTransaction={saveTransaction} onSaveEvent={saveEvent} onSaveGoal={saveGoal} onSaveList={saveList} onSaveShoppingItem={saveShoppingItem} onSaveBudget={saveBudget} />}
     {toast && <div className="toast" role="status"><CheckCircle2 size={17} />{toast}</div>}
  </div>
}

function PageHeading({ title, subtitle, action }: { eyebrow?: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p className="muted">{subtitle}</p></div>{action}</div>
}

function Overview({ data, expenses, currentMonth, onAdd, onEditTransaction, onNavigate }: { data: FinanceData; expenses: number; currentMonth: string; onAdd: () => void; onEditTransaction: (item: Transaction) => void; onNavigate: (page: Page) => void }) {
  const now = new Date()
  const { balance, latestIncome, latestExpense } = summarizeBalance(data.transactions, isoDate(now))
  const latest = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
  const nextEvent = data.events.filter(e => e.date >= isoDate(now)).sort((a, b) => a.date.localeCompare(b.date))[0]
  const nextGoal = data.goals.find(item => !goalCompleted(item))
  const budget = data.budgets.find(item => item.month === currentMonth)
  const monthLabel = new Intl.DateTimeFormat('es-EC', { month: 'long' }).format(now)
  return <div className="page-wrap miser-dashboard">
    <section className="overview-spend" aria-labelledby="overview-spend-title">
      <div className="overview-spend-head"><h1 id="overview-spend-title">Tu dinero</h1><button className="btn btn-primary overview-add" onClick={onAdd}><Plus size={17} /> Añadir movimiento</button></div>
      <div className="overview-money">
        <div className="overview-balance"><span>Saldo disponible</span><strong>{currency(balance)}</strong><p>Ingresos menos gastos registrados hasta hoy.</p></div>
        <div className="overview-last-movements" aria-label="Último ingreso y último gasto">
          {([{ item: latestIncome, type: 'income', label: 'Último ingreso' }, { item: latestExpense, type: 'expense', label: 'Último gasto' }] as const).map(({ item, type, label }) => (
            <button key={type} type="button" className={`overview-last-movement overview-last-${type}`} disabled={!item} onClick={() => item && onEditTransaction(item)} aria-label={item ? `${label}: ${item.title}, ${currency(item.amount)}, ${shortDate(item.date)}. Editar movimiento` : `${label}: sin registrar`}>
              <span className="overview-last-label">{type === 'income' ? <ArrowDownLeft size={15} aria-hidden="true" /> : <ArrowUpRight size={15} aria-hidden="true" />}{label}</span>
              <strong>{item ? `${type === 'income' ? '+' : '−'}${currency(item.amount)}` : 'Sin registrar'}</strong>
              <span className="overview-last-detail">{item ? <><span title={item.title}>{item.title}</span><time dateTime={item.date}>{shortDate(item.date)}</time></> : 'Añade tu primer movimiento'}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="overview-month-spend"><span>Gastos de {monthLabel}</span><strong>{currency(expenses)}</strong></div>
      {budget && budget.totalLimit > 0 ? <div className="overview-budget"><progress max={budget.totalLimit} value={Math.min(expenses, budget.totalLimit)} aria-label="Presupuesto mensual utilizado" /><div><span>Presupuesto: {currency(budget.totalLimit)}</span><strong>{expenses < budget.totalLimit ? `Te quedan ${currency(money(budget.totalLimit - expenses))} del presupuesto` : expenses === budget.totalLimit ? 'Llegaste a tu límite' : `Superaste el límite por ${currency(money(expenses - budget.totalLimit))}`}</strong></div></div> : <p className="overview-budget-empty">Sin límite mensual configurado. Puedes añadirlo en Ajustes.</p>}
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
        for (let attempt = 0; !Capacitor.isNativePlatform() && attempt < 3; attempt++) {
          const candidate = await requestApiQuote()
          if (!candidate) continue
          const key = quoteIdentity(candidate)
          if (seenQuotes.current.has(key)) continue
          markSeen(candidate); saveDailyMotivationQuote(candidate); setQuote(candidate); return
        }
      } catch { apiFailed = true }
      const rotation = nextLocalQuoteIndex(localMotivationQuotes.map(quoteIdentity), seenQuotes.current, quoteIdentity(quote))
      const fallback = localMotivationQuotes[rotation.index]
      if (rotation.reset) {
        seenQuotes.current = new Set([quoteIdentity(quote)])
        try { localStorage.setItem(seenMotivationQuotesKey, JSON.stringify([...seenQuotes.current])) } catch { /* Rotation still works in memory. */ }
      }
      if (fallback) {
        markSeen(fallback); saveDailyMotivationQuote(fallback); setQuote(fallback)
        setMessage(Capacitor.isNativePlatform() ? 'Frase de tu colección sin conexión.' : apiFailed ? 'Sin respuesta del servicio; mostramos una frase de tu colección.' : 'Frase de tu colección.')
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
  const [limit, setLimit] = useState(50)
  const today = isoDate(new Date())
  const recorded = data.transactions.filter(item => item.date <= today)
  const { balance } = summarizeBalance(data.transactions, today)
  const sumIn = sumMoney(recorded.filter(item => item.type === 'income').map(item => item.amount))
  const sumOut = sumMoney(recorded.filter(item => item.type === 'expense').map(item => item.amount))
  const filtered = data.transactions.filter(item => `${item.title} ${item.category}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))).sort((a, b) => b.date.localeCompare(a.date))
  const subtotal = sumMoney(filtered.map(item => item.type === 'income' ? item.amount : -item.amount))
  const changeQuery = (value: string) => { setQuery(value); setLimit(50) }
  return <div className="page-wrap">
    <PageHeading title="Movimientos" subtitle="Tus ingresos y gastos, sin perder de vista tu saldo." action={<button className="btn btn-primary" onClick={onAdd} aria-label="Añadir movimiento"><Plus size={17} /> Añadir movimiento</button>} />
    <div className="activity-stats"><div><span>Ingresos hasta hoy</span><strong className="value-income">+{currency(sumIn)}</strong></div><div><span>Gastos hasta hoy</span><strong>−{currency(sumOut)}</strong></div><div><span>Saldo disponible</span><strong>{currency(balance)}</strong></div></div>
    <section className="panel activity-panel">
      <div className="activity-toolbar"><div className="search-box"><Search size={18} /><input aria-label="Buscar movimiento o categoría" placeholder="Buscar movimiento o categoría" value={query} onChange={event => changeQuery(event.target.value)} /></div>{query && <button className="select-button" onClick={() => changeQuery('')}>Limpiar búsqueda <X size={16} /></button>}</div>
      {query && <p className="search-subtotal" role="status">{filtered.length} resultados · Subtotal de búsqueda: {currency(subtotal)}. No cambia tu saldo disponible.</p>}
      {filtered.length ? <><div className="transaction-list">{filtered.slice(0, limit).map(item => <div className="activity-item" key={item.id}><div className="activity-row-copy"><TransactionRow item={item} onClick={() => onEdit(item)} />{item.date > today && <span className="future-label">Programado · aún no incluido en tu saldo</span>}</div><button className="delete-mini" aria-label={`Eliminar ${item.title}`} onClick={() => onDelete(item.id)}><X size={18} /></button></div>)}</div>{filtered.length > limit && <button className="btn btn-soft full" onClick={() => setLimit(value => value + 50)}>Ver más movimientos ({filtered.length - limit})</button>}</> : <EmptyState icon={<Search size={20} />} title="No encontramos movimientos" text="Prueba otra búsqueda o añade un movimiento nuevo." />}
    </section><p className="page-footnote">El saldo incluye todos los movimientos hasta hoy. Los programados aparecen en la lista, pero todavía no cuentan.</p>
  </div>
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

function SettingsPage({ isDemo, email, profile, onSaveProfile, preferences, onPreferencesChange, passwordAccount, onPasswordChange, syncStatus, syncMessage, onRetry, onExport, darkMode, onDarkModeChange, onBudget, onLogout, onExitDemo, onClearLocal }: {
  isDemo: boolean; email: string; profile: UserProfile; onSaveProfile: (draft: UserProfile) => Promise<UserProfile>;
  preferences: Preferences; onPreferencesChange: (next: Preferences) => void; passwordAccount: boolean; onPasswordChange: () => Promise<void>;
  syncStatus: 'saved' | 'pending' | 'saving' | 'error'; syncMessage: string; onRetry: () => void; onExport: () => void;
  darkMode: boolean; onDarkModeChange: (enabled: boolean) => void; onBudget: () => void; onLogout: () => void; onExitDemo: () => void;
  onClearLocal: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(profile)
  const [saving, setSaving] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const dirty = draft.displayName !== profile.displayName || draft.photoURL !== profile.photoURL
  const statusLabel = isDemo ? 'Solo local' : syncStatus === 'saved' ? 'Sincronizado' : syncStatus === 'saving' ? 'Guardando…' : syncStatus === 'pending' ? 'Pendiente' : 'Sin guardar'

  const uploadPhoto = async (file?: File) => {
    if (!file) return
    setImageBusy(true)
    setProfileMessage(null)
    try {
      const photoURL = await compressImage(file, true)
      setDraft(current => ({ ...current, photoURL }))
    } catch (error) { setProfileMessage({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo preparar la foto. Prueba con otra imagen.' }) }
    finally { setImageBusy(false) }
  }
  const submitProfile = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || imageBusy) return
    setSaving(true)
    setProfileMessage(null)
    try {
      const next = await onSaveProfile(validateProfile(draft))
      setDraft(next)
      setProfileMessage({ kind: 'success', text: isDemo ? 'Perfil guardado en este dispositivo.' : 'Perfil guardado. Tu nombre y foto aparecerán al abrir MiSer en tus otros dispositivos.' })
    } catch (error) {
      const text = error instanceof Error && !('code' in error) ? error.message : 'No se pudo guardar el perfil. Revisa tu conexión y vuelve a intentarlo.'
      setProfileMessage({ kind: 'error', text })
    } finally { setSaving(false) }
  }
  const changePassword = async () => {
    if (passwordBusy) return
    setPasswordBusy(true)
    setPasswordMessage(null)
    try { await onPasswordChange(); setPasswordMessage({ kind: 'success', text: 'Enlace enviado a tu correo. Revisa también la carpeta de spam.' }) }
    catch { setPasswordMessage({ kind: 'error', text: 'No se pudo enviar el enlace. Revisa tu conexión y vuelve a intentarlo.' }) }
    finally { setPasswordBusy(false) }
  }

  return <div className="page-wrap settings-page">
    <div className="page-heading"><div><h1>Ajustes</h1><p>Tu perfil, tu cuenta y un espacio a tu manera.</p></div></div>
    <div className="settings-layout settings-profile-layout">
      <section className="panel profile-editor" aria-labelledby="profile-heading">
        <div className="settings-card-heading"><UserRound size={19} /><div><h2 id="profile-heading">Tu perfil</h2><p>Así te verás dentro de MiSer.</p></div></div>
        <form onSubmit={event => void submitProfile(event)}>
          <div className="profile-photo-editor">
            <ProfileAvatar profile={draft} className="profile-photo" />
            <div className="profile-photo-copy"><div className="profile-photo-actions">
              <button className="btn btn-soft" type="button" disabled={saving || imageBusy} onClick={() => imageInput.current?.click()}><ImagePlus size={16} />{imageBusy ? 'Preparando foto…' : draft.photoURL ? 'Cambiar foto' : 'Añadir foto'}</button>
              {draft.photoURL && <button className="btn btn-quiet" type="button" disabled={saving || imageBusy} onClick={() => { setDraft(current => ({ ...current, photoURL: '' })); setProfileMessage(null) }}>Quitar foto</button>}
            </div><p>JPG, PNG, WebP o AVIF · hasta 10 MB. La foto se recorta al centro y se reduce automáticamente.</p></div>
            <input ref={imageInput} className="profile-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-label="Seleccionar foto de perfil" disabled={saving || imageBusy} onChange={event => { void uploadPhoto(event.target.files?.[0]); event.target.value = '' }} />
          </div>
          <label className="profile-name-field" htmlFor="profile-display-name">Nombre de usuario
            <input id="profile-display-name" type="text" autoComplete="nickname" required minLength={2} maxLength={50} value={draft.displayName} disabled={saving} onChange={event => { setDraft(current => ({ ...current, displayName: event.target.value })); setProfileMessage(null) }} aria-describedby="profile-name-help" />
          </label>
          <p id="profile-name-help" className="profile-help">Se mostrará en lugar de tu correo. Es un nombre visible, no cambia tu forma de iniciar sesión.</p>
          {profileMessage && <p className={`inline-message ${profileMessage.kind === 'success' ? 'inline-message-success' : ''}`} role={profileMessage.kind === 'error' ? 'alert' : 'status'}>{profileMessage.text}</p>}
          <div className="profile-save-actions"><button className="btn btn-primary" disabled={saving || imageBusy || !dirty}>{saving ? 'Guardando…' : 'Guardar perfil'}<Check size={16} /></button>
            {dirty && <button className="btn btn-quiet" type="button" disabled={saving || imageBusy} onClick={() => { setDraft(profile); setProfileMessage(null) }}>Descartar cambios</button>}
          </div>
        </form>
      </section>
      <aside className="setup-card settings-account" aria-labelledby="account-heading">
        <div className="settings-card-heading"><ShieldCheck size={19} /><h2 id="account-heading">Tu cuenta</h2></div>
        {isDemo ? <><p>Estás en una demostración. El perfil y tus datos se guardan solo en este navegador.</p><span className="connection-badge connection-demo">Solo en este dispositivo</span></> : <>
          <span className="account-email-label">Correo de acceso</span><p className="account-email">{email}</p>
          <span className="connection-badge"><CheckCircle2 size={14} />Correo verificado</span>
          <p>El correo solo aparece aquí. Tu perfil no es público y no cambia el nombre de tu cuenta de Google.</p>
          <div className="account-security"><h3>Seguridad</h3><p>{passwordAccount ? 'Recibe un enlace para cambiar tu contraseña de forma segura.' : 'Inicias sesión con Google. Administra tu contraseña desde tu cuenta de Google.'}</p>
            {passwordAccount && <button className="btn btn-soft" type="button" disabled={passwordBusy} onClick={() => void changePassword()}>{passwordBusy ? 'Enviando…' : 'Enviar enlace de cambio'}</button>}
            {passwordMessage && <p className={`inline-message ${passwordMessage.kind === 'success' ? 'inline-message-success' : ''}`} role={passwordMessage.kind === 'error' ? 'alert' : 'status'}>{passwordMessage.text}</p>}
          </div>
        </>}
      </aside>
    </div>
    <section className="panel settings-panel settings-preferences" aria-labelledby="preferences-heading">
      <h2 id="preferences-heading" className="settings-group-heading">Preferencias de este dispositivo</h2>
      <div className="settings-section"><div className="settings-section-icon">{darkMode ? <Moon size={18} /> : <Sun size={18} />}</div><div className="settings-copy"><h3>Modo oscuro</h3><p>Un aspecto más cómodo para ambientes con poca luz.</p></div><button className={`theme-toggle ${darkMode ? 'theme-toggle-on' : ''}`} type="button" role="switch" aria-checked={darkMode} aria-label="Modo oscuro" onClick={() => onDarkModeChange(!darkMode)}><span /></button></div>
      <div className="settings-section"><div className="settings-section-icon"><LayoutDashboard size={18} /></div><div className="settings-copy"><h3><label htmlFor="settings-start-page">Pantalla de inicio</label></h3><p>Elige qué ver al volver a abrir MiSer.</p></div><select id="settings-start-page" className="settings-select" value={preferences.startPage} onChange={event => onPreferencesChange({ ...preferences, startPage: parsePreferences({ startPage: event.target.value }).startPage })}><option value="overview">Resumen</option><option value="activity">Movimientos</option><option value="calendar">Calendario</option><option value="goals">Objetivos</option><option value="shopping">Compras</option></select></div>
      <div className="settings-section"><div className="settings-section-icon"><Eye size={18} /></div><div className="settings-copy"><h3>Movimiento reducido</h3><p>Reduce las animaciones. También respetamos la preferencia de tu sistema.</p></div><button className={`theme-toggle ${preferences.reducedMotion ? 'theme-toggle-on' : ''}`} type="button" role="switch" aria-checked={preferences.reducedMotion} aria-label="Movimiento reducido" onClick={() => onPreferencesChange({ ...preferences, reducedMotion: !preferences.reducedMotion })}><span /></button></div>
    </section>
    <AndroidUpdateSettings />
    {!isDemo && <DeviceSecuritySettings onClearLocal={onClearLocal} />}
    <section className="panel settings-panel settings-data" aria-labelledby="data-settings-heading">
      <h2 id="data-settings-heading" className="settings-group-heading">Tus finanzas y tus datos</h2>
      <div className="settings-section"><div className="settings-section-icon"><Wallet size={18} /></div><div className="settings-copy"><h3>Presupuesto mensual</h3><p>Configura tu límite general y los límites de cada categoría.</p></div><button className="btn btn-soft" onClick={onBudget}>Editar presupuesto</button></div>
      <div className="settings-section"><div className="settings-section-icon"><Heart size={18} /></div><div className="settings-copy"><h3>Moneda principal</h3><p>Los importes se registran en dólares estadounidenses.</p></div><span className="setting-value">USD · $</span></div>
      <div className="settings-section"><div className="settings-section-icon"><Download size={18} /></div><div className="settings-copy"><h3>Copia de tus datos</h3><p>Descarga tus movimientos, objetivos, eventos, listas y presupuestos en un archivo JSON. No incluye el perfil.</p>{syncMessage && <p className="sync-message" role="alert">{syncMessage}</p>}</div><div className="storage-actions"><span className={`connection-badge ${isDemo ? 'connection-demo' : ''} ${syncStatus === 'error' ? 'connection-error' : ''}`} role="status"><i />{statusLabel}</span><button className="btn btn-soft" onClick={onExport}><Download size={15} />Exportar JSON</button>{syncStatus === 'error' && <button className="btn btn-primary" onClick={onRetry}>Reintentar</button>}</div></div>
      <div className="settings-section"><div className="settings-section-icon"><LogOut size={18} /></div><div className="settings-copy"><h3>{isDemo ? 'Demostración' : 'Sesión'}</h3><p>{isDemo ? 'Vuelve al acceso sin borrar tus datos de muestra.' : 'Cierra sesión únicamente en este dispositivo.'}</p></div><button className="btn btn-soft" onClick={isDemo ? onExitDemo : onLogout}>{isDemo ? 'Salir del demo' : 'Cerrar sesión'}</button></div>
    </section>
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
     if (event.key === 'Escape') { event.preventDefault(); requestClose(); return }
     if (event.key !== 'Tab' || !dialogRef.current) return
     const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]')].filter(element => element.getClientRects().length)
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
  const draft = JSON.stringify([title, type, amount, category, date, note, time, location, eventCategory, kind, remind, store, description, quantity, imageUrl, purchaseLinksText, limitsText])
  const [initialDraft] = useState(draft)
  const [discardPrompt, setDiscardPrompt] = useState(false)
  const dirty = draft !== initialDraft
  const requestClose = useCallback(() => {
    if (imageBusy) { setFormError('Espera a que termine de prepararse la imagen.'); return }
    if (discardPrompt) { setDiscardPrompt(false); return }
    if (dirty) setDiscardPrompt(true)
    else onClose()
  }, [dirty, imageBusy, discardPrompt, onClose, setFormError, setDiscardPrompt])
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>(discardPrompt ? '[data-keep-editing]' : 'form input, form textarea, form select')?.focus()
  }, [discardPrompt])
  useEffect(() => {
    const close = () => requestClose()
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('miser-close-modal', close)
    window.addEventListener('beforeunload', warn)
    return () => { window.removeEventListener('miser-close-modal', close); window.removeEventListener('beforeunload', warn) }
  }, [dirty, requestClose])
  const heading = modal.kind === 'transaction' ? editing ? 'Editar movimiento' : 'Nuevo movimiento' : modal.kind === 'event' ? editing ? 'Editar en el calendario' : 'Añadir al calendario' : modal.kind === 'goal' ? editing ? 'Editar objetivo' : 'Nuevo objetivo' : modal.kind === 'list' ? editing ? 'Editar lista' : 'Nueva lista' : modal.kind === 'shoppingItem' ? editing ? 'Editar artículo' : 'Nuevo artículo' : 'Presupuesto mensual'
  const uploadImage = async (file?: File) => {
    if (!file) return
    setImageBusy(true); setFormError('')
    try { setImageUrl(await compressImage(file)) }
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
      if (imageUrl && !shoppingImageSrc(imageUrl) && !mediaId(imageUrl)) { setFormError('El enlace de la imagen debe comenzar con https://.'); return }
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
   return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose() }}><section ref={dialogRef} className="edit-modal" role={discardPrompt ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="modal-title" onKeyDown={onDialogKeyDown}><div className="modal-heading"><div><h2 id="modal-title">{discardPrompt ? 'Cambios sin guardar' : heading}</h2></div><button className="icon-button pale-icon" onClick={requestClose} aria-label="Cerrar"><X size={18} /></button></div>{discardPrompt && <div className="discard-confirmation"><p>Si cierras ahora, perderás lo que escribiste en este formulario.</p><div className="modal-actions"><button type="button" className="btn btn-soft" data-keep-editing onClick={() => setDiscardPrompt(false)}>Seguir editando</button><button type="button" className="btn btn-quiet" onClick={onClose}>Descartar cambios</button></div></div>}<form hidden={discardPrompt} className="stack-form modal-form" onSubmit={submit}>
    {modal.kind === 'transaction' && <><div className="segmented-control"><button type="button" className={type === 'expense' ? 'selected' : ''} onClick={() => setType('expense')}><ArrowUpRight size={15} /> Gasto</button><button type="button" className={type === 'income' ? 'selected income-selected' : ''} onClick={() => setType('income')}><ArrowDownLeft size={15} /> Ingreso</button></div><label>¿En qué fue?<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Supermercado" /></label><div className="form-row"><label>Monto (USD)<input type="number" step="0.01" min="0.01" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label><label>Categoría<select value={category} onChange={e => setCategory(e.target.value)}>{['Comida', 'Hogar', 'Transporte', 'Salud', 'Educación', 'Ocio', 'Trabajo', 'Extra', 'Ahorro', 'Otro'].map(value => <option key={value}>{value}</option>)}</select></label></div><label>Fecha<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label><label>Nota <span className="optional">· opcional</span><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Un detalle para recordar…" rows={2} /></label></>}
    {modal.kind === 'event' && <><div className="segmented-control"><button type="button" className={kind === 'event' ? 'selected' : ''} onClick={() => setKind('event')}><CalendarDays size={15} /> Evento</button><button type="button" className={kind === 'payment' ? 'selected selected-payment' : ''} onClick={() => setKind('payment')}><CreditCard size={15} /> Pago</button></div><label>Nombre<input required value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === 'payment' ? 'Ej. Pago de luz' : 'Ej. Cita médica'} /></label>{kind === 'payment' && <label>Monto (USD)<input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>}<div className="form-row"><label>Fecha<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label><label>Hora<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label></div><div className="form-row"><label>Categoría<select value={eventCategory} onChange={e => setEventCategory(e.target.value as 'personal' | 'work' | 'health')}><option value="personal">Personal</option><option value="work">Trabajo</option><option value="health">Salud</option></select></label><label>Lugar<input value={location} onChange={e => setLocation(e.target.value)} placeholder="Opcional" /></label></div><label>Nota <span className="optional">· opcional</span><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Añade un detalle…" rows={2} /></label><label className="check-setting"><input type="checkbox" checked={remind} onChange={e => setRemind(e.target.checked)} /><span><strong>Mostrar en recordatorios</strong><small>Se señalará en la campana de MiSer. No envía alertas al teléfono.</small></span></label></>}
    {modal.kind === 'goal' && <label>Tu objetivo<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Mejorar mi físico" /></label>}
    {modal.kind === 'list' && <><label>Nombre de la lista<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Compra de la semana" /></label><label>Tienda o categoría <span className="optional">· opcional</span><input value={store} onChange={e => setStore(e.target.value)} placeholder="Ej. Supermercado" /></label>{editing && <p className="modal-help">Los artículos de esta lista se conservan al editarla.</p>}</>}
    {modal.kind === 'shoppingItem' && <>
      <label>Nombre del artículo<input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Teclado mecánico" /></label>
      <label>Descripción y detalles <span className="optional">· opcional</span><textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Modelo, color, características o por qué te interesa…" /></label>
      <div className="form-row"><label>Cantidad <span className="optional">· opcional</span><input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Ej. 1 unidad" /></label><label>Precio estimado (USD) <span className="optional">· opcional</span><input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label></div>
      <div className="shopping-image-field"><span><ImagePlus size={16} /> Imagen de referencia</span>{(shoppingImageSrc(imageUrl) || mediaId(imageUrl)) && <div className="shopping-image-preview"><FinanceImage source={imageUrl} alt="Vista previa del artículo" size={128} /><button type="button" onClick={() => setImageUrl('')}>Quitar imagen</button></div>}<label>Subir imagen desde el dispositivo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={imageBusy} onChange={e => { void uploadImage(e.target.files?.[0]); e.target.value = '' }} /></label><label>O pegar enlace de imagen<input type="url" value={imageUrl.startsWith('data:') || mediaId(imageUrl) ? '' : imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://tienda.com/imagen.jpg" /></label><small>Las imágenes subidas se reducen y se cargan solo cuando las necesitas.</small></div>
      <label>Enlaces de compra <span className="optional">· opcional</span><textarea rows={3} value={purchaseLinksText} onChange={e => setPurchaseLinksText(e.target.value)} placeholder={'https://tienda.com/producto\nhttps://otra-tienda.com/producto'} /></label><p className="modal-help">Pega un enlace por línea. Podrás abrirlos desde la lista cuando quieras comparar opciones.</p>
    </>}
    {modal.kind === 'budget' && <><label>Límite total del mes (USD)<input type="number" min="0" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></label><label>Límites por categoría <span className="optional">· separados por coma</span><textarea rows={3} value={limitsText} onChange={e => setLimitsText(e.target.value)} placeholder="Comida: 350, Hogar: 600" /></label><p className="modal-help">Escribe cada categoría como <strong>Nombre: monto</strong>. Se guardará para el mes actual.</p></>}
    {formError && <p className="shopping-form-error" role="alert">{formError}</p>}
    <div className="modal-actions"><button type="button" className="btn btn-quiet" onClick={requestClose}>Cancelar</button><button className="btn btn-primary" disabled={imageBusy}>{imageBusy ? 'Preparando imagen…' : editing ? 'Guardar cambios' : modal.kind === 'budget' ? 'Guardar presupuesto' : 'Guardar'} <Check size={15} /></button></div>
  </form></section></div>
}

export default function MiSerApp() {
  return <DeviceSecurityGate><AndroidUpdatesProvider><App /></AndroidUpdatesProvider></DeviceSecurityGate>
}
