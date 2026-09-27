# Diseño: Fase 2d — Seguimiento de pedidos

**Fecha:** 2026-09-26
**Estado:** Aprobado (diseño por secciones en conversación) — pendiente de revisión del spec escrito
**Rama:** `feature/supabase-backend`
**Depende de:** Fase 1 (esquema + RLS), Fase 2a (cliente de Supabase en el frontend)

## Contexto

`src/views/user/TrackingView.vue` busca pedidos en `localStorage` a través de
`src/stores/orders.js`: basta con el número de pedido y muestra nombre y dirección completa
del cliente. Es un IDOR de manual y no funciona con pedidos reales.

El spec de la Fase 1 (`2026-07-11-supabase-schema-design.md`, "Seguimiento sin IDOR") ya
fijó las reglas: el cliente nunca consulta `orders` directo; se exige **número de pedido +
correo**; se devuelve solo un subconjunto seguro; hay límite de intentos.

## Objetivo

El cliente escribe su número de pedido y su correo y ve: estado del pedido, línea de tiempo,
productos comprados, totales y, si ya se envió, la paquetería con un enlace para rastrear la
guía. Nadie puede ver un pedido ajeno ni averiguar si un número existe.

## Decisiones

| Tema | Decisión |
|---|---|
| Mecanismo | **Función de Postgres `security definer` llamada por RPC** (no Edge Function). |
| Identificación | `order_number` + `customer_email` juntos; el correo sin distinguir mayúsculas (`citext`). |
| Respuesta ante fallo | Idéntica para número inexistente, correo equivocado o entrada malformada. |
| Límite de intentos | Doble: por IP y por número de pedido, contando solo intentos fallidos. |
| Datos devueltos | Subconjunto seguro (ver abajo). Nunca teléfono, calle, CP, correo, IDs ni datos de Stripe. |
| Pedidos de prueba | 3 pedidos en `supabase/seed.sql` (solo local; `db push` no ejecuta el seed). |
| `src/stores/orders.js` | **No se toca.** `CheckoutView` lo usa hasta la 2c. |

### Por qué RPC y no Edge Function (cambio respecto al spec de la Fase 1)

- **Menor privilegio.** Una Edge Function necesitaría la llave `service_role`, con acceso
  total a todas las tablas; un bug expondría todo. La función de Postgres solo puede hacer
  lo que dice su SQL.
- **Mismo lugar que el resto de la seguridad.** Vive en una migración, se prueba con pgTAP
  junto a las 88 pruebas existentes y se despliega con `supabase db push`, sin pasos extra.
- **No obliga a rehacer nada en la 2c.** El checkout real creará los pedidos y esta función
  los leerá igual. Las Edge Functions de la 2c (Stripe, Skydropx) son piezas aparte.

## Base de datos

Una migración nueva: `supabase/migrations/<timestamp>_track_order.sql`.

### Tabla `track_order_attempts`

| columna | tipo | notas |
|---|---|---|
| `id` | bigint identity PK | |
| `kind` | text NOT NULL | CHECK `in ('ip','order')` |
| `key` | text NOT NULL | la IP o el número de pedido normalizado |
| `created_at` | timestamptz NOT NULL default now() | |

- Índice en `(kind, key, created_at)`.
- RLS activada **sin políticas**, y `revoke all` a `anon` y `authenticated`: nadie de fuera
  la lee ni la escribe. Solo la función (dueña `postgres`) la usa.
- Guarda **solo intentos fallidos**.

### Función `public.track_order(p_order_number text, p_email text) returns jsonb`

- `language plpgsql`, `security definer`, `set search_path = ''` (todas las referencias
  calificadas con `public.`), `volatile` (escribe intentos; se llama por POST).
- `revoke execute ... from public`; `grant execute ... to anon, authenticated`.

**Pasos:**

1. **Normalizar:** número → `upper(trim(...))`; correo → `trim(...)`.
2. **IP del cliente:** primer valor de `x-forwarded-for` en
   `current_setting('request.headers', true)::json`; si no existe, `'unknown'`.
3. **Limpieza:** borrar intentos con más de 1 día de antigüedad.
4. **Comprobar bloqueo** (antes de buscar el pedido, aunque los datos sean correctos):
   - IP con **10 o más** fallos en los últimos **15 minutos**, o
   - número de pedido con **5 o más** fallos en los últimos **15 minutos**
   → devolver `{"status":"rate_limited"}` sin registrar otro intento.
