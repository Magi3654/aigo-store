create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  order_number              text not null unique,
  customer_name             text not null,
  customer_email            citext not null,
  customer_phone            text,
  shipping_address          text not null,
  shipping_city             text not null,
  shipping_state            text not null,
  shipping_postal_code      text not null,
  shipping_carrier          text,
  shipping_service          text,
  shipping_service_code     text,
  shipping_cost_cents       integer not null check (shipping_cost_cents >= 0),
  subtotal_cents            integer not null check (subtotal_cents >= 0),
  total_cents               integer not null check (total_cents >= 0),
  payment_status            text not null default 'pending'
                              check (payment_status in ('pending','paid','failed','refunded')),
  fulfillment_status        text not null default 'pending'
                              check (fulfillment_status in ('pending','preparing','shipped','delivered','cancelled')),
  tracking_number           text,
  tracking_url              text,
  stripe_payment_intent_id  text,
  stripe_checkout_session_id text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  variant_id       uuid references public.product_variants(id) on delete set null,
  product_name     text not null,
  variant_label    text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity         integer not null check (quantity > 0),
  line_total_cents integer not null check (line_total_cents >= 0)
);

create table public.order_status_history (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  status     text not null,
  note       text,
  created_at timestamptz not null default now()
);

create index on public.order_items (order_id);
create index on public.order_status_history (order_id);
create index on public.orders (customer_email);
