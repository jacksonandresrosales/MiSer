import type { FinanceRecord } from './financeData.ts'
import { profilePhotoSrc } from './userProfile.ts'

export const mediaId = (value: unknown): string | null => typeof value === 'string' && /^miser-media:[a-f0-9]{64}$/.test(value) ? value.slice(12) : null

/** Immutable, content-addressed photos keep toggles and delta reads small. */
export async function separateRecordImage(record: FinanceRecord | null): Promise<{ record: FinanceRecord | null; media: { id: string; imageUrl: string } | null }> {
  const image = record?.kind === 'item' ? record.value.imageUrl : null
  if (typeof image !== 'string' || !image.startsWith('data:')) return { record, media: null }
  if (!profilePhotoSrc(image)) throw new Error('invalid-data')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(image))
  const id = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return { record: { ...record!, value: { ...record!.value, imageUrl: `miser-media:${id}` } }, media: { id, imageUrl: image } }
}
