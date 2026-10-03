import { test } from 'node:test'
import assert from 'node:assert/strict'
import { androidUpdatesSupported, updateErrorMessage } from './androidUpdater.ts'

test('el actualizador no se activa en el navegador web', () => {
  assert.equal(androidUpdatesSupported(), false)
})

test('los errores del actualizador ofrecen recuperación y no exponen mensajes internos', () => {
  assert.match(updateErrorMessage({ code: 'CHANNEL_UNAVAILABLE' }), /Todavía no hay una versión/)
  assert.match(updateErrorMessage({ code: 'VERIFY_FAILED', message: 'secreto interno' }), /No se instaló ningún archivo/)
  assert.match(updateErrorMessage({ code: 'INSTALL_FAILED' }), /permiso/)
  assert.match(updateErrorMessage({ code: 'BUSY' }), /curso/)
  assert.match(updateErrorMessage(new Error('credencial')), /Tus datos no han cambiado/)
})
