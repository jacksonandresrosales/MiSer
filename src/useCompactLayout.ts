import { useSyncExternalStore } from 'react'

export const compactLayoutQuery = '(max-width: 820px), (max-width: 1100px) and (pointer: coarse) and (max-height: 600px)'
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(compactLayoutQuery)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export const useCompactLayout = () => useSyncExternalStore(subscribe,
  () => window.matchMedia(compactLayoutQuery).matches, () => false)
