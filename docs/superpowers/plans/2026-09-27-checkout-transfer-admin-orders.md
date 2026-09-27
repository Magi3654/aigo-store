# Fase 2c-1 — Checkout con transferencia + pedidos en el admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El cliente compra como invitado y paga por transferencia. El pedido se crea en el servidor con precios y stock reales (el stock queda apartado). La admin confirma pagos, avanza el envío, cancela pedidos (el stock vuelve) y las transferencias sin pagar vencen solas a las 48 h.

**Architecture:** Toda la lógica de pedidos vive en funciones de Postgres `security definer` con `search_path = ''`, siguiendo el patrón de `track_order` (2d):
- **Públicas:** `checkout_options`, `create_order`.
- **Admin:** `admin_mark_paid`, `admin_cancel_order`, `admin_update_fulfillment`, `admin_add_order_note`.
- **Internas:** `assert_admin`, `restock_and_cancel`, `expire_unpaid_orders`. La última la corre pg_cron.

`authenticated` pierde el UPDATE directo sobre `orders`, así que todas las escrituras pasan por las RPC. En el frontend, dos módulos puros llaman a las RPC y alimentan `CheckoutView` y `TrackingView`: `validateCheckout.js` y `checkout.js`. Un store `adminOrders` y un módulo `orderLabels` alimentan las vistas del admin.

**Tech Stack:** PostgreSQL 17 (Supabase local) + pgTAP + pg_cron; Vue 3 (`script setup`) + Pinia + vue-router; `@supabase/supabase-js`; Vitest.

**Spec:** `docs/superpowers/specs/2026-09-27-checkout-transfer-admin-orders-design.md`

## Global Constraints

- **Solo stack local.** Nada de `supabase db push`, deploy ni cuentas externas.
- **Nunca `supabase db reset`.** Borraría los datos locales de la usuaria. Las migraciones se aplican con `supabase migration up`; los seeds nuevos, con `psql`.
- **Los subagentes NO ejecutan git** (ningún comando: ni status, ni diff, ni checkout, ni stash). El controlador hace todos los commits, agregando archivos explícitos. Los pasos "Commit" son para él.
- **No editar migraciones existentes.** Todo cambio de esquema va en una migración nueva.
- DB local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. pgTAP: `supabase test db`. Vitest: `npm test`. Build: `npm run build`.
- **Toda función nueva:** `security definer`, `set search_path = ''`, todo calificado con `public.`, `auth.` o `cron.`.
- **Grants:** Supabase da EXECUTE a `anon` y `authenticated` por *default privileges*, así que cada función nueva lleva `revoke execute ... from public, anon, authenticated` y luego el `grant` explícito que corresponda.
  - Públicas (`checkout_options`, `create_order`): `anon` + `authenticated`.
  - Admin: solo `authenticated`; por dentro verifican `is_admin`.
  - Internas: ningún grant.
- **Errores de negocio de las funciones de admin:** `raise exception '<codigo>' using errcode = 'P0001'`. Los códigos son exactamente estos: `order_not_found`, `order_cancelled`, `already_paid`, `not_transfer`, `not_paid`, `invalid_transition`, `tracking_required`, `invalid_tracking_url`, `note_required`, `note_too_long`. Sin permisos: `raise exception 'forbidden' using errcode = '42501'`.
- **Respuestas de `create_order` (exactas):**
  - `{"status":"ok","order_number","subtotal_cents","shipping_cost_cents","total_cents","payment_due_at"}`
  - `{"status":"invalid","field":<campo>}`
  - `{"status":"unavailable","variant_ids":[...]}`
  - `{"status":"insufficient_stock","items":[{"variant_id","available"}]}`
  - `{"status":"payment_method_unavailable"}`
  - `{"status":"rate_limited"}`
- **Plazo de transferencia: 48 h. Rate-limit de `create_order`: ≥ 5 llamadas por IP en 15 min** → `rate_limited`. Se cuenta cada llamada no bloqueada.
- **Precios en centavos**, mostrados solo con `formatMXN` de `src/lib/format.js`.
- **Vistas públicas:** tokens del rediseño (`--ink`, `--lilac`, `--surface`, `--danger`, `--font-display`…), sin Font Awesome, planas (sin sombras ni degradados). El admin puede seguir usando Font Awesome.
- TDD estricto donde hay tests: test que falla → implementación mínima → test verde → commit.
- Línea base antes de empezar: pgTAP 112 tests verdes, Vitest 141 verdes.

### Desviaciones del spec (decididas al planear)

1. **`payment_method` conserva `default 'transfer'`.** Así no hay que reescribir cada insert de los tests existentes; `create_order` lo pasa siempre explícito. (El spec ya se actualizó.)
2. **`gen_order_number()` recibe `set search_path = public, extensions`.** `create_order` corre con `search_path = ''`, dispara ese trigger y `gen_random_bytes` (pgcrypto, en el esquema `extensions`) no se resolvería.
3. **Notas del admin en el historial con `status = 'note'`,** no con el estado actual. Si se usara el estado actual, en /seguimiento `pending` se leería "Pedido creado". `historyLabel('note')` devuelve "Aviso de la tienda".
4. **`ProductDetailView.vue` pierde el cotizador por CP** (usaba `shipping.js`) y muestra las dos tarifas planas de `checkout_options()`. Sin esto no se puede borrar `shipping.js`.
5. **Helper interno `assert_admin()`** para no repetir la verificación en cada función. **Códigos de error extra:** `order_cancelled`, `tracking_required`, `invalid_tracking_url`, `note_required` y `note_too_long` (notas de más de 500 caracteres).
6. **También se revoca el UPDATE sobre `orders` a `anon`** (la RLS ya lo bloqueaba; esto es higiene).
7. **Contadores solo en las pestañas accionables** ("Por confirmar pago" y "Por enviar"), que son los mismos que usa el dashboard.
8. **Datos bancarios locales en `supabase/seed_payment_local.sql`** (idempotente y añadido a `sql_paths`), porque `seed.sql` solo corre con `db reset`.
9. **Pedido demo `AIGO-SEED0001`.** La migración le calcula `payment_due_at = created_at + 48 h`. Como se sembró hace días, el job lo cancelará al correr. Es el comportamiento correcto; `seed_orders.sql` queda con `payment_due_at` para futuros resets.

## Review Focus

1. **El cliente paga tarde:** la transferencia llega después de que el pedido venció y la admin intenta marcarlo como pagado. Lo esperable es un mensaje claro que explique que el pedido está cancelado y que el cliente debe volver a comprar o recibir un reembolso, no un error genérico. Lo cubren el pgTAP (`order_cancelled`) de la Task 3 y el test de `describeDbError` de la Task 7.
2. **Dos compradores por la última pieza.** El segundo debe recibir `insufficient_stock` con `available: 0`, y su bolsa debe ajustarse (la variante sale del carrito). Lo cubren el pgTAP de la Task 2 (segundo pedido sobre stock agotado) y el test de `setAvailableStock(…, 0)` de la Task 5.
3. **Teléfono escrito "33 1234-5678"** (con espacios y guión). Se acepta en ambos lados y se guarda como `3312345678`. Lo cubren la Task 2 (fixture) y la Task 4 (`validateCheckout` + `buildOrderPayload`).
4. **Un producto en la bolsa que la admin despublicó mientras tanto.** Debe devolver `unavailable`, sin cobrar ni apartar nada, y sacarlo del carrito. Lo cubren la Task 2 (producto inactivo) y la Task 5 (cart).
5. **Texto de búsqueda del admin con comas o paréntesis** (`"ana,(x)"`). No debe romper el filtro `or=` de PostgREST. Lo cubre `sanitizeSearch` en la Task 7.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `supabase/migrations/20260927120000_payment_method.sql` | Columnas de pago y settings, pg_cron, fix del trigger, revoke UPDATE, `track_order` v2 | 1 |
| `supabase/seed_payment_local.sql` + `supabase/config.toml` + `supabase/seed_orders.sql` | Datos bancarios de prueba; `payment_due_at` en el seed | 1 |
| `supabase/tests/09_payment_schema_test.sql` (nuevo), `05_rls_orders_test.sql`, `08_track_order_test.sql` | pgTAP del esquema y de los permisos | 1 |
| `supabase/migrations/20260927121000_create_order.sql` | `checkout_options`, `create_order`, tabla de intentos | 2 |
| `supabase/tests/10_create_order_test.sql` | pgTAP de las dos funciones | 2 |
| `supabase/migrations/20260927122000_admin_order_actions.sql` | `assert_admin`, `restock_and_cancel`, las 4 RPC de admin, `expire_unpaid_orders` + cron | 3 |
| `supabase/tests/11_admin_orders_test.sql` | pgTAP de las acciones y del vencimiento | 3 |
| `src/lib/validateCheckout.js` + `.test.js` | Validación del formulario (espejo del servidor) | 4 |
| `src/lib/checkout.js` + `.test.js` | RPC `checkout_options` y `create_order`, normalización, sessionStorage | 4 |
| `src/stores/cart.js` + `.test.js` | Sin shims; `setAvailableStock` | 5 |
| `src/views/user/CheckoutView.vue` | Checkout reescrito | 5 |
| `src/views/user/ProductDetailView.vue` | Tarifas planas en lugar del cotizador | 5 |
| `src/stores/shipping.js`, `src/stores/orders.js` | **Se borran** | 5 |
| `src/lib/trackOrder.js` + `.test.js`, `src/views/user/TrackingView.vue` | Recuadro de transferencia pendiente | 6 |
| `src/lib/orderLabels.js` + `.test.js` | Etiquetas, tiempo restante y acciones disponibles | 7 |
| `src/stores/adminOrders.js` + `.test.js` | Consultas y acciones del admin | 7 |
| `src/lib/dbError.js` + `.test.js` | Códigos `P0001` nuevos | 7 |
| `src/views/admin/OrdersView.vue`, `src/views/admin/DashboardView.vue` | Lista de pedidos y tarjetas del dashboard | 8 |
| `src/views/admin/OrderDetailView.vue`, `src/router/index.js` | Detalle y acciones | 9 |

---

### Task 1: Esquema de pago, permisos y `track_order` v2

**Files:**
- Create: `supabase/migrations/20260927120000_payment_method.sql`
- Create: `supabase/tests/09_payment_schema_test.sql`
- Create: `supabase/seed_payment_local.sql`
- Modify: `supabase/tests/05_rls_orders_test.sql` (el `lives_ok` del UPDATE del admin)
- Modify: `supabase/tests/08_track_order_test.sql` (lista de llaves + 1 test)
- Modify: `supabase/config.toml` (`sql_paths`)
- Modify: `supabase/seed_orders.sql` (columna `payment_due_at`)

**Interfaces:**
- Produces:
  - `orders.payment_method text not null default 'transfer'` (`transfer|card`) y `orders.payment_due_at timestamptz`.
  - `settings.bank_name`, `bank_account_holder`, `bank_clabe` (18 dígitos), `payment_contact_whatsapp`, `payment_contact_email`, `standard_days` (default `'5-8'`), `express_days` (default `'2-3'`) y `card_enabled` (default `false`).
  - `track_order` agrega a `order` las llaves `payment_method` y `payment_due_at`.
  - `authenticated` y `anon` ya no tienen UPDATE sobre `orders`.

- [ ] **Step 1: Escribir el test de esquema que falla**

Crear `supabase/tests/09_payment_schema_test.sql`:

```sql
begin;
select plan(14);

select has_column('public', 'orders', 'payment_method', 'orders tiene payment_method');
select has_column('public', 'orders', 'payment_due_at', 'orders tiene payment_due_at');

select throws_ok(
  $$ insert into public.orders (customer_name, customer_email, shipping_address, shipping_city,
       shipping_state, shipping_postal_code, shipping_cost_cents, subtotal_cents, total_cents, payment_method)
     values ('n','a@b.com','d','c','e','01000',0,0,0,'cash') $$,
  '23514', null,
  'payment_method solo acepta transfer o card'
);

select has_column('public', 'settings', 'bank_clabe', 'settings tiene bank_clabe');
select has_column('public', 'settings', 'standard_days', 'settings tiene standard_days');
select has_column('public', 'settings', 'express_days', 'settings tiene express_days');
select has_column('public', 'settings', 'card_enabled', 'settings tiene card_enabled');
select col_default_is('public', 'settings', 'card_enabled', 'false', 'card_enabled arranca en false');

-- settings es fila unica: se vacia dentro de la transaccion para poder insertar.
delete from public.settings;
select throws_ok(
  $$ insert into public.settings (bank_clabe) values ('123') $$,
  '23514', null,
  'la CLABE debe tener exactamente 18 digitos'
);

select ok(
  exists(select 1 from pg_extension where extname = 'pg_cron'),
  'pg_cron esta instalado'
);

-- create_order corre con search_path vacio y dispara gen_order_number.
select lives_ok(
  $$ do $d$
     declare v_old text := current_setting('search_path');
     begin
       perform set_config('search_path', '', true);
       insert into public.orders (customer_name, customer_email, shipping_address, shipping_city,
         shipping_state, shipping_postal_code, shipping_cost_cents, subtotal_cents, total_cents)
       values ('n','sp@b.com','d','c','e','01000',0,0,0);
       perform set_config('search_path', v_old, true);
     end $d$ $$,
  'el numero de pedido se genera aunque el search_path este vacio'
);

select ok(
  not has_table_privilege('authenticated', 'public.orders', 'update'),
  'authenticated ya no tiene UPDATE de tabla sobre orders'
);

select ok(
  not has_column_privilege('authenticated', 'public.orders', 'tracking_number', 'update'),
  'authenticated ya no tiene UPDATE de columna (tracking_number) sobre orders'
);

select ok(
  not has_table_privilege('anon', 'public.orders', 'update'),
  'anon no tiene UPDATE sobre orders'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Ajustar los tests existentes**

En `supabase/tests/05_rls_orders_test.sql`, reemplazar el bloque:

```sql
select lives_ok(
  $$ update public.orders set fulfillment_status = 'shipped' where id = 'b1111111-1111-1111-1111-111111111111' $$,
  'admin puede actualizar campos de envio/estado de un pedido'
);

-- scope de columnas: el admin NO puede tocar el estado de pago ni los montos
-- (eso es del webhook via service_role). El grant de columna lo deniega con 42501.
```

por:

```sql
-- Desde la Fase 2c-1 el admin no escribe en orders directo: todo pasa por las
-- funciones admin_* (que devuelven stock, validan transiciones, etc.).
select throws_ok(
  $$ update public.orders set fulfillment_status = 'shipped' where id = 'b1111111-1111-1111-1111-111111111111' $$,
  '42501', null,
  'admin ya no puede actualizar pedidos directamente (solo por RPC)'
);

-- Tampoco el estado de pago ni los montos.
```

(El `plan(23)` no cambia.)

En `supabase/tests/08_track_order_test.sql`:
- Cambiar `select plan(24);` por `select plan(25);`.
- En la lista cerrada de llaves, cambiar el arreglo por:

```sql
  array['created_at', 'fulfillment_status', 'history', 'items', 'order_number', 'payment_due_at',
        'payment_method', 'payment_status', 'shipping_carrier', 'shipping_city', 'shipping_cost_cents',
        'shipping_service', 'shipping_state', 'subtotal_cents', 'total_cents', 'tracking_number',
        'tracking_url'],
```

- Justo después de ese `select is(...)` (el de "el pedido expone solo la lista cerrada de llaves"), agregar:

```sql
select is(
  public.track_order('AIGO-TT000002', 'beto@test.com') -> 'order' ->> 'payment_method', 'transfer',
  'track_order devuelve el metodo de pago'
);
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `supabase test db`
Expected: FAIL en `09_payment_schema_test.sql` (no existen las columnas), en `05` (el UPDATE todavía funciona) y en `08` (llaves).

- [ ] **Step 4: Escribir la migración**

Crear `supabase/migrations/20260927120000_payment_method.sql`:

```sql
-- Fase 2c-1: metodo de pago, plazo de transferencia, datos bancarios y cierre de
-- las escrituras directas del admin sobre orders.

create extension if not exists pg_cron;

alter table public.orders
  add column payment_method text not null default 'transfer'
    check (payment_method in ('transfer', 'card')),
  add column payment_due_at timestamptz;

-- Transferencias pendientes que ya existian: mismo plazo que las nuevas.
update public.orders
   set payment_due_at = created_at + interval '48 hours'
 where payment_method = 'transfer'
   and payment_status = 'pending'
   and fulfillment_status <> 'cancelled';

-- Para el job de vencimiento.
create index orders_unpaid_due_idx on public.orders (payment_due_at)
  where payment_status = 'pending' and fulfillment_status <> 'cancelled';

alter table public.settings
  add column bank_name                text,
  add column bank_account_holder      text,
  add column bank_clabe               text check (bank_clabe ~ '^[0-9]{18}$'),
  add column payment_contact_whatsapp text,
  add column payment_contact_email    text,
  add column standard_days            text not null default '5-8',
  add column express_days             text not null default '2-3',
  add column card_enabled             boolean not null default false;

-- create_order (search_path vacio) dispara este trigger; gen_random_bytes vive
-- en el esquema extensions.
alter function public.gen_order_number() set search_path = public, extensions;

-- Todas las escrituras del admin sobre pedidos pasan por funciones admin_*:
-- asi nadie cancela sin devolver stock ni envia un pedido sin pagar. Revocar el
-- privilegio de tabla tambien revoca los grants por columna de la Fase 1.
revoke update on public.orders from anon, authenticated;

-- track_order v2: agrega payment_method y payment_due_at.
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
      'payment_method',      v_order.payment_method,
      'payment_status',      v_order.payment_status,
      'payment_due_at',      v_order.payment_due_at,
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
```

(`create or replace` conserva los grants de `track_order`.)

- [ ] **Step 5: Aplicar la migración y correr los tests**

Run: `supabase migration up`
Run: `supabase test db`
Expected: PASS. Todos los archivos en verde; total de pgTAP = 112 + 14 + 1 = 127.

- [ ] **Step 6: Seeds locales**

