import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { sonidoExito } from './utils/sonido';
import { useEmpresaInfo } from './utils/useEmpresa';

const NuevoClientePOS = ({ onGuardado, onCerrar }) => {
    const { id: empresaId, nombre: nombreDelNegocio } = useEmpresaInfo();
    const [esEmpresa, setEsEmpresa] = useState(false);
    const [tipoDoc, setTipoDoc] = useState('RUC');
    const [nroDoc, setNroDoc] = useState('');

    const [prefijo, setPrefijo] = useState('');
    const [nombre, setNombre] = useState('');
    const [segundoNombre, setSegundoNombre] = useState('');
    const [apellido, setApellido] = useState('');
    const [nombreEmpresa, setNombreEmpresa] = useState('');
    const [representanteLegal, setRepresentanteLegal] = useState('');

    const [telefono, setTelefono] = useState('');
    const [email, setEmail] = useState('');

    const [pais, setPais] = useState('Paraguay');
    const [departamento, setDepartamento] = useState('-- Depto --');
    const [ciudad, setCiudad] = useState('');
    const [direccionCalle, setDireccionCalle] = useState('');
    const [nroCasa, setNroCasa] = useState('');
    const [edificioPiso, setEdificioPiso] = useState('');
    const [codPostal, setCodPostal] = useState('7700');

    const [vendedorAsignado, setVendedorAsignado] = useState('');
    const [grupoClientes, setGrupoClientes] = useState('Ninguna');
    const [saldoInicial, setSaldoInicial] = useState('0');
    const [terminoPagoNum, setTerminoPagoNum] = useState('');
    const [terminoPagoTipo, setTerminoPagoTipo] = useState('Seleccione');
    const [limiteCredito, setLimiteCredito] = useState('0');

    const [mostrarUbicacion, setMostrarUbicacion] = useState(true);
    const [mostrarCredito, setMostrarCredito] = useState(true);
    const [guardando, setGuardando] = useState(false);

    // === Foto del cliente ===
    const [fotoUrl, setFotoUrl] = useState('');
    const [subiendoFoto, setSubiendoFoto] = useState(false);
    const [camaraAbierta, setCamaraAbierta] = useState(false);
    const videoRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    const streamRef = React.useRef(null);

    const subirFoto = async (blobOArchivo) => {
        setSubiendoFoto(true);
        try {
            const extension = blobOArchivo.type?.includes('png') ? 'png' : 'jpg';
            const nombreArchivo = `${crypto.randomUUID()}.${extension}`;
            const { error: errorSubida } = await supabase.storage.from('clientes').upload(nombreArchivo, blobOArchivo);
            if (errorSubida) throw errorSubida;
            const { data: urlData } = supabase.storage.from('clientes').getPublicUrl(nombreArchivo);
            setFotoUrl(urlData.publicUrl);
        } catch (error) {
            alert('Error al subir la foto: ' + error.message + '\n\n¿Ya creaste el bucket "clientes" en Supabase Storage (público)?');
        } finally {
            setSubiendoFoto(false);
        }
    };

    const manejarArchivoFoto = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return alert('La imagen supera los 5MB.');
        subirFoto(file);
    };

    const abrirCamara = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            streamRef.current = stream;
            setCamaraAbierta(true);
            // El <video> recién existe en el próximo render, así que esperamos un tick
            setTimeout(() => {
                if (videoRef.current) videoRef.current.srcObject = stream;
            }, 0);
        } catch (error) {
            alert('No se pudo acceder a la cámara: ' + error.message);
        }
    };

    const cerrarCamara = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCamaraAbierta(false);
    };

    const capturarFoto = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
            if (blob) subirFoto(blob);
            cerrarCamara();
        }, 'image/jpeg', 0.9);
    };

    const guardarCliente = async (e) => {
        e.preventDefault();
        if (!empresaId) {
            alert('No se pudo identificar la empresa activa. Esperá un momento y volvé a intentar.');
            return;
        }
        if (esEmpresa && !nombreEmpresa.trim()) return alert('Ingresá la razón social / nombre comercial.');
        if (!esEmpresa && (!nombre.trim() || !apellido.trim())) return alert('Ingresá nombre y apellido.');

        setGuardando(true);
        try {
            const nombreCompleto = `${prefijo} ${nombre} ${segundoNombre} ${apellido}`.replace(/\s+/g, ' ').trim();
            const nombreFinal = esEmpresa ? nombreEmpresa : nombreCompleto;
            const codigoGenerado = `CL${Math.floor(1000 + Math.random() * 9000)}`;
            const partesDireccion = [direccionCalle, nroCasa ? `Nro ${nroCasa}` : '', edificioPiso].filter(Boolean).join(' ');
            const direccionCompleta = `${partesDireccion}, ${ciudad}, ${departamento}, ${pais} (CP: ${codPostal})`.replace(/^, /, '').trim();
            const terminoPagoFinal = terminoPagoNum ? `${terminoPagoNum} ${terminoPagoTipo}` : '';

            const { data, error } = await supabase
                .from('clientes')
                .insert([{
                    empresa_id: empresaId,
                    tipo_contacto: 'Clientes',
                    codigo_cliente: codigoGenerado,
                    tipo_documento: tipoDoc,
                    documento_nro: nroDoc || null,
                    nombre_empresa: esEmpresa ? nombreEmpresa : null,
                    nombre: nombreFinal,
                    representante_legal: representanteLegal || null,
                    celular: telefono || null,
                    email: email || null,
                    direccion: direccionCompleta,
                    vendedor_asignado: vendedorAsignado || nombreDelNegocio,
                    saldo_apertura: parseFloat(saldoInicial) || 0,
                    termino_pago: terminoPagoFinal,
                    limite_credito: parseFloat(limiteCredito) || 0,
                    estado: 'Activo',
                    foto_url: fotoUrl || null,
                }])
                .select();

            if (error) throw error;

            sonidoExito();
            alert('¡Cliente creado con éxito!');
            if (onGuardado) onGuardado(data[0]);
        } catch (error) {
            const mensaje = error.message?.includes('row-level security')
                ? 'No se pudo guardar el cliente porque la política de seguridad de Supabase no permite insertar en esta empresa. Verificá que el usuario tenga el perfil correcto y que la empresa esté bien asociada.'
                : error.message;
            alert('Error al crear cliente: ' + mensaje);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[99999] p-4">
            <div className="bg-white w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

                <div className="px-6 py-4 bg-[#1e2a4a] flex justify-between items-center">
                    <h3 className="text-white text-lg font-bold flex items-center gap-2">👤+ Nuevo (Cliente Potencial, Cliente, Proveedor)</h3>
                    <button onClick={onCerrar} className="text-white/80 hover:text-white text-2xl font-bold leading-none">×</button>
                </div>

                <div className="p-6 overflow-y-auto bg-gray-50 flex-1 text-xs">
                    <form id="form-cliente-pos" onSubmit={guardarCliente}>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5 items-end">
                            <div className="flex border rounded overflow-hidden shadow-sm h-[42px] md:col-span-2">
                                <button type="button" onClick={() => setEsEmpresa(false)} className={`flex-1 font-bold flex items-center justify-center gap-2 transition-colors ${!esEmpresa ? 'bg-gray-200 text-gray-800 border-b-2 border-blue-500' : 'bg-white text-gray-500'}`}>
                                    👤 Individual
                                </button>
                                <button type="button" onClick={() => setEsEmpresa(true)} className={`flex-1 font-bold flex items-center justify-center gap-2 transition-colors ${esEmpresa ? 'bg-gray-200 text-gray-800 border-b-2 border-blue-500' : 'bg-white text-gray-500'}`}>
                                    🏢 Empresa
                                </button>
                            </div>
                            <div>
                                <label className="block font-bold text-gray-700 uppercase mb-1">Código</label>
                                <input type="text" className="w-full border rounded p-2.5 bg-gray-100 outline-none" placeholder="Automático" disabled />
                            </div>
                        </div>

                        <div className="border border-blue-100 bg-blue-50/40 p-4 rounded-lg mb-5">
                            <h4 className="text-[#004284] font-bold mb-3">🔍 Buscar o registrar contacto</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-bold text-[#004284] uppercase mb-1">Tipo doc.</label>
                                    <select className="w-full border rounded p-2 bg-white" value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
                                        <option value="RUC">RUC</option>
                                        <option value="CÉDULA DE IDENTIDAD">CÉDULA DE IDENTIDAD</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-bold text-[#004284] uppercase mb-1">Nro. documento</label>
                                    <input type="text" className="w-full border rounded p-2 bg-white outline-none focus:border-orange-500" placeholder="Ej: 4671379-4" value={nroDoc} onChange={(e) => setNroDoc(e.target.value)} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border rounded-lg mb-3 p-4 shadow-sm">
                            <h4 className="font-bold text-gray-700 mb-3">Identificación</h4>
                            {esEmpresa ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">Razón social / Nombre comercial *</label><input type="text" className="w-full border rounded p-2.5 bg-white outline-none focus:border-orange-500" value={nombreEmpresa} onChange={(e) => setNombreEmpresa(e.target.value)} /></div>
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">Representante legal</label><input type="text" className="w-full border rounded p-2 bg-white outline-none focus:border-orange-500" value={representanteLegal} onChange={(e) => setRepresentanteLegal(e.target.value)} /></div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">Prefijo</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="—" value={prefijo} onChange={(e) => setPrefijo(e.target.value)} /></div>
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">Nombre *</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">Segundo nombre</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={segundoNombre} onChange={(e) => setSegundoNombre(e.target.value)} /></div>
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">Apellido *</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={apellido} onChange={(e) => setApellido(e.target.value)} /></div>
                                </div>
                            )}
                        </div>

                        {/* === Foto del Cliente: clon de la captura, con subir archivo y cámara web funcionales === */}
                        <div className="bg-white border rounded-lg mb-3 p-4 shadow-sm">
                            <h4 className="font-bold text-orange-600 mb-3 flex items-center gap-1">📷 Foto del Cliente</h4>
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-24 h-24 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden">
                                    {fotoUrl ? (
                                        <img src={fotoUrl} alt="Foto del cliente" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-4xl text-gray-300">👤</span>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    <label className="border rounded px-4 py-2 text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-50 flex items-center gap-1">
                                        ⬆️ {subiendoFoto ? 'Subiendo...' : 'Subir archivo'}
                                        <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={manejarArchivoFoto} disabled={subiendoFoto} />
                                    </label>
                                    <button type="button" onClick={abrirCamara} className="border rounded px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                                        📷 Camara Web
                                    </button>
                                </div>

                                <label className="w-full max-w-xs border-2 border-dashed border-gray-300 rounded-lg py-4 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 transition-colors">
                                    <span className="text-xs font-bold text-gray-500">🖼️ Seleccionar imagen</span>
                                    <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={manejarArchivoFoto} disabled={subiendoFoto} />
                                </label>
                                <p className="text-[10px] text-gray-400">JPG o PNG, max 5MB</p>
                            </div>

                            {/* Modal de cámara web */}
                            {camaraAbierta && (
                                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
                                    <div className="bg-white rounded-xl shadow-2xl p-4 flex flex-col items-center gap-3 max-w-sm w-full">
                                        <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg bg-black" />
                                        <canvas ref={canvasRef} className="hidden" />
                                        <div className="flex gap-2 w-full">
                                            <button type="button" onClick={capturarFoto} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded-lg text-sm">
                                                📸 Capturar
                                            </button>
                                            <button type="button" onClick={cerrarCamara} className="flex-1 border text-gray-600 font-bold py-2 rounded-lg text-sm hover:bg-gray-50">
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-white border rounded-lg mb-3 p-4 shadow-sm">
                            <h4 className="font-bold text-green-600 mb-3 flex items-center gap-1">📞 Contacto</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block font-bold text-gray-700 uppercase mb-1">Teléfono</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="Celular / Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
                                <div><label className="block font-bold text-gray-700 uppercase mb-1">Email</label><input type="email" className="w-full border rounded p-2 bg-white outline-none" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                            </div>
                        </div>

                        <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                            <div className="p-3 flex justify-between items-center cursor-pointer border-b" onClick={() => setMostrarUbicacion(!mostrarUbicacion)}>
                                <h4 className="font-bold text-red-500 flex items-center gap-1">📍 Ubicación y Datos Fiscales</h4>
                                <span className="text-gray-400 font-bold">{mostrarUbicacion ? '▲' : '▼'}</span>
                            </div>
                            {mostrarUbicacion && (
                                <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">País</label><select className="w-full border rounded p-2 bg-white" value={pais} onChange={(e) => setPais(e.target.value)}><option value="Paraguay">Paraguay</option></select></div>
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">Departamento</label><select className="w-full border rounded p-2 bg-white" value={departamento} onChange={(e) => setDepartamento(e.target.value)}><option value="-- Depto --">-- Depto --</option><option value="ALTO PARANA">ALTO PARANA</option></select></div>
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">Ciudad</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={ciudad} onChange={(e) => setCiudad(e.target.value)} /></div>
                                    <div className="hidden md:block"></div>
                                    <div className="md:col-span-2"><label className="block font-bold text-gray-700 uppercase mb-1">Dirección (Calle/Barrio/Av)</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="Calle / Barrio / Av / Referencia" value={direccionCalle} onChange={(e) => setDireccionCalle(e.target.value)} /></div>
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">Nro. casa</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="Ej: 123" value={nroCasa} onChange={(e) => setNroCasa(e.target.value)} /></div>
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">Edificio / Piso</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="Opcional" value={edificioPiso} onChange={(e) => setEdificioPiso(e.target.value)} /></div>
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">Cód. postal</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={codPostal} onChange={(e) => setCodPostal(e.target.value)} /></div>
                                </div>
                            )}
                        </div>

                        <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                            <div className="p-3 flex justify-between items-center cursor-pointer border-b" onClick={() => setMostrarCredito(!mostrarCredito)}>
                                <h4 className="font-bold text-purple-600 flex items-center gap-1">💳 Crédito y Condiciones</h4>
                                <span className="text-gray-400 font-bold">{mostrarCredito ? '▲' : '▼'}</span>
                            </div>
                            {mostrarCredito && (
                                <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="md:col-span-2"><label className="block font-bold text-gray-700 uppercase mb-1">Vendedor asignado</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={vendedorAsignado} onChange={(e) => setVendedorAsignado(e.target.value)} /></div>
                                    <div className="md:col-span-2">
                                        <label className="block font-bold text-gray-700 uppercase mb-1">Grupo de clientes</label>
                                        <select className="w-full border rounded p-2 bg-white" value={grupoClientes} onChange={(e) => setGrupoClientes(e.target.value)}><option value="Ninguna">Ninguna</option></select>
                                    </div>
                                    <div><label className="block font-bold text-gray-700 uppercase mb-1">Saldo inicial</label><input type="number" className="w-full border rounded p-2 bg-white outline-none" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} /></div>
                                    <div className="md:col-span-2">
                                        <label className="block font-bold text-gray-700 uppercase mb-1">Término de pago</label>
                                        <div className="flex gap-2">
                                            <input type="number" className="w-1/2 border rounded p-2 bg-white outline-none" placeholder="N°" value={terminoPagoNum} onChange={(e) => setTerminoPagoNum(e.target.value)} />
                                            <select className="w-1/2 border rounded p-2 bg-white" value={terminoPagoTipo} onChange={(e) => setTerminoPagoTipo(e.target.value)}><option value="Seleccione">Seleccione</option><option value="Dias">Días</option><option value="Meses">Meses</option></select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 uppercase mb-1">Límite de crédito</label>
                                        <input type="number" className="w-full border rounded p-2 bg-white outline-none" value={limiteCredito} onChange={(e) => setLimiteCredito(e.target.value)} />
                                        <p className="text-[10px] text-gray-400 mt-1">Crédito predeterminado (0)</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </form>
                </div>

                <div className="px-6 py-4 border-t bg-white flex justify-end gap-3">
                    <button type="button" onClick={onCerrar} className="bg-white border px-5 py-2 rounded font-bold text-xs">Cerrar</button>
                    <button type="submit" form="form-cliente-pos" disabled={guardando} className="bg-[#fd7e14] text-white px-6 py-2 rounded font-bold text-xs hover:bg-[#e86e04] disabled:opacity-60">
                        {guardando ? 'Guardando...' : '✔ Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NuevoClientePOS;