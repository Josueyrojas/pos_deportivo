-- =====================================================================
--  Migración: imágenes de producto
--  Ejecútala en Supabase > SQL Editor si ya corriste schema.sql antes.
--  (schema.sql ya actualizado también la incluye para instalaciones nuevas.)
-- =====================================================================

-- 1) Columna para la URL de la imagen
alter table public.products
  add column if not exists image_url text;

-- 2) Bucket público de Storage para las fotos
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- 3) Permisos sobre los archivos del bucket
--    Lectura pública (para mostrar las fotos) y escritura solo para admin.
drop policy if exists "product_images_read" on storage.objects;
create policy "product_images_read" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "product_images_insert" on storage.objects;
create policy "product_images_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product_images_update" on storage.objects;
create policy "product_images_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product_images_delete" on storage.objects;
create policy "product_images_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