Crear `supabase/seed_payment_local.sql`:

```sql
-- ============================================================
-- DATOS BANCARIOS FICTICIOS — SOLO STACK LOCAL.
-- `supabase db push` NO ejecuta seeds. La clienta pone los reales en la nube.
-- Idempotente.
-- ============================================================

update public.settings set
  bank_name                = 'Banco de Prueba',
  bank_account_holder      = 'AIGO Store (PRUEBA)',
  bank_clabe               = '000000000000000000',
  payment_contact_whatsapp = '3300000000',
  payment_contact_email    = 'pagos@aigo.local';
```

En `supabase/config.toml`, cambiar la línea de `sql_paths` por:

```toml
sql_paths = ["./seed.sql", "./seed_payment_local.sql", "./seed_orders.sql", "./seed_catalog_local.sql"]
```

En `supabase/seed_orders.sql`:
- Agregar `payment_due_at` a la lista de columnas, después de `tracking_url`.
- En los valores, `now() + interval '47 hours'` para `AIGO-SEED0001` y `null` para `SEED0002` y `SEED0003`. Esto va inmediatamente antes del `created_at` de cada fila.

Aplicar el seed de pago:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/seed_payment_local.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc "select bank_clabe, standard_days, card_enabled from public.settings"
```
Expected: `000000000000000000|5-8|f`

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260927120000_payment_method.sql supabase/tests/09_payment_schema_test.sql \
  supabase/tests/05_rls_orders_test.sql supabase/tests/08_track_order_test.sql \
  supabase/seed_payment_local.sql supabase/seed_orders.sql supabase/config.toml
git commit -m "feat(db): metodo de pago, plazo de transferencia y datos bancarios en settings"
```

---

### Task 2: `checkout_options` y `create_order`

**Files:**
- Create: `supabase/migrations/20260927121000_create_order.sql`
- Create: `supabase/tests/10_create_order_test.sql`

**Interfaces:**
- Consumes: columnas de la Task 1.
- Produces:
  - `public.checkout_options() returns jsonb`. Llaves: `shipping` (arreglo de `{code, label, cost_cents, days}`), `bank` (`{name, holder, clabe}`), `contact` (`{whatsapp, email}`), `card_enabled` y `transfer_hours`.
  - `public.create_order(p_items jsonb, p_customer jsonb, p_shipping text, p_payment_method text) returns jsonb`, con las respuestas de Global Constraints.
  - `p_customer`: `{name, email, phone, address, city, state, postal_code}`.

- [ ] **Step 1: Escribir el test que falla**

Crear `supabase/tests/10_create_order_test.sql`:

```sql
begin;
select plan(33);

-- ===== fixtures (como postgres) =====
delete from public.create_order_attempts;
delete from public.orders;  -- hermetico frente a seed_orders.sql

update public.settings set
  fallback_standard_cents = 9900, fallback_express_cents = 17900,
  standard_days = '5-8', express_days = '2-3', card_enabled = false,
  bank_name = 'Banco Test', bank_account_holder = 'AIGO Test', bank_clabe = '012345678901234567',
  payment_contact_whatsapp = '3300000000', payment_contact_email = 'pagos@aigo.local',
  origin_address = '{"street":"Secreta 1"}';

insert into public.products (id, name, "group", category, is_active) values
  ('e1111111-1111-1111-1111-111111111111', 'TEST CO Album',  'BTS', 'Albums', true),
  ('e2222222-2222-2222-2222-222222222222', 'TEST CO Oculto', 'BTS', 'Albums', false);

insert into public.product_variants (id, product_id, label, price_cents, stock, weight_grams, is_active) values
  ('f1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'Único',    85000, 3, 300, true),
  ('f2222222-2222-2222-2222-222222222222', 'e1111111-1111-1111-1111-111111111111', 'Ver. B',   50000, 1, 300, true),
  ('f3333333-3333-3333-3333-333333333333', 'e1111111-1111-1111-1111-111111111111', 'Inactiva',  1000, 5, 300, false),
  ('f4444444-4444-4444-4444-444444444444', 'e2222222-2222-2222-2222-222222222222', 'Único',     1000, 5, 300, true);

-- Cliente valido; el telefono trae espacios y guion a proposito.
create function pg_temp.cust() returns jsonb language sql as $$
  select '{"name":" Ana Pérez ","email":"Ana@Test.com","phone":"33 1234-5678","address":"Av. Siempre Viva 742",
           "city":"Guadalajara","state":"Jalisco","postal_code":"44100"}'::jsonb
$$;

-- Llama a create_order desde una IP nueva cada vez (para no chocar con el rate-limit).
create function pg_temp.co(p_items jsonb, p_customer jsonb default null,
                           p_shipping text default 'standard', p_method text default 'transfer')
returns jsonb language plpgsql as $$
begin
  perform set_config('request.headers',
    jsonb_build_object('x-forwarded-for', 'ip-' || gen_random_uuid())::text, true);
  return public.create_order(p_items, coalesce(p_customer, pg_temp.cust()), p_shipping, p_method);
end $$;

-- 1-2
select has_function('public', 'create_order', array['jsonb', 'jsonb', 'text', 'text'], 'existe create_order');
select has_function('public', 'checkout_options', array[]::text[], 'existe checkout_options');

-- ===== checkout_options como anon =====
set local role anon;

-- 3
select is(
  (select array_agg(k order by k collate "C") from jsonb_object_keys(public.checkout_options()) k),
  array['bank', 'card_enabled', 'contact', 'shipping', 'transfer_hours'],
  'checkout_options expone solo la lista cerrada de llaves (nunca origin_address)'
);
-- 4
select is(
  public.checkout_options() -> 'shipping',
  '[{"code":"standard","label":"Estándar","cost_cents":9900,"days":"5-8"},
    {"code":"express","label":"Exprés","cost_cents":17900,"days":"2-3"}]'::jsonb,
  'checkout_options devuelve las dos tarifas planas'
);
-- 5
select is(
  public.checkout_options() -> 'bank',
  '{"name":"Banco Test","holder":"AIGO Test","clabe":"012345678901234567"}'::jsonb,
  'checkout_options devuelve los datos bancarios'
);

-- ===== camino feliz, como anon (el precio que manda el cliente se ignora) =====
do $$
begin
  perform set_config('request.headers', '{"x-forwarded-for":"10.7.0.1"}', true);
  perform set_config('test.ok', public.create_order(
    '[{"variant_id":"f1111111-1111-1111-1111-111111111111","quantity":2,"unit_price_cents":1},
      {"variant_id":"f2222222-2222-2222-2222-222222222222","quantity":1}]'::jsonb,
    pg_temp.cust(), 'express', 'transfer')::text, true);
end $$;

reset role;

-- 6-9
select is(current_setting('test.ok')::jsonb ->> 'status', 'ok', 'el pedido se crea');
select is(current_setting('test.ok')::jsonb ->> 'subtotal_cents', '220000', 'subtotal con precios de la BD');
select is(current_setting('test.ok')::jsonb ->> 'shipping_cost_cents', '17900', 'envio expres desde settings');
select is(current_setting('test.ok')::jsonb ->> 'total_cents', '237900', 'total = subtotal + envio');

-- 10
select results_eq(
  $$ select stock from public.product_variants
      where id in ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222') order by id $$,
  $$ values (1), (0) $$,
  'el stock queda apartado'
);
-- 11
select results_eq(
  $$ select product_name, variant_label, unit_price_cents, quantity, line_total_cents
       from public.order_items i join public.orders o on o.id = i.order_id
      where o.order_number = current_setting('test.ok')::jsonb ->> 'order_number'
      order by line_total_cents $$,
  $$ values ('TEST CO Album'::text, 'Ver. B'::text, 50000, 1, 50000),
            ('TEST CO Album'::text, 'Único'::text, 85000, 2, 170000) $$,
  'order_items guarda el snapshot'
);
-- 12
select results_eq(
  $$ select customer_name, customer_email::text, customer_phone, payment_method, payment_status,
            fulfillment_status, shipping_service, shipping_service_code
       from public.orders where order_number = current_setting('test.ok')::jsonb ->> 'order_number' $$,
  $$ values ('Ana Pérez'::text, 'ana@test.com'::text, '3312345678'::text, 'transfer'::text, 'pending'::text,
             'pending'::text, 'Exprés'::text, 'express'::text) $$,
  'el pedido guarda datos normalizados, transferencia pendiente'
);
-- 13
select is(
  (select payment_due_at from public.orders where order_number = current_setting('test.ok')::jsonb ->> 'order_number'),
  now() + interval '48 hours',
  'la transferencia vence en 48 h'
);
-- 14
select results_eq(
  $$ select h.status, h.note from public.order_status_history h join public.orders o on o.id = h.order_id
      where o.order_number = current_setting('test.ok')::jsonb ->> 'order_number' $$,
  $$ values ('pending'::text, 'Pedido creado'::text) $$,
  'se registra el historial'
);

-- ===== rechazos (no escriben nada) =====
-- 15: la ultima pieza ya se aparto
select is(
  pg_temp.co('[{"variant_id":"f2222222-2222-2222-2222-222222222222","quantity":1}]'),
  '{"status":"insufficient_stock","items":[{"variant_id":"f2222222-2222-2222-2222-222222222222","available":0}]}'::jsonb,
  'segundo comprador de la ultima pieza -> insufficient_stock'
);
-- 16
select is(
  pg_temp.co('[{"variant_id":"f3333333-3333-3333-3333-333333333333","quantity":1},
               {"variant_id":"f4444444-4444-4444-4444-444444444444","quantity":1},
               {"variant_id":"f9999999-9999-9999-9999-999999999999","quantity":1}]'),
  '{"status":"unavailable","variant_ids":["f3333333-3333-3333-3333-333333333333",
    "f4444444-4444-4444-4444-444444444444","f9999999-9999-9999-9999-999999999999"]}'::jsonb,
  'variante inactiva, producto despublicado o inexistente -> unavailable'
);
-- 17-21: carrito invalido
select is(pg_temp.co('[]'), '{"status":"invalid","field":"items"}'::jsonb, 'carrito vacio -> invalid items');
select is(
  pg_temp.co('[{"variant_id":"f1111111-1111-1111-1111-111111111111","quantity":1},
               {"variant_id":"F1111111-1111-1111-1111-111111111111","quantity":1}]'),
  '{"status":"invalid","field":"items"}'::jsonb, 'variante repetida -> invalid items');
select is(
  pg_temp.co('[{"variant_id":"f1111111-1111-1111-1111-111111111111","quantity":0}]'),
  '{"status":"invalid","field":"items"}'::jsonb, 'cantidad 0 -> invalid items');
select is(
  pg_temp.co('[{"variant_id":"f1111111-1111-1111-1111-111111111111","quantity":1.5}]'),
  '{"status":"invalid","field":"items"}'::jsonb, 'cantidad no entera -> invalid items');
select is(
  pg_temp.co('[{"variant_id":"no-es-uuid","quantity":1}]'),
  '{"status":"invalid","field":"items"}'::jsonb, 'variant_id que no es uuid -> invalid items');
-- 22-25: cliente invalido
select is(
  pg_temp.co('[{"variant_id":"f1111111-1111-1111-1111-111111111111","quantity":1}]', pg_temp.cust() || '{"phone":"12345"}'),
  '{"status":"invalid","field":"phone"}'::jsonb, 'telefono corto -> invalid phone');
select is(
  pg_temp.co('[{"variant_id":"f1111111-1111-1111-1111-111111111111","quantity":1}]', pg_temp.cust() || '{"postal_code":"abcde"}'),
  '{"status":"invalid","field":"postal_code"}'::jsonb, 'CP no numerico -> invalid postal_code');
select is(
  pg_temp.co('[{"variant_id":"f1111111-1111-1111-1111-111111111111","quantity":1}]', pg_temp.cust() || '{"email":"no-es-correo"}'),
  '{"status":"invalid","field":"email"}'::jsonb, 'correo sin arroba -> invalid email');
select is(
  pg_temp.co('[{"variant_id":"f1111111-1111-1111-1111-111111111111","quantity":1}]', pg_temp.cust() || '{"name":"   "}'),
  '{"status":"invalid","field":"name"}'::jsonb, 'nombre en blanco -> invalid name');
-- 26-28: envio y metodo de pago
select is(
  pg_temp.co('[{"variant_id":"f1111111-1111-1111-1111-111111111111","quantity":1}]', null, 'teleport'),
  '{"status":"invalid","field":"shipping"}'::jsonb, 'envio desconocido -> invalid shipping');
select is(
  pg_temp.co('[{"variant_id":"f1111111-1111-1111-1111-111111111111","quantity":1}]', null, 'standard', 'card'),
  '{"status":"payment_method_unavailable"}'::jsonb, 'tarjeta sin Stripe -> payment_method_unavailable');
select is(
  pg_temp.co('[{"variant_id":"f1111111-1111-1111-1111-111111111111","quantity":1}]', null, 'standard', 'cash'),
  '{"status":"invalid","field":"payment_method"}'::jsonb, 'metodo desconocido -> invalid payment_method');
-- 29
select is(
  (select count(*) from public.orders), 1::bigint,
  'ningun rechazo creo pedidos'
);

-- ===== rate-limit: 5 llamadas por IP en 15 min =====
set local role anon;
do $$
begin
  perform set_config('request.headers', '{"x-forwarded-for":"10.8.0.1, 172.16.0.1"}', true);
  for i in 1..5 loop
    perform public.create_order('[]'::jsonb, '{}'::jsonb, 'standard', 'transfer');
  end loop;
end $$;
-- 30
select is(
  public.create_order('[]'::jsonb, '{}'::jsonb, 'standard', 'transfer'), '{"status":"rate_limited"}'::jsonb,
  'la sexta llamada desde la misma IP queda bloqueada'
);
reset role;
-- 31
select is(
  (select count(*) from public.create_order_attempts where ip = '10.8.0.1'), 5::bigint,
  'cuenta la primera IP de x-forwarded-for y la llamada bloqueada no suma'
);

-- ===== permisos =====
set local role anon;
-- 32
select throws_ok(
  $$ select * from public.create_order_attempts $$,
  '42501', null,
  'anon no puede leer los intentos'
);
-- 33
select throws_ok(
  $$ insert into public.orders (customer_name, customer_email, shipping_address, shipping_city,
       shipping_state, shipping_postal_code, shipping_cost_cents, subtotal_cents, total_cents)
     values ('n','a@b.com','d','c','e','01000',0,0,0) $$,
  '42501', null,
  'anon sigue sin poder insertar pedidos directo'
);
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `supabase test db`
Expected: FAIL en `10_create_order_test.sql` (no existe `create_order_attempts`).

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/20260927121000_create_order.sql`:

