-- =====================================================================
--  Migración v5 — IVA (16%, fijo para todos los negocios)
--  Corre esto en Supabase > SQL Editor.
--
--  Los precios en Inventario siguen siendo base (sin IVA). El IVA se
--  calcula al cobrar: sobre (subtotal − descuento), y se suma al total
--  que paga el cliente. Las ventas ya registradas no se tocan (su `tax`
--  queda en 0 — no hay forma de saber retroactivamente cuánto hubiera
--  sido el IVA de un precio que no lo contemplaba).
-- =====================================================================

alter table public.sales add column if not exists tax numeric(12,2) not null default 0;

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
    'change',  v_change
  );
end;
$$;
