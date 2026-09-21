-- =====================================================================
--  Migración v3 — multi-negocio (multi-tenant)
--  Corre esto en Supabase > SQL Editor. Haz un respaldo antes: toca
--  `sales` y reescribe todas las políticas RLS en producción.
--
--  Después de correrla:
--   1) Redespliega las Edge Functions: create-user y delete-user
--      (npx supabase functions deploy create-user / delete-user)
--   2) Entra con josueyrojas@gmail.com — ya queda como super admin — y
--      dale un dueño a Deportes Apaseo desde /negocios.
-- =====================================================================

-- ------- 1) Tabla de negocios ------------------------------------------
create table if not exists public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Mi Negocio',
  logo_url   text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------- 2) business_id en cada tabla (nullable primero, se llena después) ---
alter table public.profiles         add column if not exists business_id uuid references public.businesses(id);
alter table public.categories       add column if not exists business_id uuid references public.businesses(id);
alter table public.products         add column if not exists business_id uuid references public.businesses(id);
alter table public.product_variants add column if not exists business_id uuid references public.businesses(id);
alter table public.cash_sessions    add column if not exists business_id uuid references public.businesses(id);
alter table public.sales            add column if not exists business_id uuid references public.businesses(id);
alter table public.sale_items       add column if not exists business_id uuid references public.businesses(id);

-- ------- 3) Migrar los datos existentes al primer negocio (Deportes Apaseo) --
do $$
declare
  v_biz_id uuid;
begin
  select id into v_biz_id from public.businesses limit 1;

  if v_biz_id is null then
    insert into public.businesses (name, logo_url)
    select coalesce(name, 'Deportes Apaseo'), logo_url
      from public.store_settings where id = '00000000-0000-0000-0000-000000000001'
    returning id into v_biz_id;
  end if;

  if v_biz_id is null then
    insert into public.businesses (name) values ('Deportes Apaseo') returning id into v_biz_id;
  end if;

  update public.categories       set business_id = v_biz_id where business_id is null;
  update public.products         set business_id = v_biz_id where business_id is null;
  update public.product_variants set business_id = v_biz_id where business_id is null;
  update public.cash_sessions    set business_id = v_biz_id where business_id is null;
  update public.sales            set business_id = v_biz_id where business_id is null;
  update public.sale_items       set business_id = v_biz_id where business_id is null;
  -- perfiles existentes (admin/cajero) también quedan en este negocio;
  -- luego, más abajo, se saca a josueyrojas@gmail.com y se vuelve super_admin.
  update public.profiles         set business_id = v_biz_id where business_id is null;
end $$;

-- ------- 4) Ya con todo migrado, business_id es obligatorio ------------
alter table public.categories       alter column business_id set not null;
alter table public.products         alter column business_id set not null;
alter table public.product_variants alter column business_id set not null;
alter table public.cash_sessions    alter column business_id set not null;
alter table public.sales            alter column business_id set not null;
alter table public.sale_items       alter column business_id set not null;
-- profiles.business_id se queda nullable (null = super_admin)

-- el nombre de categoría era único globalmente; ahora debe serlo solo
-- dentro de cada negocio (dos negocios distintos sí pueden tener "Calzado")
alter table public.categories drop constraint if exists categories_name_key;
create unique index if not exists uq_category_business_name on public.categories (business_id, name);

create index if not exists idx_categories_business on public.categories (business_id);
create index if not exists idx_products_business on public.products (business_id);
create index if not exists idx_variants_business on public.product_variants (business_id);
create index if not exists idx_sessions_business on public.cash_sessions (business_id);
create index if not exists idx_sales_business on public.sales (business_id);
create index if not exists idx_saleitems_business on public.sale_items (business_id);
create index if not exists idx_profiles_business on public.profiles (business_id);

-- ------- 5) Rol nuevo: super_admin --------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin','admin','cajero'));

-- ------- 6) Promover a Josué a super admin (sin negocio propio) --------
update public.profiles set role = 'super_admin', business_id = null
where id = (select id from auth.users where email = 'josueyrojas@gmail.com');

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

-- se conserva is_admin() (admin de MI propio negocio) por compatibilidad
create or replace function public.is_admin()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- El business_id de lo que se crea desde el cliente (categorías, productos,
-- variantes, apertura de caja) se rellena solo con el negocio de quien hace
-- el insert — así el frontend nunca necesita mandarlo.
alter table public.categories       alter column business_id set default public.my_business_id();
alter table public.products         alter column business_id set default public.my_business_id();
alter table public.product_variants alter column business_id set default public.my_business_id();
alter table public.cash_sessions    alter column business_id set default public.my_business_id();

-- =====================================================================
--  Alta de usuario: el perfil nace ya con role/business_id correctos
--  (antes: se creaba como 'cajero' y un update posterior lo corregía)
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

-- =====================================================================
--  process_sale / close_cash_session / cancel_sale: ahora fijan/usan
--  business_id (siempre el del usuario que llama, nunca del cliente)
-- =====================================================================
create or replace function public.process_sale(
  p_items          jsonb,
  p_payment_method text,
  p_discount       numeric default 0,
  p_cash_received  numeric default null,
  p_session_id     uuid    default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_biz_id     uuid;
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

  insert into public.sales (session_id, cashier_id, payment_method, business_id)
  values (p_session_id, v_uid, p_payment_method, v_biz_id)
  returning id, folio into v_sale_id, v_folio;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    select pv.id, pv.stock, coalesce(pv.price, p.price) as price,
           p.name as product_name, pv.size, pv.color, coalesce(p.cost, 0) as cost
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
      (sale_id, variant_id, product_name, size, color, unit_price, qty, line_total, unit_cost, business_id)
    values
      (v_sale_id, v_variant.id, v_variant.product_name, v_variant.size,
       v_variant.color, v_price, v_qty, v_price * v_qty, v_variant.cost, v_biz_id);

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
--  RLS: businesses
-- =====================================================================
alter table public.businesses enable row level security;

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

-- =====================================================================
--  RLS: profiles (ahora con business_id)
-- =====================================================================
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

-- =====================================================================
--  RLS: catálogo (categorías / productos / variantes)
-- =====================================================================
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

-- =====================================================================
--  RLS: cajas / ventas
-- =====================================================================
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
--  Fin. store_settings queda sin usarse (el frontend ya no la lee) —
--  se deja la tabla por si se quiere revisar el dato viejo, sin RLS nueva.
-- =====================================================================
