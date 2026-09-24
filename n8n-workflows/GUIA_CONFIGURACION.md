# Guía Rápida de Configuración n8n para GDA POS

Esta guía te explica cómo poner en marcha **n8n**, conectar la base de datos de **GDA POS** y recibir tus primeros reportes en **Telegram**.

---

## 🚀 1. Iniciar n8n en tu PC

Abre una terminal (PowerShell o CMD) y ejecuta:

```powershell
npx n8n
```

* La primera vez descargará los paquetes necesarios.
* Una vez iniciado, verás el mensaje: `Editor is now accessible via: http://localhost:5678/`
* Abre tu navegador en **`http://localhost:5678`** y crea tu usuario local.

---

## 🤖 2. Crear tu Bot de Telegram (1 minuto)

1. Abre Telegram y busca al usuario oficial **`@BotFather`**.
2. Envía el comando `/newbot`.
3. asígnale un nombre (ej. `GDA POS Notificaciones`) y un usuario (ej. `GdaPosAlertasBot`).
4. `@BotFather` te entregará un **Token de Acceso** (ej: `7123456789:AAEk...`). **Cópialo**.
5. Abre el chat con tu nuevo bot en Telegram y presiona **"Iniciar"** (o envía `/start`).
6. Para obtener tu **Chat ID** numérico:
   - Busca en Telegram el bot **`@userinfobot`** y envíale un mensaje.
   - Te responderá con tu `Id` (ej. `123456789`).

---

## 🗄️ 3. Conectar Postgres / Supabase en n8n

1. En n8n, ve a **Credentials** (menú izquierdo) > **Add Credential** > busca **Postgres**.
2. Completa los datos con las credenciales de tu base de datos de Supabase/Postgres:
   - **Host:** `db.xxx.supabase.co` (o tu host de base de datos)
   - **Database:** `postgres`
   - **User:** `postgres`
   - **Password:** Tu contraseña de base de datos
   - **Port:** `5432` (o `6543` si usas connection pooling)
   - **SSL:** Activado (`require` o `allow` para Supabase)
3. Haz clic en **Save** & **Test**.

---

## 📥 4. Importar los Flujos de Trabajo

1. En n8n, haz clic en **Workflows** > **Add Workflow**.
2. Haz clic en el menú de los tres puntos `...` (arriba a la derecha) > **Import from File**.
3. Selecciona el archivo:
   - `c:\gda-pos-system\n8n-workflows\reporte_diario_y_stock.json`
4. Abre el nodo **Telegram** en el flujo:
   - Añade una nueva credencial de Telegram con el **Bot Token** obtenido en el paso 2.
   - En el campo `Chat ID`, ingresa tu ID numérico.
5. Haz clic en **Test Step** para probar el envío inmediato.
6. Activa el interruptor **Active** (arriba a la derecha) para que se ejecute todos los días a las 22:00.

---

## ⚡ 5. Flujos Incluidos en esta Carpeta

* `reporte_diario_y_stock.json`: Cierre de ventas del día, resumen de gastos, desglose de pagos y listado de productos con stock crítico (≤ 5 unidades).
* `webhook_alerta_venta.json`: Endpoint listo para recibir notificaciones instantáneas de ventas en tiempo real.
