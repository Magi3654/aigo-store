-- Seguimiento de pedidos (Fase 2d). La unica puerta publica a los pedidos:
-- exige numero + correo, devuelve una lista cerrada de campos y limita los
-- intentos fallidos por IP y por numero de pedido.

create table public.track_order_attempts (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('ip', 'order')),
  key        text not null,
  created_at timestamptz not null default now()
);

create index on public.track_order_attempts (kind, key, created_at);

-- Cerrada: RLS sin politicas y sin privilegios para los roles de la API. Solo
-- la funcion (dueña postgres, security definer) la lee y la escribe.
alter table public.track_order_attempts enable row level security;
revoke all on public.track_order_attempts from anon, authenticated;

create or replace function public.track_order(p_order_number text, p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_number  text := upper(trim(coalesce(p_order_number, '')));
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_ip      text;
  v_order   public.orders%rowtype;
  v_window  constant interval := interval '15 minutes';
begin
  -- x-forwarded-for puede traer "cliente, proxy1, ..."; el cliente es el primero.
  v_ip := coalesce(nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');

  delete from public.track_order_attempts where created_at < now() - interval '1 day';

  if (select count(*) from public.track_order_attempts
        where kind = 'ip' and key = v_ip and created_at > now() - v_window) >= 10
     or (select count(*) from public.track_order_attempts
        where kind = 'order' and key = left(v_number, 64) and created_at > now() - v_window) >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if v_number <> '' and length(v_number) <= 32 and v_email <> '' and length(v_email) <= 254 then
    -- lower() explicito: citext vive en "public" y con search_path vacio su
    -- operador no se resolveria; asi la comparacion no depende de eso.
    select * into v_order
      from public.orders o
     where o.order_number = v_number
       and lower(o.customer_email::text) = v_email;
  end if;

  if v_order.id is null then
    insert into public.track_order_attempts (kind, key)
    values ('ip', v_ip), ('order', left(v_number, 64));
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'order', jsonb_build_object(
      'order_number',        v_order.order_number,
      'created_at',          v_order.created_at,
      'payment_status',      v_order.payment_status,
      'fulfillment_status',  v_order.fulfillment_status,
      'shipping_city',       v_order.shipping_city,
      'shipping_state',      v_order.shipping_state,
      'shipping_carrier',    v_order.shipping_carrier,
      'shipping_service',    v_order.shipping_service,
      'tracking_number',     v_order.tracking_number,
      'tracking_url',        v_order.tracking_url,
      'subtotal_cents',      v_order.subtotal_cents,
      'shipping_cost_cents', v_order.shipping_cost_cents,
      'total_cents',         v_order.total_cents,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'product_name',     i.product_name,
                 'variant_label',    i.variant_label,
                 'quantity',         i.quantity,
                 'unit_price_cents', i.unit_price_cents,
                 'line_total_cents', i.line_total_cents
               ) order by i.created_at)
          from public.order_items i
         where i.order_id = v_order.id
      ), '[]'::jsonb),
      'history', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'status',     h.status,
                 'note',       h.note,
                 'created_at', h.created_at
               ) order by h.created_at)
          from public.order_status_history h
         where h.order_id = v_order.id
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.track_order(text, text) from public;
grant execute on function public.track_order(text, text) to anon, authenticated;
