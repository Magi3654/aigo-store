create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.settings (
  id                      uuid primary key default gen_random_uuid(),
  origin_address          jsonb,
  fallback_standard_cents integer not null default 0,
  fallback_express_cents  integer not null default 0
);

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = uid), false);
$$;
