// Sonidos cortos generados con Web Audio API (sin archivos de audio externos)

let audioCtx = null;
const getAudioCtx = () => {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
};

const reproducirTono = (frecuencia, inicio, duracion, volumen = 0.2) => {
  try {
    const ctx = getAudioCtx();
    const oscilador = ctx.createOscillator();
    const ganancia = ctx.createGain();
    oscilador.type = 'sine';
    oscilador.frequency.value = frecuencia;
    ganancia.gain.setValueAtTime(volumen, ctx.currentTime + inicio);
    ganancia.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracion);
    oscilador.connect(ganancia);
    ganancia.connect(ctx.destination);
    oscilador.start(ctx.currentTime + inicio);
    oscilador.stop(ctx.currentTime + inicio + duracion);
  } catch (e) {
    console.warn('No se pudo reproducir el sonido:', e.message);
  }
};

// Sonido de éxito: dos tonos ascendentes (venta, guardado, registro, etc.)
export const sonidoExito = () => {
  reproducirTono(880, 0, 0.12);
  reproducirTono(1318.5, 0.1, 0.15);
};

// Sonido de error: un tono grave y corto
export const sonidoError = () => {
  reproducirTono(220, 0, 0.25, 0.15);
};