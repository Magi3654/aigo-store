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

create policy order_items_admin_select on public.order_items for select
  to authenticated using (public.is_admin(auth.uid()));

create policy history_admin_select on public.order_status_history for select
  to authenticated using (public.is_admin(auth.uid()));
