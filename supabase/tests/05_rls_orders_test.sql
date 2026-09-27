begin;
select plan(23);

-- Hermetico frente a supabase/seed_orders.sql: este test afirma el contenido
-- exacto de las tablas de pedidos. El delete en cascada vacia items e historial.
delete from public.orders;

-- sembrar: un pedido con un item y una entrada de historial (como postgres, bypassa RLS)
insert into public.orders (id, order_number, customer_name, customer_email, shipping_address,
  shipping_city, shipping_state, shipping_postal_code, shipping_cost_cents, subtotal_cents, total_cents)
values ('b1111111-1111-1111-1111-111111111111','AIGO-SEED','n','a@b.com','d','c','e','01000',0,0,0);

insert into public.order_items (order_id, product_name, variant_label, unit_price_cents, quantity, line_total_cents)
values ('b1111111-1111-1111-1111-111111111111','P','V',100,1,100);

insert into public.order_status_history (order_id, status)
values ('b1111111-1111-1111-1111-111111111111','pending');

-- sembrar usuarios: un admin y un no-admin (auth.users primero por la FK de profiles)
insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111','admin-orders@test.com'),
  ('a2222222-2222-2222-2222-222222222222','user-orders@test.com');

insert into public.profiles (id, is_admin) values
  ('a1111111-1111-1111-1111-111111111111', true),
  ('a2222222-2222-2222-2222-222222222222', false);

-- ===== anon: acceso denegado por defecto =====
set local role anon;

select is_empty(
  $$ select id from public.orders $$,
  'anon no ve pedidos'
);

select is_empty(
  $$ select id from public.order_items $$,
  'anon no ve items de pedidos'
);

select is_empty(
  $$ select id from public.order_status_history $$,
  'anon no ve historial de pedidos'
);

select throws_ok(
  $$ insert into public.orders (order_number,customer_name,customer_email,shipping_address,
       shipping_city,shipping_state,shipping_postal_code,shipping_cost_cents,subtotal_cents,total_cents)
     values ('AIGO-HACK-ANON','n','a@b.com','d','c','e','01000',0,0,0) $$,
  '42501', null,
  'anon no puede crear pedidos'
);

select throws_ok(
  $$ insert into public.order_items (order_id, product_name, variant_label, unit_price_cents, quantity, line_total_cents)
     values ('b1111111-1111-1111-1111-111111111111','P','V',100,1,100) $$,
  '42501', null,
  'anon no puede insertar items de pedidos'
);

select throws_ok(
  $$ insert into public.order_status_history (order_id, status)
     values ('b1111111-1111-1111-1111-111111111111','pending') $$,
  '42501', null,
  'anon no puede insertar historial de pedidos'
);

reset role;

-- ===== usuario autenticado NO-admin: mismas restricciones que anon =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"a2222222-2222-2222-2222-222222222222"}';

select is_empty(
  $$ select id from public.orders $$,
  'no-admin autenticado no ve pedidos'
);

select is_empty(
  $$ select id from public.order_items $$,
  'no-admin autenticado no ve items de pedidos'
);

select is_empty(
  $$ select id from public.order_status_history $$,
  'no-admin autenticado no ve historial de pedidos'
);

select throws_ok(
  $$ insert into public.orders (order_number,customer_name,customer_email,shipping_address,
       shipping_city,shipping_state,shipping_postal_code,shipping_cost_cents,subtotal_cents,total_cents)
     values ('AIGO-HACK-USER','n','a@b.com','d','c','e','01000',0,0,0) $$,
  '42501', null,
  'no-admin autenticado no puede crear pedidos'
);

select throws_ok(
  $$ insert into public.order_items (order_id, product_name, variant_label, unit_price_cents, quantity, line_total_cents)
     values ('b1111111-1111-1111-1111-111111111111','P','V',100,1,100) $$,
  '42501', null,
  'no-admin autenticado no puede insertar items de pedidos'
);

select throws_ok(
  $$ insert into public.order_status_history (order_id, status)
     values ('b1111111-1111-1111-1111-111111111111','pending') $$,
  '42501', null,
  'no-admin autenticado no puede insertar historial de pedidos'
);

reset role;
reset request.jwt.claims;

-- ===== admin autenticado: puede leer y actualizar, pero no insertar =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1111111-1111-1111-1111-111111111111"}';

select results_eq(
  $$ select order_number from public.orders $$,
  $$ values ('AIGO-SEED'::text) $$,
  'admin ve pedidos'
);

select results_eq(
  $$ select product_name from public.order_items $$,
  $$ values ('P'::text) $$,
  'admin ve items de pedidos'
);

select results_eq(
  $$ select status from public.order_status_history $$,
  $$ values ('pending'::text) $$,
  'admin ve historial de pedidos'
);

select lives_ok(
  $$ update public.orders set fulfillment_status = 'shipped' where id = 'b1111111-1111-1111-1111-111111111111' $$,
  'admin puede actualizar campos de envio/estado de un pedido'
);

-- scope de columnas: el admin NO puede tocar el estado de pago ni los montos
-- (eso es del webhook via service_role). El grant de columna lo deniega con 42501.
select throws_ok(
  $$ update public.orders set payment_status = 'paid' where id = 'b1111111-1111-1111-1111-111111111111' $$,
  '42501', null,
  'admin no puede cambiar payment_status (privilegio de columna)'
);

select throws_ok(
  $$ update public.orders set total_cents = 999999 where id = 'b1111111-1111-1111-1111-111111111111' $$,
  '42501', null,
  'admin no puede cambiar total_cents (privilegio de columna)'
);

-- el admin SI puede anexar una nota al historial de estado
select lives_ok(
  $$ insert into public.order_status_history (order_id, status, note)
     values ('b1111111-1111-1111-1111-111111111111','shipped','enviado por admin') $$,
  'admin puede insertar en el historial de estado'
);

select throws_ok(
  $$ insert into public.orders (order_number,customer_name,customer_email,shipping_address,
       shipping_city,shipping_state,shipping_postal_code,shipping_cost_cents,subtotal_cents,total_cents)
     values ('AIGO-HACK-ADMIN','n','a@b.com','d','c','e','01000',0,0,0) $$,
  '42501', null,
  'admin no puede insertar pedidos (solo select/update)'
);

reset role;
reset request.jwt.claims;

-- ===== RLS habilitado en las tres tablas =====
select is(
  (select relrowsecurity from pg_class where oid = 'public.orders'::regclass),
  true,
  'RLS habilitado en orders'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.order_items'::regclass),
  true,
  'RLS habilitado en order_items'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.order_status_history'::regclass),
  true,
  'RLS habilitado en order_status_history'
);

select * from finish();
rollback;
