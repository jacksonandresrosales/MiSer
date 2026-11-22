import { useCallback, useEffect, useState } from 'react'
import { defaultPreferences, parsePreferences, type Preferences } from '../userProfile'

const preferencesKey = 'miser-preferences'
const themeKey = 'miser-theme'
const readPreferences = () => {
  try { return parsePreferences(JSON.parse(localStorage.getItem(preferencesKey) ?? 'null')) }
  catch { return defaultPreferences }
}
/** Dark is the default look; only an explicit "light" choice switches it off. */
const readDarkMode = () => {
  try { return localStorage.getItem(themeKey) !== 'light' } catch { return true }
}

export function useAppPreferences(onError: (message: string) => void) {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences)
  const [darkMode, setDarkMode] = useState(readDarkMode)

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#0d0c0b' : '#f6f4f0')
    try { localStorage.setItem(themeKey, darkMode ? 'dark' : 'light') } catch { /* Theme still applies for this session. */ }
  }, [darkMode])

  useEffect(() => { document.documentElement.dataset.reducedMotion = String(preferences.reducedMotion) }, [preferences.reducedMotion])

  const changePreferences = useCallback((next: Preferences) => {
    try { localStorage.setItem(preferencesKey, JSON.stringify(next)); setPreferences(next) }
    catch { onError('No se pudieron guardar las preferencias en este dispositivo.') }
  }, [onError])

  return { preferences, changePreferences, darkMode, setDarkMode }
}
