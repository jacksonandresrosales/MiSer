import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { Download, RefreshCw, X } from 'lucide-react'
import { AndroidUpdater, androidUpdatesSupported, updateErrorMessage, type UpdateStatus } from './androidUpdater'
import './AndroidUpdates.css'

type Updates = {
  status: UpdateStatus | null
  busy: 'checking' | 'downloading' | 'configuring' | null
  message: string
  error: boolean
  check: (manual?: boolean) => Promise<void>
  install: () => Promise<void>
  configure: () => Promise<void>
  openPermissions: () => Promise<void>
}
const UpdateContext = createContext<Updates | null>(null)

export function AndroidUpdatesProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState<Updates['busy']>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [noticeRequest, setNoticeRequest] = useState(0)
  const locked = useRef(false)
  const mounted = useRef(false)
  const supported = androidUpdatesSupported()
  const reportError = (failure: unknown) => { if (mounted.current) { setMessage(updateErrorMessage(failure)); setError(true) } }
  const check = useCallback(async (manual = false) => {
    if (!supported || locked.current) return
    locked.current = true
    if (manual) setBusy('checking')
    if (manual) { setMessage(''); setError(false) }
    try {
      const local = await AndroidUpdater.getStatus()
      if (mounted.current) {
        setStatus(current => current?.currentVersionCode === local.currentVersionCode
          ? { ...current, notificationsEnabled: local.notificationsEnabled, backgroundEnabled: local.backgroundEnabled }
          : local)
        setBusy('checking')
      }
      const next = await AndroidUpdater.check()
      if (mounted.current) {
        setStatus(next)
        if (manual) { setMessage(next.available ? 'Hay una versión nueva lista para descargar.' : 'Tienes la versión más reciente publicada.'); setError(false) }
      }
    } catch (failure) { if (manual) reportError(failure) }
    finally { locked.current = false; if (mounted.current) setBusy(null) }
  }, [supported])

  useEffect(() => {
    mounted.current = true
    if (!supported) return () => { mounted.current = false }
    void check()
    const listener = NativeApp.addListener('appStateChange', ({ isActive }) => { if (isActive) void check() })
    const notification = AndroidUpdater.addListener('updateRequested', () => {
      setNoticeRequest(value => value + 1)
      void check()
    })
    return () => {
      mounted.current = false
      void listener.then(handle => handle.remove())
      void notification.then(handle => handle.remove())
    }
  }, [check, supported])

  const install = async () => {
    if (locked.current) return
    locked.current = true
    setBusy('downloading'); setMessage('Descargando y verificando el APK. Mantén MiSer abierta hasta que aparezca el instalador.'); setError(false)
    try {
      const result = await AndroidUpdater.install()
      if (mounted.current) setMessage(result.status === 'permission-required'
        ? 'Activa «Permitir de esta fuente» para MiSer, vuelve a la app y pulsa Descargar e instalar otra vez.'
        : result.status === 'up-to-date' ? 'Tienes la versión más reciente publicada.'
        : 'Confirma la actualización en el instalador de Android. Si la cancelas, puedes volver a intentarlo aquí.')
    } catch (failure) { reportError(failure) }
    finally { locked.current = false; if (mounted.current) setBusy(null) }
  }
  const configure = async () => {
    if (locked.current || !status) return
    locked.current = true
    setBusy('configuring'); setMessage(''); setError(false)
    try {
      const next = await AndroidUpdater.configure({ enabled: !status.backgroundEnabled })
      if (mounted.current) {
        setStatus(current => current ? { ...current, ...next } : current)
        setMessage(!next.backgroundEnabled ? 'Avisos en segundo plano desactivados. Seguiremos comprobando al abrir MiSer.'
          : next.notificationsEnabled ? 'Avisos activados. MiSer comprobará las versiones periódicamente cuando haya conexión.'
          : 'Los avisos están programados, pero Android bloquea las notificaciones. Puedes permitirlas en los ajustes del teléfono.')
      }
    } catch (failure) { reportError(failure) }
    finally { locked.current = false; if (mounted.current) setBusy(null) }
  }
  const openPermissions = async () => {
    try { await AndroidUpdater.openNotificationSettings() } catch (failure) { reportError(failure) }
  }
  return <UpdateContext value={supported ? { status, busy, message, error, check, install, configure, openPermissions } : null}>
    <UpdateNotice key={noticeRequest} />{children}
  </UpdateContext>
}

