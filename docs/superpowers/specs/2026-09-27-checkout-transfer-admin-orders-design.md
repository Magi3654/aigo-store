# Diseño: Fase 2c-1 — Checkout real con transferencia + pedidos en el admin

**Fecha:** 2026-09-27
**Estado:** Aprobado (diseño por secciones en conversación). Falta revisar el spec escrito.
**Rama:** `feature/supabase-backend`
**Depende de:** Fase 1 (esquema + RLS), 2a (catálogo y carrito), 2b (auth admin), 2d (seguimiento)

## Contexto

`CheckoutView.vue` todavía guarda los pedidos en `localStorage` (`src/stores/orders.js`) y
calcula el envío por zonas de CP en el cliente (`src/stores/shipping.js`). El carrito conserva
shims temporales (`id/name/price/image`, `subtotal`) solo para esa vista. `anon` no puede
escribir en `orders`, y `admin/OrdersView.vue` es un placeholder.

La 2c completa (Stripe + Skydropx + deploy) está bloqueada hasta que la clienta cree sus
cuentas. Esta fase hace la parte que **no** depende de ellas. Además agrega un segundo método
de pago, **transferencia/depósito bancario**, para que la tienda pueda vender antes de Stripe.
Cuando llegue Stripe, la tarjeta se suma como otra opción; la transferencia no se retira.

## Objetivo

1. El cliente compra como invitado: da sus datos, elige el envío (tarifa plana), paga por
   transferencia y recibe su número de pedido con los datos bancarios y una fecha límite.
2. El pedido se crea **en el servidor** con precios y stock reales. El stock queda apartado.
3. La admin ve los pedidos, confirma los pagos por transferencia, avanza el envío (con guía)
   y cancela pedidos. El stock vuelve solo al cancelar.
4. Las transferencias sin pagar vencen solas a las 48 h y devuelven el stock.

## Decisiones

| Tema | Decisión |
|---|---|
| Métodos de pago | `transfer` (ya) y `card` (Stripe, después). Conviven. |
| Crear el pedido | **RPC de Postgres `create_order` (`security definer`)**, igual que `track_order`. La futura Edge Function de Stripe la reutiliza. |
| Stock | **Se aparta al crear el pedido.** Vuelve al cancelar o vencer. |
| Vencimiento | Transferencias sin pagar: **48 h**, las cancela **pg_cron** cada 15 min. |
| Comprobante | Por **WhatsApp/email** con el número de pedido. No se suben archivos. |
| Envío | Tarifa plana Estándar/Exprés desde `settings`. Se retira `shipping.js`; Skydropx llega en la 2c-Stripe. |
| Escrituras del admin sobre pedidos | **Solo por RPC.** Se quita el UPDATE directo de columnas: así nadie pone `cancelled` sin devolver stock ni envía un pedido sin pagar. |
| Datos bancarios y tarifas | Columnas nuevas en `settings`, cargadas por seed/SQL. **El formulario del admin queda para después.** |
| Emails | Fuera de alcance: la confirmación se ve en pantalla y en /seguimiento. |

## Base de datos

### Cambios de esquema (migración nueva)

**`orders`:**
- `payment_method text not null check (payment_method in ('transfer','card'))`. La
  migración la agrega con `default 'transfer'` (para rellenar los pedidos existentes) y
  luego le quita el default. `supabase/seed_orders.sql` se actualiza para incluir la
  columna.
- `payment_due_at timestamptz`: `created_at + 48 h` para `transfer` y `null` para `card`.
- Índice parcial para el job de vencimiento:
  `(payment_due_at) where payment_status = 'pending' and fulfillment_status <> 'cancelled'`.

**`settings`** (todas nullable, excepto donde se indica):
- `bank_name`, `bank_account_holder`, `bank_clabe` (`check (bank_clabe ~ '^[0-9]{18}$')`).
- `payment_contact_whatsapp`, `payment_contact_email`.
- `standard_days text not null default '5-8'` y `express_days text not null default '2-3'`.
- `card_enabled boolean not null default false`. Lo prende la 2c-Stripe.
- El seed local llena valores ficticios de prueba (CLABE de 18 dígitos que no existe).

**`orders.payment_status`** conserva sus valores. Semántica en esta fase:
- Si se cancela o vence un pedido **sin pagar**, `payment_status` pasa a `failed` y
  `fulfillment_status` a `cancelled`.
- Si se cancela un pedido **pagado**, se queda `paid` + `cancelled` y el admin lo muestra
  como "Reembolso pendiente". El reembolso es manual y fuera de la app.

**Permisos:** `revoke update on public.orders from authenticated` (sin excepciones de
columna). La política `history_admin_insert` se queda, para las notas del admin.

