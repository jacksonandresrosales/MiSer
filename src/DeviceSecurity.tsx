import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'
import { LockKeyhole, ShieldCheck } from 'lucide-react'
import { MiSerSecurity, type LockStatus } from './privateStorage'
import './DeviceSecurity.css'

const SecurityContext = createContext<{ status: LockStatus | null; configure: (enabled: boolean) => Promise<void> }>({ status: null, configure: async () => {} })

export function DeviceSecurityGate({ children }: { children: ReactNode }) {
  const native = Capacitor.getPlatform() === 'android'
  const [status, setStatus] = useState<LockStatus | null>(null)
  const [visible, setVisible] = useState(!native)
  const [opened, setOpened] = useState(!native)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const active = useRef(true)
  useEffect(() => {
    if (!native) return
    let alive = true
    const refresh = async () => {
      try {
        const next = await MiSerSecurity.getLockStatus()
        if (!alive || !active.current) return
        setStatus(next); setVisible(next.unlocked)
        if (next.unlocked) setOpened(true)
      } catch { if (alive) setMessage('No se pudo comprobar la protección local. Inténtalo de nuevo.') }
    }
    void refresh()
    const listener = NativeApp.addListener('appStateChange', ({ isActive }) => {
      active.current = isActive
      if (!isActive) setVisible(false)
      else void refresh()
    })
    return () => { alive = false; void listener.then(handle => handle.remove()) }
  }, [native])
  const unlock = async () => {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const current = await MiSerSecurity.getLockStatus()
      const next = current.enabled && !current.unlocked ? await MiSerSecurity.authenticate() : current
      setStatus(next); setVisible(next.unlocked); if (next.unlocked) setOpened(true)
    } catch { setMessage('No se completó el desbloqueo. Vuelve a intentarlo con tu huella o PIN.') }
    finally { setBusy(false) }
  }
  const configure = async (enabled: boolean) => { const next = await MiSerSecurity.configureLock({ enabled }); setStatus(next) }
  return <SecurityContext.Provider value={{ status, configure }}>
    {opened && <div hidden={!visible}>{children}</div>}
    {!visible && <main className="device-lock-screen"><section className="device-lock-content" aria-labelledby="device-lock-title">
      <LockKeyhole size={36} aria-hidden="true" /><h1 id="device-lock-title">Tu espacio está protegido</h1><p>Desbloquea MiSer para ver tus finanzas.</p>
      <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void unlock()}>{busy ? 'Comprobando…' : 'Desbloquear MiSer'}</button>
      {message && <p role="alert">{message}</p>}
    </section></main>}
  </SecurityContext.Provider>
}

export function DeviceSecuritySettings({ onClearLocal }: { onClearLocal: () => Promise<void> }) {
  const { status, configure } = useContext(SecurityContext)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  if (!status) return null
  const toggle = async () => {
    setBusy(true); setMessage('')
    try { await configure(!status.enabled) }
    catch { setMessage('No se cambió el bloqueo. Verifica tu huella o PIN e inténtalo otra vez.') }
    finally { setBusy(false) }
  }
  const clear = async () => {
    setBusy(true); setMessage('')
    try { await onClearLocal() }
    catch (error) { setMessage(error instanceof Error && !('code' in error) ? error.message : 'No se pudo borrar la copia local.') }
    finally { setBusy(false) }
  }
  return <section className="panel settings-panel" aria-labelledby="device-security-heading">
    <h2 id="device-security-heading" className="settings-group-heading">Privacidad en este teléfono</h2>
    <div className="settings-section"><div className="settings-section-icon"><LockKeyhole size={18} /></div><div className="settings-copy"><h3>Bloqueo con huella o PIN</h3><p>Al abrir MiSer o volver tras un minuto fuera. Mientras esté activo, se oculta en recientes y se bloquean las capturas.</p>{!status.available && <p>Configura una huella o bloqueo de pantalla en Android.</p>}</div><button className={`theme-toggle ${status.enabled ? 'theme-toggle-on' : ''}`} type="button" role="switch" aria-checked={status.enabled} aria-label="Bloqueo con huella o PIN" disabled={busy || !status.available} onClick={() => void toggle()}><span /></button></div>
    <div className="settings-section"><div className="settings-section-icon"><ShieldCheck size={18} /></div><div className="settings-copy"><h3>Recuperación cifrada</h3><p>La copia financiera y los cambios pendientes usan AES-GCM con una clave de Android Keystore. No se incluyen en backups del sistema. Las sesiones las administra Firebase.</p></div></div>
    <div className="settings-section settings-section-no-icon"><div className="settings-copy"><h3>Borrar copia local</h3><p>Elimina la copia sincronizada y cierra sesión. No borra Firebase ni permite eliminar cambios pendientes.</p></div><button className="btn btn-soft" type="button" disabled={busy} onClick={() => void clear()}>Borrar copia y salir</button></div>
    {message && <p className="inline-message" role="alert">{message}</p>}
  </section>
}
