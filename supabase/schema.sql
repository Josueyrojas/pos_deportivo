-- =====================================================================
--  POS multi-negocio — Esquema de base de datos (Supabase / Postgres)
--  Ejecuta este archivo completo en:  Supabase > SQL Editor > New query
--
--  Un solo despliegue sirve a varios negocios independientes. Cada uno
--  tiene su propio catálogo, ventas, caja y usuarios — aislados por
--  Row Level Security. Un "super admin" (sin negocio propio) da de alta
--  negocios nuevos con su primer usuario admin.
-- =====================================================================

-- ------- Extensiones -------------------------------------------------
create extension if not exists "pgcrypto";

-- ------- Negocios (tenants) -------------------------------------------
create table if not exists public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Mi Negocio',
  logo_url   text,
  address    text not null default '',
  phone      text not null default '',
  rfc        text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- notas internas del super admin sobre cada negocio (privadas: el dueño
-- del negocio nunca las ve, ni siquiera con select('*') sobre businesses)
create table if not exists public.business_notes (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  notes       text not null default '',
  updated_at  timestamptz not null default now()
);

-- ------- Perfiles de usuario (extiende auth.users) -------------------
-- business_id es NULL solo para role = 'super_admin' (no pertenece a
-- ningún negocio, administra la plataforma completa).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id),
  full_name   text not null default '',
  role        text not null default 'cajero' check (role in ('super_admin','admin','cajero')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_profiles_business on public.profiles (business_id);

-- ------- Catálogo ----------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  name        text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists uq_category_business_name on public.categories (business_id, name);

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  name        text not null,
  brand       text default '',
  category_id uuid references public.categories(id) on delete set null,
  sku         text,
  unit        text not null default 'pieza'
    check (unit in ('pieza','metro','kg','litro','caja','rollo','par')),
  cost        numeric(12,2) not null default 0,
  price       numeric(12,2) not null default 0,   -- precio base de venta
  image_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_products_business on public.products (business_id);
create index if not exists idx_products_name on public.products (lower(name));

-- Cada producto tiene 1..n variantes (talla/color, o lo que aplique según
-- el negocio). Un producto sin variantes se guarda con una sola fila con
-- ambos campos en NULL. stock/min_stock admiten fracciones (ej. 3.5 metros
-- de manguera) — la unidad real vive en products.unit.
create table if not exists public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id),
  product_id    uuid not null references public.products(id) on delete cascade,
  size          text,
  color         text,
  sku           text,
  price         numeric(12,2),        -- si es NULL, usa products.price
  stock         numeric(12,3) not null default 0,
  min_stock     numeric(12,3) not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_variants_business on public.product_variants (business_id);
create index if not exists idx_variants_product on public.product_variants (product_id);
-- No repetir la misma combinación talla/color dentro de un producto
create unique index if not exists uq_variant_combo
  on public.product_variants (product_id, coalesce(size,''), coalesce(color,''));

-- ------- Sesiones de caja (corte) -----------------------------------
create table if not exists public.cash_sessions (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id),
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
create index if not exists idx_sessions_business on public.cash_sessions (business_id);
create index if not exists idx_sessions_openedby on public.cash_sessions (opened_by);
create index if not exists idx_sessions_status on public.cash_sessions (status);

-- ------- Ventas ------------------------------------------------------
create table if not exists public.sales (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id),
  folio          bigint generated always as identity,
  session_id     uuid references public.cash_sessions(id) on delete set null,
  cashier_id     uuid not null references public.profiles(id),
  subtotal       numeric(12,2) not null default 0,
  discount       numeric(12,2) not null default 0,
  tax            numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  payment_method text not null check (payment_method in ('efectivo','tarjeta','transferencia')),
  cash_received  numeric(12,2),
  change         numeric(12,2),
  status         text not null default 'completed' check (status in ('completed','cancelled')),
  cancelled_at   timestamptz,
  cancelled_by   uuid references public.profiles(id),
  cancel_reason  text not null default '',
  customer_name  text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists idx_sales_business on public.sales (business_id);
