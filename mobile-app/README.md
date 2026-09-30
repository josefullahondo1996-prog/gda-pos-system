# GDA POS Móvil

Cliente móvil independiente para el equipo de cada negocio. Comparte inicio de sesión, datos y permisos con GDA POS mediante el mismo proyecto de Supabase; no crea otra base ni duplica inventario.

## Funciones de esta primera versión

- Inicio de sesión con las credenciales actuales y verificación del usuario, empresa y estado de acceso.
- Resumen de ventas del día y actividad reciente, sujeto al rol.
- Consulta del catálogo y existencias.
- Punto de venta móvil: búsqueda, carrito y registro de ventas mediante `registrar_venta`, la misma operación transaccional del POS de escritorio. Se necesita una caja abierta para cobrar.
- Rol de cajero exclusivo limitado a cobrar; oculta Inicio, inventario e informes.
- Instalable como PWA y con proyecto Android separado (`com.gdapossystem.mobile`).

## Desarrollo y compilación web

Desde esta carpeta:

```sh
npm install
npm run dev
npm run build
```

Vite toma `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` del `.env` ubicado en la carpeta raíz del sistema. Para alojarla por separado, configura esas dos variables en el entorno de compilación del alojamiento y publica `mobile-app/dist` en HTTPS. La app no incluye claves de servicio.

## Android

```sh
npm run android:sync
```

Abre `mobile-app/android` en Android Studio para generar una compilación instalable. La PWA y el proyecto Android tienen identidad y carpeta propias; el Android existente de escritorio no se usa ni se modifica.

La aplicación requiere conexión a internet para autenticar y consultar Supabase. El service worker conserva la interfaz y sus archivos estáticos; no guarda datos de ventas ni permite registrar transacciones fuera de línea.
