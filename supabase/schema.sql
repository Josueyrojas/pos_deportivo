-- =====================================================================
--  POS Deportes Sarapaseo — Esquema de base de datos (Supabase / Postgres)
--  Ejecuta este archivo completo en:  Supabase > SQL Editor > New query
-- =====================================================================

-- ------- Extensiones -------------------------------------------------
create extension if not exists "pgcrypto";

-- ------- Perfiles de usuario (extiende auth.users) -------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  role       text not null default 'cajero' check (role in ('admin','cajero')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------- Catálogo ----------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  brand       text default '',
  category_id uuid references public.categories(id) on delete set null,
  sku         text,
  cost        numeric(12,2) not null default 0,
  price       numeric(12,2) not null default 0,   -- precio base de venta
  image_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_products_name on public.products (lower(name));

-- Cada producto tiene 1..n variantes (talla/color). Un producto sin
-- variantes se guarda con una sola fila de talla/color en NULL.
create table if not exists public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  size          text,
  color         text,
  sku           text,
  price         numeric(12,2),        -- si es NULL, usa products.price
  stock         integer not null default 0,
  min_stock     integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_variants_product on public.product_variants (product_id);
-- No repetir la misma combinación talla/color dentro de un producto
create unique index if not exists uq_variant_combo
  on public.product_variants (product_id, coalesce(size,''), coalesce(color,''));

-- ------- Sesiones de caja (corte) -----------------------------------
create table if not exists public.cash_sessions (
  id              uuid primary key default gen_random_uuid(),
  opened_by       uuid not null references public.profiles(id),
  opened_at       timestamptz not null default now(),
  opening_amount  numeric(12,2) not null default 0,
  closed_at       timestamptz,
  counted_amount  numeric(12,2),
  expected_amount numeric(12,2),
  difference      numeric(12,2),
  status          text not null default 'open' check (status in ('open','closed')),
  notes           text default ''
);
create index if not exists idx_sessions_openedby on public.cash_sessions (opened_by);
create index if not exists idx_sessions_status on public.cash_sessions (status);

-- ------- Ventas ------------------------------------------------------
create table if not exists public.sales (
  id             uuid primary key default gen_random_uuid(),
  folio          bigint generated always as identity,
  session_id     uuid references public.cash_sessions(id) on delete set null,
  cashier_id     uuid not null references public.profiles(id),
  subtotal       numeric(12,2) not null default 0,
  discount       numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  payment_method text not null check (payment_method in ('efectivo','tarjeta','transferencia')),
  cash_received  numeric(12,2),
  change         numeric(12,2),
  status         text not null default 'completed' check (status in ('completed','cancelled')),
  cancelled_at   timestamptz,
  cancelled_by   uuid references public.profiles(id),
  cancel_reason  text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists idx_sales_created on public.sales (created_at);
create index if not exists idx_sales_session on public.sales (session_id);
create index if not exists idx_sales_cashier on public.sales (cashier_id);
create index if not exists idx_sales_status on public.sales (status);

create table if not exists public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales(id) on delete cascade,
  variant_id   uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  size         text,
  color        text,
  unit_price   numeric(12,2) not null,
  unit_cost    numeric(12,2) not null default 0,
  qty          integer not null check (qty > 0),
  line_total   numeric(12,2) not null
);
create index if not exists idx_saleitems_sale on public.sale_items (sale_id);

-- ------- Configuración de tienda (nombre + logo) ----------------------
create table if not exists public.store_settings (
  id         uuid primary key default '00000000-0000-0000-0000-000000000001',
  name       text not null default 'Mi Tienda',
  logo_url   text,
  updated_at timestamptz not null default now()
);

-- =====================================================================
--  Función helper: ¿el usuario actual es admin?  (evita recursión RLS)
-- =====================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- =====================================================================
--  Alta automática de perfil al registrarse un usuario
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'cajero')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
--  Venta atómica: valida stock, registra venta y descuenta inventario
--  Se ejecuta como definer para que el cajero venda sin permiso directo
--  de escritura sobre el inventario.
-- =====================================================================
create or replace function public.process_sale(
  p_items          jsonb,          -- [{ "variant_id": "...", "qty": 2 }, ...]
  p_payment_method text,
  p_discount       numeric default 0,
  p_cash_received  numeric default null,
  p_session_id     uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_sale_id    uuid;
  v_folio      bigint;
  v_subtotal   numeric(12,2) := 0;
  v_total      numeric(12,2) := 0;
  v_change     numeric(12,2);
  v_item       jsonb;
  v_variant    record;
  v_qty        integer;
  v_price      numeric(12,2);
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;
  if p_payment_method not in ('efectivo','tarjeta','transferencia') then
    raise exception 'Método de pago inválido';
  end if;

  -- Crear encabezado de venta (subtotal/total se actualizan al final)
  insert into public.sales (session_id, cashier_id, payment_method)
  values (p_session_id, v_uid, p_payment_method)
  returning id, folio into v_sale_id, v_folio;

  -- Procesar cada renglón
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    -- Bloquear la variante para evitar sobreventa concurrente
    select pv.id, pv.stock, coalesce(pv.price, p.price) as price,
           p.name as product_name, pv.size, pv.color, coalesce(p.cost, 0) as cost
      into v_variant
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where pv.id = (v_item->>'variant_id')::uuid
     for update;

    if not found then
      raise exception 'Producto no encontrado';
    end if;
    if v_variant.stock < v_qty then
      raise exception 'Stock insuficiente de "%" (disponible: %)',
        v_variant.product_name, v_variant.stock;
    end if;

    v_price := v_variant.price;

    insert into public.sale_items
      (sale_id, variant_id, product_name, size, color, unit_price, qty, line_total, unit_cost)
    values
      (v_sale_id, v_variant.id, v_variant.product_name, v_variant.size,
       v_variant.color, v_price, v_qty, v_price * v_qty, v_variant.cost);

    update public.product_variants
       set stock = stock - v_qty
     where id = v_variant.id;

    v_subtotal := v_subtotal + (v_price * v_qty);
  end loop;

  v_total := greatest(v_subtotal - coalesce(p_discount,0), 0);

  if p_payment_method = 'efectivo' and p_cash_received is not null then
    v_change := greatest(p_cash_received - v_total, 0);
  end if;

  update public.sales
     set subtotal = v_subtotal,
         discount = coalesce(p_discount,0),
         total    = v_total,
         cash_received = p_cash_received,
         change   = v_change
   where id = v_sale_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'folio',   v_folio,
    'subtotal',v_subtotal,
    'discount',coalesce(p_discount,0),
    'total',   v_total,
    'change',  v_change
  );
