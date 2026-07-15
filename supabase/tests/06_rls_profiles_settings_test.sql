begin;
select plan(14);

-- sembrar (como postgres, bypassa RLS): settings, usuarios y perfiles.
-- Vaciamos settings primero: supabase/seed.sql ya inserto su fila y las
-- aserciones de abajo leen la tabla completa. Se revierte con el rollback final.
delete from public.settings;

insert into public.settings (fallback_standard_cents, fallback_express_cents)
  values (9900, 17900);

-- auth.users primero por la FK de profiles; el tercer usuario queda sin fila
-- en profiles para poder probar un INSERT "de otro modo valido" (satisface FK
-- y PK) bloqueado unicamente por RLS.
insert into auth.users (id, email) values
  ('d1111111-1111-1111-1111-111111111111','admin-profiles@test.com'),
  ('d2222222-2222-2222-2222-222222222222','user-profiles@test.com'),
  ('d3333333-3333-3333-3333-333333333333','unclaimed-profiles@test.com');

insert into public.profiles (id, is_admin) values
  ('d1111111-1111-1111-1111-111111111111', true),
  ('d2222222-2222-2222-2222-222222222222', false);

-- ===== anon: acceso denegado por defecto =====
set local role anon;

select is_empty(
  $$ select id from public.settings $$,
  'anon no ve settings'
);

select is_empty(
  $$ select id from public.profiles $$,
  'anon no ve profiles'
);

select throws_ok(
  $$ insert into public.profiles (id) values ('d3333333-3333-3333-3333-333333333333') $$,
  '42501', null,
  'anon no puede insertar en profiles'
);

select throws_ok(
  $$ insert into public.settings (fallback_standard_cents, fallback_express_cents) values (5000, 6000) $$,
  '42501', null,
  'anon no puede insertar en settings'
);

reset role;

-- ===== usuario autenticado NO-admin =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"d2222222-2222-2222-2222-222222222222"}';

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('d2222222-2222-2222-2222-222222222222'::uuid) $$,
  'no-admin autenticado ve solo su propio perfil'
);

select is_empty(
  $$ select id from public.settings $$,
  'no-admin autenticado no ve settings'
);

select throws_ok(
  $$ insert into public.settings (fallback_standard_cents, fallback_express_cents) values (5000, 6000) $$,
  '42501', null,
  'no-admin autenticado no puede insertar en settings'
);

-- intento de escalar privilegios: no existe policy de UPDATE en profiles, asi
-- que la fila queda intacta (el update afecta 0 filas, no lanza error).
update public.profiles set is_admin = true where id = auth.uid();

select is(
  (select is_admin from public.profiles where id = 'd2222222-2222-2222-2222-222222222222'),
  false,
  'no-admin autenticado no puede escalar privilegios via update'
);

reset role;
reset request.jwt.claims;

-- ===== admin autenticado =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1111111-1111-1111-1111-111111111111"}';

select results_eq(
  $$ select id from public.profiles order by id $$,
  $$ values ('d1111111-1111-1111-1111-111111111111'::uuid), ('d2222222-2222-2222-2222-222222222222'::uuid) $$,
  'admin ve todos los perfiles'
);

select results_eq(
  $$ select fallback_standard_cents from public.settings $$,
  $$ values (9900) $$,
  'admin puede leer settings'
);

-- settings es fila unica: ni siquiera el admin puede insertar una segunda
-- (el indice unico settings_singleton lo bloquea con 23505). Ya hay una fila
-- sembrada arriba en esta transaccion.
select throws_ok(
  $$ insert into public.settings (fallback_standard_cents, fallback_express_cents) values (1000, 2000) $$,
  '23505', null,
  'ni el admin puede crear una segunda fila de settings (singleton)'
);

select lives_ok(
  $$ update public.settings set fallback_standard_cents = 8800 $$,
  'admin puede actualizar settings'
);

reset role;
reset request.jwt.claims;

-- ===== RLS habilitado en ambas tablas =====
select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true, 'RLS habilitado en profiles'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.settings'::regclass),
  true, 'RLS habilitado en settings'
);

select * from finish();
rollback;
