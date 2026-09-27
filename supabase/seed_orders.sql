-- ============================================================
-- PEDIDOS DE EJEMPLO — SOLO PARA EL STACK LOCAL.
-- `supabase db push` NO ejecuta seeds, asi que esto nunca llega a la nube.
-- Para probar /seguimiento: correo cliente@aigo.local y uno de estos numeros:
--   AIGO-SEED0001  esperando pago
--   AIGO-SEED0002  pagado, en preparacion
--   AIGO-SEED0003  enviado, con guia
-- Idempotente: se puede ejecutar varias veces (UUIDs fijos + on conflict).
-- ============================================================

insert into public.orders (id, order_number, customer_name, customer_email, customer_phone,
  shipping_address, shipping_city, shipping_state, shipping_postal_code,
  shipping_carrier, shipping_service, shipping_cost_cents, subtotal_cents, total_cents,
  payment_status, fulfillment_status, tracking_number, tracking_url, created_at)
values
  ('00000000-0000-4000-8000-0000000000d1', 'AIGO-SEED0001', 'Cliente Demo', 'cliente@aigo.local', '3300000000',
   'Calle Falsa 123', 'Guadalajara', 'Jalisco', '44100',
   null, null, 15000, 85000, 100000,
   'pending', 'pending', null, null, now() - interval '1 hour'),
  ('00000000-0000-4000-8000-0000000000d2', 'AIGO-SEED0002', 'Cliente Demo', 'cliente@aigo.local', '3300000000',
   'Calle Falsa 123', 'Zapopan', 'Jalisco', '45010',
   'DHL', 'Express', 25000, 120000, 145000,
   'paid', 'preparing', null, null, now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000000d3', 'AIGO-SEED0003', 'Cliente Demo', 'cliente@aigo.local', '3300000000',
   'Calle Falsa 123', 'Monterrey', 'Nuevo León', '64000',
   'FedEx', 'Nacional Terrestre', 18000, 130000, 148000,
   'paid', 'shipped', '794612345678', 'https://www.fedex.com/fedextrack/?trknbr=794612345678',
   now() - interval '5 days')
on conflict (id) do nothing;

insert into public.order_items (id, order_id, variant_id, product_name, variant_label,
  unit_price_cents, quantity, line_total_cents)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1',
   (select v.id from public.product_variants v join public.products p on p.id = v.product_id
     where p.name = 'BTS - Album "Proof"' limit 1),
   'BTS - Album "Proof"', 'Único', 85000, 1, 85000),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d2',
   (select v.id from public.product_variants v join public.products p on p.id = v.product_id
     where p.name = 'BLACKPINK - Lightstick Ver.2' limit 1),
   'BLACKPINK - Lightstick Ver.2', 'Único', 120000, 1, 120000),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d3',
   (select v.id from public.product_variants v join public.products p on p.id = v.product_id
     where p.name = 'TWICE - Album "READY TO BE"' limit 1),
   'TWICE - Album "READY TO BE"', 'Único', 65000, 2, 130000)
on conflict (id) do nothing;

insert into public.order_status_history (id, order_id, status, note, created_at)
values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1',
   'pending', 'Pedido creado', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000d2',
   'pending', 'Pedido creado', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000d2',
   'paid', 'Pago confirmado', now() - interval '2 days' + interval '5 minutes'),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000d2',
   'preparing', 'Estamos preparando tu pedido', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000d3',
   'pending', 'Pedido creado', now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000000d3',
   'paid', 'Pago confirmado', now() - interval '5 days' + interval '3 minutes'),
  ('00000000-0000-4000-8000-0000000000f7', '00000000-0000-4000-8000-0000000000d3',
   'preparing', 'Estamos preparando tu pedido', now() - interval '4 days'),
  ('00000000-0000-4000-8000-0000000000f8', '00000000-0000-4000-8000-0000000000d3',
   'shipped', 'Enviado con FedEx', now() - interval '3 days')
on conflict (id) do nothing;
