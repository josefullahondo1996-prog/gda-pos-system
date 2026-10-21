import http from 'node:http';
import net from 'node:net';

const HTTP_HOST = '127.0.0.1';
const HTTP_PORT = Number(process.env.SCALE_BRIDGE_PORT || 8765);
const ALLOWED_ORIGINS = new Set((process.env.SCALE_BRIDGE_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((v) => v.trim()).filter(Boolean));

function privateIPv4(value) {
  const octets = String(value || '').split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function readModbus(ip, port, unitId) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port });
    const transaction = Math.floor(Math.random() * 65536);
    const request = Buffer.alloc(12);
    request.writeUInt16BE(transaction, 0);
    request.writeUInt16BE(0, 2);
    request.writeUInt16BE(6, 4);
    request.writeUInt8(unitId, 6);
    request.writeUInt8(3, 7); // Read holding registers: SPM B4..D10.
    request.writeUInt16BE(0, 8);
    request.writeUInt16BE(18, 10);
    let received = Buffer.alloc(0);
    const finish = (error, value) => {
      socket.destroy();
      error ? reject(error) : resolve(value);
    };
    socket.setTimeout(2500, () => finish(new Error('Tiempo de espera agotado leyendo la balanza.')));
    socket.once('error', (error) => finish(new Error(`No se pudo conectar a la balanza: ${error.message}`)));
    socket.on('data', (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (received.length < 9) return;
      const length = received.readUInt16BE(4);
      if (received.length < 6 + length) return;
      if (received.readUInt16BE(0) !== transaction || received.readUInt16BE(2) !== 0 || received[6] !== unitId) return finish(new Error('Respuesta Modbus TCP inválida.'));
      if (received[7] === 0x83) return finish(new Error(`La balanza rechazó la lectura Modbus (código ${received[8]}).`));
      if (received[7] !== 3 || received[8] !== 36) return finish(new Error('La balanza respondió con un mapa de registros inesperado.'));
      const regs = [];
      for (let i = 0; i < 18; i += 1) regs.push(received.readUInt16BE(9 + i * 2));
      const status = regs[2] >>> 8; // SPM byte B4; bit X39 means stable.
      const exponent = (regs[16] >>> 8) & 0xff; // SPM byte B16.
      const signedExponent = exponent > 127 ? exponent - 256 : exponent;
      const unitCode = regs[16] & 0xff; // SPM byte B17.
      const raw = (regs[9] * 65536 + regs[10]) | 0; // D9 current net weight (signed DINT).
      if (signedExponent < 0 || signedExponent > 6) return finish(new Error('Exponente de balanza fuera del rango admitido.'));
      const scaled = raw * (10 ** -signedExponent);
      const unitToKg = { 1: 1e-6, 2: 1e-3, 3: 1, 4: 1000, 5: 0.45359237, 9: 0.028349523125 }[unitCode];
      if (!unitToKg) return finish(new Error(`Unidad de peso X3 no reconocida (${unitCode}).`));
      finish(null, { stable: Boolean(status & 0x80), kilograms: scaled * unitToKg, displayValue: scaled, unitCode, exponent: signedExponent, raw, sample: Date.now() });
    });
    socket.once('connect', () => socket.write(request));
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    res.writeHead(403).end('Origin not allowed');
    return;
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.writeHead(204).end();
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200).end(JSON.stringify({ ok: true, service: 'gda-local-device-bridge' }));
    return;
  }
  if (req.method === 'POST' && req.url === '/api/printer/print') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 180000) { res.writeHead(413).end(JSON.stringify({ ok: false, error: 'Ticket demasiado grande.' })); return; }
    }
    try {
      const cfg = JSON.parse(body || '{}');
      const port = Number(cfg.port || 9100);
      if (!privateIPv4(cfg.ip)) throw new Error('La IP de la impresora debe ser privada IPv4 (LAN).');
      if (port !== 9100) throw new Error('La impresora ESC/POS debe usar el puerto RAW 9100.');
      if (typeof cfg.bytesBase64 !== 'string' || cfg.bytesBase64.length < 8 || cfg.bytesBase64.length > 160000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(cfg.bytesBase64)) {
        throw new Error('Los datos ESC/POS no son válidos.');
      }
      const bytes = Buffer.from(cfg.bytesBase64, 'base64');
      if (!bytes.length || bytes.length > 120000) throw new Error('El ticket supera el tamaño permitido.');
      await new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: cfg.ip, port });
        const timer = setTimeout(() => finish(new Error('Tiempo de espera agotado al conectar con la impresora.')), 8000);
        let finished = false;
        const finish = (error) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          socket.destroy();
          error ? reject(error) : resolve();
        };
        socket.once('connect', () => socket.end(bytes, () => finish()));
        socket.once('error', (error) => finish(new Error(`No se pudo enviar el ticket ESC/POS: ${error.message}`)));
        socket.once('close', (hadError) => { if (!finished && hadError) finish(new Error('La conexión con la impresora se cerró antes de completar el envío.')); });
      });
      res.writeHead(200).end(JSON.stringify({ ok: true, sent: true, note: 'Datos enviados al puerto RAW; el puente no puede confirmar la impresión física.' }));
    } catch (error) {
      res.writeHead(400).end(JSON.stringify({ ok: false, error: error.message || 'Falló el envío a la impresora.' }));
    }
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/scale/read') {
    res.writeHead(404).end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4096) { res.writeHead(413).end(JSON.stringify({ error: 'Request too large' })); return; }
  }
  try {
    const cfg = JSON.parse(body || '{}');
    const port = Number(cfg.port || 502);
    const unitId = Number(cfg.unitId ?? 1);
    if (!privateIPv4(cfg.ip)) throw new Error('La IP de la balanza debe ser privada IPv4 (LAN).');
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(unitId) || unitId < 0 || unitId > 247) throw new Error('Puerto o ID Modbus no válido.');
    const reading = await readModbus(cfg.ip, port, unitId);
    if (!reading.stable) throw new Error('El peso todavía no está estable. Esperá y volvé a leer.');
    if (!Number.isFinite(reading.kilograms) || reading.kilograms <= 0 || reading.kilograms > 10000) throw new Error('La lectura de peso está vacía o fuera del rango admitido.');
    res.writeHead(200).end(JSON.stringify({ ok: true, ...reading }));
  } catch (error) {
    res.writeHead(400).end(JSON.stringify({ ok: false, error: error.message || 'Falló la lectura de peso.' }));
  }
});

server.listen(HTTP_PORT, HTTP_HOST, () => console.log(`GDA scale bridge escuchando en http://${HTTP_HOST}:${HTTP_PORT}`));
