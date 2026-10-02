export type UserProfile = { displayName: string; photoURL: string }
export type StartPage = 'overview' | 'activity' | 'calendar' | 'goals' | 'shopping'
export type Preferences = { startPage: StartPage; reducedMotion: boolean }

export const defaultPreferences: Preferences = { startPage: 'overview', reducedMotion: false }

export function profilePhotoSrc(value: string): string | null {
  if (!value) return null
  if (value.length <= 140_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value
  if (value.length > 2048) return null
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null }
  catch { return null }
}

export function validateProfile(profile: UserProfile): UserProfile {
  const displayName = profile.displayName.trim().replace(/\s+/gu, ' ')
  if (displayName.length < 2 || displayName.length > 50 || /[\p{Cc}\p{Cf}]/u.test(displayName)) {
    throw new Error('Escribe un nombre de entre 2 y 50 caracteres, sin caracteres de control.')
  }
  if (profile.photoURL && !profilePhotoSrc(profile.photoURL)) throw new Error('La foto no es válida. Vuelve a seleccionarla.')
  return { displayName, photoURL: profile.photoURL }
}

export function parseProfile(value: unknown): UserProfile | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Record<string, unknown>
  if (typeof entry.displayName !== 'string' || typeof entry.photoURL !== 'string') return null
  try { return validateProfile({ displayName: entry.displayName, photoURL: entry.photoURL }) }
  catch { return null }
}

export function profileInitials(name: string): string {
  return name.trim().split(/\s+/u).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('es') || 'M'
}

export function parsePreferences(value: unknown): Preferences {
  const entry = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const pages: readonly string[] = ['overview', 'activity', 'calendar', 'goals', 'shopping']
  return {
    startPage: typeof entry.startPage === 'string' && pages.includes(entry.startPage) ? entry.startPage as StartPage : 'overview',
    reducedMotion: entry.reducedMotion === true,
  }
}
