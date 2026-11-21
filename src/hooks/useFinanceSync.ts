import { useCallback, useEffect, useRef, useState } from 'react'
import { signOut as firebaseSignOut } from 'firebase/auth'
import { firebaseAuth, firebaseConfigured, firebaseMisconfigured, firestore } from '../firebase'
import { changedRecords, flattenData, loadFinanceData, maxRecordsPerTransaction, saveFinanceRecords, saveUserProfile } from '../financeStore'
import { inflateRecords, type RecordMap } from '../financeData'
import { parsePendingChanges, readFinanceCache, readPendingChanges, writeFinanceCache, type SyncCursor } from '../financeCache'
import { clearPrivateCache, flushPrivateStorage, forgetPrivateMemory, preparePrivateStorage, privateStorage } from '../privateStorage'
import { demoData } from '../demoData'
import { exportJson } from '../lib/exportData'
import { validateProfile, type UserProfile } from '../userProfile'
import type { FinanceData } from '../types'
import type { Session, SyncStatus } from '../appTypes'
import { demoProfileKey } from './useAuthSession'

const demoStorageKey = 'miser-demo'
const previousDemoStorageKey = 'brisa-demo'
const pendingKey = (uid: string) => `miser-pending-${uid}`
const readDemoData = (): FinanceData | null => {
  if (firebaseConfigured || firebaseMisconfigured) return null
  try { const stored = localStorage.getItem(demoStorageKey) ?? localStorage.getItem(previousDemoStorageKey); return stored ? JSON.parse(stored) as FinanceData : demoData } catch { return demoData }
}
const errorCode = (error: unknown) => error && typeof error === 'object' && 'code' in error ? String(error.code) : ''

type Options = {
  session: Session
  profile: UserProfile
  setProfile: (profile: UserProfile) => void
  notify: (message: string, kind?: 'success' | 'error') => void
}

/**
 * Loads, caches and saves the finance records of the signed-in person.
 * Invariants kept from the original App: a write never overwrites a record changed elsewhere (version check),
 * pending changes are persisted locally before any network write and only removed once the cloud matches them.
 */
