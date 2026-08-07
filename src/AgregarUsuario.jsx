import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { sonidoExito } from './utils/sonido';
import { useEmpresaInfo, useNombreEmpresa } from './utils/useEmpresa';

const AgregarUsuario = ({ usuarioEditar, onGuardado, onCancelar }) => {
    const { id: empresaId } = useEmpresaInfo();
    const nombreEmpresa = useNombreEmpresa();
    const [prefijo, setPrefijo] = useState('');
    const [nombre, setNombre] = useState('');
    const [apellido, setApellido] = useState('');
    const [email, setEmail] = useState('');
    const [activo, setActivo] = useState(true);

    const [permitirAcceso, setPermitirAcceso] = useState(true);
    const [nombreUsuario, setNombreUsuario] = useState('');
    const [contrasena, setContrasena] = useState('');
    const [confirmarContrasena, setConfirmarContrasena] = useState('');
    const [rolId, setRolId] = useState('');
    const [todasLocalizaciones, setTodasLocalizaciones] = useState(true);
    const [rolesDisponibles, setRolesDisponibles] = useState([]);
    const [ubicacionesDisponibles, setUbicacionesDisponibles] = useState([]);
    const [ubicacionId, setUbicacionId] = useState('');

    const [comisionVentas, setComisionVentas] = useState('');
    const [descuentoMaxVentas, setDescuentoMaxVentas] = useState('');
    const [permitirContactos, setPermitirContactos] = useState(false);

    const [fechaNacimiento, setFechaNacimiento] = useState('');
    const [genero, setGenero] = useState('');
    const [estadoCivil, setEstadoCivil] = useState('');
    const [grupoSanguineo, setGrupoSanguineo] = useState('');
    const [telefonoMovil, setTelefonoMovil] = useState('');
    const [telefonoAlternativo, setTelefonoAlternativo] = useState('');
    const [contactoFamiliar, setContactoFamiliar] = useState('');
    const [facebook, setFacebook] = useState('');
    const [twitter, setTwitter] = useState('');
    const [redesSociales1, setRedesSociales1] = useState('');
    const [redesSociales2, setRedesSociales2] = useState('');
    const [campoPersonalizado1, setCampoPersonalizado1] = useState('');
    const [campoPersonalizado2, setCampoPersonalizado2] = useState('');
    const [campoPersonalizado3, setCampoPersonalizado3] = useState('');
    const [campoPersonalizado4, setCampoPersonalizado4] = useState('');
    const [nombreTutor, setNombreTutor] = useState('');
    const [nombrePruebaId, setNombrePruebaId] = useState('');
    const [numeroPruebaId, setNumeroPruebaId] = useState('');
    const [direccionPermanente, setDireccionPermanente] = useState('');
    const [direccionActual, setDireccionActual] = useState('');

    const [bancoTitular, setBancoTitular] = useState('');
    const [bancoNumeroCuenta, setBancoNumeroCuenta] = useState('');
    const [bancoNombre, setBancoNombre] = useState('');
    const [bancoCodigoId, setBancoCodigoId] = useState('');
    const [rama, setRama] = useState('');
    const [identificacionFiscal, setIdentificacionFiscal] = useState('');

    const [departamentoRRHH, setDepartamentoRRHH] = useState('');
    const [designacion, setDesignacion] = useState('');

    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        const cargarRoles = async () => {
            if (!empresaId) return;
            const { data } = await supabase.from('roles').select('*').eq('empresa_id', empresaId).order('nombre');
            if (data) setRolesDisponibles(data);
        };
        cargarRoles();
    }, [empresaId]);

    useEffect(() => {
        const cargarUbicaciones = async () => {
            if (!empresaId) return;
            const { data } = await supabase.from('ubicaciones_comerciales').select('id, nombre, codigo_ubicacion').eq('empresa_id', empresaId).order('creado_en');
            if (data) {
                setUbicacionesDisponibles(data);
                if (!ubicacionId && data.length > 0) setUbicacionId(data[0].id);
            }
        };
        cargarUbicaciones();
    }, [empresaId]);

    useEffect(() => {
        if (!usuarioEditar) return;
        setPrefijo(usuarioEditar.prefijo || '');
        setNombre(usuarioEditar.nombre || '');
        setApellido(usuarioEditar.apellido || '');
        setEmail(usuarioEditar.email || '');
        setActivo(usuarioEditar.activo ?? true);
        setPermitirAcceso(usuarioEditar.permitir_acceso ?? true);
        setNombreUsuario(usuarioEditar.nombre_usuario || '');
        setRolId(usuarioEditar.rol_id || '');
        setTodasLocalizaciones(usuarioEditar.todas_localizaciones ?? true);
        setUbicacionId(usuarioEditar.ubicacion_id || '');
        setComisionVentas(usuarioEditar.comision_ventas ?? '');
        setDescuentoMaxVentas(usuarioEditar.descuento_max_ventas ?? '');
        setPermitirContactos(usuarioEditar.permitir_contactos_seleccionados || false);
        setFechaNacimiento(usuarioEditar.fecha_nacimiento || '');
        setGenero(usuarioEditar.genero || '');
        setEstadoCivil(usuarioEditar.estado_civil || '');
        setGrupoSanguineo(usuarioEditar.grupo_sanguineo || '');
        setTelefonoMovil(usuarioEditar.telefono_movil || '');
        setTelefonoAlternativo(usuarioEditar.telefono_alternativo || '');
        setContactoFamiliar(usuarioEditar.contacto_familiar || '');
        setFacebook(usuarioEditar.facebook || '');
        setTwitter(usuarioEditar.twitter || '');
        setRedesSociales1(usuarioEditar.redes_sociales_1 || '');
        setRedesSociales2(usuarioEditar.redes_sociales_2 || '');
        setCampoPersonalizado1(usuarioEditar.campo_personalizado_1 || '');
        setCampoPersonalizado2(usuarioEditar.campo_personalizado_2 || '');
        setCampoPersonalizado3(usuarioEditar.campo_personalizado_3 || '');
        setCampoPersonalizado4(usuarioEditar.campo_personalizado_4 || '');
        setNombreTutor(usuarioEditar.nombre_tutor || '');
        setNombrePruebaId(usuarioEditar.nombre_prueba_id || '');
        setNumeroPruebaId(usuarioEditar.numero_prueba_id || '');
        setDireccionPermanente(usuarioEditar.direccion_permanente || '');
        setDireccionActual(usuarioEditar.direccion_actual || '');
        setBancoTitular(usuarioEditar.banco_titular || '');
        setBancoNumeroCuenta(usuarioEditar.banco_numero_cuenta || '');
        setBancoNombre(usuarioEditar.banco_nombre || '');
        setBancoCodigoId(usuarioEditar.banco_codigo_id || '');
        setRama(usuarioEditar.rama || '');
        setIdentificacionFiscal(usuarioEditar.identificacion_fiscal || '');
        setDepartamentoRRHH(usuarioEditar.departamento || '');
        setDesignacion(usuarioEditar.designacion || '');
    }, [usuarioEditar]);

    const guardarUsuario = async (e) => {
        e.preventDefault();
        if (!nombre.trim()) return alert('El nombre es obligatorio.');
        if (!email.trim()) return alert('El email es obligatorio.');
        if (permitirAcceso && !usuarioEditar && contrasena !== confirmarContrasena) {
            return alert('Las contraseñas no coinciden.');
        }
        if (permitirAcceso && !rolId) return alert('Seleccioná un rol.');
        if (!todasLocalizaciones && !ubicacionId) return alert('Seleccioná la sucursal fija de este usuario.');

        setGuardando(true);
        try {
            const datos = {
                empresa_id: empresaId,
                prefijo: prefijo || null,
                nombre: nombre.trim(),
                apellido: apellido || null,
                email: email.trim(),
                activo,
                permitir_acceso: permitirAcceso,
                nombre_usuario: nombreUsuario || (email.split('@')[0] || null),
                rol_id: rolId || null,
                todas_localizaciones: todasLocalizaciones,
                ubicacion_id: todasLocalizaciones ? null : ubicacionId,
                comision_ventas: comisionVentas ? Number(comisionVentas) : null,
                descuento_max_ventas: descuentoMaxVentas ? Number(descuentoMaxVentas) : null,
                permitir_contactos_seleccionados: permitirContactos,
                fecha_nacimiento: fechaNacimiento || null,
                genero: genero || null,
                estado_civil: estadoCivil || null,
                grupo_sanguineo: grupoSanguineo || null,
                telefono_movil: telefonoMovil || null,
                telefono_alternativo: telefonoAlternativo || null,
                contacto_familiar: contactoFamiliar || null,
                facebook: facebook || null,
                twitter: twitter || null,
                redes_sociales_1: redesSociales1 || null,
                redes_sociales_2: redesSociales2 || null,
                campo_personalizado_1: campoPersonalizado1 || null,
                campo_personalizado_2: campoPersonalizado2 || null,
                campo_personalizado_3: campoPersonalizado3 || null,
                campo_personalizado_4: campoPersonalizado4 || null,
                nombre_tutor: nombreTutor || null,
                nombre_prueba_id: nombrePruebaId || null,
                numero_prueba_id: numeroPruebaId || null,
                direccion_permanente: direccionPermanente || null,
                direccion_actual: direccionActual || null,
                banco_titular: bancoTitular || null,
                banco_numero_cuenta: bancoNumeroCuenta || null,
                banco_nombre: bancoNombre || null,
                banco_codigo_id: bancoCodigoId || null,
                rama: rama || null,
                identificacion_fiscal: identificacionFiscal || null,
                departamento: departamentoRRHH || null,
                designacion: designacion || null,
            };

            if (usuarioEditar) {
                // Si ahora permitimos acceso, tiene contraseña cargada y no tiene auth_user_id previo, creamos el login
                if (permitirAcceso && contrasena && !usuarioEditar.auth_user_id) {
                    const { data: resultado, error: errorFuncion } = await supabase.functions.invoke('create-user', {
                        body: { email: email.trim(), password: contrasena, nombre: nombre.trim() },
                    });

                    if (errorFuncion || resultado?.error) {
                        let mensajeStr = resultado?.error;
                        if (!mensajeStr && errorFuncion) {
                            try {
                                const errBody = await errorFuncion.context.json();
                                mensajeStr = errBody.error || errBody.message;
                            } catch (_) {
                                mensajeStr = errorFuncion.message;
                            }
                        }
                        throw new Error(mensajeStr || 'Error al invocar la función de creación de usuario');
                    }

                    datos.auth_user_id = resultado.user.id;
                }

                const { error } = await supabase.from('usuarios').update(datos).eq('id', usuarioEditar.id).eq('empresa_id', empresaId);
                if (error) throw error;
            } else {
                // Si se marcó "Permitir acceso" y cargó contraseña, creamos el login real primero
                if (permitirAcceso && contrasena) {
                    const { data: resultado, error: errorFuncion } = await supabase.functions.invoke('create-user', {
                        body: { email: email.trim(), password: contrasena, nombre: nombre.trim() },
                    });

                    if (errorFuncion || resultado?.error) {
                        let mensajeStr = resultado?.error;
                        if (!mensajeStr && errorFuncion) {
                            try {
                                const errBody = await errorFuncion.context.json();
                                mensajeStr = errBody.error || errBody.message;
                            } catch (_) {
                                mensajeStr = errorFuncion.message;
                            }
                        }
                        throw new Error(mensajeStr || 'Error al invocar la función de creación de usuario');
                    }

                    datos.auth_user_id = resultado.user.id;
                }

                const { error } = await supabase.from('usuarios').insert([{ ...datos, empresa_id: empresaId }]);
                if (error) throw error;
            }

            sonidoExito();
            alert(usuarioEditar ? '¡Usuario actualizado con éxito!' : '¡Usuario creado con éxito! Ya puede iniciar sesión con su email y contraseña.');
            if (onGuardado) onGuardado();
        } catch (error) {
            alert('Error al guardar el usuario: ' + error.message);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="bg-transparent text-sm text-gray-700">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800">{usuarioEditar ? 'Editar usuario' : 'Agregar usuario'}</h2>
                <button onClick={onCancelar} className="text-xs font-bold text-gray-500 hover:text-gray-800">← Volver a la lista</button>
            </div>

            <form onSubmit={guardarUsuario} className="flex flex-col gap-4">

                {/* Datos básicos */}
                <div className="bg-white p-5 rounded-lg shadow-sm border-t-2 border-[#004284]">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Prefijo:</label>
                            <input className="w-full border border-gray-300 rounded p-2 text-sm" placeholder="Señor, señora" value={prefijo} onChange={(e) => setPrefijo(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Nombre:*</label>
                            <input className="w-full border border-gray-300 rounded p-2 text-sm" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Apellido:</label>
                            <input className="w-full border border-gray-300 rounded p-2 text-sm" placeholder="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Email:*</label>
                            <input type="email" className="w-full border border-gray-300 rounded p-2 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mt-5">
                            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> ¿Está activo?
                        </label>
                    </div>
                </div>

                {/* Roles y permisos */}
                <div className="bg-white p-5 rounded-lg shadow-sm border-t-2 border-[#004284]">
                    <h3 className="font-bold text-gray-800 mb-4">Roles y permisos</h3>
                    <label className="flex items-center gap-2 font-bold text-gray-700 mb-4">
                        <input type="checkbox" checked={permitirAcceso} onChange={(e) => setPermitirAcceso(e.target.checked)} /> Permitir acceso
                    </label>

                    {permitirAcceso && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-1">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Nombre de usuario:</label>
                                    <input className="w-full border border-gray-300 rounded p-2 text-sm" placeholder="Nombre de usuario" value={nombreUsuario} onChange={(e) => setNombreUsuario(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Contraseña:{!usuarioEditar && '*'}</label>
                                    <input type="password" className="w-full border border-gray-300 rounded p-2 text-sm" placeholder="Contraseña" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Confirmar contraseña:{!usuarioEditar && '*'}</label>
                                    <input type="password" className="w-full border border-gray-300 rounded p-2 text-sm" placeholder="Confirmar contraseña" value={confirmarContrasena} onChange={(e) => setConfirmarContrasena(e.target.value)} />
                                </div>
                            </div>
                            <p className="text-[11px] text-gray-400 mb-4">Dejar en blanco para generar automáticamente el nombre de usuario</p>

                            <div className="mb-4">
                                <label className="block text-xs font-bold text-gray-500 mb-1">Rol:*</label>
                                <select className="w-full md:w-1/2 border border-gray-300 rounded p-2 text-sm bg-white" value={rolId} onChange={(e) => setRolId(e.target.value)}>
                                    <option value="">Seleccione</option>
                                    {rolesDisponibles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-2">Lugares de acceso:</label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                                    <input type="checkbox" checked={todasLocalizaciones} onChange={(e) => setTodasLocalizaciones(e.target.checked)} /> Todas las localizaciones
                                </label>
                                {!todasLocalizaciones && (
                                    <div className="pl-6 mt-2">
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Sucursal fija:*</label>
                                        <select
                                            className="w-full md:w-1/2 border border-gray-300 rounded p-2 text-sm bg-white"
                                            value={ubicacionId}
                                            onChange={(e) => setUbicacionId(e.target.value)}
                                        >
                                            <option value="">Seleccione una sucursal</option>
                                            {ubicacionesDisponibles.map((u) => (
                                                <option key={u.id} value={u.id}>
                                                    {u.nombre} {u.codigo_ubicacion ? `(${u.codigo_ubicacion})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-[11px] text-gray-400 mt-1">Este usuario solo va a ver el stock, ventas y caja de esta sucursal.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Ventas */}
                <div className="bg-white p-5 rounded-lg shadow-sm border-t-2 border-[#004284]">
                    <h3 className="font-bold text-gray-800 mb-4">Ventas</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Porcentaje de la Comisión de Ventas (%):</label>
                            <input type="number" className="w-full border border-gray-300 rounded p-2 text-sm" value={comisionVentas} onChange={(e) => setComisionVentas(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Porcentaje máximo de descuento de ventas:</label>
                            <input type="number" className="w-full border border-gray-300 rounded p-2 text-sm" value={descuentoMaxVentas} onChange={(e) => setDescuentoMaxVentas(e.target.value)} />
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={permitirContactos} onChange={(e) => setPermitirContactos(e.target.checked)} /> Permitir contactos seleccionados
                    </label>
                </div>

                {/* Datos Financieros */}
                <div className="bg-white p-5 rounded-lg shadow-sm border-t-2 border-[#004284]">
                    <h3 className="font-bold text-gray-800 mb-4">Datos Financieros</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Fecha de nacimiento:</label><input type="date" className="w-full border border-gray-300 rounded p-2 text-sm" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Género:</label><select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={genero} onChange={(e) => setGenero(e.target.value)}><option value="">Seleccione</option><option>Masculino</option><option>Femenino</option><option>Otro</option></select></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Estado civil:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={estadoCivil} onChange={(e) => setEstadoCivil(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Grupo sanguíneo:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={grupoSanguineo} onChange={(e) => setGrupoSanguineo(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Número de teléfono móvil:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={telefonoMovil} onChange={(e) => setTelefonoMovil(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Número de contacto alternativo:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={telefonoAlternativo} onChange={(e) => setTelefonoAlternativo(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Número de contacto familiar:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={contactoFamiliar} onChange={(e) => setContactoFamiliar(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Enlace de Facebook:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={facebook} onChange={(e) => setFacebook(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Enlace de Twitter:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={twitter} onChange={(e) => setTwitter(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Redes sociales 1:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={redesSociales1} onChange={(e) => setRedesSociales1(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Redes sociales 2:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={redesSociales2} onChange={(e) => setRedesSociales2(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Campo personalizado 1:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={campoPersonalizado1} onChange={(e) => setCampoPersonalizado1(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Campo personalizado 2:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={campoPersonalizado2} onChange={(e) => setCampoPersonalizado2(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Campo personalizado 3:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={campoPersonalizado3} onChange={(e) => setCampoPersonalizado3(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Campo personalizado 4:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={campoPersonalizado4} onChange={(e) => setCampoPersonalizado4(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Nombre del tutor:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={nombreTutor} onChange={(e) => setNombreTutor(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Nombre de prueba de identificación:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={nombrePruebaId} onChange={(e) => setNombrePruebaId(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Número de prueba de identificación:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={numeroPruebaId} onChange={(e) => setNumeroPruebaId(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Dirección permanente:</label><textarea className="w-full border border-gray-300 rounded p-2 text-sm h-20" value={direccionPermanente} onChange={(e) => setDireccionPermanente(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Dirección actual:</label><textarea className="w-full border border-gray-300 rounded p-2 text-sm h-20" value={direccionActual} onChange={(e) => setDireccionActual(e.target.value)} /></div>
                    </div>

                    <hr className="my-4 border-gray-100" />
                    <p className="font-bold text-gray-700 mb-3">Detalles del banco:</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Nombre del titular de la cuenta:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={bancoTitular} onChange={(e) => setBancoTitular(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Número de cuenta:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={bancoNumeroCuenta} onChange={(e) => setBancoNumeroCuenta(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Nombre del banco:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={bancoNombre} onChange={(e) => setBancoNombre(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Código de identificación del banco:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={bancoCodigoId} onChange={(e) => setBancoCodigoId(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Rama:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={rama} onChange={(e) => setRama(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">Identificación fiscal:</label><input className="w-full border border-gray-300 rounded p-2 text-sm" value={identificacionFiscal} onChange={(e) => setIdentificacionFiscal(e.target.value)} /></div>
                    </div>
                </div>

                {/* RRHH */}
                <div className="bg-white p-5 rounded-lg shadow-sm border-t-2 border-[#004284]">
                    <h3 className="font-bold text-gray-800 mb-4">Detalles de gestión de recursos humanos</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Departamento:</label>
                            <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={departamentoRRHH} onChange={(e) => setDepartamentoRRHH(e.target.value)}>
                                <option value="">Seleccione</option>
                                <option>Ventas</option><option>Administración</option><option>Depósito</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Designación:</label>
                            <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={designacion} onChange={(e) => setDesignacion(e.target.value)}>
                                <option value="">Seleccione</option>
                                <option>Cajero</option><option>Vendedor</option><option>Gerente</option><option>Encargado de depósito</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex justify-center">
                    <button type="submit" disabled={guardando} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-2.5 rounded disabled:opacity-60">
                        {guardando ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AgregarUsuario;