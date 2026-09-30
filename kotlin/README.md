# MiSer en Kotlin

Primera etapa de la adaptación a **Kotlin Multiplatform y Compose Multiplatform**, con interfaz compartida para Android y web. El cliente React de la raíz continúa funcionando durante la migración.

## Qué funciona en esta etapa

- Resumen con gastos del mes, presupuesto, movimientos recientes y tarjeta de frases.
- Crear, editar, buscar y eliminar ingresos y gastos.
- Crear objetivos con un nombre, marcarlos como cumplidos, editarlos y eliminarlos.
- Tema claro y oscuro, navegación adaptable y exportación de una copia JSON.
- Interfaz móvil con botones de cristal translúcido, barra inferior flotante con selección animada y objetivos que se marcan tocando toda la fila.
- Formularios de movimientos en una hoja inferior, teclado decimal, selector de fecha y confirmación al guardar. Editar y eliminar están en el menú de cada registro.
- Transiciones breves que respetan el movimiento reducido, búsqueda con botón para limpiar y conservación de la búsqueda al cambiar de pantalla.
- Almacenamiento local de demostración: `localStorage` en web y preferencias privadas en Android.

Esta vista previa **todavía no inicia sesión ni sincroniza con Firebase**. Los datos de cuentas existentes continúan en Firestore y no son modificados por este cliente. El calendario, las compras y la edición de presupuestos siguen disponibles en la versión React.

## Estructura

| Módulo | Responsabilidad |
| --- | --- |
| `shared` | Modelos, validación, conversión de registros, pruebas e interfaz Compose. |
| `webApp` | Entrada del navegador, almacenamiento local y descarga JSON. |
| `androidApp` | Aplicación nativa Android, almacenamiento privado y exportación de archivos. |

Las cinco colecciones y los campos existentes de `src/types.ts` se conservan en los modelos Kotlin. El formato de registros coincide con `src/financeData.ts`, incluyendo objetivos antiguos, orden de listas e imágenes de artículos. Las pruebas verifican esa compatibilidad.

En el navegador, el cliente puede leer una copia de demostración de `miser-demo` cuando está disponible en **el mismo origen**. Guarda sus cambios en `miser-kotlin-demo`, una clave independiente. Un formato local inválido bloquea la carga y permite exportar la copia; no se sustituye por datos vacíos.

## Requisitos

- JDK 21, con `java` en el PATH o `JAVA_HOME` configurado.
- La primera compilación descarga Gradle y las dependencias.
- Para Android: Android SDK Platform 36 y Build Tools 36.0.0 o posteriores compatibles, instalados desde Android Studio.
- Para web: un navegador moderno con soporte de WebAssembly GC.

El proyecto fija Kotlin 2.4.20, Compose Multiplatform 1.12.1, Android Gradle Plugin 9.3.1 y Gradle 9.7.0. El wrapper comprueba el checksum de la distribución de Gradle.

## Ejecutar la web

Desde esta carpeta, en PowerShell:

```powershell
.\gradlew.bat :webApp:wasmJsBrowserDevelopmentRun
```

El servidor de desarrollo muestra su dirección local, normalmente `http://localhost:8080`.

Para compilar la web de producción:

```powershell
.\gradlew.bat :webApp:wasmJsBrowserDistribution
```

## Ejecutar Android

Abre la carpeta `kotlin` en Android Studio y selecciona la configuración `androidApp` junto a un emulador o dispositivo Android 8.0 o posterior.

Si Gradle no encuentra el SDK, crea `kotlin/local.properties` con su ubicación. Ejemplo para Windows:

```properties
sdk.dir=C:/Users/TU_USUARIO/AppData/Local/Android/Sdk
```

Para generar un APK de desarrollo:

```powershell
.\gradlew.bat :androidApp:assembleDebug
```

El APK se genera en `androidApp/build/outputs/apk/debug/`. Esta vista previa no requiere `google-services.json`.

Si el proyecto está en OneDrive y aparecen errores al borrar cachés de compilación, agrega una ubicación local a `local.properties`:

```properties
miser.buildRoot=C:/Users/TU_USUARIO/AppData/Local/MiSerKotlin/build
```

En ese caso, cada módulo genera sus archivos bajo esa carpeta; por ejemplo, el APK queda en `androidApp/outputs/apk/debug/`. `local.properties` está excluido de Git.

## Verificar el núcleo compartido

```powershell
.\gradlew.bat :shared:jvmTest
```

Estas pruebas se ejecutan en Java, sin emulador. Comprueban los registros existentes, las imágenes, los objetivos antiguos, los importes y la validación de fechas.

En macOS o Linux, los mismos comandos usan `./gradlew`.

## Próximas etapas

1. Trasladar Authentication y la sincronización versionada de Firestore, conservando `finance_data/{uid}/records/{id}` y las reglas de acceso actuales.
2. Adaptar calendario, listas de compras y ajustes de presupuesto.
3. Comprobar ambos clientes con datos reales, preparar la firma Android y publicar la nueva web.
