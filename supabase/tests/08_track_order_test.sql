begin;
select plan(24);

-- Hermetico: sin intentos previos de otras pruebas o del uso manual.
delete from public.track_order_attempts;

-- Pedidos propios del test (como postgres, bypassa RLS).
insert into public.orders (id, order_number, customer_name, customer_email, customer_phone,
  shipping_address, shipping_city, shipping_state, shipping_postal_code,
  shipping_carrier, shipping_service, shipping_service_code,
  shipping_cost_cents, subtotal_cents, total_cents, payment_status, fulfillment_status,
  tracking_number, tracking_url, stripe_payment_intent_id, stripe_checkout_session_id)
values
  ('c1111111-1111-1111-1111-111111111111', 'AIGO-TT000001', 'Ana Pérez', 'Ana@Test.com', '3312345678',
   'Av. Siempre Viva 742', 'Guadalajara', 'Jalisco', '44100',
   'DHL', 'Express', 'dhl_exp',
   15000, 170000, 185000, 'paid', 'shipped',
   '1234567890', 'https://track.example/1234567890', 'pi_123', 'cs_123'),
  ('c2222222-2222-2222-2222-222222222222', 'AIGO-TT000002', 'Beto', 'beto@test.com', null,
   'Calle 1', 'Monterrey', 'Nuevo León', '64000',
   null, null, null,
   0, 0, 0, 'pending', 'pending',
   null, null, null, null);

insert into public.order_items (order_id, product_name, variant_label, unit_price_cents, quantity, line_total_cents)
values ('c1111111-1111-1111-1111-111111111111', 'BTS - Album "Proof"', 'Único', 85000, 2, 170000);

insert into public.order_status_history (order_id, status, note, created_at) values
  ('c1111111-1111-1111-1111-111111111111', 'pending', 'Pedido creado', now() - interval '2 days'),
  ('c1111111-1111-1111-1111-111111111111', 'paid', 'Pago confirmado', now() - interval '1 day');

select has_function('public', 'track_order', array['text', 'text'], 'existe track_order(text, text)');

-- La limpieza de intentos viejos corre en cada llamada: sin este indice lee la
-- tabla entera, y un atacante puede llenarla rotando IP y numero.
select ok(
  exists(select 1 from pg_indexes
          where schemaname = 'public' and tablename = 'track_order_attempts'
            and indexdef like '%(created_at)'),
  'track_order_attempts tiene un indice solo por created_at para la limpieza'
);

-- ===== consultas exitosas, como anon =====
set local role anon;

select is(
  public.track_order('AIGO-TT000001', 'Ana@Test.com') ->> 'status', 'ok',
  'numero + correo correctos encuentran el pedido'
);

select is(
  public.track_order('AIGO-TT000001', '  ana@test.COM ') -> 'order' ->> 'order_number', 'AIGO-TT000001',
  'el correo ignora mayusculas y espacios'
);

select is(
  public.track_order(' aigo-tt000001 ', 'ana@test.com') ->> 'status', 'ok',
  'el numero se normaliza a mayusculas y sin espacios'
);

select is(
  (select array_agg(k order by k collate "C")
     from jsonb_object_keys(public.track_order('AIGO-TT000001', 'ana@test.com') -> 'order') k),
  array['created_at', 'fulfillment_status', 'history', 'items', 'order_number', 'payment_status',
        'shipping_carrier', 'shipping_city', 'shipping_cost_cents', 'shipping_service',
        'shipping_state', 'subtotal_cents', 'total_cents', 'tracking_number', 'tracking_url'],
  'el pedido expone solo la lista cerrada de llaves'
);

select is(
  (select array_agg(k order by k collate "C")
     from jsonb_object_keys(public.track_order('AIGO-TT000001', 'ana@test.com') -> 'order' -> 'items' -> 0) k),
  array['line_total_cents', 'product_name', 'quantity', 'unit_price_cents', 'variant_label'],
  'cada item expone solo nombre, variante, cantidad y precios'
);

select is(
  (select array_agg(k order by k collate "C")
     from jsonb_object_keys(public.track_order('AIGO-TT000001', 'ana@test.com') -> 'order' -> 'history' -> 0) k),
  array['created_at', 'note', 'status'],
  'cada entrada del historial expone solo estado, nota y fecha'
);

