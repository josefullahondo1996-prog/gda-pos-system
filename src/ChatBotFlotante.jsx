import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { sonidoExito, sonidoError } from './utils/sonido';

export default function ChatBotFlotante({ perfilUsuario }) {
    const [abierto, setAbierto] = useState(false);
    const [mensajes, setMensajes] = useState([]);
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [recording, setRecording] = useState(false);
    
    // Posicionamiento para la funcionalidad de arrastre
    const [posicion, setPosicion] = useState({ x: null, y: null });
    const [dragging, setDragging] = useState(false);
    const dragStart = useRef({ offsetX: 0, offsetY: 0 });
    
    const finRef = useRef(null);
    const panelRef = useRef(null);
    const recognitionRef = useRef(null);

    // Obtener la hora actual formateada
    const obtenerHoraActual = () => {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Inicializar el Speech Recognition API para entrada de voz
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const rec = new SpeechRecognition();
            rec.continuous = false;
            rec.interimResults = false;
            rec.lang = 'es-ES';
            
            rec.onstart = () => {
                setRecording(true);
            };
            rec.onend = () => {
                setRecording(false);
            };
            rec.onerror = (event) => {
                console.error("Speech recognition error:", event.error);
                setRecording(false);
                sonidoError();
            };
            rec.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setTexto((prev) => (prev ? prev + ' ' + transcript : transcript));
                sonidoExito();
            };
            recognitionRef.current = rec;
        }
    }, []);

    // Actualizar el saludo inicial dinámicamente según la empresa y usuario logueado
    useEffect(() => {
        if (perfilUsuario) {
            const nombreEmpresa = perfilUsuario.empresas?.nombre || 'tu negocio';
            const nombreUsuario = perfilUsuario.nombre || 'Usuario';
            setMensajes([
                { 
                    role: 'assistant', 
                    text: `¡Hola, **${nombreUsuario}**! Soy el asistente virtual de **${nombreEmpresa}**. ¿En qué te puedo ayudar hoy?`,
                    time: obtenerHoraActual()
                }
            ]);
        } else {
            setMensajes([
                { 
                    role: 'assistant', 
                    text: '¡Hola! Soy el asistente de **PYpos**. ¿En qué te puedo ayudar hoy?',
                    time: obtenerHoraActual()
                }
            ]);
        }
    }, [perfilUsuario]);

    const suggestions = [
        { label: '📊 Venta de hoy', text: '¿Cuánto se ha vendido hoy?' },
        { label: '📦 Stock bajo', text: '¿Qué productos tienen bajo stock?' },
        { label: '🧾 Crear factura', text: '¿Cómo puedo emitir una factura electrónica?' },
        { label: '⚙️ Abrir caja', text: '¿Cuáles son los pasos para abrir la caja?' },
    ];

    // Scroll automático al recibir mensajes
    useEffect(() => {
        if (abierto) {
            setTimeout(() => {
                finRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    }, [mensajes, abierto, enviando]);

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

    // Reajusta la posición cuando la ventana cambia de tamaño
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

        const nuevosMensajes = [
            ...mensajes, 
            { role: 'user', text: mensaje, time: obtenerHoraActual() }
        ];
        setMensajes(nuevosMensajes);
        setTexto('');
        setEnviando(true);

        try {
            const historialParaIA = nuevosMensajes.slice(-10).map((m) => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                text: m.text,
            }));

            const { data, error } = await supabase.functions.invoke('asistente-ia', {
                body: {
                    mensaje,
                    historial: historialParaIA,
                    empresa: perfilUsuario?.empresas?.nombre,
                    empresaId: perfilUsuario?.empresas?.id,
                    usuario: perfilUsuario?.nombre,
                    usuarioId: perfilUsuario?.id,
                },
            });

            if (error || data?.error) {
                throw new Error(data?.error || error.message);
            }

            setMensajes((prev) => [
                ...prev, 
                { role: 'assistant', text: data.respuesta, time: obtenerHoraActual() }
            ]);
            sonidoExito();
        } catch (err) {
            setMensajes((prev) => [
                ...prev, 
                { role: 'assistant', text: '⚠️ No pude responder: ' + err.message, time: obtenerHoraActual() }
            ]);
            sonidoError();
        } finally {
            setEnviando(false);
        }
    };

    const enviarMensaje = (e) => {
        e.preventDefault();
        sendMessageText(texto);
    };

    const toggleEscuchar = () => {
        if (!recognitionRef.current) return;
        if (recording) {
            recognitionRef.current.stop();
        } else {
            try {
                recognitionRef.current.start();
            } catch (err) {
                console.error(err);
            }
        }
    };

    const borrarHistorial = () => {
        if (window.confirm("¿Querés limpiar la conversación actual?")) {
            const nombreEmpresa = perfilUsuario?.empresas?.nombre || 'tu negocio';
            const nombreUsuario = perfilUsuario?.nombre || 'Usuario';
            setMensajes([
                { 
                    role: 'assistant', 
                    text: `Chat reiniciado. ¿En qué te puedo ayudar ahora, **${nombreUsuario}**?`,
                    time: obtenerHoraActual()
                }
            ]);
            sonidoExito();
        }
    };

    // Controladores de eventos Pointer para arrastrar el chat
    const handlePointerDown = (e) => {
        if (e.button !== 0) return; 
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

    // Parser de Markdown súper liviano e interactivo
    const renderMensaje = (textoMarkdown, isUser) => {
        if (typeof textoMarkdown !== 'string') return textoMarkdown;

        const lineas = textoMarkdown.split('\n');
        let enLista = false;
        const nodos = [];
        let listaActual = [];

        const procesarEstilos = (lineaText) => {
            // Dividir por enlaces [texto](url)
            const partesEnlace = lineaText.split(/(\[[^\]]+\]\([^)]+\))/g);
            
            return partesEnlace.map((parte, index) => {
                const matchEnlace = parte.match(/\[([^\]]+)\]\(([^)]+)\)/);
                if (matchEnlace) {
                    return (
                        <a 
                            key={index} 
                            href={matchEnlace[2]} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className={`underline font-semibold transition-all ${
                                isUser 
                                    ? 'text-orange-200 hover:text-white' 
                                    : 'text-orange-600 hover:text-orange-700'
                            }`}
                        >
                            {matchEnlace[1]}
                        </a>
                    );
                }
                
                // Dividir por negrita **texto**
                const partesNegrita = parte.split(/(\*\*[^*]+\*\*)/g);
                return partesNegrita.map((subParte, subIndex) => {
                    const matchNegrita = subParte.match(/\*\*([^*]+)\*\*/);
                    if (matchNegrita) {
                        return <strong key={`${index}-${subIndex}`} className="font-bold text-gray-900 dark:text-gray-100">{matchNegrita[1]}</strong>;
                    }
                    
                    // Dividir por código `codigo`
                    const partesCodigo = subParte.split(/(`[^`]+`)/g);
                    return partesCodigo.map((miniParte, miniIndex) => {
                        const matchCodigo = miniParte.match(/`([^`]+)`/);
                        if (matchCodigo) {
                            return (
                                <code key={`${index}-${subIndex}-${miniIndex}`} className="bg-black/5 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono">
                                    {matchCodigo[1]}
                                </code>
                            );
                        }
                        return miniParte;
                    });
                });
            });
        };

        lineas.forEach((linea, index) => {
            const trimmed = linea.trim();
            
            if (trimmed.startsWith('###')) {
                if (enLista) {
                    nodos.push(<ul key={`list-${index}`} className="list-disc pl-5 mb-2 space-y-1">{listaActual}</ul>);
                    listaActual = [];
                    enLista = false;
                }
                nodos.push(
                    <h4 key={index} className="font-bold text-xs text-gray-800 dark:text-gray-200 mt-2 mb-1">
                        {procesarEstilos(trimmed.replace(/^###\s*/, ''))}
                    </h4>
                );
            }
            else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                enLista = true;
                listaActual.push(
                    <li key={index} className="text-[13px] leading-relaxed">
                        {procesarEstilos(trimmed.substring(2))}
                    </li>
                );
            } else {
                if (enLista) {
                    nodos.push(<ul key={`list-${index}`} className="list-disc pl-5 mb-2 space-y-1">{listaActual}</ul>);
                    listaActual = [];
                    enLista = false;
                }
                if (trimmed !== '') {
                    nodos.push(
                        <p key={index} className="mb-1 leading-relaxed text-[13px]">
                            {procesarEstilos(linea)}
                        </p>
                    );
                } else {
                    nodos.push(<div key={index} className="h-1.5" />);
                }
            }
        });

        if (enLista) {
            nodos.push(<ul key={`list-final`} className="list-disc pl-5 mb-2 space-y-1">{listaActual}</ul>);
        }

        return nodos;
    };

    return (
        <>
            {/* Botón flotante llamativo */}
            <button
                onClick={() => setAbierto((v) => !v)}
                className={`fixed bottom-5 right-5 z-[9998] bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 animate-pulse-glow ${!abierto ? 'animate-float' : ''}`}
                title="Asistente virtual"
            >
                {abierto ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 rotate-90">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                ) : (
                    <div className="relative">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 hover:rotate-12">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-green-400 border-2 border-orange-500 rounded-full animate-ping"></span>
                    </div>
                )}
            </button>

            {/* Panel del chat interactivo y deslizable */}
            {abierto && (
                <div
                    ref={panelRef}
                    style={posicion.x !== null ? { left: `${posicion.x}px`, top: `${posicion.y}px`, bottom: 'auto', right: 'auto' } : {}}
                    className="fixed bottom-24 right-5 z-[9998] w-[360px] max-w-[92vw] h-[520px] max-h-[82vh] bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.18)] border border-gray-200/80 flex flex-col overflow-hidden animate-chat-open select-none"
                >
                    {/* Header Arrastrable */}
                    <div
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        className={`bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 flex items-center justify-between select-none cursor-grab active:cursor-grabbing ${dragging ? 'cursor-grabbing' : ''}`}
                    >
                        <div className="flex items-center gap-2.5">
                            <div className="relative flex items-center justify-center w-8.5 h-8.5 bg-white/15 rounded-full border border-white/25">
                                <span className="text-lg">🤖</span>
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-orange-500 rounded-full"></span>
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-orange-500 rounded-full animate-ping opacity-75"></span>
                            </div>
                            <div>
                                <p className="text-white font-bold text-sm tracking-wide leading-tight">Asistente PYpos</p>
                                <p className="text-white/80 text-[10px] font-medium leading-tight">En línea • Inteligencia Artificial</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Limpiar Conversación */}
                            <button
                                onClick={borrarHistorial}
                                className="text-white/80 hover:text-white hover:bg-white/15 w-6.5 h-6.5 rounded-full flex items-center justify-center transition-all text-xs"
                                title="Reiniciar chat"
                            >
                                🗑️
                            </button>

                            {/* Icono de Indicador de Arrastre */}
                            <div className="px-1 py-1 hover:bg-white/10 rounded transition-colors hidden sm:block cursor-grab">
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
                                className="text-white/80 hover:text-white hover:bg-white/15 w-6.5 h-6.5 rounded-full flex items-center justify-center transition-all text-xs font-bold"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Cuerpo de Mensajes */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 bg-gray-50/70 select-text">
                        {mensajes.map((m, i) => (
                            <div
                                key={i}
                                className={`flex flex-col max-w-[85%] transition-all duration-200 ${
                                    m.role === 'user' ? 'self-end items-end' : 'self-start items-start'
                                }`}
                            >
                                <div
                                    className={`px-3.5 py-2.5 rounded-2xl text-[13.5px] shadow-sm leading-relaxed border transition-all duration-200 ${
                                        m.role === 'user'
                                            ? 'bg-gradient-to-tr from-orange-500 to-amber-500 text-white border-orange-400 rounded-tr-none shadow-orange-500/10'
                                            : 'bg-white text-gray-800 border-gray-200/60 rounded-tl-none'
                                    }`}
                                >
                                    {renderMensaje(m.text, m.role === 'user')}
                                </div>
                                <span className="text-[9px] text-gray-400 mt-1 px-1">{m.time}</span>
                            </div>
                        ))}
                        
                        {enviando && (
                            <div className="flex flex-col max-w-[85%] self-start items-start">
                                <div className="bg-white text-gray-800 border border-gray-200/60 self-start rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex flex-col gap-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce-dot" style={{ animationDelay: '0ms' }}></span>
                                        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce-dot" style={{ animationDelay: '150ms' }}></span>
                                        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce-dot" style={{ animationDelay: '300ms' }}></span>
                                    </div>
                                </div>
                                <span className="text-[9px] text-gray-400 mt-1 px-1">Pensando...</span>
                            </div>
                        )}
                        <div ref={finRef} />
                    </div>

                    {/* Sugerencias de Preguntas (Chips Deslizables) */}
                    <div className="px-3 py-2.5 bg-white border-t border-gray-100/80 flex gap-2 overflow-x-auto scrollbar-none select-none">
                        {suggestions.map((sug, i) => (
                            <button
                                key={i}
                                onClick={() => sendMessageText(sug.text)}
                                className="flex-shrink-0 bg-gray-50 hover:bg-orange-50/50 text-gray-600 hover:text-orange-600 border border-gray-200/70 hover:border-orange-200 rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-sm hover:shadow-none"
                            >
                                {sug.label}
                            </button>
                        ))}
                    </div>

                    {/* Formulario de Entrada */}
                    <form onSubmit={enviarMensaje} className="p-3 border-t border-gray-150/60 flex items-center gap-2 bg-white select-text">
                        <div className="flex-1 relative flex items-center">
                            <input
                                type="text"
                                value={texto}
                                onChange={(e) => setTexto(e.target.value)}
                                placeholder="Escribí tu consulta..."
                                className="w-full border border-gray-200 focus:border-orange-500 rounded-full pl-4 pr-10 py-2.5 text-sm outline-none transition-all focus:ring-4 focus:ring-orange-500/10"
                                disabled={enviando}
                            />
                            {/* Botón de Entrada por Voz (si está disponible) */}
                            {recognitionRef.current && (
                                <button
                                    type="button"
                                    onClick={toggleEscuchar}
                                    className={`absolute right-2.5 p-1 rounded-full transition-all ${
                                        recording 
                                            ? 'text-red-500 bg-red-100 animate-pulse' 
                                            : 'text-gray-400 hover:text-orange-500'
                                    }`}
                                    title={recording ? "Escuchando..." : "Escribir por voz"}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                        <line x1="12" y1="19" x2="12" y2="23"></line>
                                        <line x1="8" y1="23" x2="16" y2="23"></line>
                                    </svg>
                                </button>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={enviando || !texto.trim()}
                            className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-40 disabled:pointer-events-none text-white rounded-full w-9.5 h-9.5 flex items-center justify-center flex-shrink-0 shadow-md shadow-orange-500/10 transition-all hover:scale-105 active:scale-95"
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
