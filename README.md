# POS Deportes Sarapaseo

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

## Desplegar en producción

Es un sitio estático; cualquiera de estos funciona:

- **Vercel / Netlify / Cloudflare Pages**: conecta el repo, build `npm run build`,
  carpeta de salida `dist`, y agrega las dos variables `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY` en la configuración del proyecto.
- Como es una SPA con React Router, activa el *fallback* a `index.html`
  (Netlify: `/* /index.html 200`).

## Qué quedó listo para extender

- **Facturación (SAT/CFDI)**: no incluida por ahora; el modelo de ventas ya guarda
  todo lo necesario para conectarla después.
- **Lector de código de barras**: la búsqueda ya está lista para recibirlo (un lector
  USB "teclea" el código); solo faltaría capturar el SKU en el campo de búsqueda.
- **Impresión de ticket**: hoy se muestra el resumen en pantalla; se puede conectar
  a una impresora térmica.

---

Hecho por **Yañez Society**.
