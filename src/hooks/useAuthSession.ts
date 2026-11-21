import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { firebaseAuth, firebaseConfigured } from '../firebase'
import { parseProfile, profilePhotoSrc, type UserProfile } from '../userProfile'
import type { Session } from '../appTypes'

export const emptyProfile: UserProfile = { displayName: 'Mi espacio', photoURL: '' }
export const demoProfileKey = 'miser-demo-profile'

const readDemoProfile = () => {
  if (firebaseConfigured) return emptyProfile
  try { return parseProfile(JSON.parse(localStorage.getItem(demoProfileKey) ?? 'null')) ?? emptyProfile }
  catch { return emptyProfile }
}

export function useAuthSession() {
  const [session, setSession] = useState<Session>(null)
  const [authReady, setAuthReady] = useState(!firebaseConfigured)
  const [profile, setProfile] = useState<UserProfile>(readDemoProfile)

  useEffect(() => {
    if (!firebaseAuth) return
    return onAuthStateChanged(firebaseAuth, next => {
      setSession(next ? { user: { id: next.uid, email: next.email ?? undefined, verified: next.emailVerified, passwordAccount: next.providerData.some(provider => provider.providerId === 'password') } } : null)
      setProfile(next ? { displayName: next.displayName?.trim() || emptyProfile.displayName, photoURL: profilePhotoSrc(next.photoURL ?? '') ?? '' } : emptyProfile)
      setAuthReady(true)
    })
  }, [])

  return { session, setSession, authReady, profile, setProfile }
}
