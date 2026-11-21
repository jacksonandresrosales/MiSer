import { Capacitor } from '@capacitor/core'
import { isoDate, newId } from './format'

/** Saves a JSON copy. Native plugins load only when someone exports. Returns false when it could not finish. */
export async function exportJson(payload: unknown, prefix = 'miser'): Promise<boolean> {
  const json = JSON.stringify(payload, null, 2)
  if (Capacitor.isNativePlatform()) {
    try {
      const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
      const file = await Filesystem.writeFile({ path: `exports/${prefix}-${isoDate(new Date())}-${newId()}.json`, data: json, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true })
      await Share.share({ title: 'Copia de MiSer', files: [file.uri], dialogTitle: 'Guardar o compartir copia' })
      return true
    } catch { return false }
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${prefix}-${isoDate(new Date())}.json`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
