# Rediseño de MiSer (noviembre de 2026)

Rama `rediseno-miser`. Dirección visual elegida: **Obsidiana y ámbar** (oscura por defecto, tema claro opcional).

## Qué cambió

**Visual**
- Sistema de diseño en `src/styles/tokens.css` (color, tipografía Sora + Manrope, escala de 7 tamaños, espaciado base 4, radios, sombras, movimiento) y `src/styles/app.css` (componentes y pantallas). Sustituye nueve hojas anteriores, incluido `MiSer.css` minificado.
- Logo nuevo en web (`public/favicon.svg`) y Android (`drawable/miser_mark.xml`), fondo oscuro al abrir la APK.
- Barra inferior de cristal, botón «+» flotante que añade según la pantalla, menú lateral en escritorio.
- Texto mínimo de 12 px, áreas táctiles de 48 px con puntero táctil (también en tabletas en horizontal), foco visible y contraste AA en ambos temas.

**Experiencia de uso**
- Al guardar aparece una confirmación; al eliminar se borra al momento con «Deshacer» durante 5 s. Los diálogos nativos se sustituyeron por uno propio.
- Formulario de movimiento: monto primero con teclado decimal (acepta coma), concepto opcional, categorías separadas para gasto e ingreso, atajos Hoy y Ayer, y botones Eliminar y Duplicar al editar.
- Presupuesto por filas (categoría y monto), sin valores inventados, y heredado del mes anterior. «Gastos del mes» ya no incluye los gastos programados; se indican aparte.
- Movimientos agrupados por día, con la etiqueta «Programado». Calendario de 7 columnas y una sola acción de añadir.
- Demostración disponible también en la APK. La verificación del correo se detecta sola.
- Conflictos de sincronización con salida («Usar la de la nube» o «Conservar la mía») y reintento al volver la conexión.
- Atrás de Android vuelve a la pestaña anterior; cada pestaña conserva su scroll, la búsqueda y el día del calendario.

**Rendimiento**
- Todas las pantallas y el formulario se cargan bajo demanda; React y Firebase van en archivos separados. El JS inicial de la app pasa de 571 kB a unos 87 kB (más los dos vendors cacheables).
- Con cuenta, la copia local cifrada se muestra al instante en solo lectura mientras responde la nube; la escritura en disco ya no bloquea la primera pantalla.
- Los cambios se guardan en una sola transacción por grupo (hasta 150 registros), con el mismo control de versiones.
- La sincronización incremental queda activada por defecto en el workflow de Android.

## Pendiente
- Requiere tener publicadas en Firebase las reglas actuales de `firestore.rules` (exigen `updatedAt`) para que la sincronización incremental sea segura. Se puede desactivar con la variable de repositorio `VITE_FIRESTORE_INCREMENTAL_SYNC=false`.
- No se cambió la lectura del campo heredado `data` del documento raíz: necesita una regla nueva y pruebas con el emulador.
- Falta probar la APK en un teléfono: arranque, Atrás, teclado decimal, texto ampliado, TalkBack y sincronización con una cuenta de prueba.
- Las capturas de `docs/screenshots` y del README corresponden al diseño anterior.
