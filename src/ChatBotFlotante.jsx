import { useEffect } from 'react';

export default function ChatBotFlotante({ perfilUsuario }) {
  const empresaId = perfilUsuario?.empresas?.id || perfilUsuario?.empresa_id;
  const usuarioId = perfilUsuario?.id || perfilUsuario?.auth_user_id;
  const nombreEmpresa = perfilUsuario?.empresas?.nombre || 'Mi Negocio';
  const nombreUsuario = perfilUsuario?.nombre || 'Usuario';

  useEffect(() => {
    if (!empresaId) return;

    let cancelado = false;

    const iniciarChat = async () => {
      try {
        // Limpiar widgets previos para evitar mezclar sesiones
        const instanciasPrevias = document.querySelectorAll('.n8n-chat, [class*="n8n-chat"]');
        instanciasPrevias.forEach((el) => el.remove());

        // @ts-ignore
        const { createChat } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@n8n/chat/dist/chat.bundle.es.js');

        if (cancelado) return;

        // Generar un ID de sesión único para esta empresa y usuario
        const sessionId = `sesion_${empresaId}_${usuarioId}`;

        createChat({
          webhookUrl: 'https://jose199666.app.n8n.cloud/webhook/79898afb-2ea2-4aab-a1c4-026661b0e5f6/chat',
          mode: 'window',
          sessionId: sessionId,
          metadata: {
            empresa_id: empresaId,
            usuario_id: usuarioId,
            empresa_nombre: nombreEmpresa,
            usuario_nombre: nombreUsuario,
          },
          initialMessages: [
            `¡Hola, ${nombreUsuario}! 👋 Soy el asistente de ${nombreEmpresa}. ¿En qué te puedo ayudar hoy?`
          ],
          i18n: {
            en: {
              title: `Asistente ${nombreEmpresa}`,
              subtitle: `Empresa: ${nombreEmpresa}`,
              inputPlaceholder: 'Escribe tu consulta...',
              getStarted: 'Nueva conversación',
            },
          },
        });
      } catch (err) {
        console.error('Error al cargar el widget de n8n chat:', err);
      }
    };

    iniciarChat();

    return () => {
      cancelado = true;
      const instancias = document.querySelectorAll('.n8n-chat, [class*="n8n-chat"]');
      instancias.forEach((el) => el.remove());
    };
  }, [empresaId, usuarioId, nombreEmpresa, nombreUsuario]);

  return null;
}