create index if not exists idx_sales_created on public.sales (created_at);
create index if not exists idx_sales_session on public.sales (session_id);
create index if not exists idx_sales_cashier on public.sales (cashier_id);
create index if not exists idx_sales_status on public.sales (status);

create table if not exists public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id),
  sale_id      uuid not null references public.sales(id) on delete cascade,
  variant_id   uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  size         text,
  color        text,
  unit_price   numeric(12,2) not null,
  unit_cost    numeric(12,2) not null default 0,
  unit         text not null default 'pieza',
  qty          numeric(12,3) not null check (qty > 0),
  line_total   numeric(12,2) not null
);
create index if not exists idx_saleitems_business on public.sale_items (business_id);
create index if not exists idx_saleitems_sale on public.sale_items (sale_id);

-- =====================================================================
--  Helpers de RLS
-- =====================================================================
create or replace function public.my_business_id()
returns uuid
language sql security definer set search_path = public stable
as $$
  select business_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and active = true
  );
$$;

create or replace function public.is_business_admin(target_business uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
      and business_id = target_business
  );
$$;

-- admin de MI propio negocio (usado donde no hay una fila de la que
-- tomar el business_id, ej. políticas de profiles)
create or replace function public.is_admin()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- El business_id de lo que crea un usuario desde el cliente (categorías,
-- productos, variantes, apertura de caja) se rellena solo con el negocio
-- de quien hace el insert — así el frontend nunca necesita mandarlo.
alter table public.categories       alter column business_id set default public.my_business_id();
alter table public.products         alter column business_id set default public.my_business_id();
alter table public.product_variants alter column business_id set default public.my_business_id();
alter table public.cash_sessions    alter column business_id set default public.my_business_id();

