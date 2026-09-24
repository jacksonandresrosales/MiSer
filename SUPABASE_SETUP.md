# Activar las cuentas de MiSer

La pantalla de acceso aparece cuando MiSer recibe la URL y la clave pública de un proyecto Supabase. Hasta entonces, la aplicación sigue en modo de demostración y guarda datos únicamente en este navegador.

## 1. Crear el proyecto

En [Supabase Dashboard](https://supabase.com/dashboard), crea una organización si hace falta y un proyecto llamado **MiSer**. Elige una región cercana a quienes usarán la aplicación. La contraseña de la base de datos se introduce únicamente en Supabase; no va en el repositorio ni en MiSer.

## 2. Crear el almacenamiento privado

En **SQL Editor**, ejecuta el contenido completo de [`supabase/schema.sql`](supabase/schema.sql). Crea la tabla `public.finance_data` con Row Level Security: cada sesión autenticada puede leer y escribir solo la fila cuyo `user_id` coincide con su cuenta. El rol anónimo no recibe permisos sobre la tabla.

## 3. Configurar Auth

En **Authentication → Providers**, deja activado **Email** y la confirmación de correo. En **Authentication → URL Configuration**, usa el dominio final de MiSer en **Site URL** y añade a **Redirect URLs** el mismo dominio y `http://localhost:5173` para desarrollo. La app usa esos orígenes para los enlaces de confirmación y recuperación.

En **Authentication → Settings**, configura una longitud mínima de contraseña de **12 caracteres**. La interfaz la exige al registrarse y al cambiar contraseña, pero la regla del servidor debe proteger también otros clientes. Revisa los límites de solicitudes de Auth y activa CAPTCHA si el registro público recibe abuso.

El correo integrado de Supabase sirve para empezar, pero tiene límites de envío. Antes de invitar usuarios reales, configura un proveedor SMTP propio en **Authentication → SMTP Settings** y confirma que llegan los correos de registro y recuperación.

## 4. Conectar la web

En **Project Settings → API**, copia la **Project URL** y la **publishable key** (o la clave `anon` heredada). En local, copia `.env.example` a `.env.local` y rellena:

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU-CLAVE-PUBLICA
```

Reinicia `npm run dev`. En Vercel, crea las mismas dos variables de entorno para los entornos que vayas a usar y vuelve a desplegar. Añade cada dominio de despliegue que deba recibir enlaces de correo a **Redirect URLs** en Supabase.

**Nunca** uses una clave `service_role`, `secret` ni la contraseña de la base de datos en variables `VITE_`: esas variables se incluyen en el JavaScript entregado al navegador. `.env.local` está excluido de Git.

## 5. Uso

El registro envía un correo de confirmación. El acceso inicia una sesión para cargar los datos privados de esa cuenta. «¿Olvidaste tu contraseña?» envía un enlace para elegir una nueva. Si falla la lectura de datos, MiSer detiene el guardado y ofrece reintentar, evitando reemplazar información con un documento vacío.

Los datos creados en el modo de demostración **no se copian automáticamente** a la cuenta. Permanecen en el navegador que los creó.
