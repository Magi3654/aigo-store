begin;
select plan(4);

-- insertar una orden SIN order_number genera uno con formato AIGO-XXXXXXXX (8 hex uppercase)
insert into public.orders (customer_name, customer_email, shipping_address,
     shipping_city, shipping_state, shipping_postal_code, shipping_cost_cents,
     subtotal_cents, total_cents)
  values ('n', 'a@b.com', 'dir', 'cd', 'edo', '01000', 0, 0, 0)
  returning order_number as generated_order_number \gset

select matches(
  :'generated_order_number'::text,
  '^AIGO-[0-9A-F]{8}$',
  'order_number autogenerado cumple el formato AIGO-XXXXXXXX'
);

-- insertar una orden CON order_number explicito no lo sobreescribe
insert into public.orders (order_number, customer_name, customer_email, shipping_address,
     shipping_city, shipping_state, shipping_postal_code, shipping_cost_cents,
     subtotal_cents, total_cents)
  values ('AIGO-EXPLICIT1', 'n', 'a@b.com', 'dir', 'cd', 'edo', '01000', 0, 0, 0);

select is(
  (select order_number from public.orders where order_number = 'AIGO-EXPLICIT1'),
  'AIGO-EXPLICIT1',
  'order_number explicito no es sobreescrito por el trigger'
);

-- actualizar un producto actualiza su updated_at
insert into public.products (id, name, "group", category)
  values ('22222222-2222-2222-2222-222222222222', 't', 'g', 'Albums');

-- fijamos updated_at a un valor conocido en el pasado para que la comparacion
-- con now() sea significativa (dentro de una transaccion now() es fijo, asi
-- que un update ingenuo produciria un valor IGUAL y la aserción no probaria nada).
-- Se deshabilita momentaneamente el trigger para poder fijar ese valor pasado,
-- ya que de lo contrario el propio trigger lo sobreescribiria con now().
alter table public.products disable trigger trg_products_updated;

update public.products
  set updated_at = '2000-01-01 00:00:00+00'
  where id = '22222222-2222-2222-2222-222222222222';

alter table public.products enable trigger trg_products_updated;

select ok(
  (select updated_at from public.products where id = '22222222-2222-2222-2222-222222222222')
    = '2000-01-01 00:00:00+00'::timestamptz,
  'updated_at quedo fijado al valor pasado antes del update de prueba'
);

update public.products
  set name = 'actualizado'
  where id = '22222222-2222-2222-2222-222222222222';

select ok(
  (select updated_at from public.products where id = '22222222-2222-2222-2222-222222222222')
    > '2000-01-01 00:00:00+00'::timestamptz,
  'trg_products_updated actualiza updated_at a now()'
);

select * from finish();
rollback;
