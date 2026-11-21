import { useState, type FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { ArrowRight, Eye, EyeOff, Heart, Sparkles } from 'lucide-react'
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { firebaseAuth } from '../firebase'
import { signInWithGoogleAccount } from '../googleAuth'
import { BrandMark } from '../components/common'

type AuthMode = 'login' | 'register' | 'recover'

export function AuthScreen({ preview = false, onOpenDemo }: { preview?: boolean; onOpenDemo?: () => void }) {
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
