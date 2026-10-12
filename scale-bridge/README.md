# GDA POS scale bridge

The browser cannot open a Modbus TCP socket directly. This small local service reads a Minebea Intec X3 / PR 5410 over the shop LAN and exposes a read-only loopback HTTP endpoint to the POS.

## Start

1. Put the X3 and the cashier PC on the same LAN. Enable/configure Modbus TCP on the indicator and give it a reserved private IPv4 address.
2. Save the indicator under **Configuración → Balanzas de red** (Modbus TCP, normally port 502, Unit ID normally 1).
3. On the cashier PC, in the GDA project folder run `npm run scale-bridge`. Keep that terminal/service running while using weight capture.
4. In the POS, choose **⚖️ Balanza**, select a product whose unit is kg or g, read stable weight and add it to the cart. Review the line and charge through the existing sale flow.

For a hosted HTTPS POS, set `SCALE_BRIDGE_ORIGINS` to the exact POS origin before starting the service, for example `https://pos.example.com`. Development defaults to Vite origins on localhost. The service only binds to `127.0.0.1`, accepts configured web origins, restricts target indicators to private IPv4, allows read-only Modbus function 3, and never accepts a target host from the browser outside RFC1918/link-local LAN ranges.

## X3 map used

Reads holding registers starting at offset 0 and maps the SPM bytes/words documented for PR 5410: B4 (X39 stable bit), B16 exponent, B17 unit, and D9 current net weight. This assumes the standard Modbus TCP SPM byte-to-register layout (two SPM bytes per holding register, high byte first). Confirm a stable known test weight and the unit/decimal display during commissioning; do not use the reading to charge customers until it agrees with the calibrated indicator. This service reads weight only; it does not tare, zero, calibrate, or change scale state.

HTTP health check: `http://127.0.0.1:8765/health`. POS read endpoint: `POST http://127.0.0.1:8765/api/scale/read`.
