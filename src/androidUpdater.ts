import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type UpdateStatus = {
  currentVersionCode: number
  currentVersionName: string
  available: boolean
  update?: { versionCode: number; versionName: string; size: number }
  notificationsEnabled: boolean
  backgroundEnabled: boolean
}

export const androidUpdatesSupported = () => Capacitor.getPlatform() === 'android'

export const AndroidUpdater = registerPlugin<{
  getStatus(): Promise<UpdateStatus>
  check(): Promise<UpdateStatus>
  install(): Promise<{ status: 'permission-required' | 'installer-opened' | 'up-to-date' }>
  configure(options: { enabled: boolean }): Promise<{ backgroundEnabled: boolean; notificationsEnabled: boolean }>
  openNotificationSettings(): Promise<void>
  addListener(eventName: 'updateRequested', listener: () => void): Promise<PluginListenerHandle>
}>('MiSerUpdater')

export function updateErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  switch (code) {
    case 'CHANNEL_UNAVAILABLE': return 'Todavía no hay una versión publicada en el canal. Puedes volver a comprobar más tarde.'
    case 'INVALID_UPDATE':
    case 'VERIFY_FAILED': return 'No se pudo verificar esta actualización. No se instaló ningún archivo. Vuelve a comprobar más tarde.'
    case 'INSTALL_FAILED': return 'Android no pudo abrir el instalador. Revisa el permiso para instalar aplicaciones de MiSer e inténtalo de nuevo.'
    case 'BUSY': return 'Ya hay una actualización en curso. Espera a que termine.'
    case 'CONFIGURE_FAILED': return 'No se pudo cambiar la preferencia de avisos. Vuelve a intentarlo desde Ajustes.'
    case 'SETTINGS_FAILED': return 'No se pudieron abrir los permisos. Ve a Ajustes de Android → Aplicaciones → MiSer → Notificaciones.'
    default: return 'No se pudo comprobar o descargar la actualización. Revisa tu conexión y vuelve a intentarlo. Tus datos no han cambiado.'
  }
}
