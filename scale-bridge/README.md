# GDA POS local device bridge

The browser cannot open raw TCP sockets. This local service runs on the cashier PC and exposes loopback HTTP endpoints for a read-only Minebea Intec X3 / PR 5410 connection and direct ESC/POS printing to a LAN thermal printer.

## Direct ESC/POS printing

1. Connect the cashier PC and a network thermal printer to the same LAN. Give the printer a reserved private IPv4 address and enable its RAW/9100 printing service.
2. In GDA POS open **Configuración → Impresoras de tickets**, add a **Network** printer, enter its private LAN IP, keep port **9100**, and choose the receipt width (32 characters for 58 mm or 42 for 80 mm).
3. On the cashier PC, in the GDA project folder run `npm run device-bridge`. Keep it running while the POS is in use. If GDA POS is hosted, set `SCALE_BRIDGE_ORIGINS` to its exact HTTPS origin before starting the bridge, for example `https://pos.example.com`.
4. Use **Probar impresión** on the saved printer. The POS also sends completed sale tickets directly when a Network printer is configured. If the local bridge is unavailable, it falls back to the browser print dialog.

The bridge only binds to `127.0.0.1`, checks the exact allowed web origin, restricts printer IPs to private/link-local IPv4, accepts only TCP port 9100, and caps ticket size. The ticket uses ESC/POS initialization, PC850 text, alignment/bold commands, line feeds, and a full-cut command. Some printer models use a different character-table index or ignore cutter commands. A successful send only means the local socket accepted the bytes; verify the test ticket physically on the target printer before relying on it.

## Scale reading

1. Put the X3 and the cashier PC on the same LAN. Enable/configure Modbus TCP on the indicator and give it a reserved private IPv4 address.
2. Save the indicator under **Configuración → Balanzas de red** (Modbus TCP, normally port 502, Unit ID normally 1).
3. On the cashier PC, in the GDA project folder run `npm run device-bridge` (or the existing `npm run scale-bridge` alias). Keep that terminal/service running while using weight capture.
4. In the POS, choose **⚖️ Balanza**, select a product whose unit is kg or g, read stable weight and add it to the cart. Review the line and charge through the existing sale flow.

Development defaults to Vite origins on localhost. The service only binds to `127.0.0.1`, accepts configured web origins, restricts target indicators to private IPv4, allows read-only Modbus function 3, and never accepts a target host from the browser outside RFC1918/link-local LAN ranges.

## X3 map used

Reads holding registers starting at offset 0 and maps the SPM bytes/words documented for PR 5410: B4 (X39 stable bit), B16 exponent, B17 unit, and D9 current net weight. This assumes the standard Modbus TCP SPM byte-to-register layout (two SPM bytes per holding register, high byte first). Confirm a stable known test weight and the unit/decimal display during commissioning; do not use the reading to charge customers until it agrees with the calibrated indicator. This service reads weight only; it does not tare, zero, calibrate, or change scale state.

HTTP health check: `http://127.0.0.1:8765/health`. POS read endpoint: `POST http://127.0.0.1:8765/api/scale/read`.
