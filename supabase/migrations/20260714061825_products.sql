create table public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  "group"     text not null,
  category    text not null check (category in ('Albums','Lightsticks','Ropa','Photocards','Posters')),
  description text,
  image_url   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.product_variants (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  label        text not null,
  sku          text unique,
  price_cents  integer not null check (price_cents >= 0),
  stock        integer not null default 0 check (stock >= 0),
  weight_grams integer not null check (weight_grams >= 0),
  length_cm    integer,
  width_cm     integer,
  height_cm    integer,
  image_url    text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on public.product_variants (product_id);