**Extensión:** `create extension if not exists pg_cron`.

### Funciones

Todas llevan `security definer`, `set search_path = ''` y son de `postgres`. Se hace
`revoke execute ... from public`, y el `grant execute` se da explícito a quien corresponda.

#### `public.checkout_options() returns jsonb` (anon, authenticated)
Devuelve la configuración pública del checkout: `shipping` con
`[{code:'standard', label, cost_cents, days}, {code:'express', ...}]`, más `bank`
(`name, holder, clabe`), `contact` (`whatsapp, email`), `card_enabled` y
`transfer_hours: 48`. Nunca devuelve `origin_address` ni otras columnas.

#### `public.create_order(p_items jsonb, p_customer jsonb, p_shipping text, p_payment_method text) returns jsonb` (anon, authenticated)

- **Rate-limit:** tabla cerrada `create_order_attempts` (mismo patrón que
  `track_order_attempts`). Se cuenta **cada llamada** por IP (`x-forwarded-for`, primer salto)
  y con **≥ 5 en 15 min** responde `{status:'rate_limited'}`. Al entrar se purgan los
  registros de más de 1 día. (El spoofing de XFF sigue como pendiente del deploy, igual que en
  la 2d.)
- **Validación.** Cualquier fallo responde `{status:'invalid', field}` sin tocar nada:
  - `p_items`: arreglo de 1 a 50 elementos `{variant_id uuid, quantity int 1..99}`, sin
    `variant_id` repetidos.
  - `p_customer`: `name` (1–120), `email` (formato básico, ≤ 254), `phone` (10 dígitos tras
    quitar espacios y guiones), `address` (1–200), `city` y `state` (1–80) y `postal_code`
    (`^[0-9]{5}$`). Se aplica `trim` a todo.
  - `p_shipping`: `'standard' | 'express'`.
  - `p_payment_method`: si es `'card'` y `settings.card_enabled` es false →
    `{status:'payment_method_unavailable'}`. Hoy se acepta solo `'transfer'`.
- **Stock atómico:** se hace `select ... for update` de las variantes pedidas **ordenadas
  por id** (así dos pedidos concurrentes no se bloquean mutuamente), con join a su producto.
  Cada variante debe existir, estar activa y pertenecer a un producto publicado. Si no:
  `{status:'unavailable', variant_ids:[...]}`. Si `stock < quantity`:
  `{status:'insufficient_stock', items:[{variant_id, available}]}`. En ambos casos no se
  escribe nada.
- **Montos:** `unit_price_cents` sale de la DB; `subtotal` es la suma de las líneas;
  `shipping_cost_cents` sale de `settings.fallback_{standard|express}_cents` y
  `total = subtotal + envío`. Se guardan `shipping_service` ('Estándar'/'Exprés') y
  `shipping_service_code` (`standard`/`express`).
- **Escrituras:** se descuenta el stock y se insertan el `order` (con
  `payment_status='pending'`, `payment_due_at`), los `order_items` (snapshot de nombre,
  variante y precio) y el historial `('pending','Pedido creado')`.
- **Respuesta:** `{status:'ok', order_number, total_cents, subtotal_cents,
  shipping_cost_cents, payment_due_at}`. Los datos bancarios los tiene el frontend por
  `checkout_options()`.

#### `public.restock_and_cancel(p_order_id uuid, p_note text)` (interna, sin grants)
Toma el pedido con `for update`. Si ya está `cancelled` no hace nada, lo que la vuelve
idempotente. Si está `shipped` o `delivered`, lanza un error. Si no:
- devuelve el stock de cada `order_item` cuyo `variant_id` no sea null,
- pone `fulfillment_status='cancelled'`,
- pone `payment_status='failed'` si estaba `pending`,
- agrega una entrada al historial con la nota.

La usan la cancelación del admin y el job de vencimiento.

#### Funciones de admin (authenticated; cada una verifica `public.is_admin(auth.uid())` y si no → `42501`)
- **`admin_mark_paid(p_order_id)`**. Exige `payment_method='transfer'`,
  `payment_status='pending'` y no `cancelled`. Pone `paid` y agrega al historial
  `('paid','Pago por transferencia confirmado')`. No toca el stock, que ya estaba apartado.
- **`admin_cancel_order(p_order_id, p_note)`**. Llama a `restock_and_cancel`. La nota es
  obligatoria.
- **`admin_update_fulfillment(p_order_id, p_status, p_carrier, p_tracking_number,
  p_tracking_url, p_note)`**. Solo permite estas transiciones:
  - `pending → preparing`
  - `preparing → shipped`, que exige `p_carrier` y `p_tracking_number`
  - `shipped → delivered`

  En todos los casos el pedido tiene que estar `paid`. Registra el paso en el historial.
  Para cancelar se usa `admin_cancel_order`.
