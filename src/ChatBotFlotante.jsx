import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

export default function ChatBotFlotante({ perfilUsuario }) {
    const [abierto, setAbierto] = useState(false);
    const [mensajes, setMensajes] = useState([
        { role: 'assistant', text: '¡Hola! Soy el asistente de PYpos. ¿En qué te puedo ayudar hoy?' },
    ]);
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    
    // Actualizar el saludo inicial dinámicamente según la empresa y usuario logueado
    useEffect(() => {
        if (perfilUsuario) {
            const nombreEmpresa = perfilUsuario.empresas?.nombre || 'tu negocio';
            const nombreUsuario = perfilUsuario.nombre || 'Usuario';
            setMensajes([
                { role: 'assistant', text: `¡Hola, ${nombreUsuario}! Soy el asistente virtual de ${nombreEmpresa}. ¿En qué te puedo ayudar hoy?` }
            ]);
        } else {
            setMensajes([
                { role: 'assistant', text: '¡Hola! Soy el asistente de PYpos. ¿En qué te puedo ayudar hoy?' }
            ]);
        }
    }, [perfilUsuario]);
    
    // Posicionamiento para la funcionalidad de arrastre
    const [posicion, setPosicion] = useState({ x: null, y: null });
    const [dragging, setDragging] = useState(false);
    const dragStart = useRef({ offsetX: 0, offsetY: 0 });
    
    const finRef = useRef(null);
    const panelRef = useRef(null);

    const suggestions = [
        { label: '📊 Venta de hoy', text: '¿Cuánto se ha vendido hoy?' },
        { label: '📦 Stock bajo', text: '¿Qué productos tienen bajo stock?' },
        { label: '🧾 Crear factura', text: '¿Cómo puedo emitir una factura electrónica?' },
        { label: '⚙️ Abrir caja', text: '¿Cuáles son los pasos para abrir la caja?' },
    ];

    // Scroll automático al recibir mensajes
    useEffect(() => {
        if (abierto) finRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [mensajes, abierto]);

    // Establece la posición inicial al abrir el panel por primera vez
    useEffect(() => {
        if (abierto && posicion.x === null) {
            const width = 360;
            const height = 500;
            const margin = 20;
            setPosicion({
                x: window.innerWidth - width - margin,
                y: window.innerHeight - height - margin - 80,
            });
        }
    }, [abierto]);

    // Reajusta la posición cuando la ventana cambia de tamaño para evitar que quede fuera de la pantalla
    useEffect(() => {
        const handleResize = () => {
            if (posicion.x !== null && panelRef.current) {
                const rect = panelRef.current.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width;
                const maxY = window.innerHeight - rect.height;
                setPosicion((prev) => ({
                    x: Math.max(0, Math.min(prev.x, maxX)),
                    y: Math.max(0, Math.min(prev.y, maxY)),
                }));
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [posicion]);

    const sendMessageText = async (textToSend) => {
        const mensaje = textToSend.trim();
        if (!mensaje || enviando) return;

        const nuevosMensajes = [...mensajes, { role: 'user', text: mensaje }];
        setMensajes(nuevosMensajes);
        setTexto('');
        setEnviando(true);

        try {
            const { data, error } = await supabase.functions.invoke('chat-gda', {
                body: {
                    mensaje,
                    historial: mensajes.slice(-10),
                    empresa: perfilUsuario?.empresas?.nombre,
                    usuario: perfilUsuario?.nombre
                },
            });

            if (error || data?.error) {
                throw new Error(data?.error || error.message);
            }

            setMensajes((prev) => [...prev, { role: 'assistant', text: data.respuesta }]);
        } catch (err) {
            setMensajes((prev) => [...prev, { role: 'assistant', text: '⚠️ No pude responder: ' + err.message }]);
        } finally {
            setEnviando(false);
        }
    };

    const enviarMensaje = (e) => {
        e.preventDefault();
        sendMessageText(texto);
    };

    // Controladores de eventos Pointer para arrastrar el chat
    const handlePointerDown = (e) => {
        if (e.button !== 0) return; // Solo clics izquierdos / toques principales
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;

        setDragging(true);
        const header = e.currentTarget;
        header.setPointerCapture(e.pointerId);

        const rect = panelRef.current.getBoundingClientRect();
        dragStart.current = {
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
        };
    };

    const handlePointerMove = (e) => {
        if (!dragging) return;

        let newX = e.clientX - dragStart.current.offsetX;
        let newY = e.clientY - dragStart.current.offsetY;

        const width = panelRef.current.offsetWidth;
        const height = panelRef.current.offsetHeight;
        const maxX = window.innerWidth - width;
        const maxY = window.innerHeight - height;

        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        setPosicion({ x: newX, y: newY });
    };

    const handlePointerUp = (e) => {
        if (dragging) {
            setDragging(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    };

    return (
        <>
            {/* Botón flotante llamativo */}
            <button
                onClick={() => setAbierto((v) => !v)}
                className={`fixed bottom-5 right-5 z-[9998] bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 animate-pulse-glow ${!abierto ? 'animate-float' : ''}`}
                title="Asistente virtual"
            >
                {abierto ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 rotate-90">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 hover:rotate-12">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                )}
            </button>

            {/* Panel del chat interactivo y deslizable */}
            {abierto && (
                <div
                    ref={panelRef}
                    style={posicion.x !== null ? { left: `${posicion.x}px`, top: `${posicion.y}px`, bottom: 'auto', right: 'auto' } : {}}
                    className="fixed bottom-24 right-5 z-[9998] w-[360px] max-w-[92vw] h-[500px] max-h-[80vh] bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] border border-gray-200/60 flex flex-col overflow-hidden animate-chat-open select-none"
                >
                    {/* Header Arrastrable */}
                    <div
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        className={`bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 flex items-center justify-between select-none cursor-grab active:cursor-grabbing ${dragging ? 'cursor-grabbing' : ''}`}
                    >
                        <div className="flex items-center gap-2.5">
                            <div className="relative flex items-center justify-center w-8 h-8 bg-white/10 rounded-full border border-white/20">
                                <span className="text-lg">🤖</span>
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-orange-500 rounded-full"></span>
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-orange-500 rounded-full animate-ping opacity-75"></span>
                            </div>
                            <div>
                                <p className="text-white font-bold text-sm tracking-wide leading-tight">Asistente PYpos</p>
                                <p className="text-white/80 text-[10px] font-medium leading-tight">Siempre disponible • Soporte</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Icono de Indicador de Arrastre */}
                            <div className="px-1.5 py-1 hover:bg-white/10 rounded transition-colors hidden sm:block">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-70">
                                    <circle cx="3" cy="3" r="1" fill="white"/>
                                    <circle cx="3" cy="6" r="1" fill="white"/>
                                    <circle cx="3" cy="9" r="1" fill="white"/>
                                    <circle cx="9" cy="3" r="1" fill="white"/>
                                    <circle cx="9" cy="6" r="1" fill="white"/>
                                    <circle cx="9" cy="9" r="1" fill="white"/>
                                </svg>
                            </div>

                            {/* Botón de cerrar */}
                            <button
                                onClick={() => setAbierto(false)}
                                className="text-white/80 hover:text-white hover:bg-white/15 w-6 h-6 rounded-full flex items-center justify-center transition-all text-xs font-bold"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Cuerpo de Mensajes */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 bg-gray-50/50 select-text">
                        {mensajes.map((m, i) => (
                            <div
                                key={i}
                                className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-line shadow-sm transition-all duration-200 ${m.role === 'user'
                                        ? 'bg-gradient-to-tr from-orange-500 to-orange-600 text-white self-end rounded-tr-none shadow-orange-500/10'
                                        : 'bg-white text-gray-800 border border-gray-150/60 self-start rounded-tl-none'
                                    }`}
                            >
                                {m.text}
                            </div>
                        ))}
                        {enviando && (
                            <div className="bg-white text-gray-800 border border-gray-150/60 self-start rounded-2xl rounded-tl-none px-3.5 py-3 shadow-sm flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce-dot" style={{ animationDelay: '0ms' }}></span>
                                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce-dot" style={{ animationDelay: '150ms' }}></span>
                                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce-dot" style={{ animationDelay: '300ms' }}></span>
                            </div>
                        )}
                        <div ref={finRef} />
                    </div>

                    {/* Sugerencias de Preguntas (Chips Deslizables) */}
                    <div className="px-3 py-2 bg-white border-t border-gray-100 flex gap-2 overflow-x-auto scrollbar-none select-none">
                        {suggestions.map((sug, i) => (
                            <button
                                key={i}
                                onClick={() => sendMessageText(sug.text)}
                                className="flex-shrink-0 bg-gray-50 hover:bg-orange-50 text-gray-600 hover:text-orange-600 border border-gray-200/60 hover:border-orange-200 rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                            >
                                {sug.label}
                            </button>
                        ))}
                    </div>

                    {/* Formulario de Entrada */}
                    <form onSubmit={enviarMensaje} className="p-3 border-t border-gray-100 flex gap-2 bg-white select-text">
                        <input
                            type="text"
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                            placeholder="Escribí tu consulta..."
                            className="flex-1 border border-gray-200 focus:border-orange-500 rounded-full px-4 py-2 text-sm outline-none transition-all focus:ring-4 focus:ring-orange-500/10"
                            disabled={enviando}
                        />
                        <button
                            type="submit"
                            disabled={enviando || !texto.trim()}
                            className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-40 disabled:pointer-events-none text-white rounded-full w-9 h-9 flex items-center justify-center flex-shrink-0 shadow-md shadow-orange-500/10 transition-all hover:scale-105 active:scale-95"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </form>
                </div>
            )}
        </>
    );
}
