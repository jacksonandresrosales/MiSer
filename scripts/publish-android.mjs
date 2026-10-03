import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const repository = 'jacksonandresrosales/MiSer'
const maximumApkSize = 200 * 1024 * 1024

export function validateManifest(value) {
  assert.equal(value?.schemaVersion, 1, 'Versión de manifiesto incompatible')
  assert.equal(value.packageId, 'com.miser.finanzas', 'Paquete incorrecto')
  assert.ok(Number.isSafeInteger(value.versionCode) && value.versionCode > 0 && value.versionCode <= 2147483647, 'Código de versión inválido')
  assert.ok(typeof value.versionName === 'string' && value.versionName.length > 0 && value.versionName.length <= 80, 'Nombre de versión inválido')
  assert.equal(value.apkUrl, `https://github.com/${repository}/releases/download/android-build-${value.versionCode}/MiSer.apk`, 'Origen del APK incorrecto')
  assert.match(value.sha256, /^[a-f0-9]{64}$/)
  assert.ok(Number.isSafeInteger(value.size) && value.size > 0 && value.size <= maximumApkSize, 'Tamaño del APK inválido')
  return value
}

export function createManifest(apk, versionCode) {
  return validateManifest({ schemaVersion: 1, packageId: 'com.miser.finanzas', versionCode,
    versionName: `1.0.${versionCode}`,
    apkUrl: `https://github.com/${repository}/releases/download/android-build-${versionCode}/MiSer.apk`,
    sha256: createHash('sha256').update(apk).digest('hex'), size: apk.length })
}

export function shouldPromote(current, candidate) {
  validateManifest(candidate)
  return !current || candidate.versionCode >= validateManifest(current).versionCode
}

export function uploadedAsset(release, name) {
  return release.assets.find(asset => asset.name === name && asset.state === 'uploaded' && asset.size > 0)
}

export async function publish({ apk: suppliedApk } = {}) {
  assert.equal(process.env.GITHUB_REPOSITORY, repository, 'Solo se publica en el repositorio de MiSer')
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Solo se publica desde main')
  const token = process.env.GITHUB_TOKEN
  assert.ok(token, 'Falta el token de publicación del workflow')
  const api = `https://api.github.com/repos/${repository}`
  async function request(url, { method = 'GET', json, bytes, allowMissing = false } = {}) {
    const response = await fetch(url, { method, signal: AbortSignal.timeout(120_000), headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'MiSer-Android-Publisher',
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(bytes ? { 'Content-Type': 'application/octet-stream' } : {}),
    }, body: json ? JSON.stringify(json) : bytes })
    if (allowMissing && response.status === 404) return null
    assert.ok(response.ok, `GitHub rechazó la publicación (${response.status})`)
    return response.status === 204 ? null : response.json()
  }
  async function release(tag, name, body) {
    return await request(`${api}/releases/tags/${tag}`, { allowMissing: true }) ?? request(`${api}/releases`, {
      method: 'POST', json: { tag_name: tag, target_commitish: process.env.GITHUB_SHA,
        name, body, draft: false, prerelease: true, make_latest: 'false' },
    })
  }
  async function upload(target, name, bytes) {
    const url = new URL(target.upload_url.replace(/\{.*$/, ''))
    url.searchParams.set('name', name)
    return request(url.href, { method: 'POST', bytes })
  }
  async function readManifest(asset) {
    const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(30_000) })
    assert.ok(response.ok, 'No se pudo leer un manifiesto publicado')
    return validateManifest(await response.json())
  }
  async function removeNamed(target, name) {
    for (const asset of target.assets.filter(asset => asset.name === name)) {
      await request(`${api}/releases/assets/${asset.id}`, { method: 'DELETE' })
    }
  }
  // An old commit must never replace the update channel for current main.
  const branch = await request(`${api}/branches/main`)
  if (branch.commit.sha !== process.env.GITHUB_SHA) {
    console.log('main ya tiene otro commit; se conserva el canal de actualización actual.')
    return
  }
  assert.equal((await request(api)).private, false, 'El canal de actualización requiere un repositorio público')
  const versionCode = Number(process.env.GITHUB_RUN_NUMBER)
  const apk = suppliedApk ?? readFileSync('artifacts/MiSer.apk')
  let manifest = createManifest(apk, versionCode)
  const build = await release(`android-build-${versionCode}`, `MiSer Android · ${manifest.versionName}`,
    'APK de pruebas firmada con la clave estable de MiSer. Android solicitará confirmar la instalación. No es una distribución de producción en Google Play.')
  const existingManifest = uploadedAsset(build, 'update.json')
  if (existingManifest) {
    // Immutable build: reruns reuse the exact APK/hash already published.
    manifest = await readManifest(existingManifest)
    assert.equal(manifest.versionCode, versionCode)
    assert.equal(uploadedAsset(build, 'MiSer.apk')?.size, manifest.size, 'El APK publicado está incompleto')
  } else {
    // A failed first attempt can leave incomplete assets; no published manifest references these yet.
    for (const asset of build.assets) await request(`${api}/releases/assets/${asset.id}`, { method: 'DELETE' })
    await upload(build, 'MiSer.apk', apk)
    await upload(build, 'MiSer.apk.sha256', Buffer.from(`${manifest.sha256}  MiSer.apk\n`))
    await upload(build, 'update.json', Buffer.from(JSON.stringify(manifest, null, 2)))
  }
  const channel = await release('android-latest', 'MiSer · canal de actualizaciones Android',
    'Canal automático de APK de pruebas. Las versiones por compilación conservan su APK y checksum; update.json apunta a la más reciente.')
  const currentAsset = uploadedAsset(channel, 'update.json')
  const backupAsset = uploadedAsset(channel, 'previous-update.json')
  const current = currentAsset ? await readManifest(currentAsset) : backupAsset ? await readManifest(backupAsset) : null
  if (!shouldPromote(current, manifest)) return
  if (currentAsset) {
    // Preserve a publicly readable fallback before touching the live manifest. A cancelled
    // process cannot leave already-installed apps without their previous valid channel.
    await removeNamed(channel, 'previous-update.json')
    await upload(channel, 'previous-update.json', Buffer.from(JSON.stringify(current, null, 2)))
  }
  await removeNamed(channel, 'update.json') // Includes failed zero-byte starter uploads.
  try {
    await upload(channel, 'update.json', Buffer.from(JSON.stringify(manifest, null, 2)))
  } catch (failure) {
    if (current) {
      try {
        const refreshed = await request(`${api}/releases/${channel.id}`)
        await removeNamed(refreshed, 'update.json')
        await upload(channel, 'update.json', Buffer.from(JSON.stringify(current, null, 2)))
      } catch { /* The native client can still read previous-update.json. */ }
    }
    throw failure
  }
  await request(`${api}/releases/${channel.id}`, { method: 'PATCH', json: {
    body: `Último APK de pruebas: [MiSer ${manifest.versionName}](${manifest.apkUrl}).\n\nAndroid pide confirmación. Conserva la misma firma y los datos de la instalación anterior.`,
  } })
  console.log(`APK publicada: ${manifest.apkUrl}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await publish()
}
