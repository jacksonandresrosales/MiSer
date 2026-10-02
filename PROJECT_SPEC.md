# Especificaciones del proyecto MiSer

## Propósito y alcance

MiSer es una aplicación personal en español para organizar dinero y planes cotidianos. La primera entrega es una web adaptable a móvil; la misma base está preparada para empaquetarse con Capacitor en Android en una etapa posterior. La moneda principal es USD. Todos los ingresos y gastos se registran manualmente: no hay conexión bancaria.

## Estado actual

- Web implementada con React 19, TypeScript 6 y Vite 8.
- Interfaz MiSer adaptable, con navegación entre Resumen, Finanzas, Calendario, Objetivos, Compras y Ajustes.
- Firebase Authentication (correo/contraseña o Google) y Cloud Firestore disponibles cuando se configuran las variables de entorno y se publican las reglas de `firestore.rules`. Se exige correo verificado antes de leer o escribir datos. La recuperación de contraseña usa el manejador predeterminado de Firebase.
- Sin Firebase configurado, la aplicación muestra una vista previa del acceso con la opción de explorar el demo. Los cambios del demo se guardan en `localStorage` (`miser-demo`; también lee la clave anterior `brisa-demo` para conservar datos existentes). El demo permite volver a esa pantalla desde el perfil, el aviso superior o Ajustes.
- El resumen consulta una API pública de frases en español al abrirse y al pedir otra frase. Conserva localmente las frases ya vistas para evitar repeticiones en ese navegador; si la API falla, usa la colección local de respaldo. La API puede incluir autores de distintos ámbitos y no siempre entrega la obra original.
- El tema claro/oscuro se puede cambiar desde Ajustes o con el control rápido junto a recordatorios. La preferencia se guarda en `localStorage` por navegador. Las transiciones de controles y navegación usan una escala común y respetan la preferencia de movimiento reducido del sistema.
- Ajustes permite editar el nombre visible y subir, reemplazar o quitar la foto de perfil. La cabecera y el menú lateral usan ese perfil, no el correo. La foto de Google se utiliza como valor inicial cuando no hay un perfil personalizado. Las fotos del dispositivo se recortan al centro y se reducen a JPEG de hasta 256 × 256 y 140 000 caracteres; no requieren Cloud Storage.
- El perfil se guarda en `finance_data/{uid}.profile` con una escritura combinada que conserva los registros y la copia histórica. Utiliza las reglas de acceso existentes; no hace falta abrir nuevas colecciones. En el demo se guarda por separado en `miser-demo-profile`. El nombre no es un identificador único ni cambia el acceso con Google o correo.
- La pantalla de inicio preferida y la opción de movimiento reducido se guardan por dispositivo en `miser-preferences`. El movimiento reducido del sistema sigue teniendo prioridad aunque la opción de la app esté apagada. Las cuentas de correo/contraseña pueden solicitar un enlace de cambio desde Ajustes; no se modifica la contraseña en la app.
- Configuración base de Capacitor con `appId: com.miser.finanzas` y `appName: MiSer`. Todavía no se entrega un APK.
- Primera etapa Kotlin en `kotlin/`: núcleo compatible con los datos actuales e interfaz Compose compartida para Android y web. Incluye resumen, movimientos y objetivos en demostración local. Authentication y Firestore aún pertenecen al cliente React; consultar `kotlin/README.md` para requisitos y comandos.
- La interfaz Kotlin para teléfono usa controles de cristal translúcido, navegación inferior flotante, transiciones de pantalla y menús por registro. Los movimientos se crean en una hoja inferior con teclado decimal y calendario; las fechas del calendario se interpretan en UTC para evitar desplazamientos por zona horaria.

## Funciones

### Finanzas

- Crear, editar y eliminar ingresos y gastos con título, importe, categoría, fecha y nota opcional.
- Definir un presupuesto mensual total y límites por categoría.
- Calcular ingresos, gastos y saldo neto del mes a partir de los movimientos del mes. El disponible del presupuesto es `límite total − gastos`.
- Buscar movimientos por título o categoría y mostrar resúmenes en el dashboard.

### Calendario

- Vistas semanal y mensual, navegación entre semanas o meses y detalle del día seleccionado.
- Crear, editar y eliminar eventos y pagos. Cada entrada tiene fecha; puede incluir hora, lugar, categoría, nota y recordatorio. Los pagos pueden incluir importe.
- La web muestra los eventos próximos en la interfaz. **Aún no hay programación o envío automático de notificaciones**; no se solicita permiso al navegador hasta que exista esa función. Las notificaciones nativas de Android pertenecen a la segunda etapa.

### Objetivos y compras

- Crear objetivos del año escribiendo solo un nombre, marcarlos como cumplidos con una casilla, editarlos o eliminarlos. Los objetivos anteriores conservan sus datos numéricos, aunque ya no se muestran esos campos.
- Crear varias listas de compras, indicar tienda o categoría, agregar y editar artículos, marcarlos como comprados y quitarlos.
- Cada artículo puede guardar descripción, cantidad, precio estimado, imagen de referencia y varios enlaces de compra. La imagen puede venir de una URL o de un archivo del dispositivo; los archivos se reducen y guardan como JPEG en el documento individual del artículo. No se usa Cloud Storage, que requiere el plan Blaze.

