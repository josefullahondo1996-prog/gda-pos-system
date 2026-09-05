import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const NotificacionContext = createContext(null);

let idCounter = 0;

export function NotificacionProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialogoConfirmacion, setDialogoConfirmacion] = useState(null);
  const [aviso, setAviso] = useState(null);
  const resolverConfirmacion = useRef(null);

  const quitarToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const agregarToast = useCallback((tipo, mensaje, duracionMs = 4000) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, tipo, mensaje }]);
    if (duracionMs > 0) {
      setTimeout(() => quitarToast(id), duracionMs);
    }
  }, [quitarToast]);

  const notificar = {
    exito: (mensaje) => agregarToast('exito', mensaje),
    error: (mensaje) => agregarToast('error', mensaje, 6000),
    info: (mensaje) => agregarToast('info', mensaje),
    aviso: (mensaje, opciones = {}) => setAviso({
      titulo: opciones.titulo || 'Aviso',
      mensaje,
    }),
  };

  const confirmar = useCallback((mensaje, opciones = {}) => {
    return new Promise((resolve) => {
      resolverConfirmacion.current = resolve;
      setDialogoConfirmacion({
        mensaje,
        titulo: opciones.titulo || 'Confirmar acción',
        textoConfirmar: opciones.textoConfirmar || 'Confirmar',
        textoCancelar: opciones.textoCancelar || 'Cancelar',
        peligroso: opciones.peligroso ?? true,
      });
    });
  }, []);

  const cerrarDialogo = (resultado) => {
    setDialogoConfirmacion(null);
    if (resolverConfirmacion.current) {
      resolverConfirmacion.current(resultado);
      resolverConfirmacion.current = null;
    }
  };

  return (
    <NotificacionContext.Provider value={{ notificar, confirmar }}>
      {children}

      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl shadow-lg px-4 py-3 text-sm font-medium text-white flex items-start gap-2 ${
              t.tipo === 'exito' ? 'bg-green-600' : t.tipo === 'error' ? 'bg-red-600' : 'bg-gray-800'
            }`}
            role="alert"
          >
            <span className="flex-1">{t.mensaje}</span>
            <button
              onClick={() => quitarToast(t.id)}
              className="text-white/70 hover:text-white leading-none text-lg"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {aviso && (
        <div className="fixed inset-0 z-[100001] bg-slate-950/55 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="aviso-titulo"
          >
            <div className="flex items-start gap-4 border-b border-amber-100 bg-amber-50 px-6 py-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-700" aria-hidden="true">
                !
              </div>
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">Atención</p>
                <h3 id="aviso-titulo" className="text-lg font-bold text-slate-900">{aviso.titulo}</h3>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="whitespace-pre-line text-sm leading-6 text-slate-600">{aviso.mensaje}</p>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setAviso(null)}
                  autoFocus
                  className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-orange-700"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dialogoConfirmacion && (
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2">{dialogoConfirmacion.titulo}</h3>
            <p className="text-sm text-gray-600 mb-6 whitespace-pre-line">{dialogoConfirmacion.mensaje}</p>
            <div className="flex gap-3">
              <button
                onClick={() => cerrarDialogo(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 text-sm"
              >
                {dialogoConfirmacion.textoCancelar}
              </button>
              <button
                onClick={() => cerrarDialogo(true)}
                className={`flex-1 py-2.5 rounded-xl text-white font-bold text-sm ${
                  dialogoConfirmacion.peligroso ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'
                }`}
              >
                {dialogoConfirmacion.textoConfirmar}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificacionContext.Provider>
  );
}

export function useNotificacion() {
  const ctx = useContext(NotificacionContext);
  if (!ctx) {
    throw new Error('useNotificacion debe usarse dentro de <NotificacionProvider>');
  }
  return ctx;
}