-- Permite guardar el desglose de pagos mixtos desde el POS sin abrir acceso
-- a detalles de ventas pertenecientes a otra empresa.

ALTER TABLE public.detalle_pagos_venta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS detalle_pagos_venta_insert_own_company
ON public.detalle_pagos_venta;

CREATE POLICY detalle_pagos_venta_insert_own_company
ON public.detalle_pagos_venta
FOR INSERT
TO authenticated
WITH CHECK (
    empresa_id = public.empresa_actual()
    AND EXISTS (
        SELECT 1
        FROM public.ventas AS v
        WHERE v.id = detalle_pagos_venta.venta_id
          AND v.empresa_id = public.empresa_actual()
    )
);
