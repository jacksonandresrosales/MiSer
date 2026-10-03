# Adaptación móvil de MiSer

Cambios locales del 3 de octubre de 2026. La aplicación Android sigue usando React y Capacitor, sin migrar a Expo.

- Una sola navegación en teléfono, también en horizontal: barra inferior para las cinco secciones y ajustes desde la foto de perfil. El menú lateral se renderiza únicamente en escritorio.
- Calendario semanal compacto en móvil: siete días visibles, dos filas en teléfonos estrechos, agenda debajo y acceso a Hoy. Semana amplia en escritorio y vista mensual conservadas.
- Listas de compras compactas, con edición y eliminación de listas en el menú de opciones; conservan artículos, fotos, precios, cantidades y enlaces.
- Botones móviles principales de 48 px, textos secundarios más legibles y títulos sin duplicación. La equivalencia física en Android debe comprobarse en el dispositivo.
- El saldo en resumen y movimientos incluye registros hasta hoy. La búsqueda tiene un subtotal separado y los futuros se etiquetan como programados. La lista renderiza inicialmente 50 movimientos.
- Cierre de formularios con confirmación visible de descarte cuando hay cambios. El botón Atrás de Android cierra primero el formulario, vuelve al resumen y solo entonces sale.
- Ajustes sin columnas vacías en el control de actualizaciones; interruptores con área táctil de 48 px y pista visual de 32 px. El botón para cambiar de frase reserva su propio espacio de 48 px, sin invadir el texto.
- Destello azul de WebView desactivado, manteniendo el foco visible de teclado. Entrada de pantalla de 250 ms sin desenfoque ni rebotes, respuesta breve al tocar y respeto de la preferencia de movimiento reducido.
- La campana representa eventos futuros marcados para recordatorios; no promete notificaciones del sistema. Las frases de Android son locales y vuelven a rotar al terminar la colección.
- Copia local validada y aislada por cuenta después de cargar Firebase. Sin conexión se permite consultar/exportar, no editar. Los pendientes se restauran al reconectar y se conserva la comprobación de versiones. Si la carga falla, hay exportación de recuperación local, incluso sin un snapshot completo.

Se conservan la tarjeta de frases, la paleta y los dibujos del resumen.

## Verificación

Pruebas automatizadas de dinero, perfiles, Google, caché, aislamiento, recuperación, fechas inválidas, navegación Atrás y rotación de frases. Compilación web y sincronización de plugins Android. Revisión responsive con datos de demostración en claro/oscuro y prueba interactiva de la protección de formularios. No se escribieron datos en Firebase ni se publicaron capturas personales.

Pendiente antes de entregar un APK actualizado:

1. Compilarlo en GitHub e instalarlo sobre la versión anterior.
2. Probar Atrás, teclado, barras de Android, texto ampliado y accesibilidad en un teléfono real.
3. Con una cuenta de prueba, cargar online, abrir de nuevo offline, exportar y reconectar. Verificar conflictos entre dos dispositivos.

La consulta inicial de Firestore todavía obtiene la colección completa; la paginación de esta entrega limita el renderizado, no las lecturas de Firebase. La compilación mantiene el aviso de tamaño del bundle y las dos advertencias existentes de efectos React. `npm audit` señala cinco alertas altas heredadas de la dependencia transitiva `@grpc/grpc-js@1.9.16` que fija Firebase; no se aplicó el downgrade mayor sugerido automáticamente.

La revisión inicial se realizó localmente. La publicación del APK y su canal de actualización se describen en [Actualizaciones Android](actualizaciones-android.md).
