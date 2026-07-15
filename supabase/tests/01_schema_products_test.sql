begin;
select plan(12);

select has_table('public', 'products', 'products existe');
select has_table('public', 'product_variants', 'product_variants existe');

select col_type_is('public', 'products', 'id', 'uuid', 'products.id es uuid');
select col_is_pk('public', 'products', 'id', 'products.id es PK');
select col_not_null('public', 'products', 'name', 'products.name NOT NULL');
-- name es UNIQUE: el seed une variantes a productos por nombre, asi que un nombre
-- duplicado abanicaria ese join a un producto cartesiano.
select col_is_unique('public', 'products', 'name', 'products.name es UNIQUE');

select col_type_is('public', 'product_variants', 'price_cents', 'integer', 'price_cents es integer');
select col_type_is('public', 'product_variants', 'stock', 'integer', 'stock es integer');
select col_type_is('public', 'product_variants', 'weight_grams', 'integer', 'weight_grams es integer');

-- category CHECK
select throws_ok(
  $$ insert into public.products (name, "group", category) values ('x','y','Invalida') $$,
  '23514',
  null,
  'category invalida es rechazada'
);

-- stock negativo rechazado
insert into public.products (id, name, "group", category) values ('33333333-3333-3333-3333-333333333333','P','G','Albums');
select throws_ok(
  $$ insert into public.product_variants (product_id, label, price_cents, stock, weight_grams)
     values ('33333333-3333-3333-3333-333333333333', 'M', 100, -1, 50) $$,
  '23514', null,
  'stock negativo es rechazado'
);

-- FK cascade: variante requiere producto existente
select throws_ok(
  $$ insert into public.product_variants (product_id, label, price_cents, stock, weight_grams)
     values (gen_random_uuid(), 'M', 100, 1, 50) $$,
  '23503',
  null,
  'variante con product_id inexistente es rechazada'
);

select * from finish();
rollback;
