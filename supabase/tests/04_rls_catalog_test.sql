begin;
select plan(3);

-- sembrar: un producto activo y uno inactivo (como postgres, bypassa RLS)
insert into public.products (id, name, "group", category, is_active) values
  ('11111111-1111-1111-1111-111111111111','Activo','G','Albums', true),
  ('22222222-2222-2222-2222-222222222222','Inactivo','G','Albums', false);

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

reset role;

-- RLS habilitado en la tabla
select is(
  (select relrowsecurity from pg_class where oid = 'public.products'::regclass),
  true,
  'RLS habilitado en products'
);

select * from finish();
rollback;
