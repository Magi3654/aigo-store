begin;
select plan(10);

select has_table('public', 'orders', 'orders existe');
select has_table('public', 'order_items', 'order_items existe');
select has_table('public', 'order_status_history', 'order_status_history existe');

select has_column('public', 'order_items', 'created_at', 'order_items tiene created_at');

select col_type_is('public', 'orders', 'total_cents', 'integer', 'total_cents es integer');
select col_has_default('public', 'orders', 'payment_status', 'payment_status tiene default');

-- payment_status invalido rechazado
select throws_ok(
  $$ insert into public.orders (order_number, customer_name, customer_email, shipping_address,
       shipping_city, shipping_state, shipping_postal_code, shipping_cost_cents, subtotal_cents,
       total_cents, payment_status)
     values ('AIGO-TEST','n','a@b.com','dir','cd','edo','01000',0,0,0,'invalido') $$,
  '23514', null, 'payment_status invalido es rechazado'
);

-- order_number unico
select col_is_unique('public', 'orders', 'order_number', 'order_number es UNIQUE');

-- quantity > 0 (fixed: insert a real parent order first with a distinct order_number)
insert into public.orders (id, order_number, customer_name, customer_email, shipping_address,
       shipping_city, shipping_state, shipping_postal_code, shipping_cost_cents, subtotal_cents,
       total_cents)
  values ('11111111-1111-1111-1111-111111111111', 'AIGO-QTY-TEST', 'n', 'a@b.com', 'dir', 'cd', 'edo', '01000', 0, 0, 0);
select throws_ok(
  $$ insert into public.order_items (order_id, product_name, variant_label, unit_price_cents, quantity, line_total_cents)
     values ('11111111-1111-1111-1111-111111111111', 'p', 'M', 100, 0, 0) $$,
  '23514', null, 'quantity = 0 es rechazado'
);

-- borrar order borra sus items (cascade): verificamos la FK existe
select fk_ok('public', 'order_items', 'order_id', 'public', 'orders', 'id',
  'order_items.order_id referencia orders.id');

select * from finish();
rollback;
