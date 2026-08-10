import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const PROVEEDORES = [
    { valor: 'adoqia', nombre: 'AdoqIA', url: 'https://www.adoqia.com' },
    { valor: 'goekua', nombre: 'GOEKUA', url: 'https://goekua.com.py' },
    { valor: 'otro', nombre: 'Otro proveedor', url: '' },
];

export default function ConfiguracionFacturaElectronica() {
    const { id: empresaId, nombre: nombreEmpresa, ruc: rucEmpresa } = useEmpresaInfo();
    const [proveedor, setProveedor] = useState('adoqia');
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
            setProveedor(data.fe_proveedor || 'adoqia');
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
        alert('Datos guardados. Cuando tengamos la conexión real armada, el sistema va a usar esta clave automáticamente.');
    };

    if (cargando) return <p className="text-sm text-gray-400 p-6">Cargando...</p>;

    return (
        <div className="max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Configuración de facturación electrónica</h2>
            <p className="text-gray-400 text-sm mb-6">Conectá tu negocio con el SIFEN de la DNIT (Paraguay) a través de un proveedor tecnológico.</p>

            {/* Guía paso a paso, visible dentro del propio sistema */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6 text-sm text-gray-700">
                <h3 className="font-bold text-blue-800 mb-3">📋 Guía: cómo activar la facturación electrónica de tu negocio</h3>
                <ol className="list-decimal list-inside space-y-2">
                    <li>Registrate en un proveedor de facturación electrónica homologado (por ejemplo AdoqIA o GOEKUA, abajo tenés los links).</li>
                    <li>Completá ahí los datos reales de <strong>tu</strong> negocio: RUC, razón social, dirección.</li>
                    <li>Gestioná tu <strong>certificado digital</strong> (firma electrónica) desde la misma plataforma del proveedor — es obligatorio y va atado a tu RUC.</li>
                    <li>Una vez aprobado, entrá a la sección "API" / "Desarrolladores" del proveedor y generá tu <strong>clave de API</strong>.</li>
                    <li>Pegá esa clave acá abajo y guardá. Cuando la conexión esté 100% activa, cada venta va a facturarse sola.</li>
                </ol>
                <p className="mt-3 text-xs text-blue-600">
                    ⚠️ Esta pantalla ya guarda tu clave de forma segura en tu cuenta, pero el envío automático de cada venta a la DNIT todavía se está terminando de programar — es el siguiente paso una vez que tengas tu clave lista.
                </p>
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
                    <label className="block text-xs font-bold text-gray-600 mb-1">Clave de API (la que te dio el proveedor):</label>
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
