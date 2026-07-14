begin;
select plan(12);

-- sembrar: un producto activo y uno inactivo (como postgres, bypassa RLS)
insert into public.products (id, name, "group", category, is_active) values
  ('11111111-1111-1111-1111-111111111111','Activo','G','Albums', true),
  ('22222222-2222-2222-2222-222222222222','Inactivo','G','Albums', false);

-- sembrar: una variante activa y una inactiva sobre el producto activo
insert into public.product_variants (id, product_id, label, price_cents, stock, weight_grams, is_active) values
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','Activa', 100, 1, 50, true),
  ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','Inactiva', 100, 1, 50, false);

-- sembrar usuarios: un admin y un no-admin (auth.users primero por la FK de profiles)
insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555','admin@test.com'),
  ('66666666-6666-6666-6666-666666666666','user@test.com');

insert into public.profiles (id, is_admin) values
  ('55555555-5555-5555-5555-555555555555', true),
  ('66666666-6666-6666-6666-666666666666', false);

-- anon solo ve el activo
set local role anon;

select results_eq(
  $$ select name from public.products order by name $$,
  $$ values ('Activo'::text) $$,
  'anon ve solo productos activos'
);

-- anon NO puede insertar
select throws_ok(
  $$ insert into public.products (name,"group",category) values ('x','g','Albums') $$,
  '42501', null,
  'anon no puede insertar productos'
);

-- anon solo ve variantes activas
select results_eq(
  $$ select label from public.product_variants order by label $$,
  $$ values ('Activa'::text) $$,
  'anon ve solo variantes activas'
);

-- anon NO puede insertar variantes
select throws_ok(
  $$ insert into public.product_variants (product_id, label, price_cents, stock, weight_grams)
     values ('11111111-1111-1111-1111-111111111111', 'y', 100, 1, 50) $$,
  '42501', null,
  'anon no puede insertar variantes'
);

reset role;

-- RLS habilitado en las tablas
select is(
  (select relrowsecurity from pg_class where oid = 'public.products'::regclass),
  true,
  'RLS habilitado en products'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.product_variants'::regclass),
  true,
  'RLS habilitado en product_variants'
);

-- usuario autenticado NO-admin: mismas restricciones que anon
set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666"}';

select results_eq(
  $$ select name from public.products order by name $$,
  $$ values ('Activo'::text) $$,
  'no-admin autenticado NO ve productos inactivos'
);

select throws_ok(
  $$ insert into public.products (name,"group",category) values ('x','g','Albums') $$,
  '42501', null,
  'no-admin autenticado no puede insertar productos'
);

reset role;
reset request.jwt.claims;

-- admin autenticado: ve el catalogo completo (rama is_admin de la policy de lectura)
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';

select results_eq(
  $$ select name from public.products order by name $$,
  $$ values ('Activo'::text), ('Inactivo'::text) $$,
  'admin ve productos activos e inactivos'
);

select results_eq(
  $$ select label from public.product_variants order by label $$,
  $$ values ('Activa'::text), ('Inactiva'::text) $$,
  'admin ve variantes activas e inactivas'
);

-- admin puede insertar y actualizar productos (policy de escritura)
select lives_ok(
  $$ insert into public.products (id, name, "group", category) values
     ('77777777-7777-7777-7777-777777777777','Nuevo','G','Albums') $$,
  'admin puede insertar productos'
);

select lives_ok(
  $$ update public.products set is_active = false where id = '77777777-7777-7777-7777-777777777777' $$,
  'admin puede actualizar productos'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
