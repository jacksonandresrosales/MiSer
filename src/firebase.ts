import { initializeApp } from 'firebase/app'
import { getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth'
import { Capacitor } from '@capacitor/core'
import { getFirestore } from 'firebase/firestore/lite'
import { CustomProvider, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { MiSerSecurity } from './privateStorage'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const values = Object.values(config)
export const firebaseConfigured = values.every(Boolean)
export const firebaseMisconfigured = values.some(Boolean) && !firebaseConfigured

const app = firebaseConfigured ? initializeApp(config) : null
if (app && import.meta.env.VITE_FIREBASE_APP_CHECK_ENABLED === 'true') {
  const siteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY
  if (Capacitor.getPlatform() === 'android') {
    initializeAppCheck(app, { provider: new CustomProvider({ getToken: () => MiSerSecurity.getAppCheckToken() }), isTokenAutoRefreshEnabled: true })
  } else if (siteKey) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true })
  } else throw new Error('Configura VITE_FIREBASE_APP_CHECK_SITE_KEY antes de activar App Check en la web.')
}
export const firebaseAuth = app ? Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app) : null
export const firestore = app ? getFirestore(app) : null

declare global {
  interface ImportMetaEnv {
    readonly VITE_FIREBASE_API_KEY: string
    readonly VITE_FIREBASE_AUTH_DOMAIN: string
    readonly VITE_FIREBASE_PROJECT_ID: string
    readonly VITE_FIREBASE_STORAGE_BUCKET: string
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
    readonly VITE_FIREBASE_APP_ID: string
    readonly VITE_FIREBASE_APP_CHECK_ENABLED: string | undefined
    readonly VITE_FIREBASE_APP_CHECK_SITE_KEY: string | undefined
    readonly VITE_FIRESTORE_INCREMENTAL_SYNC: string | undefined
  }
}