5. **Validar forma:** número vacío o de más de 32 caracteres, o correo vacío o de más de 254
   → se trata como fallo (paso 7).
6. **Buscar** el pedido con `order_number = número` y `customer_email = correo`.
7. **Si no hay pedido:** insertar dos intentos fallidos (`ip` y `order`) y devolver
   `{"status":"not_found"}`.
8. **Si hay pedido:** devolver `{"status":"ok","order":{...}}` sin registrar intento.

**Límites conocidos (aceptados):**
- `x-forwarded-for` lo puede falsificar el cliente, así que el límite por IP es solo una
  primera barrera; el límite por número de pedido es el que protege un pedido concreto.
- Quien conozca un número ajeno puede bloquearlo 15 minutos con 5 correos falsos. Es una
  molestia temporal, no una fuga de datos, y el número (4 bytes aleatorios) no es adivinable.
- `authenticated` también recibe `execute` porque un admin con sesión abierta que visite
  `/seguimiento` llama como `authenticated`; no hay cuentas de cliente.

**Forma de `order` (lista cerrada de llaves):**

```json
{
  "order_number": "AIGO-3FA91C07",
  "created_at": "2026-09-20T18:04:00Z",
  "payment_status": "paid",
  "fulfillment_status": "shipped",
  "shipping_city": "Guadalajara",
  "shipping_state": "Jalisco",
  "shipping_carrier": "DHL",
  "shipping_service": "Express",
  "tracking_number": "1234567890",
  "tracking_url": "https://…",
  "subtotal_cents": 170000,
  "shipping_cost_cents": 15000,
  "total_cents": 185000,
  "items": [
    { "product_name": "…", "variant_label": "…", "quantity": 2,
      "unit_price_cents": 85000, "line_total_cents": 170000 }
  ],
  "history": [
    { "status": "paid", "note": "Pago confirmado", "created_at": "…" }
  ]
}
```

`items` ordenados por `created_at`; `history` por `created_at` ascendente. Listas vacías
se devuelven como `[]`, nunca `null`.

**Nunca aparecen:** `id`, `customer_name`, `customer_email`, `customer_phone`,
`shipping_address`, `shipping_postal_code`, `shipping_service_code`, `variant_id`,
`stripe_payment_intent_id`, `stripe_checkout_session_id`.

Las tablas `orders`, `order_items` y `order_status_history` **no reciben políticas nuevas**:
siguen cerradas a `anon` y a usuarios autenticados sin `is_admin`.

### Semilla

`supabase/seed.sql` añade 3 pedidos con correo `cliente@aigo.local`, con sus `order_items`
(snapshot de productos sembrados) y su `order_status_history`, con `order_number` fijo para
poder probarlos a mano:

| pedido | pago | envío | extra |
|---|---|---|---|
| `AIGO-SEED0001` | `pending` | `pending` | — |
| `AIGO-SEED0002` | `paid` | `preparing` | — |
| `AIGO-SEED0003` | `paid` | `shipped` | carrier, servicio, guía y `tracking_url` |

Los tests pgTAP que lean tablas de pedidos completas deben vaciarlas dentro de su
transacción (convención de la Fase 1: tests herméticos frente al seed).

## Frontend

### `src/lib/trackOrder.js` (módulo puro)

- `normalizeOrderNumber(value)`: `trim` + mayúsculas.
- `displayStatus(payment_status, fulfillment_status) → { key, label }`, en este orden de
  prioridad:

  | condición | etiqueta |
  |---|---|
  | `fulfillment_status = cancelled` | Cancelado |
  | `payment_status = refunded` | Reembolsado |
  | `payment_status = failed` | Pago rechazado |
  | `payment_status = pending` | Esperando pago |
  | `paid` + `pending` | Pago confirmado |
  | `paid` + `preparing` | En preparación |
  | `paid` + `shipped` | Enviado |
  | `paid` + `delivered` | Entregado |

- `historyLabel(status)`: etiqueta en español para cada entrada de la línea de tiempo
  (`pending`, `paid`, `failed`, `refunded`, `preparing`, `shipped`, `delivered`,
  `cancelled`); un estado desconocido se muestra tal cual.
