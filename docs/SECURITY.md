# Seguridad y rendimiento de MiSer

Estas medidas endurecen el cliente; no sustituyen una auditoría del backend desplegado ni las pruebas en Android real.

## Distribución Android

GitHub Actions prepara un APK **release**, con R8, reducción de recursos, depuración Android/WebView desactivada y verificación de firma. El nombre del secreto `ANDROID_DEBUG_KEYSTORE_BASE64` se conserva por compatibilidad: contiene la clave privada existente. Cambiar el certificado impediría actualizar los APK instalados y rompería las huellas OAuth. No se ha generado ni publicado una clave nueva.

Los certificados y la configuración cliente de Firebase son públicos; la clave privada de firma y las credenciales administrativas no lo son. Protege GitHub con MFA, acceso mínimo a los secretos y revisiones antes de publicar. Una APK release firmada con el certificado anterior no equivale a una publicación validada en Google Play.

## Datos en el teléfono

- En Android, caché financiera y cambios pendientes usan AES-256-GCM, IV aleatorio, autenticación ligada a la clave del registro y Android Keystore. Los archivos se escriben atómicamente en `noBackupFilesDir`; no se incluyen en backups ni transferencias del sistema.
- La caché antigua se elimina de `localStorage` únicamente después de una escritura cifrada exitosa. Dos copias pendientes distintas bloquean la migración y permiten exportarlas: nunca se escoge una descartando silenciosamente la otra.
- El bloqueo opcional utiliza la huella o credencial de pantalla de Android. Se solicita al arrancar y tras un minuto fuera de la app. Oculta recientes y bloquea capturas mientras está activo. Es un bloqueo de acceso a la app; la clave de cifrado no exige biometría para cada escritura de recuperación.
- Firebase administra su propia sesión. No se cifra manualmente el almacenamiento interno del SDK. En la web, la caché sigue protegida por el aislamiento del navegador, no por Android Keystore.
- Cerrar sesión elimina la copia financiera sincronizada si no hay recuperación pendiente. La acción «Borrar copia y salir» no permite borrar cambios pendientes.
- Las exportaciones JSON no están cifradas: se advierte antes de compartirlas. Los temporales de más de 24 horas se limpian al abrir Android. Las copias guardadas en otras apps no pueden retirarse desde MiSer.
- Desinstalar MiSer o borrar sus datos puede eliminar recuperación pendiente y claves locales. Sincroniza o exporta antes.

## Despliegue de Firestore: requiere una acción del administrador

1. Publica y prueba primero los clientes actualizados. Mantén `VITE_FIRESTORE_INCREMENTAL_SYNC=false` y `VITE_FIREBASE_APP_CHECK_ENABLED=false` durante esta fase.
2. Copia **todo** `firestore.rules` en Firebase Console → Firestore → Reglas, o usa `firebase deploy --only firestore:rules --project miser-b47b0` desde una sesión administrativa autorizada. Las pruebas del repositorio no despliegan reglas.
3. Las reglas nuevas exigen UID propietario, correo verificado, tipos/campos permitidos, fechas reales, límites de texto/monto, versiones consecutivas y timestamps de servidor. Los borrados usan tombstones. La colección `media` guarda fotos privadas; si las reglas antiguas aún no permiten esa colección, la transacción rechazada no guarda nada y el cliente reintenta el formato embebido anterior, con los mismos controles de propietario y versión. La optimización de fotos necesita publicar las reglas nuevas.
4. Los APK antiguos que escriben sin timestamp dejarán de poder guardar. Verifica que todos los dispositivos estén actualizados **antes** de exigir las reglas.
5. Solo entonces activa `VITE_FIRESTORE_INCREMENTAL_SYNC=true` en Vercel y en las **Variables** del repositorio GitHub y recompila ambos clientes. La primera carga es completa por páginas de 250 registros; después se fusionan cambios desde el cursor confirmado, incluyendo el límite temporal y las versiones de eliminación. Un cursor inválido/no disponible o un servidor sin protocolo reconocido fuerza una carga completa. No se calcula el saldo sobre una página aislada.

Los nuevos presupuestos admiten hasta **10 categorías** para validar todos sus valores sin superar el límite de evaluación de reglas. Las copias antiguas con más categorías se conservan y pueden leerse; deben reducirse antes de guardar con las reglas nuevas. Las fotos antiguas embebidas se conservan; al modificarlas se separan en documentos de contenido inmutable. No se purgan automáticamente fotos históricas ni tombstones porque podrían ser necesarios para recuperación o sincronización entre dispositivos.

## App Check: activar gradualmente

El soporte está implementado, pero **no está habilitado por defecto**. No basta con cambiar una variable:

1. Registra la app Android en Firebase → App Check con Play Integrity y su SHA-256 de firma. Para una APK distribuida desde GitHub, configura los requisitos para distribución fuera de Google Play: no exigir `PLAY_RECOGNIZED`/`LICENSED` sin comprobar que estos APK pueden obtener el veredicto. No uses tokens de depuración en producción.
2. Registra la app web con reCAPTCHA Enterprise y sus dominios. Configura `VITE_FIREBASE_APP_CHECK_SITE_KEY` con la clave pública del sitio.
3. Activa `VITE_FIREBASE_APP_CHECK_ENABLED=true` y recompila. Android proporciona el token nativo mediante un `CustomProvider` del SDK web; la web usa reCAPTCHA Enterprise. Firebase administra su caché y renovación.
4. Comprueba primero las métricas y que funcionan acceso, lectura, guardado, fotos y actualizaciones en Vercel y en el APK. Activa la aplicación obligatoria en Firestore solo después. Activarla antes bloquearía clientes legítimos.

## Pruebas

```sh
npm ci
npm test
npm run lint
npm run build
npm audit
npx --yes --package firebase-tools@15.32.1 firebase emulators:exec --only firestore --project demo-miser "npm run test:rules"
```

Las pruebas de reglas trabajan únicamente con el proyecto de emulación `demo-miser`. GitHub ejecuta estas pruebas antes de empaquetar y verifica que el APK no sea depurable. La validación de caché, paginación, saldo completo, versiones, fotos separadas y migración cifrada tiene pruebas adicionales. La actualización de `@grpc/grpc-js` se limita a una versión 1.x compatible; no se degradó Firebase ni se usó `npm audit fix --force`.

## Validación en el Redmi Note 10 Pro

No se afirma un porcentaje de ahorro de batería sin medirlo. Antes de considerar la versión verificada:

- Instalar el release sobre el APK anterior sin desinstalar. Confirmar sesión, saldo, fotos y recuperación existentes.
- Activar el bloqueo, cancelar el prompt, volver con huella/PIN, salir más de un minuto y probar selección de fotos y recientes.
- Cortar conexión durante un guardado, reiniciar la app y verificar que conserva recuperación. Resolver un conflicto entre dos dispositivos sin reemplazar sus datos.
- Probar historial grande, varias fotos, búsqueda, calendario y cambios rápidos durante sincronización.
- Comparar 15 minutos de uso equivalente y 24 horas de reposo con la versión anterior, misma red/brillo/frecuencia de pantalla. Registrar batería del sistema, memoria, tráfico y tiempos; usar Perfetto/ADB si están disponibles, sin necesidad de instalar Android Studio.

La consulta automática de actualizaciones tiene un intervalo mínimo de una hora; el botón manual lo omite. Los avisos de WorkManager mantienen seis horas, conexión y batería no baja. Android/MIUI puede aplazarlos. El instalador sigue requiriendo confirmación: MiSer no instala APK silenciosamente.
