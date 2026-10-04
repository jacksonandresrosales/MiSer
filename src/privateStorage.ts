import { Capacitor, registerPlugin } from '@capacitor/core'

export type LockStatus = { enabled: boolean; unlocked: boolean; available: boolean }
export const MiSerSecurity = registerPlugin<{
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
  getLockStatus(): Promise<LockStatus>
  authenticate(): Promise<LockStatus>
  configureLock(options: { enabled: boolean }): Promise<LockStatus>
  getAppCheckToken(): Promise<{ token: string; expireTimeMillis: number }>
}>('MiSerSecurity')

const native = () => Capacitor.getPlatform() === 'android'
const memory = new Map<string, string>()
const failures = new Map<string, () => Promise<unknown>>()
let writes = Promise.resolve()
function enqueue(key: string, operation: () => Promise<unknown>) {
  writes = writes.then(operation).then(() => { failures.delete(key) }, () => { failures.set(key, operation) })
}

/** Only finance cache and pending changes use this adapter; sessions remain SDK-managed. */
export const privateStorage = {
  getItem(key: string): string | null { return native() ? memory.get(key) ?? null : localStorage.getItem(key) },
  setItem(key: string, value: string) {
    if (!native()) { localStorage.setItem(key, value); return }
    memory.set(key, value)
    enqueue(key, () => MiSerSecurity.set({ key, value }))
  },
  removeItem(key: string) {
    if (!native()) { localStorage.removeItem(key); return }
    memory.delete(key)
    enqueue(key, () => MiSerSecurity.remove({ key }))
  },
}

export async function flushPrivateStorage(): Promise<void> {
  let current: Promise<void>
  do { current = writes; await current } while (current !== writes)
  // One bounded retry also lets the user's next attempt recover a transient disk failure.
  for (const [key, operation] of failures) enqueue(key, operation)
  do { current = writes; await current } while (current !== writes)
  if (failures.size) throw new Error('No se pudo guardar la recuperación cifrada. Exporta tus datos antes de cerrar.')
}

export async function preparePrivateStorage(uid: string): Promise<void> {
  if (!native()) return
  await flushPrivateStorage()
  for (const key of [`miser-finance-cache-${uid}`, `miser-pending-${uid}`]) {
    const { value } = await MiSerSecurity.get({ key })
    const legacy = localStorage.getItem(key)
    if (key.startsWith('miser-pending-') && value !== null && legacy !== null && value !== legacy) {
      throw new Error('Hay dos copias de cambios pendientes diferentes. Exporta la recuperación antes de migrarlas; no se ha eliminado ninguna.')
    }
    const recovered = value ?? legacy
    if (recovered !== null) {
      // Do not remove the old copy unless the native atomic write succeeded.
      if (value === null) await MiSerSecurity.set({ key, value: recovered })
      memory.set(key, recovered)
      if (legacy !== null) localStorage.removeItem(key)
    } else memory.delete(key)
  }
}

export async function clearPrivateCache(uid: string): Promise<void> {
  if (privateStorage.getItem(`miser-pending-${uid}`)) throw new Error('Hay cambios pendientes. Sincroniza o exporta antes de borrar la copia local.')
  privateStorage.removeItem(`miser-finance-cache-${uid}`)
  await flushPrivateStorage()
}

export function forgetPrivateMemory(): void { memory.clear() }
