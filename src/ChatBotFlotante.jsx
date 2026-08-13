import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

export default function ChatBotFlotante() {
    const [abierto, setAbierto] = useState(false);
    const [mensajes, setMensajes] = useState([
        { role: 'assistant', text: '¡Hola! Soy el asistente del sistema. ¿En qué te puedo ayudar?' },
    ]);
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const finRef = useRef(null);

    useEffect(() => {
        if (abierto) finRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [mensajes, abierto]);

    const enviarMensaje = async (e) => {
        e.preventDefault();
        const mensaje = texto.trim();
        if (!mensaje || enviando) return;

        const nuevosMensajes = [...mensajes, { role: 'user', text: mensaje }];
        setMensajes(nuevosMensajes);
        setTexto('');
        setEnviando(true);

        try {
            const { data, error } = await supabase.functions.invoke('chat-gda', {
                body: {
                    mensaje,
                    // Mandamos los últimos mensajes como contexto (sin el que acabamos de agregar, va aparte)
                    historial: mensajes.slice(-10),
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

    return (
        <>
            {/* Botón flotante */}
            <button
                onClick={() => setAbierto((v) => !v)}
                className="fixed bottom-5 right-5 z-[9998] bg-orange-500 hover:bg-orange-600 text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center text-2xl transition-transform hover:scale-105"
                title="Asistente virtual"
            >
                {abierto ? '✕' : '💬'}
            </button>

            {/* Panel del chat */}
            {abierto && (
                <div className="fixed bottom-24 right-5 z-[9998] w-[340px] max-w-[92vw] h-[480px] max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
                    <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 flex items-center gap-2">
                        <span className="text-xl">🤖</span>
                        <div>
                            <p className="text-white font-bold text-sm leading-tight">Asistente virtual</p>
                            <p className="text-white/80 text-[10px] leading-tight">Siempre disponible</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 bg-gray-50">
                        {mensajes.map((m, i) => (
                            <div
                                key={i}
                                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-line ${m.role === 'user'
                                        ? 'bg-orange-500 text-white self-end rounded-br-sm'
                                        : 'bg-white text-gray-700 border border-gray-200 self-start rounded-bl-sm'
                                    }`}
                            >
                                {m.text}
                            </div>
                        ))}
                        {enviando && (
                            <div className="bg-white text-gray-400 border border-gray-200 self-start rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
                                Escribiendo...
                            </div>
                        )}
                        <div ref={finRef} />
                    </div>

                    <form onSubmit={enviarMensaje} className="p-2 border-t border-gray-100 flex gap-2">
                        <input
                            type="text"
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                            placeholder="Escribí tu consulta..."
                            className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm outline-none focus:border-orange-400"
                            disabled={enviando}
                        />
                        <button
                            type="submit"
                            disabled={enviando || !texto.trim()}
                            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-full w-9 h-9 flex items-center justify-center flex-shrink-0"
                        >
                            ➤
                        </button>
                    </form>
                </div>
            )}
        </>
    );
}
