# 📱 Estructura de Dos Interfaces: Móvil vs Escritorio

## Resumen

El sistema ahora tiene **dos interfaces completamente separadas**:

1. **Interfaz de Cliente Móvil** → Para móviles/tablets (clientes)
2. **Interfaz de Sistema Completo** → Para web/escritorio (admins)

---

## 📂 Estructura de Carpetas

```
src/
├── Dashboard.jsx (MODIFICADO - Detecta plataforma y renderiza una u otra interfaz)
├── InterfazClienteMovil.jsx (NUEVO - Interfaz principal para móvil)
│
├── components/
│   └── ClienteMovil/ (NUEVO - Componentes de la interfaz móvil)
│       ├── CatalogoMovil.jsx - Catálogo de productos simplificado
│       ├── CarritoMovil.jsx - Carrito de compras
│       └── PerfilMovil.jsx - Perfil del cliente
│
├── hooks/
│   └── useDetectarPlataforma.js (NUEVO - Hook para detectar móvil/escritorio)
│
├── layouts/
│   └── LayoutWebEscritorio.jsx (NUEVO - Layout para sistema completo)
│
└── [resto de archivos sin cambios]
```

---

## 🔀 Cómo Funciona la Detección

### En `Dashboard.jsx`:
```javascript
// Detecta:
// 1. Plataforma (Android/iOS = móvil)
// 2. Tamaño de pantalla (< 768px = móvil)

if (!cargandoDeteccion && esMovil) {
  return <InterfazClienteMovil session={session} />;
}
// Si no es móvil, renderiza el sistema completo como siempre
```

---

## 📱 Interfaz Móvil (para clientes)

### Ubicación: `src/InterfazClienteMovil.jsx`

**3 Vistas principales:**
- **Comprar** → Catálogo simplificado de productos
- **Carrito** → Carrito de compras con total
- **Perfil** → Datos del cliente y historial

**Navegación:**
- Barra fija en la parte inferior con 3 botones
- Cada botón lleva a una vista
- Contador de items en el botón de Carrito

**Componentes:**
- `CatalogoMovil.jsx` - Grid de productos 2 columnas, búsqueda, agregar al carrito
- `CarritoMovil.jsx` - Lista de items, +/-, eliminar, total, botón pagar
- `PerfilMovil.jsx` - Datos, historial de compras, cerrar sesión

---

## 🖥️ Interfaz Web/Escritorio (sistema actual)

**Sin cambios** - Funciona exactamente como siempre:
- Menú lateral con todas las opciones
- Acceso a Dashboard, POS, Inventario, etc.
- Reportes y administración
- Control de usuarios y permisos

---

## 🎨 Diseño Personalizable

**El usuario pronto proporcionará imágenes/diseños** para la interfaz móvil.

Los componentes están listos para ser personalizados:
- `CatalogoMovil.jsx` - Adaptar grid, estilos de tarjetas
- `CarritoMovil.jsx` - Adaptar layout del carrito
- `PerfilMovil.jsx` - Adaptar secciones del perfil

**Importante:**
- Todos los componentes usan Tailwind CSS
- Se pueden cambiar colores, espaciados, disposición
- NO afecta el sistema actual de escritorio

---

## 🛠️ Desarrollo Sin Romper Nada

### Para trabajar en la interfaz móvil:
1. Edita archivos en `src/components/ClienteMovil/`
2. Edita `src/InterfazClienteMovil.jsx`
3. Cambios se aplican solo en móvil/tablet

### Para trabajar en el sistema de escritorio:
1. Edita el resto de archivos como siempre
2. Cambios NO afectan la interfaz móvil

### Para probar en móvil:
```bash
npm run android:sync      # Compila y sincroniza a Android
npx cap open android      # Abre en Android Studio
```

### Para probar en escritorio:
```bash
npm run dev               # Inicia dev server
# Abre en navegador con viewport < 768px para ver interfaz móvil
# O abre en Android/iOS para ver interfaz móvil
```

---

## ⏳ Próximos Pasos

1. **Usuario proporciona imágenes/diseños** de la interfaz móvil
2. **Adaptamos los componentes** al diseño proporcionado
3. **Probamos en móvil y escritorio** para asegurar funciona todo
4. **Commit a Git** cuando esté listo

---

## 📝 Notas Importantes

- La detección es **automática**: no hay configuración manual
- Si carga en móvil → Ve interfaz móvil
- Si carga en escritorio → Ve sistema completo
- Si **redimensiona navegador de móvil a escritorio** → Se recarga la interfaz automáticamente
- **Todos los datos se comparten** a través de Supabase
- **Sin conflictos de código** entre las dos interfaces

---

**¿Listo para pasar las imágenes?** 🎨