export function useFinanceSync({ session, profile, setProfile, notify }: Options) {
  const userId = session?.user.id
  const verified = !!session?.user.verified
  const [data, setData] = useState<FinanceData | null>(readDemoData)
  const [loaded, setLoaded] = useState(!firebaseConfigured && !firebaseMisconfigured)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveAttempt, setSaveAttempt] = useState(0)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('saved')
  const [syncMessage, setSyncMessage] = useState('')
  const [syncConflict, setSyncConflict] = useState(false)
  const [offlineSince, setOfflineSince] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)
  const dataRef = useRef(data)
  const remoteRecords = useRef<RecordMap>(new Map())
  const versions = useRef(new Map<string, number>())
  const syncCursor = useRef<SyncCursor | null>(null)
  const expectedVersions = useRef(new Map<string, number>())
  const flushing = useRef(false)
  const profileRef = useRef(profile)
  const offlineRef = useRef(offlineSince)
  const notifyRef = useRef(notify)
  useEffect(() => { profileRef.current = profile; offlineRef.current = offlineSince; notifyRef.current = notify })

  const pendingPayload = useCallback((uid: string, changes: ReturnType<typeof changedRecords>) => JSON.stringify({ uid, changes: changes.map(([key, record]) => [key, record, expectedVersions.current.get(key) ?? versions.current.get(key) ?? 0]) }), [])

  // Signing out clears what is on screen.
  useEffect(() => {
    if (!firebaseConfigured || userId) return
    dataRef.current = null
    setData(null); setLoaded(false); setLoadedUserId(null)
  }, [userId])

  useEffect(() => {
    const db = firestore
    if (!db || !userId || !verified) return
    let active = true
    setLoaded(false)
    setLoadedUserId(null)
    setLoadError('')
    setSyncConflict(false)
    const showRecords = (records: RecordMap, recoveredProfile: UserProfile | null) => {
      dataRef.current = inflateRecords(records)
      setData(dataRef.current)
      if (recoveredProfile) setProfile(recoveredProfile)
      setLoadedUserId(userId)
      setLoaded(true)
    }
    preparePrivateStorage(userId).then(() => {
      if (!active) return null
      const cache = readFinanceCache(userId)
      // Show the local copy right away, read-only, while the cloud answers.
      if (cache) {
        const local = new Map(cache.records)
        for (const [key, record] of readPendingChanges(userId)) {
          if (record) local.set(key, record)
          else local.delete(key)
        }
        refreshingRef.current = true
        setRefreshing(true)
        showRecords(local, cache.profile)
      }
      return loadFinanceData(db, userId, cache)
    }).then(async result => {
      if (!result || !active) return
      refreshingRef.current = false
      setRefreshing(false)
      const pending = parsePendingChanges(userId, privateStorage.getItem(pendingKey(userId)))
      if (!pending) throw new Error('invalid-pending')
      syncCursor.current = result.syncCursor
      setOfflineSince(null)
      remoteRecords.current = result.records
      versions.current = result.versions
      expectedVersions.current = new Map()
      const restored = new Map(result.records)
      for (const [key, record, version] of pending) {
        if (JSON.stringify(record?.value) === JSON.stringify(result.records.get(key)?.value)) continue
        if (record) restored.set(key, record)
        else restored.delete(key)
        expectedVersions.current.set(key, version)
      }
      showRecords(restored, result.profile)
      setSyncStatus(expectedVersions.current.size ? 'pending' : 'saved')
      setSyncMessage('')
      // The encrypted local copy is written after the screen is ready, off the critical path.
      if (!writeFinanceCache(userId, result)) setSyncMessage('No se pudo guardar una recuperación local segura. Revisa el espacio disponible; tus datos de Firebase siguen intactos.')
      if (!expectedVersions.current.size && pending.length) privateStorage.removeItem(pendingKey(userId))
      await flushPrivateStorage()
    }).catch((error: unknown) => {
      refreshingRef.current = false
      setRefreshing(false)
      if (!active) return
      const code = errorCode(error)
      const cache = code !== 'permission-denied' && code !== 'unauthenticated' && (code === 'unavailable' || !navigator.onLine) ? readFinanceCache(userId) : null
      if (cache) {
        const recovered = new Map(cache.records)
        for (const [key, record] of readPendingChanges(userId)) {
          if (record) recovered.set(key, record)
          else recovered.delete(key)
        }
        setOfflineSince(cache.cachedAt)
        setSyncStatus('error')
        setSyncMessage('Sin conexión. Puedes consultar o exportar tu copia local. Para editar, vuelve a conectarte.')
        showRecords(recovered, cache.profile)
        return
      }
      setLoadError(code === 'permission-denied'
        ? 'Tu cuenta no tiene permiso para abrir estos datos. Comprueba que confirmaste tu correo y vuelve a intentarlo.'
        : code === 'unavailable' ? 'El servicio no responde. Revisa tu conexión e inténtalo de nuevo.'
          : error instanceof Error && error.message === 'invalid-pending' ? 'La recuperación de cambios está dañada. No la hemos reemplazado. Exporta la recuperación antes de continuar.'
            : error instanceof Error && error.message === 'invalid-data' ? 'Hay un registro con formato inválido. Tus datos no se han reemplazado. Exporta la recuperación y revisa ese registro antes de continuar.'
              : `No se pudo cargar tu información${code ? ` (${code})` : ''}. Revisa tu conexión e inténtalo de nuevo.`)
    })
    return () => { active = false }
  }, [userId, verified, loadAttempt, setProfile])

  // Demo: persist locally after a short pause.
  useEffect(() => {
    if (firebaseConfigured || !data || !loaded) return
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(demoStorageKey, JSON.stringify(data)) }
      catch { notifyRef.current('No hay espacio suficiente en este navegador para guardar los cambios.', 'error') }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [data, loaded])

  // Account: write changed records after a short pause, persisting the pending set first.
  useEffect(() => {
    if (!firebaseConfigured || !data || !loaded || offlineSince || refreshing) return
    const db = firestore
    if (!db || !userId || loadedUserId !== userId) return
    const timer = window.setTimeout(async () => {
      if (flushing.current) return
      flushing.current = true
      let completed = false
      setSyncStatus('saving')
      try {
        while (dataRef.current) {
          if (firebaseAuth?.currentUser?.uid !== userId) return
          const batchData = dataRef.current
          const batchChanges = changedRecords(remoteRecords.current, flattenData(batchData))
          if (!batchChanges.length) break
          privateStorage.setItem(pendingKey(userId), pendingPayload(userId, batchChanges))
          await flushPrivateStorage()
          for (let start = 0; start < batchChanges.length; start += maxRecordsPerTransaction) {
            if (firebaseAuth?.currentUser?.uid !== userId) return
            const group = batchChanges.slice(start, start + maxRecordsPerTransaction)
            const results = await saveFinanceRecords(db, userId, group.map(([key, record]) => ({ key, record, expectedVersion: expectedVersions.current.get(key) ?? versions.current.get(key) ?? 0 })))
            if (firebaseAuth?.currentUser?.uid !== userId) return
            group.forEach(([key, record], index) => {
              const saved = results[index]
              if (saved.record) remoteRecords.current.set(key, saved.record)
              else remoteRecords.current.delete(key)
              versions.current.set(key, saved.version)
              expectedVersions.current.delete(key)
              if (record?.kind === 'item' && saved.record?.value.imageUrl !== record.value.imageUrl && dataRef.current) {
                const next: FinanceData = { ...dataRef.current, lists: dataRef.current.lists.map(list => ({ ...list, items: list.items.map(item =>
                  item.id === record.value.id && item.imageUrl === record.value.imageUrl ? { ...item, imageUrl: String(saved.record!.value.imageUrl) } : item) })) }
                dataRef.current = next
                setData(next)
              }
            })
          }
          if (batchData === dataRef.current) break
        }
        const committedData = dataRef.current
        if (!writeFinanceCache(userId, { records: remoteRecords.current, versions: versions.current, profile: profileRef.current, syncCursor: syncCursor.current })) throw new Error('cache-failed')
        if (dataRef.current === committedData) privateStorage.removeItem(pendingKey(userId))
        await flushPrivateStorage()
        setSyncStatus('saved')
        setSyncMessage('')
        setSyncConflict(false)
        completed = true
      } catch (error) {
        const conflict = error instanceof Error && error.message === 'conflict'
        setSyncStatus('error')
        setSyncConflict(conflict)
        setSyncMessage(conflict ? 'Otro dispositivo cambió uno de estos registros. Elige qué versión conservar.' : 'No se pudieron guardar todos los cambios. Revisa tu conexión; lo intentaremos de nuevo al reconectar.')
      } finally {
        if (firebaseAuth?.currentUser?.uid === userId && dataRef.current) {
          const remaining = changedRecords(remoteRecords.current, flattenData(dataRef.current))
          try {
            if (remaining.length) { privateStorage.setItem(pendingKey(userId), pendingPayload(userId, remaining)); await flushPrivateStorage() }
            if (completed && remaining.length) { setSyncStatus('pending'); setSaveAttempt(value => value + 1) }
          } catch { setSyncMessage('Exporta tus datos antes de cerrar: no se pudo conservar la recuperación local.') }
        }
        flushing.current = false
      }
    }, 450)
    return () => window.clearTimeout(timer)
  }, [data, loaded, userId, loadedUserId, saveAttempt, offlineSince, refreshing, pendingPayload])

  // Reconnect automatically: reload when viewing the offline copy, retry saving after a failed write.
  useEffect(() => {
    if (!firebaseConfigured) return
    const reconnect = () => {
      if (offlineRef.current) setLoadAttempt(value => value + 1)
      else setSaveAttempt(value => value + 1)
    }
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [])

  const modify = useCallback((fn: (old: FinanceData) => FinanceData) => {
    if (offlineRef.current) { notifyRef.current('Estás viendo una copia local. Vuelve a conectarte para editar.', 'error'); return false }
    if (refreshingRef.current) { notifyRef.current('Sincronizando con la nube. Podrás editar en un momento.', 'error'); return false }
    if (!dataRef.current) return false
    const next = fn(dataRef.current)
    dataRef.current = next
    setData(next)
    if (firebaseConfigured) setSyncStatus('pending')
    return true
  }, [])

  /** Conflict resolution: keep the cloud version (discard local pending) or overwrite it with this device's version. */
  const resolveConflict = useCallback(async (keep: 'cloud' | 'mine') => {
    if (!userId) return
    if (keep === 'cloud') {
      privateStorage.removeItem(pendingKey(userId))
      await flushPrivateStorage()
      setLoadAttempt(value => value + 1)
      return
    }
    // Trust the latest cloud versions as the expected ones; the next write replaces them with this device's data.
    const db = firestore
    if (!db) return
    try {
      const fresh = await loadFinanceData(db, userId, null, false)
      remoteRecords.current = fresh.records
      versions.current = fresh.versions
      expectedVersions.current = new Map()
      setSyncConflict(false)
      setSyncStatus('pending')
      setSyncMessage('')
      setSaveAttempt(value => value + 1)
    } catch { notifyRef.current('No se pudo consultar la nube. Revisa tu conexión.', 'error') }
  }, [userId])

  const hasPending = useCallback(() => flushing.current || !!(userId && (privateStorage.getItem(pendingKey(userId)) || dataRef.current && changedRecords(remoteRecords.current, flattenData(dataRef.current)).length)), [userId])

  const exportData = useCallback(async () => {
    if (!dataRef.current) return
    if (!await exportJson(dataRef.current)) notifyRef.current('No se completó la exportación. Tus datos siguen en MiSer; vuelve a intentarlo.', 'error')
  }, [])

  const exportRecovery = useCallback(async () => {
    if (!userId) return
    let pendingRaw: string | null = null
    try { pendingRaw = privateStorage.getItem(pendingKey(userId)) ?? localStorage.getItem(pendingKey(userId)) } catch { /* Export any valid cache that is still accessible. */ }
    const cache = readFinanceCache(userId)
    let legacyCacheRaw: string | null = null
    try { legacyCacheRaw = localStorage.getItem(`miser-finance-cache-${userId}`) } catch { /* Never delete inaccessible recovery data. */ }
    if (!cache && !pendingRaw && !legacyCacheRaw) { notifyRef.current('No hay una copia de recuperación en este dispositivo.', 'error'); return }
    if (!await exportJson({ uid: userId, exportedAt: new Date().toISOString(), cachedData: cache?.data ?? null, cachedAt: cache?.cachedAt ?? null, changes: readPendingChanges(userId), pendingRaw, legacyCacheRaw }, 'miser-recuperacion')) notifyRef.current('No se completó la exportación.', 'error')
  }, [userId])

  const signOut = useCallback(async () => {
    if (!firebaseAuth) return
    await flushPrivateStorage()
    const previousUid = userId
    await firebaseSignOut(firebaseAuth)
    if (previousUid && !privateStorage.getItem(pendingKey(previousUid))) await clearPrivateCache(previousUid)
    forgetPrivateMemory()
  }, [userId])

  const clearLocalData = useCallback(async () => {
    if (!userId || !firebaseAuth) throw new Error('Esta opción requiere una cuenta conectada.')
    if (hasPending() || readPendingChanges(userId).length) throw new Error('Hay cambios pendientes. Sincroniza o exporta antes de borrar la copia local.')
    await clearPrivateCache(userId)
    await firebaseSignOut(firebaseAuth)
    forgetPrivateMemory()
  }, [userId, hasPending])

  const saveProfile = useCallback(async (draft: UserProfile) => {
    if (offlineRef.current) throw new Error('Vuelve a conectarte antes de editar tu perfil.')
    const next = validateProfile(draft)
    if (firebaseConfigured) {
      if (!firestore || !userId || firebaseAuth?.currentUser?.uid !== userId || loadedUserId !== userId) throw new Error('Tu sesión cambió. Vuelve a iniciar sesión antes de guardar.')
      await saveUserProfile(firestore, userId, next)
      if (firebaseAuth.currentUser?.uid !== userId) throw new Error('El perfil se guardó, pero tu sesión cambió. Vuelve a iniciar sesión.')
      const cache = readFinanceCache(userId)
      if (cache) { if (!writeFinanceCache(userId, { ...cache, profile: next })) throw new Error('No se pudo guardar la copia local del perfil.'); await flushPrivateStorage() }
    } else {
      try { localStorage.setItem(demoProfileKey, JSON.stringify(next)) }
      catch { throw new Error('No hay espacio para guardar el perfil en este navegador. Prueba con una foto más pequeña.') }
    }
    setProfile(next)
    return next
  }, [userId, loadedUserId, setProfile])

  return {
    data, loaded, loadedUserId, loadError, syncStatus, syncMessage, syncConflict, offlineSince, refreshing,
    modify, resolveConflict, hasPending, exportData, exportRecovery, signOut, clearLocalData, saveProfile,
    retryLoad: useCallback(() => setLoadAttempt(value => value + 1), []),
    retrySave: useCallback(() => setSaveAttempt(value => value + 1), []),
  }
}
