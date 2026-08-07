import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { tieneError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { tieneError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('Error capturado por ErrorBoundary:', error, info);
  }

  handleReintentar = () => {
    this.setState({ tieneError: false, error: null });
  };

  render() {
    if (this.state.tieneError) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full border border-gray-100">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Ocurrió un error inesperado</h2>
            <p className="text-sm text-gray-500 mb-6">
              La pantalla tuvo un problema al mostrarse. Podés intentar de nuevo; si el error
              se repite, avisá al soporte técnico con el detalle de abajo.
            </p>
            <button
              onClick={this.handleReintentar}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-colors uppercase tracking-wider text-sm"
            >
              Reintentar
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 mt-2 text-gray-500 hover:text-gray-700 font-medium text-sm"
            >
              Recargar la página
            </button>
            {this.state.error?.message && (
              <p className="text-xs text-gray-400 mt-6 break-words">{this.state.error.message}</p>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;