import { profilePhotoSrc } from '../userProfile'

export const webUrl = (value: string) => {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch { return null }
}
export const shoppingImageSrc = (value?: string) => profilePhotoSrc(value ?? '')

/** Reduces a device image to a JPEG data URL small enough for a Firestore document. */
export async function compressImage(file: File, avatar = false): Promise<string> {
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
