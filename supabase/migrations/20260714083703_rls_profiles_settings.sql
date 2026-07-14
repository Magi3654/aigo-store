alter table public.profiles enable row level security;
alter table public.settings enable row level security;

-- un usuario lee su propio perfil; un admin lee todos.
create policy profiles_self_read on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));

-- settings solo admin (lectura y escritura)
create policy settings_admin_all on public.settings for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
