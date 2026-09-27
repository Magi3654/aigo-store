# Fase 2d — Seguimiento de pedidos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cliente consulte su pedido con número + correo desde `/seguimiento`, leyendo la base de datos mediante una función RPC segura y con límite de intentos.

**Architecture:** Una función de Postgres `security definer` (`public.track_order`) es la única puerta pública a los pedidos: normaliza la entrada, aplica un límite doble de intentos fallidos (por IP y por número) guardado en una tabla cerrada, y devuelve un JSON con una lista cerrada de campos. En el frontend, un módulo puro (`src/lib/trackOrder.js`) llama a la RPC y traduce estados; `TrackingView.vue` se reescribe sobre él. Pedidos de ejemplo en un seed aparte, idempotente.

**Tech Stack:** PostgreSQL 15 (Supabase local) + pgTAP; Vue 3 (`script setup`) + vue-router; `@supabase/supabase-js`; Vitest.

**Spec:** `docs/superpowers/specs/2026-09-26-order-tracking-design.md`

## Global Constraints

- **Solo stack local.** Nada de `supabase db push`, deploy ni cuentas externas.
- **Nunca `supabase db reset`.** Borraría los datos locales del usuario. Las migraciones se aplican con `supabase migration up` y el seed nuevo con `psql`.
- **Los subagentes NO ejecutan git.** El controlador hace todos los commits, agregando archivos explícitos. Los pasos "Commit" son para él.
- **No tocar:** `src/stores/orders.js`, `src/views/user/CheckoutView.vue`, `src/stores/cart.js`, `src/stores/shipping.js`, `src/stores/products.js`, `src/lib/mapProduct.js`, `supabase/seed.sql`, ni las migraciones existentes.
- **Tablas `orders`, `order_items`, `order_status_history`: ninguna política RLS nueva.**
- **Lista cerrada de llaves de `order`:** `order_number`, `created_at`, `payment_status`, `fulfillment_status`, `shipping_city`, `shipping_state`, `shipping_carrier`, `shipping_service`, `tracking_number`, `tracking_url`, `subtotal_cents`, `shipping_cost_cents`, `total_cents`, `items`, `history`.
- **Nunca devolver:** `id`, `customer_name`, `customer_email`, `customer_phone`, `shipping_address`, `shipping_postal_code`, `shipping_service_code`, `variant_id`, `stripe_payment_intent_id`, `stripe_checkout_session_id`.
- **Límites:** IP con ≥ 10 fallos en 15 min, o número con ≥ 5 fallos en 15 min → `rate_limited`. Intentos de más de 1 día se borran.
- **Respuestas de la RPC:** exactamente `{"status":"ok","order":{…}}`, `{"status":"not_found"}` o `{"status":"rate_limited"}`.
- **Precios en centavos**, mostrados solo con `formatMXN` de `src/lib/format.js`.
- TDD estricto: test que falla → implementación mínima → test verde → commit.
- DB local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

### Desviaciones del spec (decididas al planear)

- **Comparación de correo con `lower()` explícito.** `citext` vive en el esquema `public`; con `search_path = ''` su operador `=` no se resuelve y la comparación caería a texto sensible a mayúsculas. `lower(o.customer_email::text) = lower(trim(p_email))` da el comportamiento del spec sin depender del `search_path`.
- **Seed en archivo aparte, `supabase/seed_orders.sql`** (en vez de dentro de `seed.sql`), idempotente con UUIDs fijos y `on conflict (id) do nothing`, y añadido a `[db.seed] sql_paths`. Así se aplica con `psql` sin `db reset`, y un futuro `db reset` también lo carga.
- **`tracking_url` solo se enlaza si empieza por `http://` o `https://`.** Vue no sanea `href`; un valor `javascript:` pegado por error en el admin no debe ser clicable.

## Review Focus

