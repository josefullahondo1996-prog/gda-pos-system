import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useLanguage } from './LanguageContext';

const PROVEEDORES = [
    { valor: 'goekua', nombre: 'Servicio de Facturación Integrado', url: '' },
    { valor: 'otro', nombre: 'Otro proveedor', url: '' },
];

export default function ConfiguracionFacturaElectronica() {
    const { t } = useLanguage();
    const { id: empresaId, nombre: nombreEmpresa, ruc: rucEmpresa } = useEmpresaInfo();
    const [proveedor, setProveedor] = useState('goekua');
    const [apiKey, setApiKey] = useState('');
    const [activa, setActiva] = useState(false);
    const [notas, setNotas] = useState('');
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [mostrarClave, setMostrarClave] = useState(false);

    useEffect(() => {
        if (empresaId) cargarConfiguracion();
    }, [empresaId]);

    const cargarConfiguracion = async () => {
        setCargando(true);
        const { data } = await supabase
            .from('empresas')
            .select('fe_proveedor, fe_api_key, fe_activa, fe_notas')
            .eq('id', empresaId)
            .maybeSingle();
        if (data) {
            setProveedor(data.fe_proveedor || 'goekua');
            setApiKey(data.fe_api_key || '');
            setActiva(data.fe_activa || false);
            setNotas(data.fe_notas || '');
        }
        setCargando(false);
    };

    const guardar = async () => {
        setGuardando(true);
        const { error } = await supabase
            .from('empresas')
            .update({ fe_proveedor: proveedor, fe_api_key: apiKey, fe_activa: activa, fe_notas: notas })
            .eq('id', empresaId);
        setGuardando(false);
        if (error) return alert('Error al guardar: ' + error.message);
        alert('Configuración guardada exitosamente. El sistema utilizará esta clave para emitir las facturas con SIFEN.');
    };

    if (cargando) return <p className="text-sm text-gray-400 p-6">{t('loading')}</p>;

    return (
        <div className="max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">{t('electronicInvoicing')}</h2>
            <p className="text-gray-400 text-sm mb-6">Conectá tu negocio con el SIFEN de la DNIT (Paraguay) a través de un proveedor tecnológico.</p>

            {/* Guía paso a paso, visible dentro del propio sistema */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6 text-sm text-gray-700">
                <h3 className="font-bold text-blue-800 mb-3">📋 Guía: cómo activar la facturación electrónica</h3>
                <ol className="list-decimal list-inside space-y-2">
                    <li>Contactá con nuestro equipo de soporte para dar de alta la facturación electrónica de <strong>{nombreEmpresa || 'tu empresa'}</strong>.</li>
                    <li>Proporcioná tus datos fiscales reales (RUC, Razón Social, etc.) para el alta en SIFEN.</li>
                    <li>Asegurate de tener tu <strong>Certificado Digital</strong> vigente y configuralo con soporte.</li>
                    <li>Ingresá aquí tu <strong>API Key</strong> de producción (proporcionada por soporte).</li>
                    <li>Marcá la casilla "activa" abajo y guardá.</li>
                </ol>
                <div className="mt-4 p-3 bg-white rounded border border-blue-100 text-xs text-gray-600">
                    <p className="font-bold text-green-700 mb-1">✅ ¡El sistema ya está 100% integrado!</p>
                    <p>
                        Una vez configurada tu API Key, el botón de "Emitir Factura Electrónica" aparecerá al finalizar una venta en el Punto de Venta. 
                        Podrás consultar el estado SIFEN en tiempo real y ver el KuDE directamente desde tu historial de ventas.
                    </p>
                </div>
            </div>

            <div className="flex gap-3 mb-6">
                {PROVEEDORES.filter((p) => p.url).map((p) => (
                    <a key={p.valor} href={p.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 border border-blue-200 rounded-full px-3 py-1.5 hover:bg-blue-50">
                        🔗 Ir a {p.nombre}
                    </a>
                ))}
            </div>

            {/* Datos de la empresa actual, de referencia */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-sm">
                <p className="font-bold text-gray-600 mb-1">Estás configurando facturación electrónica para:</p>
                <p className="text-gray-800">{nombreEmpresa || '—'} {rucEmpresa ? `(RUC: ${rucEmpresa})` : '(todavía no cargaste el RUC en Configuraciones → Datos de la Empresa)'}</p>
            </div>

            {/* Formulario */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Proveedor de facturación electrónica:</label>
                    <select className="w-full border border-gray-300 rounded p-2.5 text-sm bg-white" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                        {PROVEEDORES.map((p) => <option key={p.valor} value={p.valor}>{p.nombre}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Clave de API de Facturación:</label>
                    <div className="flex gap-2">
                        <input
                            type={mostrarClave ? 'text' : 'password'}
                            className="w-full border border-gray-300 rounded p-2.5 text-sm"
                            placeholder="Pegá acá tu API Key"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                        />
                        <button type="button" onClick={() => setMostrarClave(!mostrarClave)} className="text-xs font-bold text-gray-500 border rounded px-3 hover:bg-gray-50">
                            {mostrarClave ? 'Ocultar' : 'Ver'}
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} id="fe_activa" />
                    <label htmlFor="fe_activa" className="text-sm text-gray-700">Ya tengo mi certificado digital aprobado y quiero activar la facturación electrónica</label>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Notas (opcional):</label>
                    <textarea className="w-full border border-gray-300 rounded p-2.5 text-sm" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: certificado vence en agosto 2027" />
                </div>

                <button onClick={guardar} disabled={guardando} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded-lg text-sm disabled:opacity-60">
                    {guardando ? 'Guardando...' : 'Guardar'}
                </button>
            </div>
        </div>
    );
}