```sql
-- Fase 2c-1: la unica puerta publica para crear pedidos. Precios, stock y envio
-- salen de la BD; del cliente solo se usan variant_id, cantidad y sus datos.

create table public.create_order_attempts (
  id         bigint generated always as identity primary key,
  ip         text not null,
  created_at timestamptz not null default now()
);

create index on public.create_order_attempts (ip, created_at);
create index on public.create_order_attempts (created_at);

-- Cerrada: solo la funcion (duena postgres) la lee y la escribe.
alter table public.create_order_attempts enable row level security;
revoke all on public.create_order_attempts from anon, authenticated;

create or replace function public.checkout_options()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'shipping', jsonb_build_array(
      jsonb_build_object('code', 'standard', 'label', 'Estándar',
                         'cost_cents', s.fallback_standard_cents, 'days', s.standard_days),
      jsonb_build_object('code', 'express', 'label', 'Exprés',
                         'cost_cents', s.fallback_express_cents, 'days', s.express_days)
    ),
    'bank', jsonb_build_object('name', s.bank_name, 'holder', s.bank_account_holder, 'clabe', s.bank_clabe),
    'contact', jsonb_build_object('whatsapp', s.payment_contact_whatsapp, 'email', s.payment_contact_email),
    'card_enabled', s.card_enabled,
    'transfer_hours', 48
  )
  from public.settings s;
$$;

revoke execute on function public.checkout_options() from public, anon, authenticated;
grant execute on function public.checkout_options() to anon, authenticated;

create or replace function public.create_order(
  p_items jsonb, p_customer jsonb, p_shipping text, p_payment_method text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_headers  jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_ip       text;
  v_name     text := trim(coalesce(p_customer ->> 'name', ''));
  v_email    text := lower(trim(coalesce(p_customer ->> 'email', '')));
  v_phone    text := regexp_replace(coalesce(p_customer ->> 'phone', ''), '[[:space:]-]', '', 'g');
  v_address  text := trim(coalesce(p_customer ->> 'address', ''));
  v_city     text := trim(coalesce(p_customer ->> 'city', ''));
  v_state    text := trim(coalesce(p_customer ->> 'state', ''));
  v_postal   text := trim(coalesce(p_customer ->> 'postal_code', ''));
  v_settings public.settings%rowtype;
  v_bad      jsonb;
  v_short    jsonb;
  v_subtotal integer;
  v_shipping integer;
  v_order    public.orders%rowtype;
begin
  -- ----- rate-limit: cada llamada no bloqueada cuenta -----
  v_ip := coalesce(nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');
  delete from public.create_order_attempts where created_at < now() - interval '1 day';
  if (select count(*) from public.create_order_attempts
       where ip = v_ip and created_at > now() - interval '15 minutes') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.create_order_attempts (ip) values (v_ip);

  -- ----- validacion del carrito (sin castear nada que no se haya validado) -----
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 50
     or exists (
       select 1 from jsonb_array_elements(p_items) e
        where jsonb_typeof(e) is distinct from 'object'
           or coalesce(e ->> 'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or jsonb_typeof(e -> 'quantity') is distinct from 'number'
           or (e ->> 'quantity') !~ '^[1-9][0-9]?$')
     or (select count(distinct lower(e ->> 'variant_id')) from jsonb_array_elements(p_items) e)
        <> jsonb_array_length(p_items) then
    return jsonb_build_object('status', 'invalid', 'field', 'items');
  end if;

  -- ----- validacion del cliente, envio y metodo -----
  if v_name = '' or length(v_name) > 120 then
    return jsonb_build_object('status', 'invalid', 'field', 'name');
  end if;
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('status', 'invalid', 'field', 'email');
  end if;
  if v_phone !~ '^[0-9]{10}$' then
    return jsonb_build_object('status', 'invalid', 'field', 'phone');
  end if;
  if v_address = '' or length(v_address) > 200 then
    return jsonb_build_object('status', 'invalid', 'field', 'address');
  end if;
  if v_city = '' or length(v_city) > 80 then
    return jsonb_build_object('status', 'invalid', 'field', 'city');
  end if;
  if v_state = '' or length(v_state) > 80 then
    return jsonb_build_object('status', 'invalid', 'field', 'state');
  end if;
  if v_postal !~ '^[0-9]{5}$' then
    return jsonb_build_object('status', 'invalid', 'field', 'postal_code');
  end if;
  if p_shipping is null or p_shipping not in ('standard', 'express') then
    return jsonb_build_object('status', 'invalid', 'field', 'shipping');
  end if;
  if p_payment_method is null or p_payment_method not in ('transfer', 'card') then
    return jsonb_build_object('status', 'invalid', 'field', 'payment_method');
  end if;

  select * into v_settings from public.settings limit 1;
  if v_settings.id is null then
    raise exception 'settings_missing';
  end if;
  if p_payment_method = 'card' and not v_settings.card_enabled then
    return jsonb_build_object('status', 'payment_method_unavailable');
  end if;

  -- ----- stock: bloqueo en orden fijo (por id) para no provocar deadlocks -----
  perform 1 from public.product_variants v
   where v.id in (select r.variant_id from jsonb_to_recordset(p_items) as r(variant_id uuid, quantity int))
   order by v.id
   for update;

  select coalesce(jsonb_agg(r.variant_id order by r.variant_id), '[]'::jsonb) into v_bad
    from jsonb_to_recordset(p_items) as r(variant_id uuid, quantity int)
    left join public.product_variants v on v.id = r.variant_id
    left join public.products p on p.id = v.product_id
   where v.id is null or not v.is_active or not p.is_active;
  if jsonb_array_length(v_bad) > 0 then
    return jsonb_build_object('status', 'unavailable', 'variant_ids', v_bad);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('variant_id', r.variant_id, 'available', v.stock)
                            order by r.variant_id), '[]'::jsonb) into v_short
    from jsonb_to_recordset(p_items) as r(variant_id uuid, quantity int)
    join public.product_variants v on v.id = r.variant_id
   where v.stock < r.quantity;
  if jsonb_array_length(v_short) > 0 then
    return jsonb_build_object('status', 'insufficient_stock', 'items', v_short);
  end if;

  -- ----- montos -----
  select sum(v.price_cents * r.quantity)::integer into v_subtotal
    from jsonb_to_recordset(p_items) as r(variant_id uuid, quantity int)
    join public.product_variants v on v.id = r.variant_id;

  v_shipping := case p_shipping when 'standard' then v_settings.fallback_standard_cents
                                else v_settings.fallback_express_cents end;

  -- ----- escrituras -----
  insert into public.orders (customer_name, customer_email, customer_phone, shipping_address,
    shipping_city, shipping_state, shipping_postal_code, shipping_service, shipping_service_code,
    shipping_cost_cents, subtotal_cents, total_cents, payment_method, payment_due_at)
  values (v_name, v_email, v_phone, v_address, v_city, v_state, v_postal,
    case p_shipping when 'standard' then 'Estándar' else 'Exprés' end, p_shipping,
    v_shipping, v_subtotal, v_subtotal + v_shipping, p_payment_method,
    case when p_payment_method = 'transfer' then now() + interval '48 hours' end)
  returning * into v_order;

  insert into public.order_items (order_id, variant_id, product_name, variant_label,
    unit_price_cents, quantity, line_total_cents)
  select v_order.id, v.id, p.name, v.label, v.price_cents, r.quantity, v.price_cents * r.quantity
    from jsonb_to_recordset(p_items) as r(variant_id uuid, quantity int)
    join public.product_variants v on v.id = r.variant_id
    join public.products p on p.id = v.product_id;

  update public.product_variants v
     set stock = v.stock - r.quantity
    from jsonb_to_recordset(p_items) as r(variant_id uuid, quantity int)
   where v.id = r.variant_id;

  insert into public.order_status_history (order_id, status, note)
  values (v_order.id, 'pending', 'Pedido creado');

  return jsonb_build_object(
    'status', 'ok',
    'order_number', v_order.order_number,
    'subtotal_cents', v_order.subtotal_cents,
    'shipping_cost_cents', v_order.shipping_cost_cents,
    'total_cents', v_order.total_cents,
    'payment_due_at', v_order.payment_due_at
  );
end;
$$;

revoke execute on function public.create_order(jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_order(jsonb, jsonb, text, text) to anon, authenticated;
```

- [ ] **Step 4: Aplicar y correr**

Run: `supabase migration up`
Run: `supabase test db`
Expected: PASS. Total pgTAP = 127 + 33 = 160.

Si un test falla por algo del test mismo (p. ej., el orden de `results_eq`), corrige el test solo si la función cumple lo que dice Global Constraints. No relajes la función para que pase.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260927121000_create_order.sql supabase/tests/10_create_order_test.sql
git commit -m "feat(db): create_order y checkout_options con stock apartado y rate-limit"
```

---

### Task 3: Acciones del admin y vencimiento automático

**Files:**
- Create: `supabase/migrations/20260927122000_admin_order_actions.sql`
- Create: `supabase/tests/11_admin_orders_test.sql`

**Interfaces:**
- Consumes: columnas de la Task 1; `public.is_admin(uuid)`.
- Produces (RPC para `authenticated`):
  - `admin_mark_paid(p_order_id uuid) returns void`
  - `admin_cancel_order(p_order_id uuid, p_note text) returns void`
  - `admin_update_fulfillment(p_order_id uuid, p_status text, p_carrier text default null, p_tracking_number text default null, p_tracking_url text default null, p_note text default null) returns void`
  - `admin_add_order_note(p_order_id uuid, p_note text) returns void`
- Internas: `assert_admin()`, `restock_and_cancel(uuid, text)`, `expire_unpaid_orders() returns integer` y el job de cron `expire-unpaid-orders`.

- [ ] **Step 1: Escribir el test que falla**

Crear `supabase/tests/11_admin_orders_test.sql`:

```sql
begin;
select plan(42);

-- ===== fixtures (como postgres) =====
delete from public.orders;  -- hermetico: expire_unpaid_orders recorre toda la tabla

insert into auth.users (id, email) values
  ('ad111111-1111-1111-1111-111111111111', 'admin-ops@test.com'),
  ('ad222222-2222-2222-2222-222222222222', 'user-ops@test.com');
insert into public.profiles (id, is_admin) values
  ('ad111111-1111-1111-1111-111111111111', true),
  ('ad222222-2222-2222-2222-222222222222', false);

insert into public.products (id, name, "group", category) values
  ('e3333333-3333-3333-3333-333333333333', 'TEST OPS', 'BTS', 'Albums');
insert into public.product_variants (id, product_id, label, price_cents, stock, weight_grams) values
  ('f5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', 'Único', 1000, 10, 300);

insert into public.orders (id, order_number, customer_name, customer_email, shipping_address, shipping_city,
  shipping_state, shipping_postal_code, shipping_cost_cents, subtotal_cents, total_cents,
  payment_method, payment_status, fulfillment_status, payment_due_at)
values
  ('00000000-0000-0000-0000-0000000000a1','AIGO-OPS1','n','a@b.com','d','c','e','01000',0,2000,2000,'transfer','pending','pending', now() + interval '1 day'),
  ('00000000-0000-0000-0000-0000000000a2','AIGO-OPS2','n','a@b.com','d','c','e','01000',0,0,0,'card','pending','pending', null),
  ('00000000-0000-0000-0000-0000000000a3','AIGO-OPS3','n','a@b.com','d','c','e','01000',0,3000,3000,'transfer','pending','pending', now() + interval '1 day'),
  ('00000000-0000-0000-0000-0000000000a4','AIGO-OPS4','n','a@b.com','d','c','e','01000',0,0,0,'transfer','paid','shipped', null),
  ('00000000-0000-0000-0000-0000000000a5','AIGO-OPS5','n','a@b.com','d','c','e','01000',0,0,0,'transfer','paid','pending', null),
  ('00000000-0000-0000-0000-0000000000a6','AIGO-OPS6','n','a@b.com','d','c','e','01000',0,1000,1000,'transfer','pending','pending', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000000a7','AIGO-OPS7','n','a@b.com','d','c','e','01000',0,0,0,'transfer','pending','pending', now() + interval '1 day'),
  ('00000000-0000-0000-0000-0000000000a8','AIGO-OPS8','n','a@b.com','d','c','e','01000',0,0,0,'transfer','paid','pending', now() - interval '1 hour');

-- o3 lleva ademas un renglon cuya variante ya se borro (variant_id null).
insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price_cents, quantity, line_total_cents)
values
  ('00000000-0000-0000-0000-0000000000a1','f5555555-5555-5555-5555-555555555555','TEST OPS','Único',1000,2,2000),
  ('00000000-0000-0000-0000-0000000000a3','f5555555-5555-5555-5555-555555555555','TEST OPS','Único',1000,3,3000),
  ('00000000-0000-0000-0000-0000000000a3',null,'Borrado','Único',500,1,500),
  ('00000000-0000-0000-0000-0000000000a6','f5555555-5555-5555-5555-555555555555','TEST OPS','Único',1000,1,1000);

-- ===== no admin =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"ad222222-2222-2222-2222-222222222222"}';

