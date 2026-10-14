-- Additive storage for product-form fields that are not part of the original productos schema.
-- Apply once in Supabase before saving brochure, extra image, serial/custom, or service metadata.
alter table public.productos
  add column if not exists datos_adicionales jsonb not null default '{}'::jsonb;

comment on column public.productos.datos_adicionales is
  'Optional product-form metadata: extra image URLs, brochure URL, barcode format, serial tracking, custom fields, and service label.';
