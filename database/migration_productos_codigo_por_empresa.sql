-- Permite reutilizar el mismo SKU en empresas distintas.
-- Dentro de una misma empresa, el codigo sigue siendo unico.

DO $$
DECLARE
    restriccion record;
BEGIN
    FOR restriccion IN
        SELECT DISTINCT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN LATERAL unnest(c.conkey) AS claves(attnum) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = claves.attnum
        WHERE n.nspname = 'public'
          AND t.relname = 'productos'
          AND c.contype = 'u'
        GROUP BY c.conname, c.conkey
        HAVING count(*) = 1 AND min(a.attname) = 'codigo'
    LOOP
        EXECUTE format('ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS %I', restriccion.conname);
    END LOOP;
END $$;

DO $$
DECLARE
    indice record;
BEGIN
    FOR indice IN
        SELECT idx.relname AS nombre
        FROM pg_index i
        JOIN pg_class tabla ON tabla.oid = i.indrelid
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_namespace n ON n.oid = tabla.relnamespace
        JOIN pg_attribute a ON a.attrelid = tabla.oid AND a.attnum = i.indkey[0]
        WHERE n.nspname = 'public'
          AND tabla.relname = 'productos'
          AND i.indisunique
          AND i.indnatts = 1
          AND i.indpred IS NULL
          AND i.indexprs IS NULL
          AND a.attname = 'codigo'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', indice.nombre);
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS productos_empresa_codigo_unico
ON public.productos (empresa_id, codigo)
WHERE codigo IS NOT NULL AND btrim(codigo) <> '';
