begin;
select plan(5);

select has_table('public', 'profiles', 'profiles existe');
select has_table('public', 'settings', 'settings existe');
select has_function('public', 'is_admin', array['uuid'], 'is_admin(uuid) existe');

-- is_admin devuelve false para un uuid inexistente
select is( public.is_admin(gen_random_uuid()), false, 'is_admin false por defecto' );

-- is_admin.is_admin default false
select col_has_default('public', 'profiles', 'is_admin', 'profiles.is_admin tiene default');

select * from finish();
rollback;