-- =====================================================================
--  Alta automática de perfil al crear un usuario (Edge Function)
--  role y business_id vienen en user_metadata (admin.createUser), así el
--  perfil nace ya correcto — nunca se crea sin negocio salvo super_admin.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, business_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'cajero'),
    nullif(new.raw_user_meta_data->>'business_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
--  Venta atómica: valida stock, registra venta y descuenta inventario.
--  Se ejecuta como definer para que el cajero venda sin permiso directo
--  de escritura sobre el inventario. business_id siempre sale del perfil
--  de quien llama, nunca del cliente.
-- =====================================================================
create or replace function public.process_sale(
  p_items          jsonb,          -- [{ "variant_id": "...", "qty": 2 }, ...]
  p_payment_method text,
  p_discount       numeric default 0,
  p_cash_received  numeric default null,
  p_session_id     uuid    default null,
  p_customer_name  text    default ''
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tax_rate   constant numeric := 0.16;  -- IVA fijo para todos los negocios
  v_uid        uuid := auth.uid();
  v_biz_id     uuid;
  v_sale_id    uuid;
  v_folio      bigint;
  v_subtotal   numeric(12,2) := 0;
  v_taxable    numeric(12,2) := 0;
  v_tax        numeric(12,2) := 0;
  v_total      numeric(12,2) := 0;
  v_change     numeric(12,2);
  v_item       jsonb;
  v_variant    record;
  v_qty        numeric(12,3);
  v_price      numeric(12,2);
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  select business_id into v_biz_id from public.profiles where id = v_uid;
  if v_biz_id is null then
    raise exception 'Tu cuenta no pertenece a ningún negocio';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;
  if p_payment_method not in ('efectivo','tarjeta','transferencia') then
    raise exception 'Método de pago inválido';
  end if;

  -- Crear encabezado de venta (subtotal/total se actualizan al final)
  insert into public.sales (session_id, cashier_id, payment_method, business_id, customer_name)
  values (p_session_id, v_uid, p_payment_method, v_biz_id, coalesce(p_customer_name, ''))
  returning id, folio into v_sale_id, v_folio;

  -- Procesar cada renglón
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    -- Bloquear la variante para evitar sobreventa concurrente
    -- (y de paso confirmar que es del mismo negocio que quien vende)
    select pv.id, pv.stock, coalesce(pv.price, p.price) as price,
           p.name as product_name, pv.size, pv.color, coalesce(p.cost, 0) as cost, p.unit
      into v_variant
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where pv.id = (v_item->>'variant_id')::uuid
       and pv.business_id = v_biz_id
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
      (sale_id, variant_id, product_name, size, color, unit_price, qty, line_total, unit_cost, unit, business_id)
    values
      (v_sale_id, v_variant.id, v_variant.product_name, v_variant.size,
       v_variant.color, v_price, v_qty, v_price * v_qty, v_variant.cost, v_variant.unit, v_biz_id);

    update public.product_variants
       set stock = stock - v_qty
     where id = v_variant.id;

    v_subtotal := v_subtotal + (v_price * v_qty);
  end loop;

  v_taxable := greatest(v_subtotal - coalesce(p_discount,0), 0);
  v_tax     := round(v_taxable * v_tax_rate, 2);
  v_total   := v_taxable + v_tax;

  if p_payment_method = 'efectivo' and p_cash_received is not null then
    v_change := greatest(p_cash_received - v_total, 0);
  end if;

  update public.sales
     set subtotal = v_subtotal,
         discount = coalesce(p_discount,0),
         tax      = v_tax,
         total    = v_total,
         cash_received = p_cash_received,
         change   = v_change
   where id = v_sale_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'folio',   v_folio,
    'subtotal',v_subtotal,
    'discount',coalesce(p_discount,0),
    'tax',     v_tax,
    'total',   v_total,
    'change',  v_change,
    'customer_name', coalesce(p_customer_name, '')
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
language plpgsql security definer set search_path = public
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
  if v_session.opened_by <> v_uid and not public.is_business_admin(v_session.business_id) then
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
language plpgsql security definer set search_path = public
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
  if v_sale.cashier_id <> v_uid and not public.is_business_admin(v_sale.business_id) then
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
alter table public.businesses        enable row level security;
alter table public.business_notes    enable row level security;
alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.products          enable row level security;
alter table public.product_variants  enable row level security;
alter table public.cash_sessions     enable row level security;
alter table public.sales             enable row level security;
alter table public.sale_items        enable row level security;

-- negocios: cada quien ve/edita el suyo; solo super admin ve/crea todos
drop policy if exists "businesses_select" on public.businesses;
create policy "businesses_select" on public.businesses
  for select using (id = public.my_business_id() or public.is_super_admin());
drop policy if exists "businesses_admin_update" on public.businesses;
create policy "businesses_admin_update" on public.businesses
  for update using (public.is_business_admin(id) or public.is_super_admin())
  with check (public.is_business_admin(id) or public.is_super_admin());
drop policy if exists "businesses_super_insert" on public.businesses;
create policy "businesses_super_insert" on public.businesses
  for insert with check (public.is_super_admin());

-- notas internas: exclusivas del super admin
drop policy if exists "business_notes_super_only" on public.business_notes;
create policy "business_notes_super_only" on public.business_notes
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid()
    or public.is_business_admin(business_id)
    or public.is_super_admin()
  );
drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles
  for update using (public.is_business_admin(business_id) or public.is_super_admin())
  with check (public.is_business_admin(business_id) or public.is_super_admin());
drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert" on public.profiles
  for insert with check (public.is_business_admin(business_id) or public.is_super_admin());

-- categorías / productos / variantes: lectura y escritura dentro del propio negocio
drop policy if exists "cat_read" on public.categories;
create policy "cat_read" on public.categories
  for select using (business_id = public.my_business_id() or public.is_super_admin());
drop policy if exists "cat_write" on public.categories;
create policy "cat_write" on public.categories
  for all using (public.is_business_admin(business_id) or public.is_super_admin())
  with check (public.is_business_admin(business_id) or public.is_super_admin());

drop policy if exists "prod_read" on public.products;
create policy "prod_read" on public.products
  for select using (business_id = public.my_business_id() or public.is_super_admin());
drop policy if exists "prod_write" on public.products;
create policy "prod_write" on public.products
  for all using (public.is_business_admin(business_id) or public.is_super_admin())
  with check (public.is_business_admin(business_id) or public.is_super_admin());

drop policy if exists "var_read" on public.product_variants;
create policy "var_read" on public.product_variants
  for select using (business_id = public.my_business_id() or public.is_super_admin());
drop policy if exists "var_write" on public.product_variants;
create policy "var_write" on public.product_variants
  for all using (public.is_business_admin(business_id) or public.is_super_admin())
  with check (public.is_business_admin(business_id) or public.is_super_admin());

-- cajas
drop policy if exists "sessions_select" on public.cash_sessions;
create policy "sessions_select" on public.cash_sessions
  for select using (
    opened_by = auth.uid()
    or public.is_business_admin(business_id)
    or public.is_super_admin()
  );
drop policy if exists "sessions_insert" on public.cash_sessions;
create policy "sessions_insert" on public.cash_sessions
  for insert with check (opened_by = auth.uid() and business_id = public.my_business_id());
drop policy if exists "sessions_update" on public.cash_sessions;
create policy "sessions_update" on public.cash_sessions
  for update
  using (opened_by = auth.uid() or public.is_business_admin(business_id) or public.is_super_admin())
  with check (opened_by = auth.uid() or public.is_business_admin(business_id) or public.is_super_admin());

-- ventas
drop policy if exists "sales_select" on public.sales;
create policy "sales_select" on public.sales
  for select using (
    cashier_id = auth.uid()
    or public.is_business_admin(business_id)
    or public.is_super_admin()
  );
drop policy if exists "sales_insert" on public.sales;
create policy "sales_insert" on public.sales
  for insert with check (cashier_id = auth.uid() and business_id = public.my_business_id());

drop policy if exists "saleitems_select" on public.sale_items;
create policy "saleitems_select" on public.sale_items
  for select using (
    exists (select 1 from public.sales s
            where s.id = sale_id
              and (s.cashier_id = auth.uid() or public.is_business_admin(s.business_id) or public.is_super_admin()))
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
  with check (bucket_id = 'product-images' and (public.is_admin() or public.is_super_admin()));

drop policy if exists "product_images_update" on storage.objects;
create policy "product_images_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and (public.is_admin() or public.is_super_admin()));

drop policy if exists "product_images_delete" on storage.objects;
create policy "product_images_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (public.is_admin() or public.is_super_admin()));

-- =====================================================================
--  Storage: bucket público para el logo de cada negocio
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
  with check (bucket_id = 'store-assets' and (public.is_admin() or public.is_super_admin()));

drop policy if exists "store_assets_update" on storage.objects;
create policy "store_assets_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'store-assets' and (public.is_admin() or public.is_super_admin()));

drop policy if exists "store_assets_delete" on storage.objects;
create policy "store_assets_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'store-assets' and (public.is_admin() or public.is_super_admin()));

-- =====================================================================
--  IMPORTANTE — primer super admin
--  1) Regístrate/crea tu primer usuario desde Supabase
--     (Authentication > Users > Add user).
--  2) Vuélvelo super admin (sin negocio propio):
--
--     update public.profiles set role = 'super_admin', business_id = null
--     where id = (select id from auth.users where email = 'TU_CORREO');
--
--  3) Entra a la app con ese correo — caerás directo en /negocios — y
--     desde ahí da de alta el primer negocio con su dueño.
-- =====================================================================
