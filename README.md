<p align="center">
  <img src="public/favicon.svg" alt="Logo de MiSer" width="88" height="88">
</p>

<h1 align="center">MiSer</h1>

<p align="center">Tus finanzas y tus planes, con más calma.</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" alt="TypeScript 6">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite 8">
  <img src="https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black" alt="Firebase Authentication y Cloud Firestore">
  <img src="https://img.shields.io/badge/Interfaz-en%20espa%C3%B1ol-7665E8" alt="Interfaz en español">
</p>

MiSer es una aplicación personal para llevar ingresos, gastos y presupuestos, organizar eventos y compras, y dar seguimiento a objetivos anuales. Se adapta a pantallas móviles y de escritorio; los movimientos se registran manualmente y la moneda principal es USD.

## Qué puedes hacer

- **Finanzas:** registrar ingresos y gastos, clasificarlos y consultar el saldo del mes, con presupuesto total y límites por categoría.
- **Calendario:** organizar eventos y pagos en vistas semanal y mensual.
- **Objetivos:** escribir objetivos de año nuevo y marcarlos como cumplidos con una casilla.
- **Compras:** crear listas, marcar artículos y guardar precios estimados, imágenes y enlaces.
- **Resumen:** ver los gastos del mes, el presupuesto, próximos eventos y objetivos, y una frase para el día.
- **Perfil:** elegir un nombre visible y subir, cambiar o quitar tu foto. El correo queda reservado a la sección de cuenta.
- **Personalización:** usar tema claro u oscuro, elegir la pantalla de inicio, reducir las animaciones y exportar una copia JSON de los datos.
- **Seguridad:** solicitar un enlace de cambio de contraseña para cuentas de correo/contraseña. Las cuentas de Google administran su contraseña en Google.
- **Acceso privado:** iniciar sesión con correo y contraseña o con Google mediante Firebase Authentication.

## Requisitos

- Node.js 24 o posterior.
- npm.
- Un proyecto de Firebase para usar cuentas y sincronizar datos. Sin Firebase configurado, puedes explorar la demostración; los cambios del demo se guardan solo en el navegador.

## Ejecutar localmente

1. Clona el repositorio e instala las dependencias:

   ```bash
   git clone https://github.com/jacksonandresrosales/MiSer.git
   cd MiSer
   npm install
   ```

2. Copia `.env.example` con el nombre `.env.local` y completa sus valores con la configuración de la aplicación web de Firebase.

   En PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. En Firebase Console, activa los métodos de acceso **Correo electrónico/contraseña** y **Google**, crea Cloud Firestore y agrega `localhost` a los dominios autorizados de Authentication.

4. Publica las reglas de acceso de [firestore.rules](firestore.rules) en **Firestore Database → Reglas**. Estas permiten leer y escribir únicamente los registros del usuario autenticado cuando su correo está verificado.

5. Inicia la aplicación:

   ```bash
   npm run dev
   ```

Las variables que debes completar en `.env.local` son:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

La configuración web de Firebase se usa en el cliente. **No agregues una cuenta de servicio ni su clave privada al frontend.** `.env.local` está excluido de Git.

## Comandos

| Comando | Acción |
| --- | --- |
| `npm run dev` | Inicia el servidor local de desarrollo. |
| `npm run build` | Comprueba TypeScript y crea la compilación de producción. |
| `npm run preview` | Sirve localmente la compilación creada. |
| `npm run lint` | Revisa el código con Oxlint. |
| `npm test` | Ejecuta las pruebas de lógica de datos. |

## Datos y alcance

Con Firebase, los datos se guardan en Cloud Firestore bajo la cuenta del usuario. La aplicación migra el formato anterior al nuevo almacenamiento por registros. En modo demo, los datos permanecen en `localStorage` y no se sincronizan con la cuenta.

MiSer no se conecta a cuentas bancarias y no envía notificaciones automáticas.

## APK Android con GitHub Actions

La versión React se empaqueta con Capacitor para Android 7 o posterior, sin instalar Android Studio en tu PC. En **Actions → Build Android APK**, ejecuta el workflow sobre `main` o abre la compilación automática del último cambio. Descarga el artefacto **MiSer-Android**, descomprime el ZIP e instala `MiSer.apk` en tu teléfono. Incluye el certificado y un checksum SHA-256 para comprobar la descarga.

La compilación exige las seis variables `VITE_FIREBASE_*` de arriba en **Settings → Secrets and variables → Actions → Variables** (también acepta secretos del mismo nombre, con prioridad). Son configuración pública del cliente, no credenciales de administrador. Si falta alguna, el workflow falla en vez de publicar una APK demo.

El secreto `ANDROID_DEBUG_KEYSTORE_BASE64` contiene la clave de firma de desarrollo en base64, protegida por GitHub Secrets. Se reutiliza en cada compilación para mantener el certificado y permitir actualizaciones. Conserva una copia privada de la clave; nunca la subas al repositorio. Una APK anterior con otra firma requiere desinstalarse antes de instalar esta: guarda tus datos primero, porque desinstalar elimina los datos locales.

Esta es una **APK de pruebas**, no una versión para Google Play. Incluye perfil, finanzas, ajustes y exportación JSON mediante el diálogo nativo de compartir. La tarjeta de frases se mantiene con las frases incluidas en la aplicación.

**Google en Android:** el botón abre el selector nativo de cuentas y usa su credencial para iniciar la misma sesión de Firebase que gestiona los datos de la app. En la web mantiene la ventana de Google. Android conserva la sesión al reiniciar mediante IndexedDB; no crea una segunda sesión de Firebase nativa.

`android/app/google-services.json` contiene la configuración pública de la app `com.miser.finanzas`, el cliente OAuth web y la SHA-1 de la firma estable registrada en Firebase. GitHub comprueba que el proyecto y la firma coincidan antes de publicar la APK. Si cambias la firma o publicas en Google Play, registra también el certificado correspondiente en Firebase y actualiza ese archivo. El flujo completo con una cuenta real debe probarse en un teléfono con servicios de Google Play.

## Tecnologías

React · TypeScript · Vite · Firebase Authentication · Cloud Firestore · Lucide · Capacitor

## Adaptación a Kotlin

La primera etapa de MiSer para Android y web vive en [`kotlin/`](kotlin/README.md), con Kotlin Multiplatform y Compose Multiplatform. Incluye resumen, movimientos y objetivos con almacenamiento local de demostración. La autenticación y sincronización de Firebase se trasladarán en la siguiente etapa; el cliente React continúa disponible durante la migración.
