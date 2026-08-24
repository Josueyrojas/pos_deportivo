-- =====================================================================
--  Migración v2 — corre esto en Supabase > SQL Editor si tu proyecto ya
--  tenía schema.sql (+ add-images.sql) aplicado.
--
--  Agrega:
--   1) Cancelar / devolver una venta (regresa el stock)
--   2) Costo por línea de venta, para poder calcular utilidad en Reportes
--   3) Configuración de tienda: nombre y logo (visibles en login y menú)
-- =====================================================================

-- ------- 1) Cancelar ventas -------------------------------------------
alter table public.sales
  add column if not exists status text not null default 'completed'
    check (status in ('completed','cancelled')),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancel_reason text not null default '';

create index if not exists idx_sales_status on public.sales (status);

-- close_cash_session: que las ventas canceladas no cuenten en el efectivo esperado
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

-- ------- 2) Costo por línea (para margen de utilidad) ------------------
alter table public.sale_items
  add column if not exists unit_cost numeric(12,2) not null default 0;

-- backfill best-effort con el costo actual del producto (no hay histórico previo)
update public.sale_items si
   set unit_cost = coalesce(p.cost, 0)
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
 where si.variant_id = pv.id and si.unit_cost = 0;

-- process_sale: igual que antes, pero ahora también guarda el costo unitario
create or replace function public.process_sale(
  p_items          jsonb,
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

  insert into public.sales (session_id, cashier_id, payment_method)
  values (p_session_id, v_uid, p_payment_method)
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

-- cancelar / devolver una venta completa: regresa el stock de cada renglón
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

-- ------- 3) Configuración de tienda (nombre + logo) ---------------------
create table if not exists public.store_settings (
  id         uuid primary key default '00000000-0000-0000-0000-000000000001',
  name       text not null default 'Mi Tienda',
  logo_url   text,
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Deportes Apaseo')
on conflict (id) do nothing;

alter table public.store_settings enable row level security;

drop policy if exists "settings_read" on public.store_settings;
create policy "settings_read" on public.store_settings
  for select using (true);   -- visible incluso en la pantalla de login (sin sesión)

drop policy if exists "settings_write" on public.store_settings;
create policy "settings_write" on public.store_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- bucket público para el logo
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
