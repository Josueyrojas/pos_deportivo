# POS Deportes Apaseo

Punto de venta web para tienda deportiva, con inventario por **tallas y colores**,
**multiusuario con roles** (admin / cajero), corte de caja y reportes.

Hecho con **React + Vite + Tailwind** en el frontend y **Supabase** (Postgres + Auth + RLS)
en el backend.

---

## 1. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto nuevo (gratis).
2. Ve a **SQL Editor → New query**, pega **todo** el contenido de
   [`supabase/schema.sql`](./supabase/schema.sql) y ejecútalo (**Run**).
   - Crea las tablas, la seguridad por rol (RLS), las funciones de venta y corte,
     el bucket de imágenes de producto y unos productos de ejemplo.
   - Si ya lo habías corrido en una versión anterior (sin imágenes), corre en su
     lugar [`supabase/add-images.sql`](./supabase/add-images.sql) para agregar solo
     lo nuevo.
   - Si ya tenías el proyecto funcionando y quieres las funciones nuevas
     (cancelar/devolver ventas, utilidad en reportes, nombre y logo de la
     tienda), corre [`supabase/update-v2.sql`](./supabase/update-v2.sql).
3. (Recomendado para empezar rápido) En **Authentication → Providers → Email**,
   desactiva **"Confirm email"**. Así los usuarios que crees desde la app pueden
   entrar de inmediato sin confirmar correo.

## 2. Configurar las credenciales

1. En Supabase ve a **Project Settings → API** y copia:
   - **Project URL**
   - **anon public key**
2. En la raíz del proyecto, copia `.env.example` a `.env` y pégalas:

   ```
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-public-key
   ```

## 3. Instalar y correr

```bash
npm install
npm run dev
```

Abre la URL que aparece (normalmente `http://localhost:5173`).

## 4. Crear el primer administrador

El primer usuario no puede crearse desde la app (aún no hay ningún admin), así que:

1. En Supabase, ve a **Authentication → Users → Add user**, y crea tu usuario
   (correo + contraseña).
2. En **SQL Editor**, conviértelo en administrador:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'TU_CORREO');
   ```

3. Inicia sesión en la app con ese correo. Ya como admin, desde **Usuarios**
   puedes crear a los demás (cajeros u otros admins) sin tocar Supabase.

---

## Roles

| Sección          | Admin | Cajero |
|------------------|:-----:|:------:|
| Punto de venta   |  ✅   |   ✅   |
| Ventas           |  ✅ (todas) | ✅ (las suyas) |
| Corte de caja    |  ✅   |   ✅   |
| Inventario       |  ✅   |   —    |
| Reportes         |  ✅   |   —    |
| Usuarios         |  ✅   |   —    |
| Configuración    |  ✅   |   —    |

La separación no es solo visual: está reforzada en la base de datos con
**Row Level Security**, así que un cajero no puede leer ni modificar lo que no le toca
aunque intente saltarse la interfaz.

## Cómo funciona el día a día

1. **Abrir caja** con el fondo inicial (en Punto de venta o en Corte de caja).
2. **Vender**: busca el producto, elige talla/color, ajusta cantidades, aplica
   descuento si hace falta y cobra (efectivo con cálculo de cambio, tarjeta o
   transferencia). El stock se descuenta solo, de forma atómica (sin sobreventa).
3. **Cerrar corte**: cuentas el efectivo real y el sistema calcula la diferencia
   contra lo esperado (fondo + ventas en efectivo).
4. **¿Un cliente se arrepiente o hubo un error?** En Ventas, abre el ticket y usa
   **Cancelar / devolver venta**: regresa el stock automáticamente y deja de contar
   en caja y reportes.

## Marca de la tienda

En **Configuración** (solo admin) puedes cambiar el nombre de la tienda y subir un
logo; se usan en el login y en el menú lateral.

## Crear usuarios de forma segura (Edge Function)

Crear usuarios ya **no** usa el registro público de Supabase Auth (quedaría abierto
a que cualquiera con la URL del proyecto se registre solo). Ahora corre en el
servidor, en [`supabase/functions/create-user`](./supabase/functions/create-user),
y solo funciona si quien llama ya es admin.

Para desplegarla (una sola vez, o cada vez que la edites):

```bash
npx supabase login
npx supabase link --project-ref yadvinimkenbmazfiich
npx supabase functions deploy create-user
```

`npx supabase login` abre el navegador para autorizar el CLI con tu cuenta de
Supabase. No hace falta configurar ninguna variable: `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` ya están disponibles automáticamente dentro de la función.

Después, en Supabase ve a **Authentication → Providers → Email** y desactiva
**"Allow new users to sign up"** (o el equivalente en tu versión del dashboard),
para cerrar del todo el registro público — de ahora en adelante todas las
cuentas se crean desde **Usuarios** en la app.

## Recuperar contraseña

El login tiene un enlace "¿Olvidaste tu contraseña?" que manda un correo con un
enlace de recuperación. Para que el enlace redirija bien a la app, en Supabase ve a
**Authentication → URL Configuration → Redirect URLs** y agrega:

```
http://localhost:5173/reset-password
```

y, cuando despliegues a producción, agrega también `https://tu-dominio.com/reset-password`.

## Desplegar en producción

Es un sitio estático; cualquiera de estos funciona:

- **Vercel / Netlify / Cloudflare Pages**: conecta el repo, build `npm run build`,
  carpeta de salida `dist`, y agrega las dos variables `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY` en la configuración del proyecto.
- El *fallback* a `index.html` que necesita una SPA con React Router ya está
  incluido: [`public/_redirects`](./public/_redirects) (Netlify/Cloudflare Pages)
  y [`vercel.json`](./vercel.json) (Vercel).
- En Supabase, agrega tu dominio de producción (ej. `https://tu-dominio.com/reset-password`)
  en **Authentication → URL Configuration → Redirect URLs**, y pon el dominio en
  **Site URL**.

## Qué quedó listo para extender

- **Facturación (SAT/CFDI)**: no incluida por ahora; el modelo de ventas ya guarda
  todo lo necesario para conectarla después.
- **Lector de código de barras**: cada variante tiene un campo de SKU/código
  (Inventario). Al escanear en el buscador del Punto de venta y dar "Enter", si
  coincide exacto se agrega directo al carrito.
- **Impresión de ticket**: el botón "Imprimir" del ticket abre una vista lista
  para una impresora térmica de 80mm (usa el diálogo de impresión del navegador).

---

Hecho por **Yañez Society**.

DeportesApaseo!