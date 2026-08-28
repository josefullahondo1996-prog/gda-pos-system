/**
 * LayoutWebEscritorio
 * Envoltura para el sistema completo en web/escritorio
 * Este layout mantiene todo el sistema administrativo actual
 */
export default function LayoutWebEscritorio({ children }) {
  return (
    <div className="h-screen w-full bg-white">
      {children}
    </div>
  );
}