-- 1-4
select throws_ok($$ select public.admin_mark_paid('00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'un no admin no puede marcar pagado');
select throws_ok($$ select public.admin_cancel_order('00000000-0000-0000-0000-0000000000a3', 'x') $$,
  '42501', null, 'un no admin no puede cancelar');
select throws_ok($$ select public.admin_update_fulfillment('00000000-0000-0000-0000-0000000000a5', 'preparing') $$,
  '42501', null, 'un no admin no puede cambiar el envio');
select throws_ok($$ select public.admin_add_order_note('00000000-0000-0000-0000-0000000000a1', 'x') $$,
  '42501', null, 'un no admin no puede agregar notas');

-- ===== admin =====
set local request.jwt.claims to '{"sub":"ad111111-1111-1111-1111-111111111111"}';

-- 5-7: marcar pagado
select lives_ok($$ select public.admin_mark_paid('00000000-0000-0000-0000-0000000000a1') $$,
  'admin marca pagada una transferencia pendiente');
select results_eq($$ select payment_status from public.orders where id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('paid'::text) $$, 'el pedido queda pagado');
select results_eq(
  $$ select status, note from public.order_status_history where order_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('paid'::text, 'Pago por transferencia confirmado'::text) $$, 'se registra el pago en el historial');
-- 8-10
select throws_ok($$ select public.admin_mark_paid('00000000-0000-0000-0000-0000000000a1') $$,
  'P0001', 'already_paid', 'no se marca pagado dos veces');
select throws_ok($$ select public.admin_mark_paid('00000000-0000-0000-0000-0000000000a2') $$,
  'P0001', 'not_transfer', 'un pago con tarjeta no se confirma a mano');
select throws_ok($$ select public.admin_mark_paid('00000000-0000-0000-0000-0000000000ff') $$,
  'P0001', 'order_not_found', 'pedido inexistente');

-- 11-18: envio
select throws_ok($$ select public.admin_update_fulfillment('00000000-0000-0000-0000-0000000000a7', 'preparing') $$,
  'P0001', 'not_paid', 'no se prepara un pedido sin pagar');
select throws_ok($$ select public.admin_update_fulfillment('00000000-0000-0000-0000-0000000000a1', 'shipped', 'DHL', '123') $$,
  'P0001', 'invalid_transition', 'no se salta de pendiente a enviado');
select lives_ok($$ select public.admin_update_fulfillment('00000000-0000-0000-0000-0000000000a1', 'preparing') $$,
  'pendiente -> preparando');
select throws_ok($$ select public.admin_update_fulfillment('00000000-0000-0000-0000-0000000000a1', 'shipped') $$,
  'P0001', 'tracking_required', 'enviado exige paqueteria y guia');
select throws_ok(
  $$ select public.admin_update_fulfillment('00000000-0000-0000-0000-0000000000a1', 'shipped', 'DHL', '123', 'javascript:alert(1)') $$,
  'P0001', 'invalid_tracking_url', 'la URL de rastreo debe ser http(s)');
select lives_ok(
  $$ select public.admin_update_fulfillment('00000000-0000-0000-0000-0000000000a1', 'shipped', ' DHL ', '  123  ',
       'https://dhl.com/t/123', 'Salió hoy') $$,
  'preparando -> enviado con guia');
select results_eq(
  $$ select fulfillment_status, shipping_carrier, tracking_number, tracking_url
       from public.orders where id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('shipped'::text, 'DHL'::text, '123'::text, 'https://dhl.com/t/123'::text) $$,
  'se guardan paqueteria, guia y URL sin espacios');
select lives_ok($$ select public.admin_update_fulfillment('00000000-0000-0000-0000-0000000000a1', 'delivered') $$,
  'enviado -> entregado');

-- 19-26: cancelar
select throws_ok($$ select public.admin_cancel_order('00000000-0000-0000-0000-0000000000a3', '   ') $$,
  'P0001', 'note_required', 'cancelar exige motivo');
select lives_ok($$ select public.admin_cancel_order('00000000-0000-0000-0000-0000000000a3', 'Cliente se arrepintió') $$,
  'admin cancela una transferencia pendiente (con un renglon sin variante)');
select results_eq($$ select stock from public.product_variants where id = 'f5555555-5555-5555-5555-555555555555' $$,
  $$ values (13) $$, 'el stock apartado vuelve');
select results_eq(
  $$ select fulfillment_status, payment_status from public.orders where id = '00000000-0000-0000-0000-0000000000a3' $$,
  $$ values ('cancelled'::text, 'failed'::text) $$, 'sin pago: cancelado + failed');
select results_eq(
  $$ select note from public.order_status_history
      where order_id = '00000000-0000-0000-0000-0000000000a3' and status = 'cancelled' $$,
  $$ values ('Cliente se arrepintió'::text) $$, 'el motivo queda en el historial');
select lives_ok($$ select public.admin_cancel_order('00000000-0000-0000-0000-0000000000a3', 'otra vez') $$,
  'cancelar de nuevo no falla');
select results_eq($$ select stock from public.product_variants where id = 'f5555555-5555-5555-5555-555555555555' $$,
  $$ values (13) $$, 'cancelar dos veces no devuelve el stock dos veces');
select throws_ok($$ select public.admin_cancel_order('00000000-0000-0000-0000-0000000000a4', 'x') $$,
  'P0001', 'invalid_transition', 'no se cancela un pedido ya enviado');
-- 27-29
select lives_ok($$ select public.admin_cancel_order('00000000-0000-0000-0000-0000000000a5', 'Sin existencias reales') $$,
  'admin cancela un pedido pagado');
select results_eq(
  $$ select fulfillment_status, payment_status from public.orders where id = '00000000-0000-0000-0000-0000000000a5' $$,
  $$ values ('cancelled'::text, 'paid'::text) $$, 'pagado + cancelado = reembolso pendiente');
select throws_ok($$ select public.admin_mark_paid('00000000-0000-0000-0000-0000000000a3') $$,
  'P0001', 'order_cancelled', 'no se marca pagado un pedido cancelado (p. ej. vencido)');

-- 30-32: notas
select lives_ok($$ select public.admin_add_order_note('00000000-0000-0000-0000-0000000000a7', ' Te escribimos por WhatsApp ') $$,
  'admin agrega una nota');
select results_eq(
  $$ select note from public.order_status_history
      where order_id = '00000000-0000-0000-0000-0000000000a7' and status = 'note' $$,
  $$ values ('Te escribimos por WhatsApp'::text) $$, 'la nota se guarda con status note');
select throws_ok($$ select public.admin_add_order_note('00000000-0000-0000-0000-0000000000a7', repeat('x', 501)) $$,
  'P0001', 'note_too_long', 'notas de mas de 500 caracteres se rechazan');

reset role;

-- ===== vencimiento (como postgres, igual que el cron) =====
-- 33-37
select is(public.expire_unpaid_orders(), 1, 'vence solo la transferencia sin pagar con plazo vencido');
select results_eq(
  $$ select fulfillment_status, payment_status from public.orders where id = '00000000-0000-0000-0000-0000000000a6' $$,
  $$ values ('cancelled'::text, 'failed'::text) $$, 'el pedido vencido queda cancelado');
select results_eq(
  $$ select note from public.order_status_history
      where order_id = '00000000-0000-0000-0000-0000000000a6' and status = 'cancelled' $$,
  $$ values ('Cancelado por falta de pago'::text) $$, 'con la nota de falta de pago');
select results_eq($$ select stock from public.product_variants where id = 'f5555555-5555-5555-5555-555555555555' $$,
  $$ values (14) $$, 'y su stock vuelve');
select results_eq(
  $$ select id::text, fulfillment_status, payment_status from public.orders
      where id in ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a8') order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000000a7'::text, 'pending'::text, 'pending'::text),
            ('00000000-0000-0000-0000-0000000000a8'::text, 'pending'::text, 'paid'::text) $$,
  'no toca pedidos sin vencer ni pedidos pagados');

-- 38
select is(
  (select schedule from cron.job where jobname = 'expire-unpaid-orders'), '*/15 * * * *',
  'el job de vencimiento corre cada 15 minutos'
);

-- 39-42: permisos
select ok(not has_function_privilege('anon', 'public.admin_mark_paid(uuid)', 'execute'),
  'anon no ejecuta funciones de admin');
select ok(has_function_privilege('authenticated', 'public.admin_mark_paid(uuid)', 'execute'),
  'authenticated si (la funcion verifica is_admin por dentro)');
select ok(not has_function_privilege('authenticated', 'public.restock_and_cancel(uuid, text)', 'execute'),
  'nadie de la API ejecuta restock_and_cancel');
select ok(not has_function_privilege('authenticated', 'public.expire_unpaid_orders()', 'execute'),
  'nadie de la API ejecuta expire_unpaid_orders');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `supabase test db`
Expected: FAIL en `11_admin_orders_test.sql` (no existen las funciones).

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/20260927122000_admin_order_actions.sql`:

```sql
-- Fase 2c-1: acciones del admin sobre pedidos y vencimiento de transferencias.
-- Todas las escrituras sobre orders pasan por aqui (authenticated ya no tiene UPDATE).

create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.assert_admin() from public, anon, authenticated;

-- Devuelve el stock apartado y cancela. Idempotente. La usan admin_cancel_order
-- y expire_unpaid_orders.
create or replace function public.restock_and_cancel(p_order_id uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.fulfillment_status = 'cancelled' then
    return;
  end if;
  if v_order.fulfillment_status in ('shipped', 'delivered') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  -- Mismo orden de bloqueo que create_order (por id) para no provocar deadlocks.
  perform 1 from public.product_variants v
   where v.id in (select i.variant_id from public.order_items i
                   where i.order_id = p_order_id and i.variant_id is not null)
   order by v.id
   for update;

  update public.product_variants v
     set stock = v.stock + i.quantity
    from (select variant_id, sum(quantity)::integer as quantity
            from public.order_items
           where order_id = p_order_id and variant_id is not null
           group by variant_id) i
   where v.id = i.variant_id;

  update public.orders
     set fulfillment_status = 'cancelled',
         payment_status = case when payment_status = 'pending' then 'failed' else payment_status end
   where id = p_order_id;

  insert into public.order_status_history (order_id, status, note)
  values (p_order_id, 'cancelled', p_note);
end;
$$;

revoke execute on function public.restock_and_cancel(uuid, text) from public, anon, authenticated;

create or replace function public.admin_mark_paid(p_order_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  perform public.assert_admin();

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.fulfillment_status = 'cancelled' then
    raise exception 'order_cancelled' using errcode = 'P0001';
  end if;
  if v_order.payment_method <> 'transfer' then
    raise exception 'not_transfer' using errcode = 'P0001';
  end if;
  if v_order.payment_status <> 'pending' then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;

  update public.orders set payment_status = 'paid' where id = p_order_id;

  insert into public.order_status_history (order_id, status, note)
  values (p_order_id, 'paid', 'Pago por transferencia confirmado');
end;
$$;

create or replace function public.admin_cancel_order(p_order_id uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform public.assert_admin();
  if v_note is null then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if length(v_note) > 500 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  perform public.restock_and_cancel(p_order_id, v_note);
end;
$$;

create or replace function public.admin_update_fulfillment(
  p_order_id uuid, p_status text,
  p_carrier text default null, p_tracking_number text default null,
  p_tracking_url text default null, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order    public.orders%rowtype;
  v_carrier  text := nullif(trim(coalesce(p_carrier, '')), '');
  v_tracking text := nullif(trim(coalesce(p_tracking_number, '')), '');
  v_url      text := nullif(trim(coalesce(p_tracking_url, '')), '');
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform public.assert_admin();

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.payment_status <> 'paid' then
    raise exception 'not_paid' using errcode = 'P0001';
  end if;
  if not ((v_order.fulfillment_status = 'pending'   and p_status = 'preparing')
       or (v_order.fulfillment_status = 'preparing' and p_status = 'shipped')
       or (v_order.fulfillment_status = 'shipped'   and p_status = 'delivered')) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if p_status = 'shipped' and (v_carrier is null or v_tracking is null) then
    raise exception 'tracking_required' using errcode = 'P0001';
  end if;
  if v_url is not null and v_url !~* '^https?://' then
    raise exception 'invalid_tracking_url' using errcode = 'P0001';
  end if;
  if length(v_note) > 500 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;

  update public.orders
     set fulfillment_status = p_status,
         shipping_carrier = case when p_status = 'shipped' then v_carrier  else shipping_carrier end,
         tracking_number  = case when p_status = 'shipped' then v_tracking else tracking_number end,
         tracking_url     = case when p_status = 'shipped' then v_url      else tracking_url end
   where id = p_order_id;

  insert into public.order_status_history (order_id, status, note)
  values (p_order_id, p_status, v_note);
end;
$$;

-- Notas visibles para el cliente en /seguimiento (status 'note').
create or replace function public.admin_add_order_note(p_order_id uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform public.assert_admin();
  if v_note is null then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if length(v_note) > 500 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  insert into public.order_status_history (order_id, status, note)
  values (p_order_id, 'note', v_note);
end;
$$;

revoke execute on function public.admin_mark_paid(uuid) from public, anon, authenticated;
revoke execute on function public.admin_cancel_order(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_update_fulfillment(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_add_order_note(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_mark_paid(uuid) to authenticated;
grant execute on function public.admin_cancel_order(uuid, text) to authenticated;
grant execute on function public.admin_update_fulfillment(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_add_order_note(uuid, text) to authenticated;

-- Cancela las transferencias vencidas y devuelve su stock. La corre pg_cron.
create or replace function public.expire_unpaid_orders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.orders
     where payment_method = 'transfer'
       and payment_status = 'pending'
       and fulfillment_status <> 'cancelled'
       and payment_due_at < now()
     order by payment_due_at
     for update skip locked
  loop
    perform public.restock_and_cancel(v_id, 'Cancelado por falta de pago');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.expire_unpaid_orders() from public, anon, authenticated;

select cron.schedule('expire-unpaid-orders', '*/15 * * * *', 'select public.expire_unpaid_orders()');
```

- [ ] **Step 4: Aplicar y correr**

Run: `supabase migration up`
Run: `supabase test db`
Expected: PASS. Total pgTAP = 160 + 42 = 202.

Verificar el job:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc "select jobname, schedule, active from cron.job"
```
Expected: `expire-unpaid-orders|*/15 * * * *|t`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260927122000_admin_order_actions.sql supabase/tests/11_admin_orders_test.sql
git commit -m "feat(db): acciones del admin sobre pedidos y vencimiento automatico de transferencias"
```

---

### Task 4: `validateCheckout.js` y `checkout.js`

**Files:**
- Create: `src/lib/validateCheckout.js`, `src/lib/validateCheckout.test.js`
- Create: `src/lib/checkout.js`, `src/lib/checkout.test.js`

**Interfaces:**
- Consumes: RPC `checkout_options` y `create_order` (Task 2).
- Produces:
  - `normalizePhone(value) -> string`
  - `validateCheckout(form) -> { valid: boolean, errors: { [field]: string } }`, donde `form` es `{name, email, phone, address, city, state, postal_code}`.
  - `fetchCheckoutOptions() -> Promise<object|null>`
  - `buildOrderPayload({ items, customer, shipping, paymentMethod }) -> { p_items, p_customer, p_shipping, p_payment_method }`
  - `placeOrder(input) -> Promise<{ ok: true, order } | { ok: false, reason, detail? }>`. `reason` es `'insufficient_stock' | 'unavailable' | 'invalid' | 'rate_limited' | 'payment_method_unavailable' | 'error'`.
  - `CHECKOUT_MESSAGES`: un mensaje por `reason`.
  - `saveLastOrder(value)`, `loadLastOrder() -> object|null`, `clearLastOrder()`. Llave de sessionStorage: `aigo_last_order`.

- [ ] **Step 1: Tests que fallan de `validateCheckout`**

Crear `src/lib/validateCheckout.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { validateCheckout, normalizePhone } from './validateCheckout.js'

const OK = {
  name: 'Ana Pérez', email: 'ana@test.com', phone: '33 1234-5678',
  address: 'Av. Siempre Viva 742', city: 'Guadalajara', state: 'Jalisco', postal_code: '44100',
}

describe('normalizePhone', () => {
  it('quita espacios y guiones', () => {
    expect(normalizePhone(' 33 1234-5678 ')).toBe('3312345678')
  })
  it('tolera null', () => {
    expect(normalizePhone(null)).toBe('')
  })
})

describe('validateCheckout', () => {
  it('acepta un formulario valido (telefono con espacios y guion)', () => {
    expect(validateCheckout(OK)).toEqual({ valid: true, errors: {} })
  })

  it.each([
    ['name', '   '],
    ['name', 'x'.repeat(121)],
    ['email', 'no-es-correo'],
    ['email', 'a@b'],
    ['phone', '12345'],
    ['phone', '33123456789'],
    ['address', ''],
    ['city', ''],
    ['state', 'x'.repeat(81)],
    ['postal_code', 'abcde'],
    ['postal_code', '4410'],
  ])('rechaza %s = %j', (field, value) => {
    const result = validateCheckout({ ...OK, [field]: value })
    expect(result.valid).toBe(false)
    expect(Object.keys(result.errors)).toEqual([field])
    expect(result.errors[field]).toMatch(/\S/)
  })

  it('reporta todos los campos vacios a la vez', () => {
    const result = validateCheckout({})
    expect(Object.keys(result.errors).sort()).toEqual(
      ['address', 'city', 'email', 'name', 'phone', 'postal_code', 'state'],
    )
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/lib/validateCheckout.test.js`
Expected: FAIL ("Failed to resolve import ./validateCheckout.js").

- [ ] **Step 3: Implementar**

Crear `src/lib/validateCheckout.js`:

```js
// Espejo de las reglas de create_order (el servidor vuelve a validar todo).
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function normalizePhone(value) {
  return String(value ?? '').replace(/[\s-]/g, '')
}

function text(value) {
  return String(value ?? '').trim()
}

export function validateCheckout(form = {}) {
  const errors = {}
  const name = text(form.name)
  const email = text(form.email)
  const address = text(form.address)
  const city = text(form.city)
  const state = text(form.state)

  if (!name || name.length > 120) errors.name = 'Escribe tu nombre completo'
  if (!EMAIL.test(email) || email.length > 254) errors.email = 'Escribe un correo válido'
  if (!/^\d{10}$/.test(normalizePhone(form.phone))) errors.phone = 'El teléfono debe tener 10 dígitos'
  if (!address || address.length > 200) errors.address = 'Escribe calle y número'
  if (!city || city.length > 80) errors.city = 'Escribe tu ciudad'
  if (!state || state.length > 80) errors.state = 'Escribe tu estado'
  if (!/^\d{5}$/.test(text(form.postal_code))) errors.postal_code = 'El código postal tiene 5 dígitos'

  return { valid: Object.keys(errors).length === 0, errors }
}
```

- [ ] **Step 4: Correr**

Run: `npx vitest run src/lib/validateCheckout.test.js`
Expected: PASS.

- [ ] **Step 5: Tests que fallan de `checkout.js`**

Crear `src/lib/checkout.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase.js', () => ({ supabase: { rpc } }))

import {
  fetchCheckoutOptions, buildOrderPayload, placeOrder,
  saveLastOrder, loadLastOrder, clearLastOrder, CHECKOUT_MESSAGES,
} from './checkout.js'

const INPUT = {
  items: [
    { variant_id: 'v1', quantity: 2, unit_price_cents: 1, product_name: 'X', stock: 5 },
    { variant_id: 'v2', quantity: 1, unit_price_cents: 1, product_name: 'Y', stock: 5 },
  ],
  customer: {
    name: ' Ana ', email: ' ana@test.com ', phone: '33 1234-5678',
    address: ' Calle 1 ', city: ' GDL ', state: ' Jal ', postal_code: ' 44100 ',
  },
  shipping: 'express',
  paymentMethod: 'transfer',
}

beforeEach(() => {
  rpc.mockReset()
  sessionStorage.clear()
})

describe('buildOrderPayload', () => {
  it('manda solo variant_id + cantidad y datos normalizados', () => {
    expect(buildOrderPayload(INPUT)).toEqual({
      p_items: [{ variant_id: 'v1', quantity: 2 }, { variant_id: 'v2', quantity: 1 }],
      p_customer: {
        name: 'Ana', email: 'ana@test.com', phone: '3312345678',
        address: 'Calle 1', city: 'GDL', state: 'Jal', postal_code: '44100',
      },
      p_shipping: 'express',
      p_payment_method: 'transfer',
    })
  })
})

describe('placeOrder', () => {
  it('llama a create_order y devuelve el pedido', async () => {
    rpc.mockResolvedValue({
      data: { status: 'ok', order_number: 'AIGO-1', subtotal_cents: 100, shipping_cost_cents: 50,
              total_cents: 150, payment_due_at: '2026-09-29T00:00:00Z' },
      error: null,
    })
    const result = await placeOrder(INPUT)
    expect(rpc).toHaveBeenCalledWith('create_order', buildOrderPayload(INPUT))
    expect(result).toEqual({
      ok: true,
      order: { order_number: 'AIGO-1', subtotal_cents: 100, shipping_cost_cents: 50,
               total_cents: 150, payment_due_at: '2026-09-29T00:00:00Z' },
    })
  })

  it.each([
    [{ status: 'insufficient_stock', items: [{ variant_id: 'v1', available: 0 }] },
      { ok: false, reason: 'insufficient_stock', detail: [{ variant_id: 'v1', available: 0 }] }],
    [{ status: 'unavailable', variant_ids: ['v2'] }, { ok: false, reason: 'unavailable', detail: ['v2'] }],
    [{ status: 'invalid', field: 'phone' }, { ok: false, reason: 'invalid', detail: 'phone' }],
    [{ status: 'rate_limited' }, { ok: false, reason: 'rate_limited' }],
    [{ status: 'payment_method_unavailable' }, { ok: false, reason: 'payment_method_unavailable' }],
    [{ status: 'raro' }, { ok: false, reason: 'error' }],
  ])('normaliza %j', async (data, expected) => {
    rpc.mockResolvedValue({ data, error: null })
    expect(await placeOrder(INPUT)).toEqual(expected)
  })

  it('un error de PostgREST o de red es reason error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await placeOrder(INPUT)).toEqual({ ok: false, reason: 'error' })
    rpc.mockRejectedValue(new Error('offline'))
    expect(await placeOrder(INPUT)).toEqual({ ok: false, reason: 'error' })
  })

  it('hay un mensaje para cada reason', () => {
    for (const reason of ['insufficient_stock', 'unavailable', 'invalid', 'rate_limited',
      'payment_method_unavailable', 'error']) {
      expect(CHECKOUT_MESSAGES[reason]).toMatch(/\S/)
    }
  })
})

describe('fetchCheckoutOptions', () => {
  it('devuelve la configuracion', async () => {
    rpc.mockResolvedValue({ data: { card_enabled: false }, error: null })
    expect(await fetchCheckoutOptions()).toEqual({ card_enabled: false })
    expect(rpc).toHaveBeenCalledWith('checkout_options')
  })

  it('devuelve null ante error o sin datos', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    expect(await fetchCheckoutOptions()).toBeNull()
    rpc.mockRejectedValue(new Error('offline'))
    expect(await fetchCheckoutOptions()).toBeNull()
  })
})

describe('ultimo pedido en sessionStorage', () => {
  it('guarda, lee y borra', () => {
    const value = { order: { order_number: 'AIGO-1' }, email: 'ana@test.com' }
    saveLastOrder(value)
    expect(loadLastOrder()).toEqual(value)
    clearLastOrder()
    expect(loadLastOrder()).toBeNull()
  })

  it('un valor corrupto no rompe', () => {
    sessionStorage.setItem('aigo_last_order', '{no json')
    expect(loadLastOrder()).toBeNull()
  })
})
```

Si Vitest corre sin DOM y `sessionStorage` no existe, revisa `vite.config.js` (bloque `test`). Si no hay `environment`, agrega al inicio del archivo de test el comentario `// @vitest-environment happy-dom` solo si `happy-dom` ya está instalado. Si no lo está, no instales dependencias: define en el `beforeEach` un stub mínimo con `vi.stubGlobal('sessionStorage', …)` (un `Map` con `getItem`, `setItem`, `removeItem` y `clear`). La implementación ya envuelve todo en try/catch.

- [ ] **Step 6: Correr y ver que falla**

Run: `npx vitest run src/lib/checkout.test.js`
Expected: FAIL ("Failed to resolve import ./checkout.js").

- [ ] **Step 7: Implementar**

Crear `src/lib/checkout.js`:

```js
import { supabase } from './supabase.js'
import { normalizePhone } from './validateCheckout.js'

const LAST_ORDER_KEY = 'aigo_last_order'

export const CHECKOUT_MESSAGES = {
  insufficient_stock: 'Algunos productos ya no tienen suficientes piezas. Ajustamos tu bolsa; revísala y confirma de nuevo.',
  unavailable: 'Algunos productos ya no están disponibles y los quitamos de tu bolsa. Revísala y confirma de nuevo.',
  invalid: 'Revisa los datos marcados.',
  rate_limited: 'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  payment_method_unavailable: 'Ese método de pago todavía no está disponible.',
  error: 'No pudimos crear tu pedido. Revisa tu conexión e inténtalo de nuevo.',
}

export async function fetchCheckoutOptions() {
  try {
    const { data, error } = await supabase.rpc('checkout_options')
    return error || !data ? null : data
  } catch {
    return null
  }
}

export function buildOrderPayload({ items, customer, shipping, paymentMethod }) {
  const t = (v) => String(v ?? '').trim()
  return {
    p_items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
    p_customer: {
      name: t(customer.name),
      email: t(customer.email),
      phone: normalizePhone(customer.phone),
      address: t(customer.address),
      city: t(customer.city),
      state: t(customer.state),
      postal_code: t(customer.postal_code),
    },
    p_shipping: shipping,
    p_payment_method: paymentMethod,
  }
}

export async function placeOrder(input) {
  try {
    const { data, error } = await supabase.rpc('create_order', buildOrderPayload(input))
    if (error || !data) return { ok: false, reason: 'error' }
    switch (data.status) {
      case 'ok':
        return {
          ok: true,
          order: {
            order_number: data.order_number,
            subtotal_cents: data.subtotal_cents,
            shipping_cost_cents: data.shipping_cost_cents,
            total_cents: data.total_cents,
            payment_due_at: data.payment_due_at,
          },
        }
      case 'insufficient_stock':
        return { ok: false, reason: 'insufficient_stock', detail: data.items }
      case 'unavailable':
        return { ok: false, reason: 'unavailable', detail: data.variant_ids }
      case 'invalid':
        return { ok: false, reason: 'invalid', detail: data.field }
      case 'rate_limited':
      case 'payment_method_unavailable':
        return { ok: false, reason: data.status }
      default:
        return { ok: false, reason: 'error' }
    }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

// La pantalla de exito sobrevive a un refresh dentro de la misma pestaña.
export function saveLastOrder(value) {
  try {
    sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(value))
  } catch {
    // modo privado o almacenamiento bloqueado: la pantalla sigue funcionando
  }
}

export function loadLastOrder() {
  try {
    const raw = sessionStorage.getItem(LAST_ORDER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearLastOrder() {
  try {
    sessionStorage.removeItem(LAST_ORDER_KEY)
  } catch {
    // ignorar
  }
}
```

- [ ] **Step 8: Correr todo Vitest**

Run: `npm test`
Expected: PASS (141 + los nuevos).

- [ ] **Step 9: Commit**

```bash
git add src/lib/validateCheckout.js src/lib/validateCheckout.test.js src/lib/checkout.js src/lib/checkout.test.js
git commit -m "feat(fe): validacion del checkout y cliente de create_order/checkout_options"
```

---

### Task 5: Carrito sin shims, `CheckoutView` nueva y retiro de `shipping.js` y `orders.js`

**Files:**
- Modify: `src/stores/cart.js`, `src/stores/cart.test.js`
- Rewrite: `src/views/user/CheckoutView.vue`
- Modify: `src/views/user/ProductDetailView.vue`
- Delete: `src/stores/shipping.js`, `src/stores/orders.js`

**Interfaces:**
- Consumes: todo lo de la Task 4; `formatMXN`; `BaseButton` (props `variant`, `to`, `type`, `disabled` y `block`).
- Produces:
  - `useCartStore()` sin `subtotal` y con ítems sin `id`, `name`, `price` ni `image`.
  - Nuevo `setAvailableStock(variantId, available)`: con `available <= 0` quita el ítem; si no, fija `stock = available` y `quantity = min(quantity, available)`.

- [ ] **Step 1: Actualizar los tests del carrito (fallan)**

En `src/stores/cart.test.js`:
- En el primer test, cambiar el título a `'addItem guarda el snapshot canónico'`. Borrar las 5 líneas de los shims (desde el comentario `// shims para CheckoutView` hasta `expect(i.image)…`) y agregar en su lugar:

```js
    expect(i).not.toHaveProperty('id')
    expect(i).not.toHaveProperty('price')
```

- Reemplazar el test `'subtotalCents y subtotal (shim) son consistentes'` por:

```js
  it('subtotalCents y totalItems suman el carrito', () => {
    const cart = useCartStore()
    cart.addItem(product, variant, 2)
    expect(cart.subtotalCents).toBe(170000)
    expect(cart.totalItems).toBe(2)
    expect(cart).not.toHaveProperty('subtotal')
  })

  it('setAvailableStock baja cantidad y stock al disponible', () => {
    const cart = useCartStore()
    cart.addItem(product, variant, 3)
    cart.setAvailableStock('v1', 1)
    expect(cart.items[0].stock).toBe(1)
    expect(cart.items[0].quantity).toBe(1)
  })

  it('setAvailableStock con 0 quita el producto de la bolsa', () => {
    const cart = useCartStore()
    cart.addItem(product, variant, 1)
    cart.setAvailableStock('v1', 0)
    expect(cart.items).toHaveLength(0)
  })

  it('setAvailableStock ignora variantes que no estan en la bolsa', () => {
    const cart = useCartStore()
    cart.addItem(product, variant, 1)
    cart.setAvailableStock('otra', 0)
    expect(cart.items).toHaveLength(1)
  })
```

Run: `npx vitest run src/stores/cart.test.js`
Expected: FAIL (los shims siguen ahí y no existe `setAvailableStock`).

- [ ] **Step 2: Actualizar `src/stores/cart.js`**

Reemplazar el archivo completo por:

```js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCartStore = defineStore('cart', () => {
  const items = ref([])

  const totalItems = computed(() => items.value.reduce((s, i) => s + i.quantity, 0))
  const subtotalCents = computed(() =>
    items.value.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0)
  )

  function addItem(product, variant, quantity = 1) {
    const existing = items.value.find((i) => i.variant_id === variant.id)
    if (existing) {
      existing.quantity = Math.min(variant.stock, existing.quantity + quantity)
      return
    }
    items.value.push({
      variant_id: variant.id,
      product_id: product.id,
      product_name: product.name,
      variant_label: variant.label,
      unit_price_cents: variant.price_cents,
      image_url: variant.image_url ?? product.image_url,
      stock: variant.stock,
      quantity: Math.min(variant.stock, quantity),
    })
  }

  function removeItem(variantId) {
    items.value = items.value.filter((i) => i.variant_id !== variantId)
  }

  function updateQuantity(variantId, quantity) {
    const item = items.value.find((i) => i.variant_id === variantId)
    if (item) item.quantity = Math.max(1, Math.min(item.stock, quantity))
  }

  // El servidor dijo cuantas piezas quedan de verdad (create_order).
  function setAvailableStock(variantId, available) {
    const item = items.value.find((i) => i.variant_id === variantId)
    if (!item) return
    if (available <= 0) {
      removeItem(variantId)
      return
    }
    item.stock = available
    item.quantity = Math.min(item.quantity, available)
  }

  function clearCart() {
    items.value = []
  }

  return {
    items, totalItems, subtotalCents,
    addItem, removeItem, updateQuantity, setAvailableStock, clearCart,
  }
})
```

Run: `npx vitest run src/stores/cart.test.js`
Expected: PASS.

- [ ] **Step 3: Confirmar que nadie más usa los shims**

Run: `grep -rnE "cart\.subtotal\b|\.price\b|item\.(id|name|image)\b" src --include=*.vue --include=*.js`
Expected: solo coincidencias en `src/views/user/CheckoutView.vue` (que se reescribe en el paso siguiente) o que no vienen del carrito (p. ej. `variant.price_cents` no coincide con `\.price\b`). Si aparece otra vista que use shims del carrito, cámbiala al campo canónico: `product_name`, `unit_price_cents`, `image_url` o `variant_id`.

- [ ] **Step 4: Reescribir `src/views/user/CheckoutView.vue`**

Reemplazar el archivo completo por:

```vue
<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { useCartStore } from '../../stores/cart.js'
import { formatMXN } from '../../lib/format.js'
import { validateCheckout } from '../../lib/validateCheckout.js'
import {
  fetchCheckoutOptions, placeOrder, saveLastOrder, loadLastOrder, clearLastOrder, CHECKOUT_MESSAGES,
} from '../../lib/checkout.js'
import BaseButton from '../../components/BaseButton.vue'

const FIELDS = [
  { key: 'name', label: 'Nombre completo', autocomplete: 'name' },
  { key: 'email', label: 'Correo', type: 'email', autocomplete: 'email' },
  { key: 'phone', label: 'Teléfono (10 dígitos)', type: 'tel', autocomplete: 'tel', inputmode: 'tel' },
  { key: 'address', label: 'Calle y número', autocomplete: 'street-address' },
  { key: 'city', label: 'Ciudad', autocomplete: 'address-level2' },
  { key: 'state', label: 'Estado', autocomplete: 'address-level1' },
  { key: 'postal_code', label: 'Código postal', autocomplete: 'postal-code', inputmode: 'numeric', maxlength: 5 },
]

const cart = useCartStore()
const options = ref(null)
const optionsFailed = ref(false)
const form = reactive({ name: '', email: '', phone: '', address: '', city: '', state: '', postal_code: '' })
const shipping = ref('standard')
const paymentMethod = ref('transfer')
const errors = ref({})
const submitting = ref(false)
const submitError = ref(null)
const stockIssues = ref({})
const placed = ref(null)
const copied = ref(false)

async function loadOptions() {
  optionsFailed.value = false
  options.value = await fetchCheckoutOptions()
  optionsFailed.value = !options.value
}

onMounted(() => {
  if (!cart.items.length) placed.value = loadLastOrder()
  loadOptions()
})

const shippingOption = computed(
  () => options.value?.shipping.find((o) => o.code === shipping.value) ?? null,
)
const totalCents = computed(() => cart.subtotalCents + (shippingOption.value?.cost_cents ?? 0))

async function submit() {
  if (submitting.value) return
  submitError.value = null
  const result = validateCheckout(form)
  errors.value = result.errors
  if (!result.valid) {
    const first = FIELDS.find((f) => result.errors[f.key])
    await nextTick()
    document.getElementById(`co-${first.key}`)?.focus()
    return
  }

  submitting.value = true
  const res = await placeOrder({
    items: cart.items, customer: form, shipping: shipping.value, paymentMethod: paymentMethod.value,
  })
  submitting.value = false

  if (res.ok) {
    placed.value = { order: res.order, email: form.email.trim() }
    saveLastOrder(placed.value)
    cart.clearCart()
    window.scrollTo(0, 0)
    return
  }

  if (res.reason === 'insufficient_stock') {
    stockIssues.value = Object.fromEntries(res.detail.map((d) => [d.variant_id, d.available]))
    res.detail.forEach((d) => cart.setAvailableStock(d.variant_id, d.available))
  } else if (res.reason === 'unavailable') {
    res.detail.forEach((id) => cart.setAvailableStock(id, 0))
  } else if (res.reason === 'invalid' && FIELDS.some((f) => f.key === res.detail)) {
    errors.value = { [res.detail]: 'Revisa este dato' }
  }
  submitError.value = CHECKOUT_MESSAGES[res.reason] ?? CHECKOUT_MESSAGES.error
}

async function copyClabe() {
  try {
    await navigator.clipboard.writeText(options.value.bank.clabe)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    copied.value = false
  }
}

function formatDue(iso) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })
}

function whatsappLink(number) {
  const digits = String(number).replace(/\D/g, '')
  return `https://wa.me/${digits.length === 10 ? '52' + digits : digits}`
}
</script>

<template>
  <div class="checkout container">
    <!-- ===== Exito ===== -->
    <section v-if="placed" class="done" aria-labelledby="done-title">
      <p class="eyebrow">Pedido registrado</p>
      <h1 id="done-title" class="display done__title">{{ placed.order.order_number }}</h1>
      <p class="done__lead">
        Tu pedido está apartado. Transfiere <strong>{{ formatMXN(placed.order.total_cents) }}</strong>
        antes del <strong>{{ formatDue(placed.order.payment_due_at) }}</strong>; si no, se cancela
        y las piezas se liberan.
      </p>

      <div v-if="options?.bank?.clabe" class="done__bank">
        <p><span>Banco</span>{{ options.bank.name }}</p>
        <p><span>Titular</span>{{ options.bank.holder }}</p>
        <p class="done__clabe">
          <span>CLABE</span><strong>{{ options.bank.clabe }}</strong>
          <BaseButton variant="outline" @click="copyClabe">{{ copied ? 'Copiada' : 'Copiar CLABE' }}</BaseButton>
        </p>
        <p><span>Concepto</span>{{ placed.order.order_number }}</p>
      </div>
      <p v-else class="done__lead">Te contactaremos para darte los datos de pago.</p>

      <p v-if="options?.contact" class="done__lead">
        Envía tu comprobante con tu número de pedido por
        <a v-if="options.contact.whatsapp" :href="whatsappLink(options.contact.whatsapp)" target="_blank" rel="noopener">WhatsApp</a>
        <template v-if="options.contact.whatsapp && options.contact.email"> o </template>
        <a v-if="options.contact.email" :href="`mailto:${options.contact.email}`">{{ options.contact.email }}</a>.
      </p>

      <div class="done__actions">
        <BaseButton :to="{ path: '/seguimiento', query: { pedido: placed.order.order_number } }">Ver mi pedido</BaseButton>
        <router-link to="/productos" class="done__link" @click="clearLastOrder">Seguir comprando</router-link>
      </div>
    </section>

    <!-- ===== Bolsa vacia ===== -->
    <section v-else-if="!cart.items.length" class="empty">
      <h1 class="display">Tu bolsa está vacía</h1>
      <BaseButton to="/productos">Ver productos</BaseButton>
    </section>

    <!-- ===== Formulario ===== -->
    <template v-else>
      <h1 class="display checkout__title">Checkout</h1>

      <p v-if="optionsFailed" class="alert" role="alert">
        No pudimos cargar las opciones de envío y pago.
        <button type="button" class="link" @click="loadOptions">Reintentar</button>
      </p>

      <div class="checkout__grid">
        <form class="checkout__form" novalidate @submit.prevent="submit">
          <fieldset>
            <legend class="eyebrow">Contacto y envío</legend>
            <div class="fields">
              <div v-for="f in FIELDS" :key="f.key" class="field" :class="`field--${f.key}`">
                <label :for="`co-${f.key}`">{{ f.label }}</label>
                <input
                  :id="`co-${f.key}`"
                  v-model="form[f.key]"
                  :type="f.type ?? 'text'"
                  :autocomplete="f.autocomplete"
                  :inputmode="f.inputmode"
                  :maxlength="f.maxlength"
                  :aria-invalid="!!errors[f.key]"
                  :aria-describedby="errors[f.key] ? `co-${f.key}-err` : undefined"
                />
                <p v-if="errors[f.key]" :id="`co-${f.key}-err`" class="field__error">{{ errors[f.key] }}</p>
              </div>
            </div>
          </fieldset>

          <fieldset v-if="options">
            <legend class="eyebrow">Envío</legend>
            <label v-for="o in options.shipping" :key="o.code" class="choice" :class="{ 'choice--on': shipping === o.code }">
              <input v-model="shipping" type="radio" name="shipping" :value="o.code" />
              <span class="choice__main">{{ o.label }} <small>{{ o.days }} días hábiles</small></span>
              <span>{{ formatMXN(o.cost_cents) }}</span>
            </label>
          </fieldset>

          <fieldset v-if="options">
            <legend class="eyebrow">Pago</legend>
            <label class="choice" :class="{ 'choice--on': paymentMethod === 'transfer' }">
              <input v-model="paymentMethod" type="radio" name="payment" value="transfer" />
              <span class="choice__main">Transferencia o depósito <small>Tienes {{ options.transfer_hours }} h para pagar</small></span>
            </label>
            <label class="choice" :class="{ 'choice--on': paymentMethod === 'card', 'choice--off': !options.card_enabled }">
              <input v-model="paymentMethod" type="radio" name="payment" value="card" :disabled="!options.card_enabled" />
              <span class="choice__main">Tarjeta de crédito o débito
                <small v-if="!options.card_enabled">Próximamente</small>
              </span>
            </label>
          </fieldset>

          <p v-if="submitError" class="alert" role="alert">{{ submitError }}</p>

          <BaseButton type="submit" block :disabled="submitting || !options">
            {{ submitting ? 'Creando pedido…' : 'Confirmar pedido' }}
          </BaseButton>
        </form>

        <aside class="summary" aria-label="Resumen del pedido">
          <p class="eyebrow">Tu bolsa</p>
          <ul class="summary__items">
            <li v-for="item in cart.items" :key="item.variant_id">
              <span>
                {{ item.product_name }} <small>{{ item.variant_label }} × {{ item.quantity }}</small>
                <em v-if="stockIssues[item.variant_id] !== undefined" class="summary__issue">
                  Solo quedan {{ stockIssues[item.variant_id] }}
                </em>
              </span>
              <span>{{ formatMXN(item.unit_price_cents * item.quantity) }}</span>
            </li>
          </ul>
          <p class="summary__row"><span>Subtotal</span><span>{{ formatMXN(cart.subtotalCents) }}</span></p>
          <p class="summary__row"><span>Envío</span><span>{{ shippingOption ? formatMXN(shippingOption.cost_cents) : '—' }}</span></p>
          <p class="summary__row summary__total"><span>Total</span><span>{{ formatMXN(totalCents) }}</span></p>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.checkout { padding-top: 48px; padding-bottom: var(--section-gap); }
.checkout__title { font-size: clamp(48px, 7vw, 80px); margin-bottom: 32px; }
.checkout__grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 48px; align-items: start; }
.checkout__form { display: flex; flex-direction: column; gap: 32px; }
fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
legend { margin-bottom: 12px; }
.fields { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; }
.field { grid-column: span 6; display: flex; flex-direction: column; gap: 6px; }
.field--email, .field--phone { grid-column: span 3; }
.field--city, .field--state, .field--postal_code { grid-column: span 2; }
.field label { font-size: 14px; }
.field input {
  padding: 12px 14px; border: 1px solid var(--lilac); background: #fff;
  color: var(--ink); font: inherit; border-radius: var(--radius-button);
}
.field input:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.field input[aria-invalid='true'] { border-color: var(--danger); }
.field__error { color: var(--danger); font-size: 13px; }
.choice {
  display: flex; align-items: center; gap: 12px; padding: 16px;
  border: 1px solid var(--lilac); cursor: pointer;
}
.choice--on { border-color: var(--ink); background: var(--surface); }
.choice--off { opacity: 0.55; cursor: not-allowed; }
.choice__main { flex: 1; display: flex; flex-direction: column; }
.choice__main small { color: var(--ink-muted); font-size: 13px; }
.alert { border: 1px solid var(--danger); padding: 12px 16px; color: var(--ink); }
.link { background: none; border: 0; padding: 0; color: var(--ink); text-decoration: underline; cursor: pointer; font: inherit; }
.summary { border: 1px solid var(--lilac); padding: 24px; display: flex; flex-direction: column; gap: 12px; position: sticky; top: 96px; }
.summary__items { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.summary__items li, .summary__row { display: flex; justify-content: space-between; gap: 12px; }
.summary__items small { color: var(--ink-muted); }
.summary__issue { display: block; color: var(--danger); font-style: normal; font-size: 13px; }
.summary__total { border-top: 1px solid var(--lilac); padding-top: 12px; font-weight: 700; }
.done, .empty { max-width: 640px; display: flex; flex-direction: column; gap: 20px; }
.done__title { font-size: clamp(40px, 7vw, 72px); }
.done__lead { font-size: 16px; line-height: 1.6; }
.done__bank { border: 1px solid var(--lilac); background: var(--surface); padding: 20px; display: flex; flex-direction: column; gap: 10px; }
.done__bank span { display: inline-block; min-width: 90px; color: var(--ink-muted); font-size: 14px; }
.done__clabe { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.done__clabe strong { font-size: 18px; letter-spacing: 1px; font-variant-numeric: tabular-nums; }
.done__actions { display: flex; gap: 12px; flex-wrap: wrap; }
.done a { color: var(--ink); text-decoration: underline; }
@media (max-width: 860px) {
  .checkout__grid { grid-template-columns: minmax(0, 1fr); }
  .summary { position: static; order: -1; }
}
@media (max-width: 520px) {
  .field--email, .field--phone, .field--city, .field--state, .field--postal_code { grid-column: span 6; }
}
</style>
```

Nota: "Seguir comprando" es un `router-link` directo (no `BaseButton`) para que el `@click` que borra el último pedido sea explícito. Agrega su estilo al `<style scoped>`: `.done__link { align-self: center; color: var(--ink); text-decoration: underline; }`.

- [ ] **Step 5: `ProductDetailView.vue` con tarifas planas**

En `src/views/user/ProductDetailView.vue`:
- Quitar `import { useShippingStore } from '../../stores/shipping'`, `const shippingStore = useShippingStore()`, `const postalCode = ref('')`, `const shippingInfo = ref(null)` y la función `calculateShipping()`.
- Agregar `import { fetchCheckoutOptions } from '../../lib/checkout.js'` y `const shippingOptions = ref(null)`.
- En el `onMounted` existente, al final: `fetchCheckoutOptions().then((o) => { shippingOptions.value = o?.shipping ?? null })`.
- Reemplazar el bloque `<!-- Cotizacion provisional … -->` y su `<div class="detail__ship">…</div>` por:

```vue
          <div v-if="shippingOptions" class="detail__ship">
            <p class="eyebrow">Envío a todo México</p>
            <div class="detail__ship-results">
              <p v-for="o in shippingOptions" :key="o.code">
                {{ o.label }}: {{ formatMXN(o.cost_cents) }} · {{ o.days }} días hábiles
              </p>
            </div>
          </div>
```

- Borrar las reglas CSS `.detail__ship-form` y `.detail__ship-form input…` (las que siguen a `.detail__ship-form {`). Conservar `.detail__ship` y `.detail__ship-results`.

- [ ] **Step 6: Borrar los stores viejos y verificar**

```bash
rm src/stores/shipping.js src/stores/orders.js
grep -rn "stores/shipping\|stores/orders\|useShippingStore\|useOrdersStore" src
```
Expected: ninguna coincidencia.

Run: `npm test`
Expected: PASS.
Run: `npm run build`
Expected: build sin errores.

- [ ] **Step 7: Prueba manual rápida contra la DB local**

Con `npm run dev`: agregar un producto a la bolsa, ir a /checkout, llenar el formulario con el teléfono `33 1234-5678` y confirmar. Debe aparecer la pantalla de éxito con número, CLABE `000000000000000000` y fecha límite. Después, un refresh debe mantener la pantalla de éxito.

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc \
  "select order_number, payment_method, payment_status, total_cents from public.orders order by created_at desc limit 1"
```
Expected: el número mostrado, `transfer|pending|<total>`.

(Si esto lo ejecuta un subagente sin navegador, basta con `npm run build` + los tests. El controlador hace esta prueba en la Task 10.)

- [ ] **Step 8: Commit**

```bash
git add src/stores/cart.js src/stores/cart.test.js src/views/user/CheckoutView.vue src/views/user/ProductDetailView.vue
git rm src/stores/shipping.js src/stores/orders.js
git commit -m "feat(fe): checkout real con transferencia; retira shims del carrito, shipping.js y orders.js"
```

---

### Task 6: Seguimiento de una transferencia pendiente

**Files:**
- Modify: `src/lib/trackOrder.js`, `src/lib/trackOrder.test.js`
- Modify: `src/views/user/TrackingView.vue`

**Interfaces:**
- Consumes: `track_order` v2 (Task 1); `fetchCheckoutOptions` y `loadLastOrder` (Task 4).
- Produces:
  - `isAwaitingTransfer(order) -> boolean`
  - `historyLabel('note') === 'Aviso de la tienda'`

- [ ] **Step 1: Tests que fallan**

En `src/lib/trackOrder.test.js`:
- Agregar `isAwaitingTransfer` al import de `./trackOrder.js`.
- Dentro de `describe('historyLabel')`, agregar un test:

```js
  it('las notas del admin se muestran como aviso de la tienda', () => {
    expect(historyLabel('note')).toBe('Aviso de la tienda')
  })
```

- Al final del archivo:

```js
describe('isAwaitingTransfer', () => {
  const base = { payment_method: 'transfer', payment_status: 'pending', fulfillment_status: 'pending' }

  it('transferencia pendiente sin cancelar -> true', () => {
    expect(isAwaitingTransfer(base)).toBe(true)
  })

  it.each([
    [{ payment_method: 'card' }],
    [{ payment_status: 'paid' }],
    [{ payment_status: 'failed' }],
    [{ fulfillment_status: 'cancelled' }],
  ])('%j -> false', (override) => {
    expect(isAwaitingTransfer({ ...base, ...override })).toBe(false)
  })

  it('tolera null', () => {
    expect(isAwaitingTransfer(null)).toBe(false)
  })
})
```

Run: `npx vitest run src/lib/trackOrder.test.js`
Expected: FAIL.

- [ ] **Step 2: Implementar**

En `src/lib/trackOrder.js`:
- En `HISTORY_LABELS`, agregar `note: 'Aviso de la tienda',` después de `cancelled: 'Cancelado',`.
- Después de `historyLabel`, agregar:

```js
// Pedido por transferencia que todavia espera el deposito.
export function isAwaitingTransfer(order) {
  return (
    !!order &&
    order.payment_method === 'transfer' &&
    order.payment_status === 'pending' &&
    order.fulfillment_status !== 'cancelled'
  )
}
```

Run: `npx vitest run src/lib/trackOrder.test.js`
Expected: PASS.

- [ ] **Step 3: `TrackingView.vue`**

En el `<script setup>`:
- Agregar `isAwaitingTransfer` al import de `trackOrder.js`.
- Agregar `import { fetchCheckoutOptions, loadLastOrder } from '../../lib/checkout.js'`.
- En `HISTORY_COLORS`, agregar `note: '#936DA4',`.
- Reemplazar el `onMounted` por:

```js
onMounted(() => {
  orderNumber.value = normalizeOrderNumber(route.query.pedido)
  // Viene de la pantalla de exito en esta misma pestaña: rellenamos el correo.
  const last = loadLastOrder()
  if (last && normalizeOrderNumber(last.order?.order_number) === orderNumber.value) {
    email.value = last.email ?? ''
  }
})
```

- Después de `const message = computed(...)`, agregar:

```js
const awaitingTransfer = computed(() => isAwaitingTransfer(order.value))
const payOptions = ref(null)

async function search() {
  if (!canSearch.value) return
  orderNumber.value = normalizeOrderNumber(orderNumber.value)
  loading.value = true
  result.value = await trackOrder(orderNumber.value, email.value)
  loading.value = false
  if (awaitingTransfer.value && !payOptions.value) payOptions.value = await fetchCheckoutOptions()
}
```

(y borrar la versión anterior de `search`).

En el template, justo después del `<div class="order-header">…</div>` (antes de `<div v-if="order.history.length" class="timeline">`), agregar:

```vue
      <div v-if="awaitingTransfer" class="pay-box">
        <p class="eyebrow">Pago pendiente</p>
        <p>
          Transfiere {{ formatMXN(order.total_cents) }} antes del
          <strong>{{ formatDate(order.payment_due_at) }}</strong>; si no, el pedido se cancela.
        </p>
        <template v-if="payOptions?.bank?.clabe">
          <p>{{ payOptions.bank.name }} · {{ payOptions.bank.holder }}</p>
          <p class="pay-box__clabe">CLABE <strong>{{ payOptions.bank.clabe }}</strong></p>
          <p>Concepto: {{ order.order_number }}</p>
        </template>
        <p v-if="payOptions?.contact?.email || payOptions?.contact?.whatsapp">
          Envía tu comprobante a
          {{ [payOptions.contact.whatsapp && `WhatsApp ${payOptions.contact.whatsapp}`, payOptions.contact.email].filter(Boolean).join(' o ') }}.
        </p>
      </div>
```

En el `<style scoped>`, agregar:

```css
.pay-box { border: 1px solid var(--lilac); background: var(--surface); padding: 20px; margin-bottom: 32px; display: flex; flex-direction: column; gap: 8px; }
.pay-box__clabe strong { letter-spacing: 1px; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: Verificar**

Run: `npm test`
Expected: PASS.
Run: `npm run build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trackOrder.js src/lib/trackOrder.test.js src/views/user/TrackingView.vue
git commit -m "feat(fe): seguimiento muestra el pago pendiente por transferencia"
```

---

### Task 7: `orderLabels`, store `adminOrders` y errores nuevos

**Files:**
- Create: `src/lib/orderLabels.js`, `src/lib/orderLabels.test.js`
- Create: `src/stores/adminOrders.js`, `src/stores/adminOrders.test.js`
- Modify: `src/lib/dbError.js`, `src/lib/dbError.test.js`

**Interfaces:**
- Consumes: las RPC de admin (Task 3); SELECT sobre `orders`, `order_items` y `order_status_history` vía RLS de admin.
- Produces:
  - `orderLabels.js`: `methodLabel(m)`, `paymentBadge(order) -> {tone, label}`, `fulfillmentBadge(status) -> {tone, label}`, `timeLeft(dueIso, now) -> string|null`, `canMarkPaid(order)`, `canCancel(order)` y `nextFulfillment(order) -> {status, label}|null`. `tone` ∈ `success|warning|danger|muted|info`.
  - `adminOrders.js`: `PAGE_SIZE = 25`, `sanitizeSearch(s)` y `useAdminOrdersStore()`, con estado `orders`, `total`, `counts {to_confirm, to_ship}`, `current`, `loading`, `error` y acciones:
    - `fetchOrders({filter, search, page})`
    - `fetchCounts()`
    - `fetchOrder(id)`
    - `markPaid(id)`, `cancelOrder(id, note)`, `updateFulfillment(id, {status, carrier, trackingNumber, trackingUrl, note})` y `addNote(id, note)`. Las cuatro devuelven `{ok: true}` o `{ok: false, message}`.
  - `describeDbError` traduce `P0001` + código.

- [ ] **Step 1: Tests que fallan de `orderLabels`**

Crear `src/lib/orderLabels.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  methodLabel, paymentBadge, fulfillmentBadge, timeLeft, canMarkPaid, canCancel, nextFulfillment,
} from './orderLabels.js'

const o = (over = {}) => ({
  payment_method: 'transfer', payment_status: 'pending', fulfillment_status: 'pending', ...over,
})

describe('methodLabel', () => {
  it('traduce el metodo', () => {
    expect(methodLabel('transfer')).toBe('Transferencia')
    expect(methodLabel('card')).toBe('Tarjeta')
  })
})

describe('paymentBadge', () => {
  it.each([
    [o(), 'warning', 'Por confirmar'],
    [o({ payment_status: 'paid' }), 'success', 'Pagado'],
    [o({ payment_status: 'paid', fulfillment_status: 'cancelled' }), 'danger', 'Reembolso pendiente'],
    [o({ payment_status: 'failed', fulfillment_status: 'cancelled' }), 'muted', 'Sin pago'],
    [o({ payment_status: 'refunded' }), 'muted', 'Reembolsado'],
  ])('%j -> %s %s', (order, tone, label) => {
    expect(paymentBadge(order)).toEqual({ tone, label })
  })
})

describe('fulfillmentBadge', () => {
  it('traduce cada estado', () => {
    expect(fulfillmentBadge('pending').label).toBe('Sin preparar')
    expect(fulfillmentBadge('preparing').label).toBe('Preparando')
    expect(fulfillmentBadge('shipped').label).toBe('Enviado')
    expect(fulfillmentBadge('delivered').label).toBe('Entregado')
    expect(fulfillmentBadge('cancelled')).toEqual({ tone: 'muted', label: 'Cancelado' })
  })
})

describe('timeLeft', () => {
  const now = Date.parse('2026-09-27T12:00:00Z')
  it.each([
    [null, null],
    ['2026-09-27T11:00:00Z', 'Vencido'],
    ['2026-09-27T12:30:00Z', 'Vence en 30 min'],
    ['2026-09-27T12:00:20Z', 'Vence en 1 min'],
    ['2026-09-29T11:00:00Z', 'Vence en 47 h'],
  ])('%s -> %s', (due, expected) => {
    expect(timeLeft(due, now)).toBe(expected)
  })
})

describe('acciones disponibles', () => {
  it('canMarkPaid solo en transferencia pendiente sin cancelar', () => {
    expect(canMarkPaid(o())).toBe(true)
    expect(canMarkPaid(o({ payment_method: 'card' }))).toBe(false)
    expect(canMarkPaid(o({ payment_status: 'paid' }))).toBe(false)
    expect(canMarkPaid(o({ fulfillment_status: 'cancelled' }))).toBe(false)
  })

  it('canCancel mientras no este enviado ni cancelado', () => {
    expect(canCancel(o())).toBe(true)
    expect(canCancel(o({ payment_status: 'paid', fulfillment_status: 'preparing' }))).toBe(true)
    expect(canCancel(o({ fulfillment_status: 'shipped' }))).toBe(false)
    expect(canCancel(o({ fulfillment_status: 'delivered' }))).toBe(false)
    expect(canCancel(o({ fulfillment_status: 'cancelled' }))).toBe(false)
  })

  it('nextFulfillment sigue pendiente -> preparando -> enviado -> entregado, solo pagado', () => {
    expect(nextFulfillment(o())).toBeNull()
    expect(nextFulfillment(o({ payment_status: 'paid' }))).toEqual({ status: 'preparing', label: 'Marcar como preparando' })
    expect(nextFulfillment(o({ payment_status: 'paid', fulfillment_status: 'preparing' }))).toEqual({ status: 'shipped', label: 'Marcar como enviado' })
    expect(nextFulfillment(o({ payment_status: 'paid', fulfillment_status: 'shipped' }))).toEqual({ status: 'delivered', label: 'Marcar como entregado' })
    expect(nextFulfillment(o({ payment_status: 'paid', fulfillment_status: 'delivered' }))).toBeNull()
    expect(nextFulfillment(o({ payment_status: 'paid', fulfillment_status: 'cancelled' }))).toBeNull()
  })
})
```

Run: `npx vitest run src/lib/orderLabels.test.js`
Expected: FAIL (no existe el módulo).

- [ ] **Step 2: Implementar `orderLabels.js`**

Crear `src/lib/orderLabels.js`:

```js
// Etiquetas y reglas de UI del admin de pedidos. Las reglas reales viven en las
// funciones admin_* de la BD; esto solo decide que botones mostrar.

const FULFILLMENT = {
  pending: { tone: 'info', label: 'Sin preparar' },
  preparing: { tone: 'info', label: 'Preparando' },
  shipped: { tone: 'success', label: 'Enviado' },
  delivered: { tone: 'success', label: 'Entregado' },
  cancelled: { tone: 'muted', label: 'Cancelado' },
}

const NEXT = {
  pending: { status: 'preparing', label: 'Marcar como preparando' },
  preparing: { status: 'shipped', label: 'Marcar como enviado' },
  shipped: { status: 'delivered', label: 'Marcar como entregado' },
}

export function methodLabel(method) {
  return method === 'card' ? 'Tarjeta' : 'Transferencia'
}

export function paymentBadge(order) {
  if (order.payment_status === 'paid') {
    return order.fulfillment_status === 'cancelled'
      ? { tone: 'danger', label: 'Reembolso pendiente' }
      : { tone: 'success', label: 'Pagado' }
  }
  if (order.payment_status === 'refunded') return { tone: 'muted', label: 'Reembolsado' }
  if (order.payment_status === 'failed') return { tone: 'muted', label: 'Sin pago' }
  return { tone: 'warning', label: 'Por confirmar' }
}

export function fulfillmentBadge(status) {
  return FULFILLMENT[status] ?? { tone: 'muted', label: status }
}

export function timeLeft(dueIso, now = Date.now()) {
  if (!dueIso) return null
  const ms = new Date(dueIso).getTime() - now
  if (ms <= 0) return 'Vencido'
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) return `Vence en ${hours} h`
  return `Vence en ${Math.max(1, Math.floor(ms / 60_000))} min`
}

export function canMarkPaid(order) {
  return order.payment_method === 'transfer' && order.payment_status === 'pending' &&
    order.fulfillment_status !== 'cancelled'
}

export function canCancel(order) {
  return !['shipped', 'delivered', 'cancelled'].includes(order.fulfillment_status)
}

export function nextFulfillment(order) {
  if (order.payment_status !== 'paid') return null
  return NEXT[order.fulfillment_status] ?? null
}
```

Run: `npx vitest run src/lib/orderLabels.test.js`
Expected: PASS.

- [ ] **Step 3: Test que falla de `dbError`**

En `src/lib/dbError.test.js`, agregar al final:

```js
describe('errores de negocio de pedidos (P0001)', () => {
  it.each([
    ['order_cancelled', /cancelado/i],
    ['already_paid', /ya estaba/i],
    ['not_transfer', /transferencia/i],
    ['not_paid', /pago/i],
    ['invalid_transition', /estado/i],
    ['tracking_required', /guía/i],
    ['invalid_tracking_url', /http/i],
    ['note_required', /motivo|nota/i],
    ['note_too_long', /500/],
    ['order_not_found', /no existe/i],
  ])('%s', (code, expected) => {
    expect(describeDbError({ code: 'P0001', message: code })).toMatch(expected)
  })

  it('un P0001 desconocido cae al mensaje generico', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(describeDbError({ code: 'P0001', message: 'otro' })).toBe('Ocurrió un error inesperado')
    spy.mockRestore()
  })
})
```

Si el archivo no importa `vi` y `describe`, agrégalos al import de `vitest`.

Run: `npx vitest run src/lib/dbError.test.js`
Expected: FAIL.

- [ ] **Step 4: Implementar en `dbError.js`**

En `src/lib/dbError.js`, antes de `export function describeDbError`, agregar:

```js
// Codigos que lanzan las funciones admin_* (errcode P0001).
const ORDER_ERRORS = {
  order_not_found: 'Ese pedido ya no existe',
  order_cancelled:
    'El pedido está cancelado (quizá venció su plazo). Si el cliente ya pagó, pídele que compre de nuevo o reembólsale.',
  already_paid: 'Ese pedido ya estaba marcado como pagado',
  not_transfer: 'Solo los pagos por transferencia se confirman a mano',
  not_paid: 'Primero confirma el pago del pedido',
  invalid_transition: 'Ese cambio no es posible desde el estado actual del pedido',
  tracking_required: 'Para marcar como enviado escribe la paquetería y el número de guía',
  invalid_tracking_url: 'La URL de rastreo debe empezar con http:// o https://',
  note_required: 'Escribe un motivo o nota',
  note_too_long: 'La nota no puede pasar de 500 caracteres',
}
```

y dentro de la función, justo después de `if (!error) return null`:

```js
  if (error.code === 'P0001' && ORDER_ERRORS[error.message]) return ORDER_ERRORS[error.message]
```

Run: `npx vitest run src/lib/dbError.test.js`
Expected: PASS.

- [ ] **Step 5: Tests que fallan del store**

Crear `src/stores/adminOrders.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Builder de PostgREST con Proxy: registra cada metodo encadenado y, al hacer
// await, consume la siguiente respuesta de `queue`.
const { queue, calls, rpc } = vi.hoisted(() => ({ queue: [], calls: [], rpc: vi.fn() }))

vi.mock('../lib/supabase.js', () => {
  function from(table) {
    const chain = []
    calls.push({ table, chain })
    const q = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          return (ok, err) => Promise.resolve(queue.shift() ?? { data: null, error: null }).then(ok, err)
        }
        return (...args) => {
          chain.push([prop, ...args])
          return q
        }
      },
    })
    return q
  }
  return { supabase: { from, rpc } }
})

import { useAdminOrdersStore, sanitizeSearch, PAGE_SIZE } from './adminOrders.js'

const has = (chain, ...call) => chain.some((c) => JSON.stringify(c) === JSON.stringify(call))

beforeEach(() => {
  setActivePinia(createPinia())
  queue.length = 0
  calls.length = 0
  rpc.mockReset()
})

describe('sanitizeSearch', () => {
  it('quita caracteres que rompen el filtro or= de PostgREST', () => {
    expect(sanitizeSearch(' ana,(x)*%\\ ')).toBe('anax')
    expect(sanitizeSearch(null)).toBe('')
  })
})

describe('fetchOrders', () => {
  it('to_confirm: transferencias pendientes sin cancelar, por vencimiento', async () => {
    queue.push({ data: [{ id: 'o1' }], error: null, count: 1 })
    const store = useAdminOrdersStore()
    await store.fetchOrders({ filter: 'to_confirm', page: 0 })
    const { table, chain } = calls[0]
    expect(table).toBe('orders')
    expect(has(chain, 'eq', 'payment_method', 'transfer')).toBe(true)
    expect(has(chain, 'eq', 'payment_status', 'pending')).toBe(true)
    expect(has(chain, 'neq', 'fulfillment_status', 'cancelled')).toBe(true)
    expect(has(chain, 'order', 'payment_due_at', { ascending: true })).toBe(true)
    expect(has(chain, 'range', 0, PAGE_SIZE - 1)).toBe(true)
    expect(store.orders).toEqual([{ id: 'o1' }])
    expect(store.total).toBe(1)
  })

  it('to_ship: pagados sin enviar', async () => {
    queue.push({ data: [], error: null, count: 0 })
    await useAdminOrdersStore().fetchOrders({ filter: 'to_ship', page: 2 })
    const { chain } = calls[0]
    expect(has(chain, 'eq', 'payment_status', 'paid')).toBe(true)
    expect(has(chain, 'in', 'fulfillment_status', ['pending', 'preparing'])).toBe(true)
    expect(has(chain, 'order', 'created_at', { ascending: false })).toBe(true)
    expect(has(chain, 'range', 50, 74)).toBe(true)
  })

  it('shipped incluye entregados; cancelled filtra cancelados; all no filtra', async () => {
    queue.push({ data: [], error: null, count: 0 }, { data: [], error: null, count: 0 }, { data: [], error: null, count: 0 })
    const store = useAdminOrdersStore()
    await store.fetchOrders({ filter: 'shipped' })
    await store.fetchOrders({ filter: 'cancelled' })
    await store.fetchOrders({ filter: 'all' })
    expect(has(calls[0].chain, 'in', 'fulfillment_status', ['shipped', 'delivered'])).toBe(true)
    expect(has(calls[1].chain, 'eq', 'fulfillment_status', 'cancelled')).toBe(true)
    expect(calls[2].chain.some(([m]) => m === 'eq' || m === 'in' || m === 'neq')).toBe(false)
  })

  it('la busqueda filtra por numero o correo, ya saneada', async () => {
    queue.push({ data: [], error: null, count: 0 })
    await useAdminOrdersStore().fetchOrders({ filter: 'all', search: ' ana,(x) ' })
    expect(has(calls[0].chain, 'or', 'order_number.ilike.%anax%,customer_email.ilike.%anax%')).toBe(true)
  })

  it('un error queda en store.error', async () => {
    queue.push({ data: null, error: { code: '42501' }, count: null })
    const store = useAdminOrdersStore()
    await store.fetchOrders({ filter: 'all' })
    expect(store.error).toBe('Tu cuenta no tiene permisos para esta acción')
  })
})

describe('fetchCounts', () => {
  it('cuenta por confirmar y por enviar', async () => {
    queue.push({ data: null, error: null, count: 3 }, { data: null, error: null, count: 5 })
    const store = useAdminOrdersStore()
    await store.fetchCounts()
    expect(store.counts).toEqual({ to_confirm: 3, to_ship: 5 })
  })
})

describe('fetchOrder', () => {
  it('trae el pedido con items e historial ordenados por fecha', async () => {
    queue.push({
      data: {
        id: 'o1',
        order_items: [{ id: 'i2', created_at: '2026-01-02' }, { id: 'i1', created_at: '2026-01-01' }],
        order_status_history: [{ id: 'h2', created_at: '2026-01-02' }, { id: 'h1', created_at: '2026-01-01' }],
      },
      error: null,
    })
    const store = useAdminOrdersStore()
    await store.fetchOrder('o1')
    expect(has(calls[0].chain, 'eq', 'id', 'o1')).toBe(true)
    expect(store.current.order_items.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(store.current.order_status_history.map((h) => h.id)).toEqual(['h1', 'h2'])
  })
})

describe('acciones', () => {
  it('markPaid llama a la RPC y recarga el pedido', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    queue.push({ data: { id: 'o1', order_items: [], order_status_history: [] }, error: null })
    const res = await useAdminOrdersStore().markPaid('o1')
    expect(rpc).toHaveBeenCalledWith('admin_mark_paid', { p_order_id: 'o1' })
    expect(res).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
  })

  it('cancelOrder, updateFulfillment y addNote mandan sus parametros', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const store = useAdminOrdersStore()
    await store.cancelOrder('o1', 'motivo')
    await store.updateFulfillment('o1', { status: 'shipped', carrier: 'DHL', trackingNumber: '1', trackingUrl: '', note: '' })
    await store.addNote('o1', 'hola')
    expect(rpc.mock.calls).toEqual([
      ['admin_cancel_order', { p_order_id: 'o1', p_note: 'motivo' }],
      ['admin_update_fulfillment', {
        p_order_id: 'o1', p_status: 'shipped', p_carrier: 'DHL', p_tracking_number: '1',
        p_tracking_url: null, p_note: null,
      }],
      ['admin_add_order_note', { p_order_id: 'o1', p_note: 'hola' }],
    ])
  })

  it('un error de negocio se devuelve traducido y no recarga', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'order_cancelled' } })
    const res = await useAdminOrdersStore().markPaid('o1')
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/cancelado/i)
    expect(calls).toHaveLength(0)
  })
})
```

Run: `npx vitest run src/stores/adminOrders.test.js`
Expected: FAIL (no existe el módulo).

- [ ] **Step 6: Implementar el store**

Crear `src/stores/adminOrders.js`:

```js
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase.js'
import { describeDbError } from '../lib/dbError.js'

