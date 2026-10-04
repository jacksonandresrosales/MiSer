# Actualizaciones del APK de MiSer

## Para quien usa la app

La primera APK que incluya el actualizador debe instalarse manualmente, encima de la instalación anterior y sin desinstalarla. Las APK antiguas no pueden incorporar esta función por sí solas.

Después:

1. MiSer comprueba las versiones al abrirse, incluso antes de iniciar sesión. Al volver al primer plano reutiliza un intervalo de espera de una hora para evitar consultas repetidas; la búsqueda manual no espera ese intervalo.
2. Si hay una versión más nueva, muestra **Descargar e instalar**. También puedes buscarla en **Ajustes → Actualizaciones de MiSer**.
3. Para recibir avisos con la app cerrada, activa **Avisarme de nuevas versiones** y permite las notificaciones de Android.
4. La descarga solo comienza cuando la pides. Si Android solicita autorizar instalaciones desde MiSer, activa **Permitir de esta fuente**, vuelve a MiSer y pulsa el botón de nuevo.
5. Confirma la instalación en Android. No desinstales MiSer: una actualización con el mismo paquete y firma conserva sus datos.

Los avisos no son push instantáneos: se comprueba cada 6 horas cuando hay conexión y la batería no está baja mediante WorkManager. Android puede retrasarlo por batería, ahorro de datos o restricciones del fabricante; forzar la detención impide ejecutar trabajo hasta volver a abrir la app. No garantiza avisos justo al terminar GitHub. No se permite instalar silenciosamente ni eludir las confirmaciones de Android.

## Publicación en GitHub

El workflow `Build Android APK` prueba la web y Android, verifica Firebase/OAuth y la firma estable y publica después de una compilación correcta de `main`:

- `android-build-N`: APK `MiSer.apk`, checksum SHA-256 y `update.json` de la compilación N. No se reemplaza un APK que ya tenga manifiesto publicado al reejecutar un job.
- `android-latest`: manifiesto del canal, apuntando al APK de una compilación concreta. La descripción de la release enlaza al APK actual.

El repositorio debe permanecer público. La app no contiene un token de GitHub. Solo el workflow usa su `GITHUB_TOKEN` con permiso `contents: write`; no hace falta una credencial personal nueva.

`versionCode` procede de `GITHUB_RUN_NUMBER` y `versionName` es `1.0.N`. Solo una versión con código mayor que el instalado se ofrece como actualización. Reejecutar el mismo run no crea una versión nueva. La publicación evita rebajar el canal y no promueve commits que ya no son la cabeza de `main`.

El canal se crea por primera vez cuando se sube este cambio y termina el workflow correctamente. Publicar este código localmente o hacer público el repositorio no crea la release por sí solo.

## Seguridad y mantenimiento

- Mantén `ANDROID_DEBUG_KEYSTORE_BASE64` y las variables Firebase existentes. Cambiar la firma impide actualizar la instalación anterior y puede romper Google OAuth.
- El workflow está configurado para generar un APK **release**, sin depuración y con reducción de código y recursos. Conserva el certificado estable existente para actualizar sin desinstalar: el nombre histórico del secreto no convierte la compilación en debug. Los APK publicados antes de este cambio pueden seguir siendo debug; solo una nueva ejecución correcta publica la versión endurecida. Esto no sustituye una revisión de distribución comercial o Google Play y de la custodia de la clave.
- Se valida el origen HTTPS del manifiesto y del APK, el esquema, el paquete, el tamaño, el código de versión, SHA-256 y la firma contra la instalación existente. Un archivo que no cumple no abre el instalador.
- El instalador de Android sigue siendo la autoridad final para aceptar y aplicar la actualización.
- No cambies el nombre del workflow o reinicies su contador sin asegurar que los nuevos códigos de versión superan los que ya están instalados.
- El manifiesto del canal se reemplaza solo después de publicar el APK y guardar una copia pública en `previous-update.json`. Si la promoción falla o se interrumpe, el cliente usa esa copia cuando el manifiesto principal responde 404. Las publicaciones se serializan sin cancelar una que esté en curso.
- Si en el futuro se publica en Google Play, se deberá usar su canal de actualizaciones y revisar/eliminar el permiso de instalación de APK externas según sus políticas.

## Verificación

`npm test` incluye pruebas del manifiesto de publicación y de la app. `npm run build` y `npm run lint` comprueban la web. El workflow prueba las reglas en el emulador de Firestore, ejecuta `testReleaseUnitTest` y `assembleRelease` para Android y comprueba que el APK no permite depuración ni copias de seguridad antes de publicar.

Consulta [Seguridad y privacidad](SECURITY.md) para el despliegue gradual de reglas, App Check, la copia cifrada y la comprobación en un teléfono real. Una compilación web local no confirma que el nuevo APK ya esté publicado.

Prueba en un teléfono real: negar/permitir notificaciones, desactivar los avisos, abrir el aviso, descargar sin conexión, autorizar fuentes externas, cancelar y reintentar la instalación, y actualizar de N a N+1 comprobando que se conserva sesión y datos. La compilación web no verifica esos diálogos ni la ejecución en segundo plano.