end;
$$;

-- =====================================================================
--  Cerrar corte de caja: calcula esperado vs contado
-- =====================================================================
create or replace function public.close_cash_session(
  p_session_id     uuid,
  p_counted_amount numeric,
  p_notes          text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_session   record;
  v_cash_sales numeric(12,2);
  v_expected  numeric(12,2);
begin
  select * into v_session from public.cash_sessions where id = p_session_id;
  if not found then raise exception 'Sesión no encontrada'; end if;
  if v_session.status = 'closed' then raise exception 'La sesión ya está cerrada'; end if;
  if v_session.opened_by <> v_uid and not is_admin() then
    raise exception 'No puedes cerrar una caja que no abriste';
  end if;

  select coalesce(sum(total),0) into v_cash_sales
    from public.sales
   where session_id = p_session_id and payment_method = 'efectivo' and status = 'completed';

  v_expected := v_session.opening_amount + v_cash_sales;

  update public.cash_sessions
     set status = 'closed',
         closed_at = now(),
         counted_amount = p_counted_amount,
         expected_amount = v_expected,
         difference = p_counted_amount - v_expected,
         notes = coalesce(p_notes,'')
   where id = p_session_id;

  return jsonb_build_object(
    'expected', v_expected,
    'counted',  p_counted_amount,
    'difference', p_counted_amount - v_expected,
    'cash_sales', v_cash_sales
  );
end;
$$;

-- =====================================================================
--  Cancelar / devolver una venta: regresa el stock de cada renglón
-- =====================================================================
create or replace function public.cancel_sale(
  p_sale_id uuid,
  p_reason  text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_sale record;
  v_item record;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Venta no encontrada';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'Esta venta ya estaba cancelada';
  end if;
  if v_sale.cashier_id <> v_uid and not is_admin() then
    raise exception 'No puedes cancelar una venta que no es tuya';
  end if;

  for v_item in select variant_id, qty from public.sale_items where sale_id = p_sale_id
  loop
    if v_item.variant_id is not null then
      update public.product_variants
         set stock = stock + v_item.qty
       where id = v_item.variant_id;
    end if;
  end loop;

  update public.sales
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_uid,
         cancel_reason = coalesce(p_reason, '')
   where id = p_sale_id;

  return jsonb_build_object('sale_id', p_sale_id, 'status', 'cancelled');
end;
$$;

-- =====================================================================
--  Row Level Security
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.cash_sessions    enable row level security;
alter table public.sales            enable row level security;
alter table public.sale_items       enable row level security;
alter table public.store_settings   enable row level security;

-- configuración de tienda: lectura pública (se usa hasta en el login, sin sesión)
drop policy if exists "settings_read" on public.store_settings;
create policy "settings_read" on public.store_settings for select using (true);
drop policy if exists "settings_write" on public.store_settings;
create policy "settings_write" on public.store_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert" on public.profiles
  for insert with check (public.is_admin());

-- categorías / productos / variantes: lectura para autenticados, escritura admin
drop policy if exists "cat_read" on public.categories;
create policy "cat_read" on public.categories for select using (auth.uid() is not null);
drop policy if exists "cat_write" on public.categories;
create policy "cat_write" on public.categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "prod_read" on public.products;
create policy "prod_read" on public.products for select using (auth.uid() is not null);
drop policy if exists "prod_write" on public.products;
create policy "prod_write" on public.products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "var_read" on public.product_variants;
create policy "var_read" on public.product_variants for select using (auth.uid() is not null);
drop policy if exists "var_write" on public.product_variants;
create policy "var_write" on public.product_variants for all using (public.is_admin()) with check (public.is_admin());

-- cajas
drop policy if exists "sessions_select" on public.cash_sessions;
create policy "sessions_select" on public.cash_sessions
  for select using (opened_by = auth.uid() or public.is_admin());
drop policy if exists "sessions_insert" on public.cash_sessions;
create policy "sessions_insert" on public.cash_sessions
  for insert with check (opened_by = auth.uid());
drop policy if exists "sessions_update" on public.cash_sessions;
create policy "sessions_update" on public.cash_sessions
  for update using (opened_by = auth.uid() or public.is_admin())
  with check (opened_by = auth.uid() or public.is_admin());

-- ventas
drop policy if exists "sales_select" on public.sales;
create policy "sales_select" on public.sales
  for select using (cashier_id = auth.uid() or public.is_admin());
drop policy if exists "sales_insert" on public.sales;
create policy "sales_insert" on public.sales
  for insert with check (cashier_id = auth.uid());

drop policy if exists "saleitems_select" on public.sale_items;
create policy "saleitems_select" on public.sale_items
  for select using (
    exists (select 1 from public.sales s
            where s.id = sale_id and (s.cashier_id = auth.uid() or public.is_admin()))
  );

-- =====================================================================
--  Storage: bucket público para imágenes de producto
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

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

-- =====================================================================
--  Storage: bucket público para el logo de la tienda
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('store-assets', 'store-assets', true)
on conflict (id) do nothing;

drop policy if exists "store_assets_read" on storage.objects;
create policy "store_assets_read" on storage.objects
  for select using (bucket_id = 'store-assets');

drop policy if exists "store_assets_insert" on storage.objects;
create policy "store_assets_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'store-assets' and public.is_admin());

drop policy if exists "store_assets_update" on storage.objects;
create policy "store_assets_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'store-assets' and public.is_admin());

drop policy if exists "store_assets_delete" on storage.objects;
create policy "store_assets_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'store-assets' and public.is_admin());

insert into public.store_settings (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Deportes Apaseo')
on conflict (id) do nothing;

-- =====================================================================
--  Datos de ejemplo (categorías + un par de productos con variantes)
--  Puedes borrar este bloque si no lo quieres.
-- =====================================================================
insert into public.categories (name) values
  ('Calzado'), ('Ropa'), ('Balones'), ('Accesorios')
on conflict (name) do nothing;

do $$
declare
  v_calzado uuid; v_ropa uuid; v_balon uuid;
  v_prod uuid;
begin
  select id into v_calzado from public.categories where name='Calzado';
  select id into v_ropa    from public.categories where name='Ropa';
  select id into v_balon   from public.categories where name='Balones';

  -- Tenis con tallas
  insert into public.products (name, brand, category_id, price, cost)
  values ('Tenis para correr', 'Genérico', v_calzado, 899.00, 520.00)
  returning id into v_prod;
  insert into public.product_variants (product_id, size, color, stock, min_stock) values
    (v_prod, '25', 'Negro', 4, 2),
    (v_prod, '26', 'Negro', 6, 2),
    (v_prod, '27', 'Negro', 3, 2),
    (v_prod, '26', 'Azul',  5, 2);

  -- Jersey con tallas
  insert into public.products (name, brand, category_id, price, cost)
  values ('Jersey deportivo', 'Genérico', v_ropa, 349.00, 190.00)
  returning id into v_prod;
  insert into public.product_variants (product_id, size, color, stock, min_stock) values
    (v_prod, 'CH', 'Rojo',  8, 3),
    (v_prod, 'M',  'Rojo',  10, 3),
    (v_prod, 'G',  'Rojo',  7, 3);

  -- Balón sin variantes
  insert into public.products (name, brand, category_id, price, cost)
  values ('Balón de fútbol No.5', 'Genérico', v_balon, 299.00, 160.00)
  returning id into v_prod;
  insert into public.product_variants (product_id, size, color, stock, min_stock) values
    (v_prod, null, null, 12, 4);
end $$;

-- =====================================================================
--  IMPORTANTE — primer administrador
--  Después de registrar tu primer usuario desde la app (o desde
--  Authentication > Users en Supabase), conviértelo en admin con:
--
--     update public.profiles set role='admin'
--     where id = (select id from auth.users where email='TU_CORREO');
-- =====================================================================
