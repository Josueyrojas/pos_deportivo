-- =====================================================================
--  Migración v8 — personalización de la nota de remisión por negocio
--  Corre esto en Supabase > SQL Editor.
-- =====================================================================

alter table public.businesses
  add column if not exists remision_footer text not null default '',
  add column if not exists remision_show_signatures boolean not null default true;
