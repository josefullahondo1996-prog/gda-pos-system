import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useLanguage } from './LanguageContext';

const GOEKUA_CONFIG_URL = 'https://www.goekua.com.py/contacto.html';

export default function ConfiguracionFacturaElectronica() {
    const { t } = useLanguage();
    const { id: empresaId, nombre: nombreEmpresa, ruc: rucEmpresa } = useEmpresaInfo();
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [estado, setEstado] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (empresaId) cargarConfiguracion();
    }, [empresaId]);

    const cargarConfiguracion = async () => {
        setCargando(true);
        const { data, error } = await supabase.functions.invoke('configurar-goekua', { body: { action: 'status', empresaId } });
        if (!error && data) { setEstado(data); setBaseUrl(data.baseUrl || ''); }
        setCargando(false);
    };

    const guardar = async () => {
        if (!apiKey.trim() || !baseUrl.trim()) return alert('Ingresá la API key y la URL de staging confirmadas por Goekua.');
        setGuardando(true);
        const { data, error } = await supabase.functions.invoke('configurar-goekua', { body: { action: 'save', empresaId, ambiente: 'staging', baseUrl, apiKey } });
        setGuardando(false);
        if (error || data?.error) return alert('No se guardó: ' + (data?.error || error.message));
        setApiKey('');
        await cargarConfiguracion();
        alert('Clave de staging guardada cifrada. La emisión sigue deshabilitada hasta completar la validación fiscal y técnica.');
    };

    if (cargando) return <p className="text-sm text-gray-400 p-6">{t('loading')}</p>;

    return (
        <div className="max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">{t('electronicInvoicing')}</h2>
            <p className="text-gray-400 text-sm mb-6">Preparación del ambiente de pruebas de Goekua. Esta pantalla no activa la emisión de documentos.</p>

            {/* Guía paso a paso, visible dentro del propio sistema */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6 text-sm text-gray-700">
                <h3 className="font-bold text-blue-800 mb-3">📋 Guía: cómo activar la facturación electrónica</h3>
                <ol className="list-decimal list-inside space-y-2">
                    <li>Solicitá a Goekua el acceso a staging, su URL base y API key de prueba.</li>
                    <li>Prepará certificado/timbrado de pruebas y datos fiscales de la empresa.</li>
                    <li>Guardá aquí únicamente las credenciales de staging; se cifran en el servidor.</li>
                    <li>Validaremos datos, numeración e idempotencia antes de habilitar cualquier envío.</li>
                </ol>
                <div className="mt-4 p-3 bg-white rounded border border-blue-100 text-xs text-gray-600">
                    <p className="font-bold text-amber-800 mb-1">Estado: preparación, no emisión</p>
                    <p>La conexión previa del sistema todavía no validaba el payload fiscal ni la numeración autorizada. No se enviará nada automáticamente desde una venta.</p>
                </div>
            </div>

            <div className="flex gap-3 mb-6">
                <a href={GOEKUA_CONFIG_URL} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 border border-blue-200 rounded-full px-3 py-1.5 hover:bg-blue-50">🔗 Contactar a Goekua</a>
            </div>

            {/* Datos de la empresa actual, de referencia */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-sm">
                <p className="font-bold text-gray-600 mb-1">Estás configurando facturación electrónica para:</p>
                <p className="text-gray-800">{nombreEmpresa || '—'} {rucEmpresa ? `(RUC: ${rucEmpresa})` : '(todavía no cargaste el RUC en Configuraciones → Datos de la Empresa)'}</p>
            </div>

            {/* Formulario */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{estado?.configurada ? `Staging configurado (${estado.baseUrl}); emisión deshabilitada.` : 'Todavía no hay credenciales de staging guardadas.'}</div>

                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">URL base de staging confirmada por Goekua</label>
                    <input type="url" className="w-full border border-gray-300 rounded p-2.5 text-sm" placeholder="https://staging-…goekua.com.py" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">API key de staging</label>
                    <input type="password" autoComplete="new-password" className="w-full border border-gray-300 rounded p-2.5 text-sm" placeholder={estado?.configurada ? 'Ingresá una clave nueva solo si vas a reemplazarla' : 'No pegues una clave de producción'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                </div>

                <button onClick={guardar} disabled={guardando} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded-lg text-sm disabled:opacity-60">
                    {guardando ? 'Guardando...' : 'Guardar'}
                </button>
            </div>
        </div>
    );
}