1. Correo pegado con mayúsculas o espacios (copiado del correo de confirmación) → debe encontrar el pedido. Lo cubre el pgTAP de la Task 1.
2. Número en minúsculas, con espacios, o llegado por `?pedido=` → se normaliza igual en SQL y en el frontend. Lo cubren el pgTAP de la Task 1 y el Vitest de la Task 3.
3. Pedido enviado con guía pero sin `tracking_url`, o con una URL que no es http(s) → se muestra la guía sin botón. Lo cubre `safeTrackingUrl` en la Task 3.
4. `payment_status` con un valor inesperado o `null` → debe decir "Esperando pago", nunca "Pago confirmado". Lo cubre `displayStatus` en la Task 3.
5. `x-forwarded-for` con cadena de proxies (`"a, b"`) → cuenta la primera IP. Lo cubre el pgTAP de la Task 1.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `supabase/migrations/20260926120000_track_order.sql` | Tabla de intentos + función `track_order` | 1 |
| `supabase/tests/08_track_order_test.sql` | pgTAP de la función y permisos | 1 |
| `supabase/seed_orders.sql` | 3 pedidos de ejemplo (solo local) | 2 |
| `supabase/config.toml` | Añadir `seed_orders.sql` a `sql_paths` | 2 |
| `src/lib/trackOrder.js` + `.test.js` | RPC + normalización + estados + URL segura | 3 |
| `src/views/user/TrackingView.vue` | Pantalla de seguimiento | 4 |

---

### Task 1: Función `track_order` y tabla de intentos

**Files:**
- Create: `supabase/migrations/20260926120000_track_order.sql`
- Test: `supabase/tests/08_track_order_test.sql`

**Interfaces:**
- Consumes: tablas `public.orders`, `public.order_items`, `public.order_status_history` (Fase 1).
- Produces: `public.track_order(p_order_number text, p_email text) returns jsonb`, ejecutable por `anon` y `authenticated`. La Task 3 la llama como `supabase.rpc('track_order', { p_order_number, p_email })`.

- [ ] **Step 1: Escribir el test que falla**

Crea `supabase/tests/08_track_order_test.sql`:

```sql
begin;
select plan(23);

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
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `supabase test db`
Esperado: FAIL en `08_track_order_test.sql` con `relation "public.track_order_attempts" does not exist`. Los archivos `01`–`07` siguen en verde.

- [ ] **Step 3: Implementación mínima**

Crea `supabase/migrations/20260926120000_track_order.sql`:

```sql
-- Seguimiento de pedidos (Fase 2d). La unica puerta publica a los pedidos:
-- exige numero + correo, devuelve una lista cerrada de campos y limita los
-- intentos fallidos por IP y por numero de pedido.

create table public.track_order_attempts (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('ip', 'order')),
  key        text not null,
  created_at timestamptz not null default now()
);

create index on public.track_order_attempts (kind, key, created_at);

-- Cerrada: RLS sin politicas y sin privilegios para los roles de la API. Solo
-- la funcion (dueña postgres, security definer) la lee y la escribe.
alter table public.track_order_attempts enable row level security;
revoke all on public.track_order_attempts from anon, authenticated;

create or replace function public.track_order(p_order_number text, p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_number  text := upper(trim(coalesce(p_order_number, '')));
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_ip      text;
  v_order   public.orders%rowtype;
  v_window  constant interval := interval '15 minutes';
begin
  -- x-forwarded-for puede traer "cliente, proxy1, ..."; el cliente es el primero.
  v_ip := coalesce(nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');

  delete from public.track_order_attempts where created_at < now() - interval '1 day';

  if (select count(*) from public.track_order_attempts
        where kind = 'ip' and key = v_ip and created_at > now() - v_window) >= 10
     or (select count(*) from public.track_order_attempts
        where kind = 'order' and key = left(v_number, 64) and created_at > now() - v_window) >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if v_number <> '' and length(v_number) <= 32 and v_email <> '' and length(v_email) <= 254 then
    -- lower() explicito: citext vive en "public" y con search_path vacio su
    -- operador no se resolveria; asi la comparacion no depende de eso.
    select * into v_order
      from public.orders o
     where o.order_number = v_number
       and lower(o.customer_email::text) = v_email;
  end if;

  if v_order.id is null then
    insert into public.track_order_attempts (kind, key)
    values ('ip', v_ip), ('order', left(v_number, 64));
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'order', jsonb_build_object(
      'order_number',        v_order.order_number,
      'created_at',          v_order.created_at,
      'payment_status',      v_order.payment_status,
      'fulfillment_status',  v_order.fulfillment_status,
      'shipping_city',       v_order.shipping_city,
      'shipping_state',      v_order.shipping_state,
      'shipping_carrier',    v_order.shipping_carrier,
      'shipping_service',    v_order.shipping_service,
      'tracking_number',     v_order.tracking_number,
      'tracking_url',        v_order.tracking_url,
      'subtotal_cents',      v_order.subtotal_cents,
      'shipping_cost_cents', v_order.shipping_cost_cents,
      'total_cents',         v_order.total_cents,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'product_name',     i.product_name,
                 'variant_label',    i.variant_label,
                 'quantity',         i.quantity,
                 'unit_price_cents', i.unit_price_cents,
                 'line_total_cents', i.line_total_cents
               ) order by i.created_at)
          from public.order_items i
         where i.order_id = v_order.id
      ), '[]'::jsonb),
      'history', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'status',     h.status,
                 'note',       h.note,
                 'created_at', h.created_at
               ) order by h.created_at)
          from public.order_status_history h
         where h.order_id = v_order.id
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.track_order(text, text) from public;
grant execute on function public.track_order(text, text) to anon, authenticated;
```

Aplica la migración al stack local **sin** reset:

Run: `supabase migration up`
Esperado: `Applying migration 20260926120000_track_order.sql...` sin errores.

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `supabase test db`
Esperado: `All tests successful`, `Files=8, Tests=111` (88 anteriores + 23 nuevos).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260926120000_track_order.sql supabase/tests/08_track_order_test.sql
git commit -m "feat(db): track_order por RPC con limite de intentos"
```