- **`admin_add_order_note(p_order_id, p_note)`**. Agrega una entrada al historial con el
  estado actual. (Opcional: también se puede usar el insert directo que ya permite RLS. Se
  prefiere la RPC para tener un solo camino.)

Violar una regla de negocio lanza una excepción con `errcode 'P0001'` y un mensaje estable
(`order_not_found`, `invalid_transition`, `not_paid`, `already_paid`, `not_transfer`, …) que
el frontend traduce.

#### `public.expire_unpaid_orders() returns int` (sin grants; solo cron)
Recorre los pedidos con `payment_method='transfer'`, `payment_status='pending'`,
`fulfillment_status <> 'cancelled'` y `payment_due_at < now()`, bloqueándolos con
`for update skip locked`. A cada uno le aplica `restock_and_cancel(id, 'Cancelado por falta
de pago')`. Devuelve cuántos canceló. Se programa con
`cron.schedule('expire-unpaid-orders', '*/15 * * * *', 'select public.expire_unpaid_orders()')`.

#### `track_order` (modificación)
Suma `payment_method` y `payment_due_at` a la respuesta. Los datos bancarios **no** van ahí:
/seguimiento los pide a `checkout_options()` cuando el pedido es una transferencia pendiente.

## Frontend

### Checkout (`src/views/user/CheckoutView.vue`, reescrita)
- Al montar, llama a `checkout_options()`. Si falla, muestra un error con "Reintentar".
- **Formulario:** nombre, email, teléfono, dirección, ciudad, estado y CP. La validación
  vive en `src/lib/validateCheckout.js` (pura, con vitest) y replica las reglas del servidor.
  Los errores se muestran por campo, en línea y con `aria-describedby`.
- **Envío:** radio Estándar/Exprés con el costo y los días de `checkout_options()`.
- **Pago:** radio con "Transferencia o depósito" (seleccionado) y "Tarjeta". Tarjeta queda
  `disabled` y con la etiqueta "Próximamente" mientras `card_enabled` sea false.
- **Resumen:** artículos, subtotal, envío y total. Es solo informativo.
- **Enviar:** `src/lib/checkout.js` expone `placeOrder({items, customer, shipping,
  paymentMethod})`. Arma el payload con solo `variant_id` + `quantity`, llama a la RPC y
  normaliza la respuesta a `{ok, order}` o `{ok:false, reason, detail}`. El botón queda
  deshabilitado mientras se envía.
  - Con `insufficient_stock` o `unavailable` se marcan los artículos afectados en el
    resumen, se ajusta el stock del carrito al disponible (y se quitan los que tienen 0) y se
    pide revisar.
  - Con `rate_limited`, un error de red u otro, aparece un mensaje y el formulario se
    conserva.
- **Éxito** (el carrito se vacía **solo** aquí). Se muestran:
  - el número `AIGO-XXXX` y el total a transferir,
  - banco, titular y CLABE, con un botón "Copiar CLABE",
  - la fecha límite formateada en `es-MX`,
  - "Envía tu comprobante con tu número de pedido a [WhatsApp] / [email]",
  - enlaces a /seguimiento y "Seguir comprando".

  El número de pedido y el correo también se guardan en `sessionStorage`, para que un
  refresh no los pierda y /seguimiento pueda llenarse solo.
- **Estilo:** los tokens del rediseño 2026-09-27, sin Font Awesome, plano (sin sombras ni
  degradados).

### Carrito
Se quitan los shims (`id`, `name`, `price`, `image`, `subtotal`) de `src/stores/cart.js`
y se actualizan sus tests. Se agrega `setAvailableStock(variantId, available)` para la
corrección tras un `insufficient_stock`. Antes de borrarlos se hace un grep para confirmar
que ninguna vista usa los shims.

### Limpieza
Se borran `src/stores/shipping.js` y `src/stores/orders.js`. No quedan imports.

### Seguimiento (`TrackingView.vue`)
Si el pedido es `transfer`, está `pending` y no está cancelado, se muestra un recuadro
"Pago pendiente — vence el …" con los datos bancarios (vía `checkout_options()`) y el
contacto. Si fue cancelado por falta de pago, se muestra como "Cancelado por falta de pago"
(eso viene de la nota del historial).

### Admin — store `src/stores/adminOrders.js`
- `fetchOrders({filter, search, page})`: lee `orders` por RLS en páginas de 25, ordenadas
  por `created_at desc`. Filtros:
  - `to_confirm`: transferencias pendientes no canceladas, ordenadas por `payment_due_at asc`
  - `to_ship`: pagados en `pending` o `preparing`
  - `shipped`
  - `cancelled`
  - `all`

  La búsqueda es por `order_number` o `customer_email` (`ilike`).