function UpdateNotice() {
  const updates = useContext(UpdateContext)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const update = updates?.status?.update
  if (!updates?.status?.available || !update || dismissed === update.versionCode) return null
  return <section className="android-update-notice" aria-label="Actualización de MiSer">
    <div><strong>MiSer {update.versionName} disponible</strong><p>Actualiza sin desinstalar. Android te pedirá confirmar.</p>
      {updates.message && <p role={updates.error ? 'alert' : 'status'}>{updates.message}</p>}
    </div>
    <button className="btn btn-primary" type="button" disabled={!!updates.busy} onClick={() => void updates.install()}><Download size={16} aria-hidden="true" />{updates.busy === 'downloading' ? 'Descargando…' : 'Descargar e instalar'}</button>
    <button className="icon-button" type="button" disabled={updates.busy === 'downloading'} aria-label="Recordarme después" onClick={() => setDismissed(update.versionCode)}><X size={18} /></button>
  </section>
}

export function AndroidUpdateSettings() {
  const updates = useContext(UpdateContext)
  if (!updates) return null
  const { status, busy, message, error } = updates
  return <section className="panel settings-panel android-update-settings" aria-labelledby="android-update-heading">
    <h2 id="android-update-heading" className="settings-group-heading">Actualizaciones de MiSer</h2>
    <p>{status ? `Versión instalada: ${status.currentVersionName} · compilación ${status.currentVersionCode}` : 'Comprueba la versión instalada y las actualizaciones publicadas.'}</p>
    <p>Al abrir la app buscamos versiones nuevas. Los avisos en segundo plano comprueban cada 6 horas con conexión; Android puede retrasarlos para ahorrar batería. No se descarga nada sin que lo pidas.</p>
    {status?.available && status.update && <p><strong>Nueva versión: {status.update.versionName}</strong> · {(status.update.size / 1024 / 1024).toFixed(1)} MB</p>}
    <div className="android-update-actions">
      <button className="btn btn-soft" type="button" disabled={!!busy} onClick={() => void updates.check(true)}><RefreshCw size={16} aria-hidden="true" />{busy === 'checking' ? 'Comprobando…' : 'Buscar actualización'}</button>
      {status?.available && <button className="btn btn-primary" type="button" disabled={!!busy} onClick={() => void updates.install()}><Download size={16} aria-hidden="true" />{busy === 'downloading' ? 'Descargando…' : 'Descargar e instalar'}</button>}
    </div>
    {status && <div className="settings-section"><div className="settings-copy"><h3>Avisarme de nuevas versiones</h3><p>Notificaciones del teléfono. Puedes desactivarlas cuando quieras.</p></div><button className={`theme-toggle ${status.backgroundEnabled ? 'theme-toggle-on' : ''}`} type="button" role="switch" aria-checked={status.backgroundEnabled} disabled={!!busy} aria-label="Avisarme de nuevas versiones" onClick={() => void updates.configure()}><span /></button></div>}
    {status?.backgroundEnabled && !status.notificationsEnabled && <div><p>Android no permite mostrar los avisos de MiSer.</p><button className="btn btn-soft" type="button" disabled={!!busy} onClick={() => void updates.openPermissions()}>Permitir notificaciones</button></div>}
    {message && <p className={`inline-message ${!error ? 'inline-message-success' : ''}`} role={error ? 'alert' : 'status'}>{message}</p>}
    <p>La actualización conserva tus datos y comprueba la firma del APK. No desinstales la app para actualizar.</p>
  </section>
}
