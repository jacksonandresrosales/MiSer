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
- **Personalización:** usar tema claro u oscuro y exportar una copia JSON de los datos.
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

MiSer no se conecta a cuentas bancarias y no envía notificaciones automáticas. La configuración de Capacitor está preparada para una futura versión Android; este repositorio todavía no incluye un APK.

## Tecnologías

React · TypeScript · Vite · Firebase Authentication · Cloud Firestore · Lucide · Capacitor

## Adaptación a Kotlin

La primera etapa de MiSer para Android y web vive en [`kotlin/`](kotlin/README.md), con Kotlin Multiplatform y Compose Multiplatform. Incluye resumen, movimientos y objetivos con almacenamiento local de demostración. La autenticación y sincronización de Firebase se trasladarán en la siguiente etapa; el cliente React continúa disponible durante la migración.