- `trackOrder(orderNumber, email)`: llama `supabase.rpc('track_order', …)` y devuelve
  `{ status: 'ok', order } | { status: 'not_found' } | { status: 'rate_limited' } |
  { status: 'error' }`. Cualquier error de la RPC o respuesta con forma inesperada →
  `'error'`.

### `src/views/user/TrackingView.vue` (reescritura)

Conserva el estilo visual actual (buscador, insignia de estado, línea de tiempo, tarjetas).

- Dos campos: número de pedido y correo. El botón se activa solo con ambos llenos.
- Si la URL trae `?pedido=AIGO-…`, se rellena el número (el cliente solo escribe su correo).
  Deja listo el enlace que usarán la página de éxito y el correo de la 2c.
- Estados de la pantalla:
  - `ok` → detalle del pedido.
  - `not_found` → "No encontramos un pedido con ese número y correo."
  - `rate_limited` → "Demasiados intentos. Intenta de nuevo en unos minutos."
  - `error` → "No pudimos consultar tu pedido. Intenta de nuevo."
- Botón deshabilitado mientras la consulta está en curso.
- Tarjeta de productos: nombre, variante, cantidad, importe; subtotal, envío y total, todo
  con `formatMXN` (centavos).
- Tarjeta de envío: ciudad y estado; paquetería y servicio si existen; número de guía; botón
  "Rastrear paquete" si hay `tracking_url`. **Sin** nombre, calle ni CP.
- Deja de importar `src/stores/orders.js`.

## Pruebas

**pgTAP — `supabase/tests/08_track_order_test.sql`:**

- Número + correo correctos → `status = ok` y el pedido esperado; el correo funciona con
  otras mayúsculas y con espacios alrededor; el número funciona en minúsculas.
- Número inexistente y correo equivocado → respuestas **idénticas** (`{"status":"not_found"}`).
- El objeto `order` tiene exactamente la lista cerrada de llaves (ninguna prohibida).
- 10 fallos desde una IP → el siguiente intento, aunque sea correcto, da `rate_limited`.
- 5 fallos contra un número (con IPs distintas) → ese número da `rate_limited`.
- Un intento exitoso no inserta filas en `track_order_attempts`.
- Permisos: `anon` puede ejecutar `track_order`; `anon` y `authenticated` sin `is_admin`
  siguen sin poder leer `orders`, `order_items` ni `order_status_history`; nadie fuera de la
  función lee `track_order_attempts`.

La IP se simula con `set_config('request.headers', '{"x-forwarded-for":"…"}', true)`.

**Vitest — `src/lib/trackOrder.test.js`:** `normalizeOrderNumber`, cada fila de la tabla de
`displayStatus`, `historyLabel` (incluido el desconocido) y `trackOrder` con el cliente
mockeado (ok, not_found, rate_limited, error de red, forma inesperada).

**Manual (navegador):** los 3 pedidos sembrados, un correo equivocado, el bloqueo tras
varios intentos y el enlace `?pedido=`.

## Fuera de alcance

- Pantalla de pedidos del admin (cambiar estado, pegar guía): Fase 2c, con pedidos reales.
- Correos al cliente.
- Rastreo en vivo con la paquetería (descartado en el spec de la Fase 1).
- Pedidos viejos guardados en `localStorage`.

## Archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/<timestamp>_track_order.sql` | Nuevo: tabla de intentos + función |
| `supabase/seed.sql` | 3 pedidos de ejemplo |
| `supabase/tests/08_track_order_test.sql` | Nuevo |
| `src/lib/trackOrder.js` + `.test.js` | Nuevos |
| `src/views/user/TrackingView.vue` | Reescritura |

## Criterios de éxito

1. Con los pedidos sembrados, número + correo correctos muestran el pedido en `/seguimiento`.
2. Cualquier otra combinación muestra el mismo "no encontrado".
3. Tras el límite de intentos, la pantalla muestra el aviso de bloqueo.
4. La respuesta de la RPC nunca incluye datos personales fuera de ciudad y estado.
5. `anon` sigue sin poder leer las tablas de pedidos directamente.
6. `supabase test db`, `npm test` y `npm run build` en verde.