## Datos y privacidad

`src/types.ts` define `FinanceData` con cinco conjuntos: `transactions`, `events`, `goals`, `lists` y `budgets`. En modo autenticado, los registros se guardan individualmente en `finance_data/{uid}/records/{id}`; las imágenes reducidas forman parte del artículo, no de un documento global. Al cargar, la app migra automáticamente el antiguo `finance_data/{uid}.data` y conserva ese documento como copia histórica. Las reglas de `firestore.rules` restringen lectura y escritura al propietario con correo verificado. La configuración web de Firebase puede estar en el frontend; nunca debe incluirse una cuenta de servicio en la web.

En modo demo, los datos son locales al navegador y no se sincronizan entre dispositivos. La interfaz debe indicarlo con claridad. Al modificar datos autenticados, la app guarda solo los registros cambiados tras una breve espera. Cada escritura comprueba la versión del registro; si otro dispositivo modificó ese mismo registro, se detiene sin sobrescribirlo. Los cambios pendientes se conservan localmente para reintentar o exportar.

Si Firebase falla al cargar, la app no muestra datos vacíos ni los guarda sobre los existentes; ofrece reintentar e indica si Firestore denegó el acceso. Antes de escribir comprueba que los datos cargados pertenecen al usuario de la sesión actual. El modo demo no migra automáticamente sus datos a una cuenta. Ajustes permite descargar una copia JSON de los datos visibles.

Las imágenes cargadas desde el dispositivo ocupan espacio en `localStorage` durante el demo o mientras haya cambios pendientes, y en su documento individual de Firestore tras sincronizar. Los enlaces externos de imagen y compra dependen de que la página de origen siga disponible. Si el navegador se queda sin espacio, la app informa que no pudo guardar la copia local.

## Estructura relevante

| Ruta | Función |
| --- | --- |
| `src/App.tsx` | Navegación, pantallas, formularios, estado y persistencia. |
| `src/MiSer.css` | Diseño adaptable y sistema visual de MiSer. |
| `src/types.ts` | Contrato de datos de TypeScript. |
| `src/quotes.ts` | Frases filosóficas, atribución y enlaces a los textos fuente. |
| `api/quote.js` | Proxy de la API de frases para despliegues en Vercel, donde el navegador no puede consultar directamente la fuente por CORS. |
| `src/demoData.ts` | Datos iniciales del modo demo. |
| `src/firebase.ts` | Configuración de Firebase Authentication y Cloud Firestore. |
| `src/financeData.ts` y `src/financeStore.ts` | Conversión de registros, migración y sincronización con control de versiones. |
| `src/userProfile.ts` | Validación del perfil, fotos seguras, iniciales y preferencias locales. |
| `firestore.rules` | Reglas de acceso por usuario. |
| `.env.example` | Variables públicas necesarias para Firebase. |
| `public/favicon.svg` | Ícono vectorial de MiSer usado en la web. |
| `capacitor.config.ts` | Identidad y carpeta web para Android. |

## Diseño

La marca usa el nombre **MiSer** y un monograma “M” blanco con trazo verde y punto dorado sobre una base oscura con sombra rosa. El fondo principal es crema (`#F8F7F2`), la tinta es pizarra (`#1E293B`) y el acento principal es un degradado violeta a rosa (`#7665E8`, `#A577ED`, `#F28EAE`). Outfit se usa en títulos y Plus Jakarta Sans en texto general. La navegación lateral pasa a menú desplegable en pantallas pequeñas; el calendario semanal permite desplazamiento horizontal.

## Configuración y comandos

1. Usar Node.js 24 o posterior y ejecutar `npm install`.
2. Ejecutar `npm run dev` para desarrollo, `npm run build` para compilar o `npm test` para las comprobaciones básicas.
3. Para activar cuentas privadas, configurar Firebase Authentication (correo/contraseña y Google) y crear Cloud Firestore. En Authentication → Configuración → Dominios autorizados, incluir el dominio de la app y `localhost` si se probará localmente.
4. En Firebase Console → Firestore Database → **Reglas**, reemplazar las reglas actuales por el contenido completo de `firestore.rules` y pulsar **Publicar**. Guardar el archivo local no publica las reglas. Es necesario para que funcione la subcolección `records` y se exija correo verificado.
5. Reiniciar el servidor de desarrollo después de cambiar variables de entorno.

## Criterios para futuras implementaciones

- Mantener el texto de la interfaz en español y los importes en USD.
- Conservar la compatibilidad de datos de `FinanceData` al añadir campos; los usuarios pueden tener documentos creados con versiones anteriores.
- Mantener el aislamiento por cuenta de Firebase y la distinción visible entre datos locales y sincronizados.
- El historial de frases vistas se conserva en `localStorage` por navegador; no se sincroniza entre dispositivos y solo puede impedir repeticiones mientras la fuente devuelva frases nuevas.
- Completar la programación real de recordatorios antes de prometer notificaciones automáticas en web o Android.
- Para el APK, añadir la plataforma Android, integrar notificaciones nativas y comprobar instalación, sesión, sincronización y permisos en un dispositivo.
