# Pre-Commit Checklist

Usa este checklist antes de hacer `git commit` para evitar mezclar cambios web y Android.

## ✅ Antes de Hacer Commit

1. **Revisa `git status`:**
   ```powershell
   git status
   ```

2. **¿Qué cambios ves?** Marca los que apliquen:
   - [ ] `src/*.jsx` (cambios de código React)
   - [ ] `android/app/src/main/**` (cambios nativos Android)
   - [ ] `package.json` (nuevas dependencias)
   - [ ] Otros (especifica):

3. **¿VES `dist/` modificado?**
   - [ ] **SÍ** → Ejecuta `git restore dist` y vuelve al paso 1
   - [ ] **NO** → Continúa

4. **¿VES `node_modules/` modificado?**
   - [ ] **SÍ** → Ejecuta `git restore node_modules` y vuelve al paso 1
   - [ ] **NO** → Continúa

5. **Verifica el propósito del cambio:**
   - [ ] Solo web (React, estilos, lógica):
     ```powershell
     npm run dev  # Prueba localmente
     npm run web  # Valida compilación
     ```
   
   - [ ] Solo Android nativo:
     ```powershell
     npx cap open android  # Abre Android Studio
     # Compila y prueba en Android Studio
     ```
   
   - [ ] Web + Android (React con Capacitor.getPlatform()):
     ```powershell
     npm run dev  # Prueba web
     npm run android:sync  # Sincroniza con Android
     npm run android:open
     # Compila en Android Studio
     ```

6. **Haz el commit:**
   ```powershell
   git add .
   git commit -m "Descripción clara del cambio"
   ```

---

## 🚨 Señales de Alerta

Si ves esto, **DETENTE** y revisa:

| Señal | Causa | Solución |
|-------|-------|----------|
| `M  dist/` | Compilación local se versionó | `git restore dist` |
| `M  node_modules/` | Dependencias se versionaron | `git restore node_modules` |
| Muchos `M src/` sin razón | Sincronización accidental desde Android Studio | `git status` y `git diff` para revisar |
| `A  src/Asistencia.jsx` etc. | Archivos nuevos locales | Verifica en `git log` si pertenecen |

---

## 📋 Ejemplo Real

### Cambio solo web:
```
M src/Dashboard.jsx
M src/PuntoDeVenta.jsx
✓ Pasa el checklist
✓ Haz commit
```

### Cambio web + Android:
```
M src/Dashboard.jsx
M android/app/src/main/AndroidManifest.xml
✓ Pasa el checklist
✓ Ejecuta npm run android:sync
✓ Compila en Android Studio
✓ Haz commit
```

### ❌ Cambio accidental web+Android (MALO):
```
M src/Dashboard.jsx
M src/PuntoDeVenta.jsx
M dist/assets/...
M android/app/src/main/res/mipmap-*/ic_launcher.png
❌ NO pasa el checklist
→ Revierte con: git restore .
→ Identifica qué cambio real querías
→ Reinicia desde cero
```

---

## 🔗 Referencias Rápidas

- **Este archivo:** `WORKFLOW.md`
- **Configuración:** `capacitor.config.json`
- **Scripts:** `package.json` → busca `"scripts"`
- **Android:** `android/app/src/main/`
- **Web:** `src/`