---

### Task 2: Pedidos de ejemplo

**Files:**
- Create: `supabase/seed_orders.sql`
- Modify: `supabase/config.toml` (`[db.seed] sql_paths`, línea ~65)
- Modify: `supabase/tests/05_rls_orders_test.sql:1-3` (hacerlo hermético frente al seed)

**Interfaces:**
- Consumes: productos sembrados por `supabase/seed.sql` (para `variant_id`); `public.track_order` (Task 1) para verificar.
- Produces: pedidos `AIGO-SEED0001`, `AIGO-SEED0002`, `AIGO-SEED0003` con correo `cliente@aigo.local`. La Task 4 los usa en la verificación manual.

- [ ] **Step 1: Hacer hermético `05_rls_orders_test.sql` (el test que va a romperse)**

`05_rls_orders_test.sql:114-118` afirma que el admin ve **exactamente** `AIGO-SEED`. Con los
pedidos sembrados de este task vería también `AIGO-SEED0001..3` y fallaría. Convención de la
Fase 1: los tests que leen tablas completas las vacían dentro de su transacción.

En `supabase/tests/05_rls_orders_test.sql`, justo después de `select plan(23);` añade:

```sql

-- Hermetico frente a supabase/seed_orders.sql: este test afirma el contenido
-- exacto de las tablas de pedidos. El delete en cascada vacia items e historial.
delete from public.orders;
```

Run: `supabase test db`
Esperado: `All tests successful` (sigue en verde: aún no hay pedidos sembrados; el `delete`
se revierte con el `rollback` del test).

- [ ] **Step 2: Escribir el seed**

Crea `supabase/seed_orders.sql`:

```sql
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
```

- [ ] **Step 3: Registrar el seed**

En `supabase/config.toml`, sección `[db.seed]`, cambia:

```toml
sql_paths = ["./seed.sql"]
```

por:

```toml
sql_paths = ["./seed.sql", "./seed_orders.sql"]
```

- [ ] **Step 4: Aplicar el seed al stack local (sin reset) y verificar idempotencia**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/seed_orders.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/seed_orders.sql
```
Esperado: ambas ejecuciones sin error (la segunda inserta `0` filas).

- [ ] **Step 5: Verificar los pedidos a través de la función**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc \
"begin; set local role anon;
 select public.track_order('AIGO-SEED0001','cliente@aigo.local')->'order'->>'payment_status';
 select jsonb_array_length(public.track_order('AIGO-SEED0002','cliente@aigo.local')->'order'->'history');
 select public.track_order('AIGO-SEED0003','CLIENTE@aigo.local')->'order'->>'tracking_number';
 rollback;"
```
Esperado, una por línea: `pending`, `3`, `794612345678`.

- [ ] **Step 6: Confirmar que las pruebas siguen herméticas**

Run: `supabase test db`
Esperado: `All tests successful`, `Tests=111`.

- [ ] **Step 7: Commit**

```bash
git add supabase/seed_orders.sql supabase/config.toml supabase/tests/05_rls_orders_test.sql
git commit -m "feat(db): pedidos de ejemplo para probar el seguimiento en local"
```

---

### Task 3: `src/lib/trackOrder.js`

