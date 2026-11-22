import { useEffect, useState } from 'react'
import { reload, sendEmailVerification } from 'firebase/auth'
import { firebaseAuth } from '../firebase'
import { BrandMark } from '../components/common'

export function VerifyEmailScreen({ email, onVerified, onLogout }: { email: string; onVerified: () => void; onLogout: () => void }) {
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
  // Check on our own every few seconds while the screen is visible, so the person does not need to tap.
  useEffect(() => {
    const timer = window.setInterval(async () => {
      const user = firebaseAuth?.currentUser
      if (!user || document.hidden) return
      try { await reload(user); if (user.emailVerified) { window.clearInterval(timer); await user.getIdToken(true); onVerified() } }
      catch { /* The manual button still reports errors. */ }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [onVerified])
  return <main className="load-error-screen"><div className="load-error-card"><BrandMark /><h1>Confirma tu correo</h1><p>Abre el enlace enviado a {email} para proteger tu espacio. Esta pantalla se actualizará sola cuando lo confirmes.</p>{message && <p role="status">{message}</p>}<div className="load-error-actions"><button className="btn btn-primary" disabled={busy} onClick={() => void verify()}>Ya confirmé mi correo</button><button className="btn btn-soft" disabled={busy} onClick={() => void resend()}>Reenviar enlace</button><button className="btn btn-quiet" disabled={busy} onClick={onLogout}>Cerrar sesión</button></div></div></main>
}
