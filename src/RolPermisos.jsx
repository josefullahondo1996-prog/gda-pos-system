import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { sonidoExito } from './utils/sonido';
import { useEmpresaInfo } from './utils/useEmpresa';

const CATEGORIAS_PERMISOS = [
    {
        key: 'clientes_proveedores', titulo: 'Clientes / Proveedores',
        permisos: ['Ver clientes', 'Agregar cliente', 'Editar cliente', 'Borrar cliente', 'Ver proveedores', 'Agregar proveedor', 'Editar proveedor', 'Borrar proveedor'],
    },
    {
        key: 'usuarios', titulo: 'Usuarios',
        permisos: ['Ver usuarios', 'Agregar usuario', 'Editar usuario', 'Borrar usuario'],
    },
    {
        key: 'roles', titulo: 'Roles',
        permisos: ['Ver roles', 'Agregar rol', 'Editar rol', 'Borrar rol'],
    },
    {
        key: 'productos', titulo: 'Productos',
        permisos: ['Ver productos', 'Agregar producto', 'Editar producto', 'Borrar producto', 'Ver marcas', 'Ver unidades', 'Ver precios de compra'],
    },
    {
        key: 'compras', titulo: 'Compras',
        permisos: ['Ver compras', 'Agregar compra', 'Editar compra', 'Borrar compra', 'Ver deudas a proveedores'],
    },
    {
        key: 'ventas_pos', titulo: 'Ventas / Punto de venta',
        permisos: ['Acceder al Punto de Venta', 'Solo Punto de Venta (bloquea todo lo demás)', 'Aplicar descuentos', 'Registrar venta a crédito', 'Editar precio manualmente', 'Ver ventas de otros usuarios'],
    },
    {
        key: 'caja', titulo: 'Caja',
        permisos: ['Abrir caja', 'Cerrar caja', 'Registrar gastos del turno', 'Ver caja registradora (histórico)'],
    },
    {
        key: 'gastos', titulo: 'Gastos',
        permisos: ['Ver gastos', 'Agregar gasto'],
    },
    {
        key: 'informes', titulo: 'Informes',
        permisos: ['Ver Ganancias y Pérdidas', 'Ver Caja registradora', 'Exportar reportes (CSV/Excel/PDF)'],
    },
    {
        key: 'configuraciones', titulo: 'Configuraciones',
        permisos: ['Acceso a configuraciones generales del sistema'],
    },
];

const RolPermisos = ({ rolEditar, onGuardado, onCancelar }) => {
    const { id: empresaId } = useEmpresaInfo();
    const [nombreRol, setNombreRol] = useState('');
    const [descripcionRol, setDescripcionRol] = useState('');
    const [permisos, setPermisos] = useState({});
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (!rolEditar) return;
        setNombreRol(rolEditar.nombre || '');
        setDescripcionRol(rolEditar.descripcion || '');
        setPermisos(rolEditar.permisos || {});
    }, [rolEditar]);

    const estaMarcado = (categoriaKey, permiso) => !!permisos[categoriaKey]?.[permiso];

    const toggleUno = (categoriaKey, permiso) => {
        setPermisos((prev) => ({
            ...prev,
            [categoriaKey]: { ...prev[categoriaKey], [permiso]: !prev[categoriaKey]?.[permiso] },
        }));
    };

    const toggleCategoriaCompleta = (categoria) => {
        const todosMarcados = categoria.permisos.every((p) => estaMarcado(categoria.key, p));
        const nuevoValor = !todosMarcados;
        setPermisos((prev) => ({
            ...prev,
            [categoria.key]: Object.fromEntries(categoria.permisos.map((p) => [p, nuevoValor])),
        }));
    };

    const guardarRol = async (e) => {
        e.preventDefault();
        if (!nombreRol.trim()) return alert('El nombre del rol es obligatorio.');

        setGuardando(true);
        try {
            const datos = { nombre: nombreRol.trim(), descripcion: descripcionRol || null, permisos };

            if (rolEditar) {
                const { error } = await supabase.from('roles').update(datos).eq('id', rolEditar.id).eq('empresa_id', empresaId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('roles').insert([{ ...datos, empresa_id: empresaId }]);
                if (error) throw error;
            }

            sonidoExito();
            alert(rolEditar ? '¡Rol actualizado con éxito!' : '¡Rol creado con éxito!');
            if (onGuardado) onGuardado();
        } catch (error) {
            alert('Error al guardar el rol: ' + error.message);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="bg-transparent text-sm text-gray-700">
            <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-gray-500">
                    <span className="text-blue-600">CDEpos</span> / Roles / <span className="text-gray-700">{rolEditar ? 'Editar rol' : 'Agregar rol'}</span>
                </p>
                <button onClick={onCancelar} className="text-xs font-bold text-gray-500 hover:text-gray-800">← Volver a la lista</button>
            </div>

            <form onSubmit={guardarRol}>
                <div className="bg-white p-5 rounded-lg shadow-sm border-t-2 border-[#004284] mb-4">
                    <h2 className="font-bold text-gray-800 text-lg mb-4">{rolEditar ? 'Editar rol' : 'Agregar rol'}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Nombre del rol *</label>
                            <input autoFocus className="w-full border border-gray-300 rounded p-2.5 text-sm" value={nombreRol} onChange={(e) => setNombreRol(e.target.value)} placeholder="Ej: Cajero" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Descripción (opcional)</label>
                            <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={descripcionRol} onChange={(e) => setDescripcionRol(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284] mb-4 overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-2">
                        {CATEGORIAS_PERMISOS.map((categoria) => {
                            const todosMarcados = categoria.permisos.every((p) => estaMarcado(categoria.key, p));
                            const algunoMarcado = categoria.permisos.some((p) => estaMarcado(categoria.key, p));
                            return (
                                <div key={categoria.key} className="border border-gray-100 p-4">
                                    <label className="flex items-center gap-2 font-bold text-gray-800 mb-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={todosMarcados}
                                            ref={(el) => { if (el) el.indeterminate = algunoMarcado && !todosMarcados; }}
                                            onChange={() => toggleCategoriaCompleta(categoria)}
                                        />
                                        {categoria.titulo}
                                        <span className="text-[10px] font-normal text-blue-500 ml-1">Seleccionar todo</span>
                                    </label>
                                    <div className="flex flex-col gap-2 pl-1">
                                        {categoria.permisos.map((permiso) => (
                                            <label key={permiso} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                                <input type="checkbox" checked={estaMarcado(categoria.key, permiso)} onChange={() => toggleUno(categoria.key, permiso)} />
                                                {permiso}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onCancelar} className="border border-gray-300 text-gray-600 font-bold px-5 py-2.5 rounded hover:bg-gray-50">Cancelar</button>
                    <button type="submit" disabled={guardando} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded disabled:opacity-60">
                        {guardando ? 'Guardando...' : '💾 Guardar'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default RolPermisos;