**Files:**
- Create: `src/lib/trackOrder.js`
- Test: `src/lib/trackOrder.test.js`

**Interfaces:**
- Consumes: `supabase` de `src/lib/supabase.js`; RPC `track_order(p_order_number, p_email)` (Task 1).
- Produces (la Task 4 los importa):
  - `normalizeOrderNumber(value: unknown) → string`
  - `displayStatus(payment_status, fulfillment_status) → { key, label }`, con `key` ∈ `cancelled | refunded | payment_failed | awaiting_payment | paid | preparing | shipped | delivered`
  - `historyLabel(status: string) → string`
  - `safeTrackingUrl(url: unknown) → string | null`
  - `trackOrder(orderNumber, email) → Promise<{ status: 'ok', order } | { status: 'not_found' } | { status: 'rate_limited' } | { status: 'error' }>`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/trackOrder.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('./supabase.js', () => ({ supabase: { rpc } }))

import {
  normalizeOrderNumber, displayStatus, historyLabel, safeTrackingUrl, trackOrder,
} from './trackOrder.js'

beforeEach(() => {
  rpc.mockReset()
})

describe('normalizeOrderNumber', () => {
  it('quita espacios y pasa a mayusculas', () => {
    expect(normalizeOrderNumber('  aigo-3fa91c07 ')).toBe('AIGO-3FA91C07')
  })

  it('tolera valores que no son texto', () => {
    expect(normalizeOrderNumber(undefined)).toBe('')
    expect(normalizeOrderNumber(['AIGO-1'])).toBe('')
  })
})

describe('displayStatus', () => {
  const cases = [
    ['paid', 'cancelled', 'cancelled', 'Cancelado'],
    ['pending', 'cancelled', 'cancelled', 'Cancelado'],
    ['refunded', 'shipped', 'refunded', 'Reembolsado'],
    ['failed', 'pending', 'payment_failed', 'Pago rechazado'],
    ['pending', 'pending', 'awaiting_payment', 'Esperando pago'],
    ['paid', 'pending', 'paid', 'Pago confirmado'],
    ['paid', 'preparing', 'preparing', 'En preparación'],
    ['paid', 'shipped', 'shipped', 'Enviado'],
    ['paid', 'delivered', 'delivered', 'Entregado'],
  ]

  it.each(cases)('pago %s + envio %s -> %s', (payment, fulfillment, key, label) => {
    expect(displayStatus(payment, fulfillment)).toEqual({ key, label })
  })

  it('un estado de pago inesperado nunca se muestra como pagado', () => {
    expect(displayStatus(null, 'pending')).toEqual({ key: 'awaiting_payment', label: 'Esperando pago' })
    expect(displayStatus('raro', 'shipped')).toEqual({ key: 'awaiting_payment', label: 'Esperando pago' })
  })
})

describe('historyLabel', () => {
  it('traduce los estados conocidos', () => {
    expect(historyLabel('pending')).toBe('Pedido creado')
    expect(historyLabel('paid')).toBe('Pago confirmado')
    expect(historyLabel('failed')).toBe('Pago rechazado')
    expect(historyLabel('refunded')).toBe('Reembolsado')
    expect(historyLabel('preparing')).toBe('En preparación')
    expect(historyLabel('shipped')).toBe('Enviado')
    expect(historyLabel('delivered')).toBe('Entregado')
    expect(historyLabel('cancelled')).toBe('Cancelado')
  })

  it('deja tal cual un estado desconocido', () => {
    expect(historyLabel('en_aduana')).toBe('en_aduana')
  })
})

describe('safeTrackingUrl', () => {
  it('acepta http y https', () => {
    expect(safeTrackingUrl('https://www.fedex.com/x')).toBe('https://www.fedex.com/x')
    expect(safeTrackingUrl('HTTP://dhl.com/x')).toBe('HTTP://dhl.com/x')
  })

  it('rechaza cualquier otro esquema o valor vacio', () => {
    expect(safeTrackingUrl('javascript:alert(1)')).toBe(null)
    expect(safeTrackingUrl('  ')).toBe(null)
    expect(safeTrackingUrl(null)).toBe(null)
  })
})

