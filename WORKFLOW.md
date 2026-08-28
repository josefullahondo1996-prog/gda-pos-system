# Flujo de Trabajo: Web + Android Separados

Este archivo explica cómo trabajar sin mezclar cambios web con cambios Android.

---

## 📱 Estructura del Proyecto

```
src/                ← Código compartido (React, lógica)
dist/               ← Compilación web (generado, NO versionar)
android/            ← Código exclusivo de Android (nativo)
capacitor.config.json ← Sincronización web → Android
```

**Capacitor** es un puente que encapsula la app web en un WebView de Android.
- Cambios en `src/` → afectan web Y Android
- Cambios en `android/` → solo Android
- `dist/` se regenera cada compilación, no debe estar en Git

---

## 🌐 Para Cambios WEB (navegador + escritorio)

### Opción 1: Desarrollo local
```powershell
npm run dev
```
Abre http://localhost:5173, auto-recarga al editar `src/`.

### Opción 2: Compilar para producción
```powershell
npm run web
```
Genera `dist/` optimizado para hosting (Vercel, Netlify, etc.).

**Archivos que cambiarán:**
- `src/*.jsx` (componentes)
- Opcionalmente: `package.json`, `vite.config.js`, estilos, etc.

---

## 📲 Para Cambios ANDROID (solo celular)

### Regla de Oro
**No edites `src/` directamente desde Android Studio.**

### Opción A: Cambios en la interfaz React (dentro de `src/`)

Si necesitas una vista diferente solo para Android:

1. **Detecta la plataforma en React:**
   ```jsx
   import { Capacitor } from '@capacitor/core';
   
   export function MiComponente() {
     const esAndroid = Capacitor.getPlatform() === 'android';
     
     return (
       <div>
         {esAndroid && <BotonExclusivoAndroid />}
         <ContenidoNormal />
       </div>
     );
   }
   ```

2. **Compila y sincroniza:**
   ```powershell
   npm run android:sync
   ```
   Esto corre `npm run build` + `npx cap copy android`.

3. **Abre Android Studio:**
   ```powershell
   npm run android:open
   ```

4. **Compila en Android Studio:**
   - Espera a que aparezca el código.
   - Build → Build Bundle(s) / APK(s) → Build APK.

---

### Opción B: Cambios nativos (Kotlin/Java, permisos, íconos)

**Solo modifica dentro de:**
```text
android/app/src/main/
```

Ejemplos:
- `AndroidManifest.xml` → permisos
- `res/mipmap-*` → íconos
- `java/com/pypos/app/MainActivity.java` → código nativo

**No necesitas sincronizar React; ábrelo directo:**
```powershell
npx cap open android
```

Compila en Android Studio normalmente.

---

## ⚠️ Lo Que NO Debes Hacer

❌ **Editar `src/Dashboard.jsx` desde Android Studio y guardar.**
- Los cambios no se sincronizan automáticamente.
- Puedes perder trabajo.

❌ **Ejecutar `npx cap sync` sin hacer `npm run build` primero.**
- Copia la versión web anterior en Android.

❌ **Confirmar cambios de `dist/` en Git.**
- Ya está en `.gitignore`, pero si ves ese directorio modificado, es señal de que olvidaste.

---

## ✅ Flujo Correcto Paso a Paso

### Escenario 1: Solo cambios web
```powershell
# Edita src/*.jsx
git add src/
git commit -m "Cambio en Dashboard"
npm run web  # opcional, para ver que compila
# Publica en Vercel automáticamente
```

### Escenario 2: Cambios web + Android
```powershell
# Edita src/MiComponente.jsx (con condición Capacitor.getPlatform())
npm run android:sync
npm run android:open
# Compila en Android Studio
git add src/
git commit -m "Cambio en MiComponente + sincronización Android"
```

### Escenario 3: Solo cambios nativos Android
```powershell
git switch -c cambio-android-nativo
npx cap open android
# Edita android/app/src/main/AndroidManifest.xml, etc.
# Compila en Android Studio
git add android/
git commit -m "Permisos de cámara en Android"
```

---

## 🛠️ Comandos Rápidos

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Inicia servidor web local con auto-recarga |
| `npm run web` | Compila `dist/` para producción |
| `npm run android:sync` | Compila web + copia en Android |
| `npm run android:open` | Abre Android Studio con la app |
| `git status` | Revisa qué archivos cambiaron |
| `git restore .` | Revierte cambios locales (CUIDADO) |

---

## 🔍 Cómo Revisar Cambios

Antes de hacer commit:
```powershell
git status
```

Deberías ver:
- `src/*.jsx` → OK
- `android/**` → OK si es cambio nativo
- `dist/` → NO debe aparecer
- `package.json` → solo si agregaste dependencias

Si ves `dist/` o `node_modules/` modificado, ejecuta:
```powershell
git restore dist
git restore node_modules
```

---

## 📚 Recursos

- [Documentación Capacitor](https://capacitorjs.com/)
- [Capacitor.getPlatform()](https://capacitorjs.com/docs/apis/core#getplatform)
- [Vite Build Guide](https://vitejs.dev/guide/build.html)

---

## 💡 Recuerda

- **`src/` es compartido:** web y Android lo usan.
- **`android/` es exclusivo:** solo Android.
- **`dist/` se regenera:** no lo versiones.
- **Usa `Capacitor.getPlatform()`** para lógica específica de plataforma.