export const PAGE_SIZE = 25

const LIST_COLUMNS =
  'id, order_number, created_at, customer_name, customer_email, total_cents, ' +
  'payment_method, payment_status, fulfillment_status, payment_due_at'

// Comas, parentesis, comodines y backslash rompen (o amplian) el filtro or= de PostgREST.
export function sanitizeSearch(value) {
  return String(value ?? '').replace(/[,()*%\\]/g, '').trim()
}

function applyFilter(query, filter) {
  switch (filter) {
    case 'to_confirm':
      return query.eq('payment_method', 'transfer').eq('payment_status', 'pending').neq('fulfillment_status', 'cancelled')
    case 'to_ship':
      return query.eq('payment_status', 'paid').in('fulfillment_status', ['pending', 'preparing'])
    case 'shipped':
      return query.in('fulfillment_status', ['shipped', 'delivered'])
    case 'cancelled':
      return query.eq('fulfillment_status', 'cancelled')
    default:
      return query
  }
}

const byCreatedAt = (a, b) => String(a.created_at).localeCompare(String(b.created_at))
const blankToNull = (v) => (v == null || String(v).trim() === '' ? null : v)

export const useAdminOrdersStore = defineStore('adminOrders', () => {
  const orders = ref([])
  const total = ref(0)
  const counts = ref({ to_confirm: 0, to_ship: 0 })
  const current = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function fetchOrders({ filter = 'to_confirm', search = '', page = 0 } = {}) {
    loading.value = true
    error.value = null
    let query = applyFilter(supabase.from('orders').select(LIST_COLUMNS, { count: 'exact' }), filter)
    const term = sanitizeSearch(search)
    if (term) query = query.or(`order_number.ilike.%${term}%,customer_email.ilike.%${term}%`)
    query = filter === 'to_confirm'
      ? query.order('payment_due_at', { ascending: true })
      : query.order('created_at', { ascending: false })
    const from = page * PAGE_SIZE
    const { data, error: err, count } = await query.range(from, from + PAGE_SIZE - 1)
    if (err) {
      error.value = describeDbError(err)
    } else {
      orders.value = data ?? []
      total.value = count ?? 0
    }
    loading.value = false
  }

  async function countFor(filter) {
    const { count, error: err } = await applyFilter(
      supabase.from('orders').select('id', { count: 'exact', head: true }), filter,
    )
    return err ? 0 : count ?? 0
  }

  async function fetchCounts() {
    const toConfirm = await countFor('to_confirm')
    const toShip = await countFor('to_ship')
    counts.value = { to_confirm: toConfirm, to_ship: toShip }
  }

  async function fetchOrder(id) {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('orders')
      .select('*, order_items(*), order_status_history(*)')
      .eq('id', id)
      .single()
    if (err || !data) {
      error.value = err ? describeDbError(err) : 'Pedido no encontrado'
      current.value = null
    } else {
      current.value = {
        ...data,
        order_items: [...(data.order_items ?? [])].sort(byCreatedAt),
        order_status_history: [...(data.order_status_history ?? [])].sort(byCreatedAt),
      }
    }
    loading.value = false
  }

  async function runAction(fn, args, id) {
    const { error: err } = await supabase.rpc(fn, args)
    if (err) return { ok: false, message: describeDbError(err) }
    await fetchOrder(id)
    return { ok: true }
  }

  const markPaid = (id) => runAction('admin_mark_paid', { p_order_id: id }, id)
  const cancelOrder = (id, note) => runAction('admin_cancel_order', { p_order_id: id, p_note: note }, id)
  const addNote = (id, note) => runAction('admin_add_order_note', { p_order_id: id, p_note: note }, id)
  const updateFulfillment = (id, { status, carrier, trackingNumber, trackingUrl, note } = {}) =>
    runAction('admin_update_fulfillment', {
      p_order_id: id,
      p_status: status,
      p_carrier: blankToNull(carrier),
      p_tracking_number: blankToNull(trackingNumber),
      p_tracking_url: blankToNull(trackingUrl),
      p_note: blankToNull(note),
    }, id)

  return {
    orders, total, counts, current, loading, error,
    fetchOrders, fetchCounts, fetchOrder, markPaid, cancelOrder, updateFulfillment, addNote,
  }
})
```

Nota: en el test "markPaid … recarga el pedido", `calls` registra la recarga (`fetchOrder`), por eso espera exactamente 1. En el test de las tres acciones no se encolan respuestas; las recargas reciben `{data: null}` y `fetchOrder` lo maneja con `if (err || !data)`.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/orderLabels.js src/lib/orderLabels.test.js src/stores/adminOrders.js src/stores/adminOrders.test.js \
  src/lib/dbError.js src/lib/dbError.test.js
git commit -m "feat(fe): store de pedidos del admin, etiquetas y errores de negocio"
```