describe('trackOrder', () => {
  const ORDER = { order_number: 'AIGO-SEED0003', items: [], history: [] }

  it('normaliza la entrada antes de llamar a la RPC', async () => {
    rpc.mockResolvedValue({ data: { status: 'not_found' }, error: null })
    await trackOrder(' aigo-seed0003 ', '  cliente@aigo.local ')
    expect(rpc).toHaveBeenCalledWith('track_order', {
      p_order_number: 'AIGO-SEED0003',
      p_email: 'cliente@aigo.local',
    })
  })

  it('devuelve el pedido cuando la RPC lo encuentra', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok', order: ORDER }, error: null })
    expect(await trackOrder('AIGO-SEED0003', 'cliente@aigo.local')).toEqual({ status: 'ok', order: ORDER })
  })

  it('pasa not_found y rate_limited tal cual', async () => {
    rpc.mockResolvedValue({ data: { status: 'not_found' }, error: null })
    expect(await trackOrder('A', 'b')).toEqual({ status: 'not_found' })
    rpc.mockResolvedValue({ data: { status: 'rate_limited' }, error: null })
    expect(await trackOrder('A', 'b')).toEqual({ status: 'rate_limited' })
  })

  it('un error de la RPC o una excepcion de red es "error"', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await trackOrder('A', 'b')).toEqual({ status: 'error' })
    rpc.mockRejectedValue(new Error('offline'))
    expect(await trackOrder('A', 'b')).toEqual({ status: 'error' })
  })

  it('una respuesta con forma inesperada es "error"', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok' }, error: null })
    expect(await trackOrder('A', 'b')).toEqual({ status: 'error' })
    rpc.mockResolvedValue({ data: { status: 'otra_cosa' }, error: null })
    expect(await trackOrder('A', 'b')).toEqual({ status: 'error' })
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/lib/trackOrder.test.js`
Esperado: FAIL — `Failed to resolve import "./trackOrder.js"`.

- [ ] **Step 3: Implementación mínima**

Crea `src/lib/trackOrder.js`:

```js
import { supabase } from './supabase.js'

const STATUS_LABELS = {
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
  payment_failed: 'Pago rechazado',
  awaiting_payment: 'Esperando pago',
  paid: 'Pago confirmado',
  preparing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
}

const HISTORY_LABELS = {
  pending: 'Pedido creado',
  paid: 'Pago confirmado',
  failed: 'Pago rechazado',
  refunded: 'Reembolsado',
  preparing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export function normalizeOrderNumber(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

// Pago y envio son ejes distintos en la BD; el cliente ve una sola etiqueta.
// Cualquier pago que no sea exactamente 'paid' se muestra como pendiente.
export function displayStatus(payment, fulfillment) {
  let key
  if (fulfillment === 'cancelled') key = 'cancelled'
  else if (payment === 'refunded') key = 'refunded'
  else if (payment === 'failed') key = 'payment_failed'
  else if (payment !== 'paid') key = 'awaiting_payment'
  else if (fulfillment === 'preparing') key = 'preparing'
  else if (fulfillment === 'shipped') key = 'shipped'
  else if (fulfillment === 'delivered') key = 'delivered'
  else key = 'paid'
  return { key, label: STATUS_LABELS[key] }
}

export function historyLabel(status) {
  return HISTORY_LABELS[status] ?? status
}

// Vue no sanea href: solo enlazamos URLs http(s).
export function safeTrackingUrl(url) {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

export async function trackOrder(orderNumber, email) {
  try {
    const { data, error } = await supabase.rpc('track_order', {
      p_order_number: normalizeOrderNumber(orderNumber),
      p_email: typeof email === 'string' ? email.trim() : '',
    })
    if (error || !data) return { status: 'error' }
    if (data.status === 'ok' && data.order) return { status: 'ok', order: data.order }
    if (data.status === 'not_found' || data.status === 'rate_limited') return { status: data.status }
    return { status: 'error' }
  } catch {
    return { status: 'error' }
  }
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npx vitest run src/lib/trackOrder.test.js`
Esperado: PASS, 21 tests. Luego `npx vitest run`: todo verde, sin ruido en la salida.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trackOrder.js src/lib/trackOrder.test.js
git commit -m "feat(fe): cliente de track_order con estados y URL de rastreo segura"
```

---

### Task 4: `TrackingView.vue` sobre la RPC

**Files:**
- Modify: `src/views/user/TrackingView.vue` (reemplazo completo)

**Interfaces:**
- Consumes: `trackOrder`, `normalizeOrderNumber`, `displayStatus`, `historyLabel`, `safeTrackingUrl` (Task 3); `formatMXN` de `src/lib/format.js`; la query `?pedido=` de vue-router.
- Produces: la pantalla `/seguimiento`. Ya no importa `src/stores/orders.js`.

- [ ] **Step 1: Reescribir la vista**

Reemplaza **todo** `src/views/user/TrackingView.vue` por:

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { formatMXN } from '../../lib/format.js'
import {
  trackOrder, normalizeOrderNumber, displayStatus, historyLabel, safeTrackingUrl,
} from '../../lib/trackOrder.js'

const STATUS_COLORS = {
  awaiting_payment: '#C18797',
  paid: '#936DA4',
  preparing: '#BB82A8',
  shipped: '#A583AA',
  delivered: '#6BA589',
  cancelled: '#C87070',
  refunded: '#C87070',
  payment_failed: '#C87070',
}

const HISTORY_COLORS = {
  pending: '#C18797',
  paid: '#936DA4',
  preparing: '#BB82A8',
  shipped: '#A583AA',
  delivered: '#6BA589',
  cancelled: '#C87070',
  refunded: '#C87070',
  failed: '#C87070',
}

const MESSAGES = {
  not_found: 'No encontramos un pedido con ese número y correo.',
  rate_limited: 'Demasiados intentos. Intenta de nuevo en unos minutos.',
  error: 'No pudimos consultar tu pedido. Intenta de nuevo.',
}

const route = useRoute()
const orderNumber = ref('')
const email = ref('')
const loading = ref(false)
const result = ref(null)

// Enlace directo desde la pagina de exito o el correo (Fase 2c): el cliente
// solo tiene que escribir su correo.
onMounted(() => {
  orderNumber.value = normalizeOrderNumber(route.query.pedido)
})

const canSearch = computed(
  () => orderNumber.value.trim() !== '' && email.value.trim() !== '' && !loading.value,
)

const order = computed(() => (result.value?.status === 'ok' ? result.value.order : null))
const status = computed(() =>
  order.value ? displayStatus(order.value.payment_status, order.value.fulfillment_status) : null,
)
const trackingUrl = computed(() => safeTrackingUrl(order.value?.tracking_url))
const message = computed(() => MESSAGES[result.value?.status] ?? null)

async function search() {
  if (!canSearch.value) return
  orderNumber.value = normalizeOrderNumber(orderNumber.value)
  loading.value = true
  result.value = await trackOrder(orderNumber.value, email.value)
  loading.value = false
}

function badgeStyle(color) {
  return { background: color + '22', color, border: '1px solid ' + color }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <div class="tracking-page container">
    <h1><i class="fas fa-truck"></i> Seguimiento de Pedido</h1>

    <form class="search-section" @submit.prevent="search">
      <div class="search-box">
        <input
          v-model="orderNumber"
          aria-label="Número de pedido"
          placeholder="Número de pedido (ej: AIGO-3FA91C07)"
          autocomplete="off"
        />
        <input
          v-model="email"
          type="email"
          aria-label="Correo electrónico"
          placeholder="Correo con el que compraste"
          autocomplete="email"
        />
        <button type="submit" :disabled="!canSearch">
          <i class="fas" :class="loading ? 'fa-spinner fa-spin' : 'fa-search'"></i>
          {{ loading ? 'Buscando…' : 'Buscar' }}
        </button>
      </div>
    </form>

    <div v-if="message" class="not-found" role="status">
      <i class="fas fa-exclamation-circle"></i>
      <p>{{ message }}</p>
    </div>

    <div v-if="order" class="order-detail">
      <div class="order-header">
        <div>
          <h2>{{ order.order_number }}</h2>
          <p class="order-date">Creado: {{ formatDate(order.created_at) }}</p>
        </div>
        <span class="status-badge" :style="badgeStyle(STATUS_COLORS[status.key])">
          {{ status.label }}
        </span>
      </div>

      <div v-if="order.history.length" class="timeline">
        <div
          v-for="(entry, i) in order.history"
          :key="i"
          class="timeline-item"
          :class="{ last: i === order.history.length - 1 }"
        >
          <div class="timeline-dot" :style="{ background: HISTORY_COLORS[entry.status] ?? '#999' }"></div>
          <div class="timeline-content">
            <p class="timeline-status">{{ historyLabel(entry.status) }}</p>
            <p v-if="entry.note" class="timeline-note">{{ entry.note }}</p>
            <p class="timeline-date">{{ formatDate(entry.created_at) }}</p>
          </div>
        </div>
      </div>

      <div class="order-info-grid">
        <div class="info-card">
          <h3><i class="fas fa-box"></i> Productos</h3>
          <div v-for="(item, i) in order.items" :key="i" class="info-item">
            <span>{{ item.product_name }} ({{ item.variant_label }}) x{{ item.quantity }}</span>
            <span>{{ formatMXN(item.line_total_cents) }}</span>
          </div>
          <hr />
          <div class="info-item"><span>Subtotal</span><span>{{ formatMXN(order.subtotal_cents) }}</span></div>
          <div class="info-item"><span>Envío</span><span>{{ formatMXN(order.shipping_cost_cents) }}</span></div>
          <div class="info-item total"><span>Total</span><span>{{ formatMXN(order.total_cents) }}</span></div>
        </div>
        <div class="info-card">
          <h3><i class="fas fa-map-marker-alt"></i> Envío</h3>
          <p>{{ order.shipping_city }}, {{ order.shipping_state }}</p>
          <p v-if="order.shipping_carrier">
            {{ order.shipping_carrier }}<template v-if="order.shipping_service"> — {{ order.shipping_service }}</template>
          </p>
          <p v-if="order.tracking_number" class="mt">Guía: {{ order.tracking_number }}</p>
          <a
            v-if="trackingUrl"
            :href="trackingUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="track-link"
          >
            <i class="fas fa-external-link-alt"></i> Rastrear paquete
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
```

Conserva el bloque `<style scoped>` actual del archivo, con estos cambios:

1. Sustituye la regla `.search-box` por:
```css
.search-box { display: flex; gap: 10px; max-width: 760px; flex-wrap: wrap; }
.search-box input { min-width: 220px; }
```
(mantén la regla `.search-box input { flex: 1; ... }` existente; la nueva línea solo añade `min-width`).
2. Añade antes del `@media`:
```css
.track-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 16px;
  background: var(--gradient);
  color: white;
  border-radius: 10px;
  font-weight: 600;
  text-decoration: none;
}
```
3. Dentro del `@media (max-width: 768px)`, añade:
```css
  .search-box { flex-direction: column; }
  .search-box input { min-width: 0; }
```

- [ ] **Step 2: Verificación automática**

Run:
```bash
npx vitest run
npm run build
grep -n "stores/orders" src/views/user/TrackingView.vue || echo "TrackingView ya no usa orders.js"
```
Esperado: Vitest todo verde, build sin errores, y el mensaje final del `grep`.

- [ ] **Step 3: Verificación manual en el navegador**

Con `npm run dev` y el stack local arriba (Task 2 aplicada), en `http://127.0.0.1:5173/seguimiento`:

1. `AIGO-SEED0001` + `cliente@aigo.local` → "Esperando pago", 1 entrada en la línea de tiempo, sin guía.
2. `aigo-seed0002` + `Cliente@AIGO.local` → "En preparación", 3 entradas, DHL — Express.
3. `AIGO-SEED0003` + `cliente@aigo.local` → "Enviado", guía `794612345678` y botón "Rastrear paquete" que abre FedEx en otra pestaña.
4. `AIGO-SEED0003` + `otro@correo.com` → "No encontramos un pedido con ese número y correo."
5. `http://127.0.0.1:5173/seguimiento?pedido=aigo-seed0002` → el número aparece ya rellenado en mayúsculas.
6. En ninguna pantalla aparecen nombre, calle, CP, teléfono ni correo del cliente.
7. Con correos falsos contra `AIGO-SEED0001`, al 6.º intento aparece "Demasiados intentos…". Para no dejarlo bloqueado:
   ```bash
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "delete from public.track_order_attempts;"
   ```

- [ ] **Step 4: Commit**

```bash
git add src/views/user/TrackingView.vue
git commit -m "feat(fe): seguimiento de pedidos con numero + correo sobre la RPC"
```

---

## Criterios de éxito (verificar al cerrar la fase)

1. `/seguimiento` muestra los pedidos sembrados con número + correo correctos.
2. Cualquier otra combinación muestra el mismo "no encontrado".
3. Tras el límite de intentos aparece el aviso de bloqueo.
4. La respuesta de la RPC nunca incluye datos personales fuera de ciudad y estado.
5. `anon` sigue sin poder leer las tablas de pedidos directamente.
6. `supabase test db` (111 pgTAP), `npm test` y `npm run build` en verde.