select is(
  public.track_order('AIGO-TT000001', 'ana@test.com') -> 'order' -> 'history' -> 0 ->> 'status', 'pending',
  'el historial va en orden cronologico'
);

select is(
  public.track_order('AIGO-TT000002', 'beto@test.com') -> 'order' -> 'items', '[]'::jsonb,
  'un pedido sin items devuelve [] y no null'
);

reset role;

select is(
  (select count(*) from public.track_order_attempts), 0::bigint,
  'las consultas exitosas no registran intentos'
);

-- ===== fallos: todos dan la misma respuesta =====
set local role anon;

select is(
  public.track_order('AIGO-NOEXISTE', 'ana@test.com'), '{"status":"not_found"}'::jsonb,
  'numero inexistente -> not_found'
);

select is(
  public.track_order('AIGO-TT000001', 'otra@test.com'), '{"status":"not_found"}'::jsonb,
  'correo equivocado -> la misma respuesta que un numero inexistente'
);

select is(
  public.track_order(repeat('A', 40), 'ana@test.com'), '{"status":"not_found"}'::jsonb,
  'numero demasiado largo -> not_found'
);

-- ===== limite por IP: 10 fallos desde la misma IP =====
do $$
begin
  perform set_config('request.headers', '{"x-forwarded-for":"10.0.0.1"}', true);
  for i in 1..10 loop
    perform public.track_order('AIGO-BAD' || i, 'x@test.com');
  end loop;
end $$;

select is(
  public.track_order('AIGO-TT000001', 'ana@test.com'), '{"status":"rate_limited"}'::jsonb,
  'tras 10 fallos desde una IP, incluso el dato correcto queda bloqueado'
);

-- ===== cadena de proxies: cuenta la primera IP =====
do $$
begin
  perform set_config('request.headers', '{"x-forwarded-for":"10.3.0.1, 172.16.0.1"}', true);
  perform public.track_order('AIGO-XFF1', 'x@test.com');
end $$;

reset role;

select is(
  (select count(*) from public.track_order_attempts where kind = 'ip' and key = '10.0.0.1'), 10::bigint,
  'un intento bloqueado no suma mas intentos'
);

select is(
  (select count(*) from public.track_order_attempts where kind = 'ip' and key = '10.3.0.1'), 1::bigint,
  'con x-forwarded-for "a, b" se cuenta la primera IP'
);

-- ===== limite por numero: 5 fallos contra un pedido desde IPs distintas =====
set local role anon;

do $$
begin
  for i in 1..5 loop
    perform set_config('request.headers', format('{"x-forwarded-for":"10.1.0.%s"}', i), true);
    perform public.track_order('AIGO-TT000002', 'intruso' || i || '@test.com');
  end loop;
  perform set_config('request.headers', '{"x-forwarded-for":"10.2.0.1"}', true);
end $$;

select is(
  public.track_order('AIGO-TT000002', 'beto@test.com'), '{"status":"rate_limited"}'::jsonb,
  'tras 5 fallos contra un numero, ese numero queda bloqueado aunque cambie la IP'
);

reset role;

-- ===== permisos =====
select ok(
  has_function_privilege('anon', 'public.track_order(text, text)', 'execute'),
  'anon puede ejecutar track_order'
);

select ok(
  has_function_privilege('authenticated', 'public.track_order(text, text)', 'execute'),
  'authenticated puede ejecutar track_order'
);

set local role anon;

select throws_ok(
  $$ select * from public.track_order_attempts $$,
  '42501', null,
  'anon no puede leer los intentos'
);

select is_empty(
  $$ select id from public.orders $$,
  'anon sigue sin ver pedidos directamente'
);

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"a2222222-2222-2222-2222-222222222222"}';

select throws_ok(
  $$ select * from public.track_order_attempts $$,
  '42501', null,
  'un usuario autenticado no puede leer los intentos'
);

do $$
begin
  perform set_config('request.headers', '{"x-forwarded-for":"10.4.0.1"}', true);
end $$;

select is(
  public.track_order('AIGO-TT000001', 'ana@test.com') ->> 'status', 'ok',
  'un usuario autenticado (p. ej. el admin) tambien puede consultar'
);

reset role;

select * from finish();
rollback;