- `fetchOrder(id)`: el pedido con sus `order_items` y su `order_status_history`.
- Acciones: `markPaid`, `cancelOrder`, `updateFulfillment`, `addNote`. Cada una llama a su
  RPC y después refresca el pedido. Los errores se traducen con `src/lib/dbError.js`
  (se agregan los códigos nuevos).

### Admin — vistas
- **`OrdersView.vue`** (reemplaza al placeholder): pestañas por filtro con contador,
  búsqueda y lista con número, fecha, cliente, total, método y badges de pago y envío. En
  "Por confirmar" se muestra el tiempo restante. Cada fila abre el detalle.
- **`OrderDetailView.vue`**, en la ruta nueva `/admin/pedidos/:id` (con guard de admin):
  cliente y dirección (con "Copiar dirección"), artículos, totales e historial.
  - **Acciones según el estado:**
    - Marcar como pagado, con un diálogo: "¿Ya verificaste el depósito de $X en tu banco?".
    - Preparando.
    - Enviado: pide paquetería, guía y URL opcional.
    - Entregado.
    - Cancelar: motivo obligatorio y aviso de que el stock se devuelve. Si el pedido ya
      estaba pagado, recuerda que el reembolso es manual.
  - **Nota:** un campo con el aviso visible *"El cliente verá esta nota en /seguimiento"*.
- **Dashboard:** dos tarjetas nuevas, "Pagos por confirmar" y "Por enviar", con su conteo
  y un enlace al filtro correspondiente.

## Pruebas

**pgTAP** (archivos nuevos, herméticos: cada uno limpia en su transacción las tablas que lee):
- `create_order`:
  - camino feliz (montos calculados en el servidor aunque el cliente mande precios, stock
    descontado, snapshot, historial y `payment_due_at` ≈ +48 h),
  - cada rama de `invalid`, `unavailable` (inactiva, no publicada o inexistente) e
    `insufficient_stock` sin escribir nada,
  - `card` rechazado con `card_enabled=false`,
  - rate-limit en la 6.ª llamada,
  - `anon` puede ejecutarla pero no puede insertar en `orders`.
- `admin_mark_paid`, `admin_cancel_order` y `admin_update_fulfillment`: rechazan a los no
  admin (`42501`); se prueban las transiciones válidas e inválidas, la devolución de stock,
  la idempotencia de la cancelación, que no se pueda cancelar lo ya enviado y que la
  variante borrada (`variant_id` null) no rompa nada.
- `expire_unpaid_orders`: cancela solo las transferencias vencidas sin pagar, devuelve el
  stock e ignora los pedidos pagados y los que no han vencido. El job existe en `cron.job`.
- Permisos: `authenticated` ya no tiene UPDATE sobre `orders`, y `anon` no puede ejecutar
  las funciones de admin ni las internas.
- `checkout_options` no filtra `origin_address`. `track_order` devuelve los campos nuevos.
- Se actualizan los tests existentes de la Fase 1 que prueban el UPDATE de columnas del
  admin, porque ese permiso desaparece.

**vitest:** `validateCheckout`, `checkout.js` (normalización de cada `status`, con el
cliente de Supabase mockeado), `cart` (sin shims, `setAvailableStock`), `adminOrders`
(filtros, construcción de queries y acciones) y los códigos nuevos de `dbError`.

**QA visual headless** (Playwright, como en el rediseño): checkout a 375 px y escritorio,
éxito, error de stock, lista y detalle del admin.

**Smoke manual (usuaria):** hacer una compra por transferencia → verla en el admin →
marcarla pagada → enviarla con guía → ver /seguimiento. Además, crear un pedido, cancelarlo
y verificar que el stock vuelve.

## Fuera de alcance
- Stripe (tarjeta), Skydropx, emails, deploy a la nube: 2c-Stripe.
- Formulario del admin para datos bancarios, tarifas y días: fase siguiente. Mientras
  tanto se editan por SQL.
- Reembolsos automáticos, exportar CSV, editar pedidos ya creados, subir comprobantes.
- Advisory lock del rate-limit (la carrera es la misma que en la 2d y se acepta).

## Notas para la 2c-Stripe
- `create-checkout` (Edge Function) llamará a `create_order(..., 'card')` y después creará la
  sesión de Stripe. Hará falta un vencimiento corto (~30 min) para las tarjetas no
  confirmadas, que puede ser el mismo job con otro plazo.
- El webhook marcará `paid` sin tocar el stock, que ya estaba apartado.
