import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Check, CheckCircle2, Download, Eye, ImagePlus, LayoutDashboard, LogOut, Moon, ShieldCheck, Wallet } from 'lucide-react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { firebaseAuth } from '../firebase'
import { parsePreferences, validateProfile, type Preferences, type UserProfile } from '../userProfile'
import { compressImage } from '../lib/image'
import { PageHeading, ProfileAvatar } from '../components/common'
import { AndroidUpdateSettings } from '../AndroidUpdates'
import { DeviceSecuritySettings } from '../DeviceSecurity'
import type { SyncStatus } from '../appTypes'

type Props = {
  isDemo: boolean; email: string; profile: UserProfile; onSaveProfile: (draft: UserProfile) => Promise<UserProfile>
  preferences: Preferences; onPreferencesChange: (next: Preferences) => void; passwordAccount: boolean
  syncStatus: SyncStatus; syncMessage: string; onRetry: () => void; onExport: () => void
  darkMode: boolean; onDarkModeChange: (enabled: boolean) => void; onBudget: () => void; onLogout: () => void; onExitDemo: () => void
  onClearLocal: () => Promise<void>
}
type Message = { kind: 'error' | 'success'; text: string } | null

function Row({ icon, title, text, children, htmlFor }: { icon: ReactNode; title: string; text: string; children?: ReactNode; htmlFor?: string }) {
  return <div className="setting-row"><span className="setting-icon" aria-hidden="true">{icon}</span><div className="setting-copy"><h3>{htmlFor ? <label htmlFor={htmlFor}>{title}</label> : title}</h3><p>{text}</p></div>{children && <div className="setting-control">{children}</div>}</div>
}
const InlineMessage = ({ message }: { message: Message }) => message && <p className={`inline-message ${message.kind === 'success' ? 'is-success' : 'is-error'}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>

export default function SettingsPage({ isDemo, email, profile, onSaveProfile, preferences, onPreferencesChange, passwordAccount, syncStatus, syncMessage, onRetry, onExport, darkMode, onDarkModeChange, onBudget, onLogout, onExitDemo, onClearLocal }: Props) {
  const [draft, setDraft] = useState(profile)
  const [saving, setSaving] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState<Message>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<Message>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const dirty = draft.displayName !== profile.displayName || draft.photoURL !== profile.photoURL
  const statusLabel = isDemo ? 'Solo en este dispositivo' : syncStatus === 'saved' ? 'Sincronizado' : syncStatus === 'saving' ? 'Guardando…' : syncStatus === 'pending' ? 'Pendiente' : 'Sin guardar'

  const uploadPhoto = async (file?: File) => {
    if (!file) return
    setImageBusy(true); setProfileMessage(null)
    try { const photoURL = await compressImage(file, true); setDraft(current => ({ ...current, photoURL })) }
    catch (error) { setProfileMessage({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo preparar la foto. Prueba con otra imagen.' }) }
    finally { setImageBusy(false) }
  }
  const submitProfile = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || imageBusy) return
    setSaving(true); setProfileMessage(null)
    try {
      const next = await onSaveProfile(validateProfile(draft))
      setDraft(next)
      setProfileMessage({ kind: 'success', text: isDemo ? 'Perfil guardado en este dispositivo.' : 'Perfil guardado. Lo verás también en tus otros dispositivos.' })
    } catch (error) {
      setProfileMessage({ kind: 'error', text: error instanceof Error && !('code' in error) ? error.message : 'No se pudo guardar el perfil. Revisa tu conexión y vuelve a intentarlo.' })
    } finally { setSaving(false) }
  }
  const changePassword = async () => {
    if (passwordBusy || !firebaseAuth || !email) return
    setPasswordBusy(true); setPasswordMessage(null)
    try { await sendPasswordResetEmail(firebaseAuth, email); setPasswordMessage({ kind: 'success', text: 'Te enviamos un enlace. Revisa también la carpeta de spam.' }) }
    catch { setPasswordMessage({ kind: 'error', text: 'No se pudo enviar el enlace. Revisa tu conexión y vuelve a intentarlo.' }) }
    finally { setPasswordBusy(false) }
  }

  return <div className="page-wrap settings-page">
    <PageHeading title="Ajustes" subtitle="Tu perfil, tu cuenta y tu forma de usar MiSer." />

    <section className="card settings-group" aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="group-title">Perfil</h2>
      <form onSubmit={event => void submitProfile(event)} className="form profile-form">
        <div className="profile-photo-row">
          <ProfileAvatar profile={draft} className="avatar avatar-large" />
          <div className="profile-photo-actions">
            <button className="btn btn-secondary" type="button" disabled={saving || imageBusy} onClick={() => imageInput.current?.click()}><ImagePlus size={18} aria-hidden="true" />{imageBusy ? 'Preparando…' : draft.photoURL ? 'Cambiar foto' : 'Añadir foto'}</button>
            {draft.photoURL && <button className="btn btn-ghost" type="button" disabled={saving || imageBusy} onClick={() => { setDraft(current => ({ ...current, photoURL: '' })); setProfileMessage(null) }}>Quitar</button>}
          </div>
          <input ref={imageInput} hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-label="Seleccionar foto de perfil" disabled={saving || imageBusy} onChange={event => { void uploadPhoto(event.target.files?.[0]); event.target.value = '' }} />
        </div>
        <label htmlFor="profile-display-name">Nombre visible<input id="profile-display-name" type="text" autoComplete="nickname" required minLength={2} maxLength={50} value={draft.displayName} disabled={saving} onChange={event => { setDraft(current => ({ ...current, displayName: event.target.value })); setProfileMessage(null) }} aria-describedby="profile-name-help" /></label>
        <p id="profile-name-help" className="form-help">Aparece en el saludo y en el menú. No cambia cómo inicias sesión.</p>
        <InlineMessage message={profileMessage} />
        {(dirty || saving) && <div className="form-actions"><button className="btn btn-primary" disabled={saving || imageBusy || !dirty}>{saving ? 'Guardando…' : 'Guardar perfil'} <Check size={18} aria-hidden="true" /></button><button className="btn btn-ghost" type="button" disabled={saving || imageBusy} onClick={() => { setDraft(profile); setProfileMessage(null) }}>Descartar</button></div>}
      </form>
    </section>

    <section className="card settings-group" aria-labelledby="account-heading">
      <h2 id="account-heading" className="group-title">Cuenta</h2>
      {isDemo ? <Row icon={<ShieldCheck size={20} />} title="Demostración" text="Tus datos de prueba se guardan solo en este navegador."><span className="badge">Solo local</span></Row> : <>
        <Row icon={<ShieldCheck size={20} />} title={email} text="Correo de acceso. Solo lo ves tú."><span className="badge badge-success"><CheckCircle2 size={16} aria-hidden="true" /> Verificado</span></Row>
        <Row icon={<ShieldCheck size={20} />} title="Contraseña" text={passwordAccount ? 'Recibe un enlace para cambiarla de forma segura.' : 'Entras con Google. Tu contraseña se gestiona desde tu cuenta de Google.'}>{passwordAccount && <button className="btn btn-secondary" type="button" disabled={passwordBusy} onClick={() => void changePassword()}>{passwordBusy ? 'Enviando…' : 'Enviar enlace'}</button>}</Row>
        <InlineMessage message={passwordMessage} />
      </>}
    </section>

    <section className="card settings-group" aria-labelledby="preferences-heading">
      <h2 id="preferences-heading" className="group-title">Apariencia y uso</h2>
      <Row icon={<Moon size={20} />} title="Modo oscuro" text="El aspecto principal de MiSer. Desactívalo para usar el tema claro."><input type="checkbox" role="switch" className="switch" aria-label="Modo oscuro" checked={darkMode} onChange={event => onDarkModeChange(event.target.checked)} /></Row>
      <Row icon={<LayoutDashboard size={20} />} title="Pantalla de inicio" text="Qué ver al abrir MiSer." htmlFor="settings-start-page"><select id="settings-start-page" value={preferences.startPage} onChange={event => onPreferencesChange({ ...preferences, startPage: parsePreferences({ startPage: event.target.value }).startPage })}><option value="overview">Resumen</option><option value="activity">Movimientos</option><option value="calendar">Calendario</option><option value="goals">Objetivos</option><option value="shopping">Compras</option></select></Row>
      <Row icon={<Eye size={20} />} title="Movimiento reducido" text="Menos animaciones. También respetamos la preferencia de tu sistema."><input type="checkbox" role="switch" className="switch" aria-label="Movimiento reducido" checked={preferences.reducedMotion} onChange={event => onPreferencesChange({ ...preferences, reducedMotion: event.target.checked })} /></Row>
    </section>

    <section className="card settings-group" aria-labelledby="data-heading">
      <h2 id="data-heading" className="group-title">Finanzas y datos</h2>
      <Row icon={<Wallet size={20} />} title="Presupuesto mensual" text="Tu límite del mes y, si quieres, por categoría. Los importes están en USD."><button className="btn btn-secondary" onClick={onBudget}>Editar</button></Row>
      <Row icon={<Download size={20} />} title="Copia de tus datos" text="Descarga movimientos, objetivos, eventos, listas y presupuestos en un archivo JSON.">
        <span className={`badge ${syncStatus === 'error' && !isDemo ? 'badge-error' : ''}`} role="status">{statusLabel}</span>
        <button className="btn btn-secondary" onClick={onExport}><Download size={18} aria-hidden="true" /> Exportar</button>
        {syncStatus === 'error' && !isDemo && <button className="btn btn-primary" onClick={onRetry}>Reintentar</button>}
      </Row>
      {syncMessage && !isDemo && <p className="inline-message is-error" role="alert">{syncMessage}</p>}
    </section>

    <AndroidUpdateSettings />
    {!isDemo && <DeviceSecuritySettings onClearLocal={onClearLocal} />}

    <section className="card settings-group" aria-labelledby="session-heading">
      <h2 id="session-heading" className="group-title">{isDemo ? 'Demostración' : 'Sesión'}</h2>
      <Row icon={<LogOut size={20} />} title={isDemo ? 'Salir del demo' : 'Cerrar sesión'} text={isDemo ? 'Vuelve al acceso. Tus datos de muestra se conservan.' : 'Cierra la sesión solo en este dispositivo.'}><button className="btn btn-danger" onClick={isDemo ? onExitDemo : onLogout}>{isDemo ? 'Salir' : 'Cerrar sesión'}</button></Row>
    </section>
  </div>
}