---

### Task 8: Lista de pedidos y tarjetas del dashboard

**Files:**
- Rewrite: `src/views/admin/OrdersView.vue`
- Modify: `src/views/admin/DashboardView.vue`

**Interfaces:**
- Consumes: `useAdminOrdersStore`, `PAGE_SIZE`, `orderLabels.js` (Task 7).
- Produces: la ruta `/admin/pedidos?filtro=<filtro>` (`to_confirm|to_ship|shipped|cancelled|all`), que usa el dashboard.

- [ ] **Step 1: Reescribir `OrdersView.vue`**

Reemplazar el archivo completo por:

```vue
<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminLayout from '../../components/AdminLayout.vue'
import { useAdminOrdersStore, PAGE_SIZE } from '../../stores/adminOrders.js'
import { formatMXN } from '../../lib/format.js'
import { methodLabel, paymentBadge, fulfillmentBadge, timeLeft } from '../../lib/orderLabels.js'

const TABS = [
  { key: 'to_confirm', label: 'Por confirmar pago', count: 'to_confirm' },
  { key: 'to_ship', label: 'Por enviar', count: 'to_ship' },
  { key: 'shipped', label: 'Enviados' },
  { key: 'cancelled', label: 'Cancelados' },
  { key: 'all', label: 'Todos' },
]

const route = useRoute()
const router = useRouter()
const store = useAdminOrdersStore()

const filter = ref(TABS.some((t) => t.key === route.query.filtro) ? route.query.filtro : 'to_confirm')
const search = ref('')
const page = ref(0)
const now = ref(Date.now())

const pages = computed(() => Math.max(1, Math.ceil(store.total / PAGE_SIZE)))

function load() {
  now.value = Date.now()
  store.fetchOrders({ filter: filter.value, search: search.value, page: page.value })
}

onMounted(() => {
  load()
  store.fetchCounts()
})

watch(filter, (value) => {
  page.value = 0
  router.replace({ query: { filtro: value } })
  load()
})

function onSearch() {
  page.value = 0
  load()
}

function go(delta) {
  page.value += delta
  load()
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <AdminLayout>
    <h1>Pedidos</h1>

    <div class="tabs" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        role="tab"
        :aria-selected="filter === t.key"
        class="tab"
        :class="{ 'tab--on': filter === t.key }"
        @click="filter = t.key"
      >
        {{ t.label }}
        <span v-if="t.count && store.counts[t.count]" class="tab__count">{{ store.counts[t.count] }}</span>
      </button>
    </div>

    <form class="search" role="search" @submit.prevent="onSearch">
      <input v-model="search" type="search" placeholder="Buscar por número o correo" aria-label="Buscar pedidos" />
      <button type="submit" class="btn-outline">Buscar</button>
    </form>

    <p v-if="store.error" class="error-msg">{{ store.error }}</p>
    <p v-else-if="store.loading && !store.orders.length" class="muted">Cargando pedidos…</p>
    <p v-else-if="!store.orders.length" class="muted">No hay pedidos en esta vista.</p>

    <ul v-else class="list">
      <li v-for="o in store.orders" :key="o.id">
        <router-link :to="`/admin/pedidos/${o.id}`" class="row">
          <span class="row__main">
            <strong>{{ o.order_number }}</strong>
            <small>{{ formatDate(o.created_at) }} · {{ o.customer_name }} · {{ o.customer_email }}</small>
          </span>
          <span class="row__meta">
            <span class="row__total">{{ formatMXN(o.total_cents) }}</span>
            <small>{{ methodLabel(o.payment_method) }}</small>
          </span>
          <span class="row__badges">
            <span class="badge" :class="`badge--${paymentBadge(o).tone}`">{{ paymentBadge(o).label }}</span>
            <span class="badge" :class="`badge--${fulfillmentBadge(o.fulfillment_status).tone}`">
              {{ fulfillmentBadge(o.fulfillment_status).label }}
            </span>
            <small v-if="filter === 'to_confirm'" class="row__due">{{ timeLeft(o.payment_due_at, now) }}</small>
          </span>
        </router-link>
      </li>
    </ul>

    <nav v-if="pages > 1" class="pager" aria-label="Paginación">
      <button type="button" class="btn-outline" :disabled="page === 0" @click="go(-1)">Anterior</button>
      <span>Página {{ page + 1 }} de {{ pages }}</span>
      <button type="button" class="btn-outline" :disabled="page + 1 >= pages" @click="go(1)">Siguiente</button>
    </nav>
  </AdminLayout>
</template>

<style scoped>
h1 { margin-bottom: 20px; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.tab {
  padding: 8px 14px; border: 1px solid var(--lilac); background: #fff; color: var(--ink);
  border-radius: var(--radius-pill); cursor: pointer; font: inherit; display: inline-flex; gap: 8px; align-items: center;
}
.tab--on { background: var(--ink); border-color: var(--ink); color: #fff; }
.tab__count { background: var(--badge); color: var(--ink); border-radius: var(--radius-pill); padding: 0 8px; font-size: 12px; font-weight: 700; }
.search { display: flex; gap: 8px; margin-bottom: 20px; max-width: 520px; }
.search input { flex: 1; padding: 10px 12px; border: 1px solid var(--lilac); font: inherit; }
.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.row {
  display: grid; grid-template-columns: minmax(0, 2fr) auto minmax(0, 1.2fr); gap: 16px; align-items: center;
  padding: 14px 16px; border: 1px solid var(--lilac); background: #fff; color: var(--ink);
}
.row:hover, .row:focus-visible { border-color: var(--ink); }
.row__main, .row__meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.row__main small { color: var(--ink-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row__meta { text-align: right; }
.row__meta small { color: var(--ink-muted); }
.row__total { font-weight: 700; font-variant-numeric: tabular-nums; }
.row__badges { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; align-items: center; }
.row__due { color: var(--ink-muted); width: 100%; text-align: right; }
.badge { padding: 2px 10px; border-radius: var(--radius-pill); font-size: 12px; border: 1px solid; color: var(--ink); }
.badge--success { border-color: var(--success); background: color-mix(in srgb, var(--success) 18%, #fff); }
.badge--warning { border-color: var(--warning); background: color-mix(in srgb, var(--warning) 18%, #fff); }
.badge--danger { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 18%, #fff); }
.badge--info { border-color: var(--signal); background: color-mix(in srgb, var(--signal) 14%, #fff); }
.badge--muted { border-color: var(--lilac); background: var(--surface); }
.pager { display: flex; gap: 12px; align-items: center; justify-content: center; margin-top: 20px; }
.btn-outline {
  padding: 8px 16px; border: 1px solid var(--ink); background: #fff; color: var(--ink);
  border-radius: var(--radius-button); cursor: pointer; font: inherit;
}
.btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
.muted { color: var(--ink-muted); }
.error-msg { color: var(--danger); }
@media (max-width: 720px) {
  .row { grid-template-columns: minmax(0, 1fr); }
  .row__meta, .row__badges, .row__due { text-align: left; justify-content: flex-start; }
}
</style>
```

