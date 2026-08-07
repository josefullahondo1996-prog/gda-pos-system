-- database/schema.sql
-- Tenant-aware schema for GDA POS system

-- Enable UUID generation for Supabase/PostgreSQL
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE empresas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    direccion text,
    email text,
    telefono text,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    permisos jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, nombre)
);

CREATE TABLE usuarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    auth_user_id uuid,
    prefijo text,
    nombre text NOT NULL,
    apellido text,
    email text,
    nombre_usuario text,
    activo boolean NOT NULL DEFAULT true,
    permitir_acceso boolean NOT NULL DEFAULT true,
    rol_id uuid REFERENCES roles(id),
    todas_localizaciones boolean NOT NULL DEFAULT true,
    comision_ventas numeric(8,2),
    descuento_max_ventas numeric(8,2),
    permitir_contactos_seleccionados boolean NOT NULL DEFAULT false,
    fecha_nacimiento date,
    genero text,
    estado_civil text,
    grupo_sanguineo text,
    telefono_movil text,
    telefono_alternativo text,
    contacto_familiar text,
    facebook text,
    twitter text,
    redes_sociales_1 text,
    redes_sociales_2 text,
    campo_personalizado_1 text,
    campo_personalizado_2 text,
    campo_personalizado_3 text,
    campo_personalizado_4 text,
    nombre_tutor text,
    nombre_prueba_id text,
    numero_prueba_id text,
    direccion_permanente text,
    direccion_actual text,
    banco_titular text,
    banco_numero_cuenta text,
    banco_nombre text,
    banco_codigo_id text,
    rama text,
    identificacion_fiscal text,
    departamento text,
    designacion text,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marcas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, nombre)
);

CREATE TABLE unidades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, nombre)
);

CREATE TABLE productos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    codigo text,
    nombre text NOT NULL,
    descripcion text,
    precio_compra numeric(12,2),
    precio_venta numeric(12,2),
    stock_actual numeric NOT NULL DEFAULT 0,
    categoria text,
    marca_id uuid REFERENCES marcas(id),
    unidad_id uuid REFERENCES unidades(id),
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clientes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    tipo_contacto text,
    codigo_cliente text,
    tipo_documento text,
    documento_nro text,
    nombre_empresa text,
    nombre text,
    representante_legal text,
    celular text,
    email text,
    direccion text,
    vendedor_asignado text,
    grupo_clientes text,
    saldo_apertura numeric(12,2) NOT NULL DEFAULT 0,
    termino_pago text,
    limite_credito numeric(12,2) NOT NULL DEFAULT 0,
    estado text,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proveedores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    empresa text,
    nombre_contacto text,
    email text,
    ruc text,
    documento text,
    termino_pago text,
    saldo numeric(12,2) DEFAULT 0,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE compras (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    proveedor_nombre text,
    nro_factura text,
    total numeric(12,2) NOT NULL DEFAULT 0,
    saldo_pendiente numeric(12,2) NOT NULL DEFAULT 0,
    estado text,
    estado_compra text,
    fecha timestamptz,
    ubicacion text,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE detalle_compras (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    compra_id uuid NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    producto_id uuid REFERENCES productos(id),
    nombre_producto text,
    codigo_sku text,
    cantidad numeric NOT NULL DEFAULT 0,
    costo_unitario numeric(12,2) NOT NULL DEFAULT 0,
    subtotal numeric(12,2) NOT NULL DEFAULT 0,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ventas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente text,
    total numeric(12,2) NOT NULL DEFAULT 0,
    metodo_pago text,
    estado_pago text,
    monto_pagado numeric(12,2) NOT NULL DEFAULT 0,
    saldo_pendiente numeric(12,2) NOT NULL DEFAULT 0,
    articulos integer NOT NULL DEFAULT 0,
    descuento numeric(12,2) NOT NULL DEFAULT 0,
    cargo_embalaje numeric(12,2) NOT NULL DEFAULT 0,
    nota_venta text,
    fecha timestamptz,
    caja_id uuid,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE detalle_ventas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    venta_id uuid NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id uuid REFERENCES productos(id),
    nombre_producto text,
    cantidad numeric NOT NULL DEFAULT 0,
    precio_unitario numeric(12,2) NOT NULL DEFAULT 0,
    subtotal numeric(12,2) NOT NULL DEFAULT 0,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE caja_registros (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    fecha_apertura timestamptz,
    fecha_cierre timestamptz,
    saldo_inicial numeric(12,2),
    saldo_final numeric(12,2),
    estado text,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gastos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    descripcion text,
    monto numeric(12,2) NOT NULL DEFAULT 0,
    categoria text,
    metodo_pago text,
    cuenta_pago text,
    caja_id uuid,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON usuarios(empresa_id);
CREATE INDEX ON roles(empresa_id);
CREATE INDEX ON productos(empresa_id);
CREATE INDEX ON clientes(empresa_id);
CREATE INDEX ON proveedores(empresa_id);
CREATE INDEX ON compras(empresa_id);
CREATE INDEX ON detalle_compras(empresa_id);
CREATE INDEX ON ventas(empresa_id);
CREATE INDEX ON detalle_ventas(empresa_id);
CREATE INDEX ON caja_registros(empresa_id);
CREATE INDEX ON gastos(empresa_id);

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresas_select_own_company"
ON empresas
FOR SELECT
USING (
    id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);

CREATE POLICY "usuarios_select_own_row"
ON usuarios
FOR SELECT
USING (auth_user_id = auth.uid());

CREATE POLICY "clientes_select_own_company"
ON clientes
FOR SELECT
USING (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);

CREATE POLICY "clientes_insert_own_company"
ON clientes
FOR INSERT
WITH CHECK (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);

CREATE POLICY "clientes_update_own_company"
ON clientes
FOR UPDATE
USING (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
)
WITH CHECK (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);

CREATE POLICY "clientes_delete_own_company"
ON clientes
FOR DELETE
USING (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);
