alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;

-- Sin politicas para anon => negado por defecto.
-- Admin puede leer todos los pedidos y actualizar estado/envio.
create policy orders_admin_select on public.orders for select
  to authenticated using (public.is_admin(auth.uid()));

create policy orders_admin_update on public.orders for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- La RLS de arriba gatea las FILAS (solo admin). El SCOPE de COLUMNAS lo imponen
-- los privilegios de columna, que se combinan con AND con la RLS: el admin solo
-- puede tocar campos de envio/estado. payment_status, los *_cents, order_number y
-- los ids de Stripe quedan fuera de su alcance (solo el webhook via service_role,
-- que ignora tanto la RLS como estos grants). Es un allowlist: cualquier columna
-- sensible nueva queda denegada por defecto.
revoke update on public.orders from authenticated;
grant update (
  fulfillment_status,
  shipping_carrier,
  shipping_service,
  shipping_service_code,
  tracking_number,
  tracking_url
) on public.orders to authenticated;

create policy order_items_admin_select on public.order_items for select
  to authenticated using (public.is_admin(auth.uid()));

create policy history_admin_select on public.order_status_history for select
  to authenticated using (public.is_admin(auth.uid()));

-- El admin puede anexar notas de estado al historial (spec: escritores = admin /
-- service_role). El INSERT del service_role ignora la RLS.
create policy history_admin_insert on public.order_status_history for insert
  to authenticated with check (public.is_admin(auth.uid()));