- [ ] **Step 2: Tarjetas en `DashboardView.vue`**

En `src/views/admin/DashboardView.vue`:
- Agregar `import { useAdminOrdersStore } from '../../stores/adminOrders.js'` y `const orders = useAdminOrdersStore()`.
- Cambiar `onMounted(() => catalog.fetchAll())` por `onMounted(() => { catalog.fetchAll(); orders.fetchCounts() })`.
- Actualizar el comentario `// Solo metricas que existen hoy: el catalogo. Los pedidos llegan en la Fase 2c.` por `// Metricas del catalogo + dos contadores accionables de pedidos.`
- Dentro de `<div class="stats-grid">`, como primeras dos tarjetas:

```vue
        <router-link to="/admin/pedidos?filtro=to_confirm" class="stat-card stat-card--link">
          <div class="stat-icon" style="background: rgba(212,160,84,0.2); color: #D4A054;">
            <i class="fas fa-money-bill-transfer"></i>
          </div>
          <div>
            <p class="stat-value">{{ orders.counts.to_confirm }}</p>
            <p class="stat-label">Pagos por confirmar</p>
          </div>
        </router-link>
        <router-link to="/admin/pedidos?filtro=to_ship" class="stat-card stat-card--link">
          <div class="stat-icon" style="background: rgba(147,109,164,0.2); color: #936DA4;">
            <i class="fas fa-truck"></i>
          </div>
          <div>
            <p class="stat-value">{{ orders.counts.to_ship }}</p>
            <p class="stat-label">Por enviar</p>
          </div>
        </router-link>
```

