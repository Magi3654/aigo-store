alter table public.products enable row level security;
alter table public.product_variants enable row level security;

-- lectura publica de lo activo (o todo, si es admin)
create policy products_read on public.products for select
  to anon, authenticated
  using (is_active = true or public.is_admin(auth.uid()));

create policy variants_read on public.product_variants for select
  to anon, authenticated
  using (is_active = true or public.is_admin(auth.uid()));

-- escritura solo admin
create policy products_admin_write on public.products for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy variants_admin_write on public.product_variants for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
