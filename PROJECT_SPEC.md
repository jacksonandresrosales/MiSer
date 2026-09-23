# Especificaciones del proyecto MiSer

## Propósito y alcance

MiSer es una aplicación personal en español para organizar dinero y planes cotidianos. La primera entrega es una web adaptable a móvil; la misma base está preparada para empaquetarse con Capacitor en Android en una etapa posterior. La moneda principal es USD. Todos los ingresos y gastos se registran manualmente: no hay conexión bancaria.

## Estado actual

- Web implementada con React 19, TypeScript 6 y Vite 8.
- Interfaz MiSer adaptable, con navegación entre Resumen, Finanzas, Calendario, Objetivos, Compras y Ajustes.
- Supabase Auth y almacenamiento privado disponibles cuando se configuran las variables de entorno y se ejecuta `supabase/schema.sql`.
- Sin Supabase configurado, la aplicación usa datos de demostración y guarda los cambios en `localStorage` (`miser-demo`; también lee la clave anterior `brisa-demo` para conservar datos existentes).
- El resumen consulta una API pública de frases en español al abrirse y al pedir otra frase. Conserva localmente las frases ya vistas para evitar repeticiones en ese navegador; si la API falla, usa la colección local de respaldo. La API puede incluir autores de distintos ámbitos y no siempre entrega la obra original.
- El tema claro/oscuro se puede cambiar desde Ajustes o con el control rápido junto a recordatorios. La preferencia se guarda en `localStorage` por navegador. Las transiciones de controles y navegación usan una escala común y respetan la preferencia de movimiento reducido del sistema.
- Configuración base de Capacitor con `appId: com.miser.finanzas` y `appName: MiSer`. Todavía no se entrega un APK.

## Funciones

### Finanzas

- Crear, editar y eliminar ingresos y gastos con título, importe, categoría, fecha y nota opcional.
- Definir un presupuesto mensual total y límites por categoría.
- Calcular ingresos, gastos y saldo neto del mes a partir de los movimientos del mes. El disponible del presupuesto es `límite total − gastos`.
- Buscar movimientos por título o categoría y mostrar resúmenes en el dashboard.

### Calendario

- Vistas semanal y mensual, navegación entre semanas o meses y detalle del día seleccionado.
- Crear, editar y eliminar eventos y pagos. Cada entrada tiene fecha; puede incluir hora, lugar, categoría, nota y recordatorio. Los pagos pueden incluir importe.
- La web permite solicitar permiso de notificaciones del navegador y muestra los eventos próximos en la interfaz. **Aún no hay programación o envío automático de notificaciones**; las notificaciones nativas de Android pertenecen a la segunda etapa.

### Objetivos y compras

- Crear, editar y eliminar objetivos anuales con tipo, meta numérica, progreso actual, unidad y fecha objetivo.
- Crear varias listas de compras, indicar tienda o categoría, agregar y editar artículos, marcarlos como comprados y quitarlos.
- Cada artículo puede guardar descripción, cantidad, precio estimado, imagen de referencia y varios enlaces de compra. La imagen puede venir de una URL o de un archivo del dispositivo; los archivos se reducen y guardan como JPEG dentro del documento de datos.

## Datos y privacidad

`src/types.ts` define `FinanceData` con cinco colecciones: `transactions`, `events`, `goals`, `lists` y `budgets`. En modo autenticado, cada usuario tiene una fila en `public.finance_data` con `user_id` y un documento `data` JSONB. Las políticas RLS de `supabase/schema.sql` restringen lectura, inserción y actualización a la cuenta propietaria. El cliente usa la clave pública de Supabase; nunca debe incluirse una clave `service_role` en la web.

En modo demo, los datos son locales al navegador y no se sincronizan entre dispositivos. La interfaz debe indicarlo con claridad. Al modificar datos autenticados, la app sincroniza el documento completo con Supabase tras una breve espera.

Las imágenes cargadas desde el dispositivo ocupan espacio dentro de `FinanceData`, tanto en `localStorage` como en Supabase. Los enlaces externos de imagen y compra dependen de que la página de origen siga disponible. Si el navegador se queda sin espacio, la app informa que no pudo guardar los cambios locales.

## Estructura relevante

| Ruta | Función |
| --- | --- |
| `src/App.tsx` | Navegación, pantallas, formularios, estado y persistencia. |
| `src/MiSer.css` | Diseño adaptable y sistema visual de MiSer. |
| `src/types.ts` | Contrato de datos de TypeScript. |
| `src/quotes.ts` | Frases filosóficas, atribución y enlaces a los textos fuente. |
| `api/quote.js` | Proxy de la API de frases para despliegues en Vercel, donde el navegador no puede consultar directamente la fuente por CORS. |
| `src/demoData.ts` | Datos iniciales del modo demo. |
| `src/supabase.ts` | Configuración del cliente Supabase. |
| `supabase/schema.sql` | Tabla y políticas RLS. |
| `public/favicon.svg` | Ícono vectorial de MiSer usado en la web. |
| `capacitor.config.ts` | Identidad y carpeta web para Android. |

## Diseño

La marca usa el nombre **MiSer** y un monograma “M” blanco con trazo verde y punto dorado sobre una base oscura con sombra rosa. El fondo principal es crema (`#F8F7F2`), la tinta es pizarra (`#1E293B`) y el acento principal es un degradado violeta a rosa (`#7665E8`, `#A577ED`, `#F28EAE`). Outfit se usa en títulos y Plus Jakarta Sans en texto general. La navegación lateral pasa a menú desplegable en pantallas pequeñas; el calendario semanal permite desplazamiento horizontal.

## Configuración y comandos

1. Usar Node.js 20 o posterior y ejecutar `npm install`.
2. Ejecutar `npm run dev` para desarrollo o `npm run build` para compilar.
3. Para activar cuentas privadas, crear un proyecto Supabase, ejecutar `supabase/schema.sql`, copiar `.env.example` a `.env.local` y establecer `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Reiniciar el servidor de desarrollo después de cambiar variables de entorno.

## Criterios para futuras implementaciones

- Mantener el texto de la interfaz en español y los importes en USD.
- Conservar la compatibilidad de datos de `FinanceData` al añadir campos; los usuarios pueden tener documentos JSONB creados con versiones anteriores.
- Mantener el aislamiento por cuenta de Supabase y la distinción visible entre datos locales y sincronizados.
- El historial de frases vistas se conserva en `localStorage` por navegador; no se sincroniza entre dispositivos y solo puede impedir repeticiones mientras la fuente devuelva frases nuevas.
- Completar la programación real de recordatorios antes de prometer notificaciones automáticas en web o Android.
- Para el APK, añadir la plataforma Android, integrar notificaciones nativas y comprobar instalación, sesión, sincronización y permisos en un dispositivo.
