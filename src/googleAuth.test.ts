import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { Auth } from 'firebase/auth'

let native = true
let token: unknown = 'google-test-token'
let nativeError: Error | null = null
const calls: unknown[][] = []
class GoogleProvider {
  static credential(idToken: string) { return { idToken } }
}
mock.module('@capacitor/core', { namedExports: { Capacitor: { isNativePlatform: () => native } } })
mock.module('@capacitor-firebase/authentication', { namedExports: { FirebaseAuthentication: {
  signInWithGoogle: async (options: unknown) => {
    calls.push(['native', options])
    if (nativeError) throw nativeError
    return { credential: { idToken: token } }
  },
} } })
mock.module('firebase/auth', { namedExports: {
  GoogleAuthProvider: GoogleProvider,
  signInWithCredential: async (auth: unknown, credential: unknown) => { calls.push(['credential', auth, credential]); return { user: { uid: 'existing-user' } } },
  signInWithPopup: async (auth: unknown, provider: unknown) => { calls.push(['popup', auth, provider]); return { user: { uid: 'existing-user' } } },
} })
const { signInWithGoogleAccount } = await import('./googleAuth.ts')

test('Google uses native credentials in the existing Firebase session; web keeps popup and failures do not authenticate', async () => {
  const auth = {} as Auth
  assert.equal((await signInWithGoogleAccount(auth)).user.uid, 'existing-user')
  assert.deepEqual(calls, [['native', { skipNativeAuth: true }], ['credential', auth, { idToken: token }]])
  for (token of [undefined, null, '', ' ', 123]) {
    calls.length = 0
    await assert.rejects(signInWithGoogleAccount(auth), /credencial válida/)
    assert.equal(calls.length, 1)
  }
  calls.length = 0
  nativeError = new Error('User canceled sign in')
  await assert.rejects(signInWithGoogleAccount(auth), error => error === nativeError)
  assert.equal(calls.length, 1)
  native = false
  calls.length = 0
  await signInWithGoogleAccount(auth)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'popup')
  assert.equal(calls[0][1], auth)
  assert.ok(calls[0][2] instanceof GoogleProvider)
})
