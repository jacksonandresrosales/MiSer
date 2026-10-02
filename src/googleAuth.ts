import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { GoogleAuthProvider, signInWithCredential, signInWithPopup, type Auth } from 'firebase/auth'

export async function signInWithGoogleAccount(auth: Auth) {
  if (!Capacitor.isNativePlatform()) return signInWithPopup(auth, new GoogleAuthProvider())
  const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true })
  const token = result.credential?.idToken
  if (typeof token !== 'string' || !token.trim()) throw new Error('Google no devolvió una credencial válida. Inténtalo de nuevo.')
  return signInWithCredential(auth, GoogleAuthProvider.credential(token))
}
