import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createManifest, publish, shouldPromote, uploadedAsset, validateManifest } from './publish-android.mjs'

test('el manifiesto conserva origen, versión, tamaño y SHA-256 del APK', () => {
  const manifest = createManifest(Buffer.from('apk'), 12)
  assert.equal(manifest.versionName, '1.0.12')
  assert.equal(manifest.size, 3)
  assert.equal(manifest.sha256, 'dd37c2d7274f7ea982cb83390c36918fee9ce8889073c44b68cdc00bdb8c3e04')
  assert.equal(validateManifest(manifest), manifest)
})

test('rechaza paquetes, URLs, hashes, versiones y tamaños no válidos', () => {
  const valid = createManifest(Buffer.from('apk'), 12)
  for (const patch of [
    { schemaVersion: 2 }, { packageId: 'otra.app' }, { versionCode: 0 }, { versionCode: 1.5 },
    { versionCode: 2147483648 }, { versionName: '' }, { apkUrl: 'https://evil.example/MiSer.apk' },
    { apkUrl: valid.apkUrl.replace('12', '13') }, { sha256: 'no' }, { size: -1 }, { size: 200 * 1024 * 1024 + 1 },
  ]) assert.throws(() => validateManifest({ ...valid, ...patch }))
})

test('una compilación antigua nunca rebaja el canal de actualización', () => {
  const manifest = createManifest(Buffer.from('apk'), 12)
  assert.equal(shouldPromote(null, manifest), true)
  assert.equal(shouldPromote(manifest, createManifest(Buffer.from('apk'), 11)), false)
  assert.equal(shouldPromote(manifest, manifest), true)
  assert.equal(shouldPromote(manifest, createManifest(Buffer.from('apk'), 13)), true)
})

test('un upload starter o vacío no bloquea el reintento de publicación', () => {
  const release = { assets: [
    { name: 'update.json', state: 'starter', size: 0 },
    { name: 'MiSer.apk', state: 'uploaded', size: 6 },
  ] }
  assert.equal(uploadedAsset(release, 'update.json'), undefined)
  assert.equal(uploadedAsset(release, 'MiSer.apk').size, 6)
  assert.equal(uploadedAsset({ assets: [{ name: 'update.json', state: 'uploaded', size: 0 }] }, 'update.json'), undefined)
})

test('un fallo al promover conserva una copia pública y restaura el manifiesto anterior', async () => {
  const previous = createManifest(Buffer.from('old'), 11)
  const channel = { id: 2, assets: [{ id: 20, name: 'update.json', state: 'uploaded', size: 400,
    browser_download_url: 'https://github.com/previous.json', manifest: previous }],
    upload_url: 'https://uploads.github.com/repos/jacksonandresrosales/MiSer/releases/2/assets{?name}' }
  const build = { id: 1, assets: [], upload_url: channel.upload_url.replace('/2/', '/1/') }
  const requests = []
  const originalFetch = globalThis.fetch
  const keys = ['GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_TOKEN', 'GITHUB_SHA', 'GITHUB_RUN_NUMBER']
  const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  Object.assign(process.env, { GITHUB_REPOSITORY: 'jacksonandresrosales/MiSer', GITHUB_REF: 'refs/heads/main',
    GITHUB_TOKEN: 'test-only', GITHUB_SHA: 'test-sha', GITHUB_RUN_NUMBER: '12' })
  let failed = false
  let nextId = 30
  const respond = (value, status = 200) => new Response(status === 204 ? null : JSON.stringify(value), { status })
  globalThis.fetch = async (address, options = {}) => {
    const url = new URL(address)
    requests.push(`${options.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname.endsWith('/branches/main')) return respond({ commit: { sha: 'test-sha' } })
    if (url.pathname === '/repos/jacksonandresrosales/MiSer') return respond({ private: false })
    if (url.pathname.endsWith('/tags/android-build-12')) return respond(build)
    if (url.pathname.endsWith('/tags/android-latest') || url.pathname.endsWith('/releases/2')) return respond(channel)
    if (url.hostname === 'github.com') return respond(previous)
    if (options.method === 'DELETE') {
      const id = Number(url.pathname.split('/').at(-1))
      if (id === 20) assert.ok(channel.assets.some(asset => asset.name === 'previous-update.json'), 'Hay respaldo antes de borrar el canal')
      channel.assets = channel.assets.filter(asset => asset.id !== id)
      return respond(null, 204)
    }
    if (url.hostname === 'uploads.github.com') {
      const target = url.pathname.includes('/2/') ? channel : build
      const name = url.searchParams.get('name')
      if (target === channel && name === 'update.json' && !failed) { failed = true; return respond({}, 502) }
      const asset = { id: nextId++, name, state: 'uploaded', size: options.body.length }
      if (name.endsWith('.json')) asset.manifest = JSON.parse(options.body.toString())
      target.assets.push(asset)
      return respond(asset)
    }
    throw new Error(`Solicitud inesperada: ${url.pathname}`)
  }
  try {
    await assert.rejects(publish({ apk: Buffer.from('new') }), /502/)
    assert.deepEqual(channel.assets.find(asset => asset.name === 'previous-update.json').manifest, previous)
    assert.deepEqual(channel.assets.find(asset => asset.name === 'update.json').manifest, previous)
    assert.ok(build.assets.some(asset => asset.name === 'MiSer.apk'))
    assert.ok(requests.length > 0)
  } finally {
    globalThis.fetch = originalFetch
    for (const key of keys) {
      if (originalEnv[key] === undefined) delete process.env[key]
      else process.env[key] = originalEnv[key]
    }
  }
})
