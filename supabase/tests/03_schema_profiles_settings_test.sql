begin;
select plan(8);

select has_table('public', 'profiles', 'profiles existe');
select has_table('public', 'settings', 'settings existe');
select has_function('public', 'is_admin', array['uuid'], 'is_admin(uuid) existe');

-- is_admin devuelve false para un uuid inexistente
select is( public.is_admin(gen_random_uuid()), false, 'is_admin false por defecto' );

-- is_admin security properties: check from system catalogs
select ok(
  (select prosecdef from pg_proc
   where pronamespace = (select oid from pg_namespace where nspname = 'public')
   and proname = 'is_admin'
   and pronargs = 1 limit 1) is true,
  'is_admin es SECURITY DEFINER'
);

select ok(
  (select provolatile = 's' from pg_proc
   where pronamespace = (select oid from pg_namespace where nspname = 'public')
   and proname = 'is_admin'
   and pronargs = 1 limit 1),
  'is_admin es STABLE'
);

-- profiles.is_admin default verification
select col_has_default('public', 'profiles', 'is_admin', 'profiles.is_admin tiene default');

-- settings fallback_*_cents check constraints
select throws_ok(
  'insert into public.settings(fallback_standard_cents) values (-1)',
  '23514',
  null,
  'settings.fallback_standard_cents non-negative check'
);

select * from finish();
rollback;