- En el `<style scoped>`, agregar:

```css
.stat-card--link { color: inherit; text-decoration: none; }
.stat-card--link:hover, .stat-card--link:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
```

- [ ] **Step 3: Verificar**

Run: `npm test`
Expected: PASS.
Run: `npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/views/admin/OrdersView.vue src/views/admin/DashboardView.vue
git commit -m "feat(admin): lista de pedidos con filtros y contadores en el dashboard"
```

---

### Task 9: Detalle del pedido y acciones

**Files:**
- Create: `src/views/admin/OrderDetailView.vue`
- Modify: `src/router/index.js`

**Interfaces:**
- Consumes: `useAdminOrdersStore` (`fetchOrder`, `current`, `markPaid`, `cancelOrder`, `updateFulfillment` y `addNote`); `orderLabels.js`; `historyLabel` de `src/lib/trackOrder.js`.
- Produces: la ruta `/admin/pedidos/:id` (name `AdminOrderDetail`, `meta.requiresAdmin`).

- [ ] **Step 1: Ruta**

En `src/router/index.js`, después de la línea de `AdminOrders`, agregar:

```js
  { path: '/admin/pedidos/:id', name: 'AdminOrderDetail', component: () => import('../views/admin/OrderDetailView.vue'), meta: { requiresAdmin: true } },
```

- [ ] **Step 2: Vista**

Crear `src/views/admin/OrderDetailView.vue`:

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AdminLayout from '../../components/AdminLayout.vue'
import { useAdminOrdersStore } from '../../stores/adminOrders.js'
import { formatMXN } from '../../lib/format.js'
import { historyLabel } from '../../lib/trackOrder.js'
import {
  methodLabel, paymentBadge, fulfillmentBadge, timeLeft, canMarkPaid, canCancel, nextFulfillment,
} from '../../lib/orderLabels.js'

const route = useRoute()
const store = useAdminOrdersStore()
const id = route.params.id

const busy = ref(false)
const feedback = ref(null) // { kind: 'ok' | 'error', text }
const panel = ref(null) // 'ship' | 'cancel' | null
const ship = ref({ carrier: '', trackingNumber: '', trackingUrl: '', note: '' })
const cancelNote = ref('')
const note = ref('')
const copied = ref(false)

onMounted(() => store.fetchOrder(id))

const order = computed(() => (store.current?.id === id ? store.current : null))
const next = computed(() => (order.value ? nextFulfillment(order.value) : null))
const address = computed(() => {
  const o = order.value
  if (!o) return ''
  return `${o.customer_name}\n${o.shipping_address}\n${o.shipping_city}, ${o.shipping_state} ${o.shipping_postal_code}\nTel. ${o.customer_phone ?? ''}`
})

async function run(action, okText) {
  busy.value = true
  feedback.value = null
  const res = await action()
  busy.value = false
  feedback.value = res.ok ? { kind: 'ok', text: okText } : { kind: 'error', text: res.message }
  if (res.ok) panel.value = null
  return res.ok
}

function onMarkPaid() {
  const total = formatMXN(order.value.total_cents)
  if (!window.confirm(`¿Ya verificaste en tu banco el depósito de ${total} con concepto ${order.value.order_number}?`)) return
  run(() => store.markPaid(id), 'Pago confirmado')
}

function onNext() {
  if (next.value.status === 'shipped') {
    panel.value = 'ship'
    return
  }
  run(() => store.updateFulfillment(id, { status: next.value.status }), 'Estado actualizado')
}

function onShip() {
  run(() => store.updateFulfillment(id, { status: 'shipped', ...ship.value }), 'Pedido marcado como enviado')
}

async function onCancel() {
  const ok = await run(() => store.cancelOrder(id, cancelNote.value), 'Pedido cancelado; el stock se devolvió')
  if (ok) cancelNote.value = ''
}

async function onNote() {
  const ok = await run(() => store.addNote(id, note.value), 'Nota agregada')
  if (ok) note.value = ''
}

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(address.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    copied.value = false
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <AdminLayout>
    <router-link to="/admin/pedidos" class="back">← Pedidos</router-link>

    <p v-if="store.error" class="error-msg">{{ store.error }}</p>
    <p v-else-if="!order" class="muted">Cargando pedido…</p>

    <template v-else>
      <header class="head">
        <div>
          <h1>{{ order.order_number }}</h1>
          <p class="muted">{{ formatDate(order.created_at) }} · {{ methodLabel(order.payment_method) }}</p>
        </div>
        <div class="badges">
          <span class="badge" :class="`badge--${paymentBadge(order).tone}`">{{ paymentBadge(order).label }}</span>
          <span class="badge" :class="`badge--${fulfillmentBadge(order.fulfillment_status).tone}`">
            {{ fulfillmentBadge(order.fulfillment_status).label }}
          </span>
          <small v-if="canMarkPaid(order)" class="muted">{{ timeLeft(order.payment_due_at) }}</small>
        </div>
      </header>

      <p v-if="feedback" class="feedback" :class="`feedback--${feedback.kind}`" role="status">{{ feedback.text }}</p>

      <!-- ===== Acciones ===== -->
      <section class="card actions">
        <button v-if="canMarkPaid(order)" type="button" class="btn" :disabled="busy" @click="onMarkPaid">
          Marcar como pagado
        </button>
        <button v-if="next" type="button" class="btn" :disabled="busy" @click="onNext">{{ next.label }}</button>
        <button v-if="canCancel(order)" type="button" class="btn-outline btn-outline--danger" :disabled="busy" @click="panel = 'cancel'">
          Cancelar pedido
        </button>
        <p v-if="!canMarkPaid(order) && !next && !canCancel(order)" class="muted">Este pedido no tiene acciones pendientes.</p>

        <form v-if="panel === 'ship'" class="panel" @submit.prevent="onShip">
          <label>Paquetería <input v-model="ship.carrier" required placeholder="DHL, FedEx, Estafeta…" /></label>
          <label>Número de guía <input v-model="ship.trackingNumber" required /></label>
          <label>URL de rastreo (opcional) <input v-model="ship.trackingUrl" type="url" placeholder="https://…" /></label>
          <label>Nota para el cliente (opcional) <input v-model="ship.note" maxlength="500" /></label>
          <p class="hint">El cliente verá la paquetería, la guía y la nota en /seguimiento.</p>
          <div class="panel__actions">
            <button type="submit" class="btn" :disabled="busy">Marcar como enviado</button>
            <button type="button" class="btn-outline" @click="panel = null">Cancelar</button>
          </div>
        </form>

        <form v-if="panel === 'cancel'" class="panel" @submit.prevent="onCancel">
          <label>Motivo <input v-model="cancelNote" required maxlength="500" /></label>
          <p class="hint">
            El stock apartado vuelve al inventario. El cliente verá el motivo en /seguimiento.
            <strong v-if="order.payment_status === 'paid'">Este pedido ya está pagado: el reembolso lo haces tú desde tu banco.</strong>
          </p>
          <div class="panel__actions">
            <button type="submit" class="btn btn--danger" :disabled="busy">Cancelar pedido</button>
            <button type="button" class="btn-outline" @click="panel = null">Volver</button>
          </div>
        </form>
      </section>

      <div class="grid">
        <!-- ===== Cliente ===== -->
        <section class="card">
          <h2>Cliente y envío</h2>
          <pre class="address">{{ address }}</pre>
          <p class="muted">{{ order.customer_email }}</p>
          <p>{{ order.shipping_service }}</p>
          <p v-if="order.tracking_number">
            {{ order.shipping_carrier }} · Guía {{ order.tracking_number }}
          </p>
          <button type="button" class="btn-outline" @click="copyAddress">{{ copied ? 'Copiada' : 'Copiar dirección' }}</button>
        </section>

        <!-- ===== Articulos ===== -->
        <section class="card">
          <h2>Artículos</h2>
          <ul class="items">
            <li v-for="i in order.order_items" :key="i.id">
              <span>{{ i.product_name }} <small>{{ i.variant_label }} × {{ i.quantity }}</small></span>
              <span>{{ formatMXN(i.line_total_cents) }}</span>
            </li>
          </ul>
          <p class="line"><span>Subtotal</span><span>{{ formatMXN(order.subtotal_cents) }}</span></p>
          <p class="line"><span>Envío</span><span>{{ formatMXN(order.shipping_cost_cents) }}</span></p>
          <p class="line line--total"><span>Total</span><span>{{ formatMXN(order.total_cents) }}</span></p>
        </section>
      </div>

      <!-- ===== Historial + nota ===== -->
      <section class="card">
        <h2>Historial</h2>
        <ol class="history">
          <li v-for="h in order.order_status_history" :key="h.id">
            <strong>{{ historyLabel(h.status) }}</strong>
            <span v-if="h.note"> — {{ h.note }}</span>
            <small class="muted"> · {{ formatDate(h.created_at) }}</small>
          </li>
        </ol>
        <form class="note" @submit.prevent="onNote">
          <label for="order-note">Agregar nota</label>
          <input id="order-note" v-model="note" maxlength="500" />
          <p class="hint"><strong>El cliente verá esta nota en /seguimiento.</strong></p>
          <button type="submit" class="btn-outline" :disabled="busy || !note.trim()">Agregar nota</button>
        </form>
      </section>
    </template>
  </AdminLayout>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 16px; color: var(--ink); }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.badge { padding: 2px 10px; border-radius: var(--radius-pill); font-size: 12px; border: 1px solid; color: var(--ink); }
.badge--success { border-color: var(--success); background: color-mix(in srgb, var(--success) 18%, #fff); }
.badge--warning { border-color: var(--warning); background: color-mix(in srgb, var(--warning) 18%, #fff); }
.badge--danger { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 18%, #fff); }
.badge--info { border-color: var(--signal); background: color-mix(in srgb, var(--signal) 14%, #fff); }
.badge--muted { border-color: var(--lilac); background: var(--surface); }
.card { border: 1px solid var(--lilac); background: #fff; padding: 20px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; }
.card h2 { font-size: 1.1rem; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.actions { flex-direction: row; flex-wrap: wrap; align-items: flex-start; }
.panel { width: 100%; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--lilac); padding-top: 12px; }
.panel label, .note label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
.panel input, .note input { padding: 10px 12px; border: 1px solid var(--lilac); font: inherit; }
.panel__actions { display: flex; gap: 8px; }
.hint { font-size: 13px; color: var(--ink-muted); }
.btn {
  padding: 10px 18px; border: 1px solid var(--ink); background: var(--ink); color: #fff;
  border-radius: var(--radius-button); cursor: pointer; font: inherit;
}
.btn--danger { background: var(--danger); border-color: var(--danger); }
.btn-outline {
  padding: 10px 18px; border: 1px solid var(--ink); background: #fff; color: var(--ink);
  border-radius: var(--radius-button); cursor: pointer; font: inherit; align-self: flex-start;
}
.btn-outline--danger { border-color: var(--danger); color: var(--danger); }
.btn:disabled, .btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
.address { font: inherit; white-space: pre-wrap; margin: 0; }
.items { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.items li, .line { display: flex; justify-content: space-between; gap: 12px; }
.items small { color: var(--ink-muted); }
.line--total { border-top: 1px solid var(--lilac); padding-top: 8px; font-weight: 700; }
.history { padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.note { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--lilac); padding-top: 12px; }
.feedback { padding: 10px 14px; border: 1px solid; margin-bottom: 16px; }
.feedback--ok { border-color: var(--success); }
.feedback--error { border-color: var(--danger); }
.muted { color: var(--ink-muted); }
.error-msg { color: var(--danger); }
@media (max-width: 720px) { .grid { grid-template-columns: minmax(0, 1fr); } }
</style>
```

- [ ] **Step 3: Verificar**

Run: `npm test`
Expected: PASS.
Run: `npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/views/admin/OrderDetailView.vue src/router/index.js
git commit -m "feat(admin): detalle del pedido con confirmar pago, envio, cancelacion y notas"
```

---

### Task 10: QA visual y smoke (controlador)

Esta tarea la hace el controlador, no un subagente.

- [ ] **Step 1: Suites completas**

Run: `supabase test db`. Expected: 202 tests, todo verde.
Run: `npm test`. Expected: todo verde.
Run: `npm run build`. Expected: sin errores.

- [ ] **Step 2: QA visual headless**

Con `npm run dev` corriendo, usar Playwright-core (en el scratchpad de la sesión, con el chromium de `~/.cache/ms-playwright`, igual que en el rediseño) para capturar:
- /checkout a 375 px y a 1280 px (formulario con errores de validación y pantalla de éxito),
- el error de stock (pedir más piezas de las que hay, forzándolo con `update product_variants set stock = 0` vía psql después de agregar a la bolsa),
- /seguimiento de una transferencia pendiente,
- /admin/pedidos y /admin/pedidos/:id a 375 y 1280.

Revisar: sin scroll horizontal, foco visible, sin Font Awesome en las vistas públicas.

- [ ] **Step 3: Smoke manual (pedirlo a la usuaria)**

1. Comprar por transferencia. Anotar el número y verificar que el stock bajó en /admin/productos.
2. En /admin/pedidos → "Por confirmar pago" → abrir → "Marcar como pagado".
3. "Marcar como preparando" → "Marcar como enviado" con paquetería y guía → verlo en /seguimiento.
4. Hacer otra compra y cancelarla con un motivo: el stock vuelve y /seguimiento muestra el motivo.
5. Dashboard: los contadores coinciden con las pestañas.

- [ ] **Step 4: Actualizar la memoria del proyecto** (estado de la 2c-1, conteos de tests y siguiente paso).

---

## Criterios de éxito (verificar al cerrar la fase)

- Un pedido por transferencia se crea con precios, envío y total calculados en el servidor, y el stock queda apartado.
- Ninguna ruta de la API permite escribir en `orders` excepto las funciones.
- La admin puede confirmar el pago, preparar, enviar (con guía), entregar, cancelar (el stock vuelve) y agregar notas.
- Las transferencias sin pagar vencen solas a las 48 h y devuelven el stock.
- `shipping.js`, `orders.js` y los shims del carrito ya no existen.
- pgTAP, Vitest y el build en verde.
