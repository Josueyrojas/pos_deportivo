-- =====================================================================
--  Migración v4 — notas internas del super admin por negocio
--  Corre esto en Supabase > SQL Editor.
-- =====================================================================

create table if not exists public.business_notes (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  notes       text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.business_notes enable row level security;

-- privadas: nadie más que el super admin las puede leer o escribir,
-- ni siquiera el dueño del negocio (a propósito, no usa is_business_admin)
drop policy if exists "business_notes_super_only" on public.business_notes;
create policy "business_notes_super_only" on public.business_notes
  for all using (public.is_super_admin()) with check (public.is_super_admin());
