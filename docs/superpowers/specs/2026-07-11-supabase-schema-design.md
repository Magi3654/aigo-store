# Diseño: Backend Supabase para AIGO Store

**Fecha:** 2026-07-11
**Estado:** Aprobado (diseño) — pendiente de plan de implementación

## Contexto

AIGO Store es hoy una SPA de Vue 3 + Pinia **sin backend**: catálogo, carrito, pedidos
y "autenticación" de admin viven en `localStorage`. Eso hace imposible cobrar de forma
segura y expone varios problemas (contraseña de admin en el bundle, precios manipulables
en el cliente, PII sin cifrar, IDOR en el seguimiento de pedidos).

Este documento define el backend en **Supabase** (PostgreSQL + Auth + Edge Functions) que
sustituye a esa capa de `localStorage`, habilita pagos con **Stripe** y cotización de
envíos con **Skydropx** (agregador de DHL/FedEx/Estafeta para México).

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Cuentas de cliente | **Solo invitado.** Nadie se registra para comprar. |
| Variantes de producto | **Sí.** Precio y stock viven en la variante, no en el producto. |
| Inventario | **Descontar al pagar**, atómicamente, vía webhook de Stripe. |
| Envíos | **Solo cotizar** (no generar etiquetas) usando **Skydropx**. Con tarifa plana de fallback si la API falla. |
| Renglones de pedido | **Snapshot**: se congela nombre + precio al momento de comprar. |
| Moneda | MXN. Precios como **enteros en centavos** (evita errores de punto flotante y encaja con Stripe). |
| Identificadores | `uuid` en todas las tablas (no enumerables). |

## Alcance

**Incluye:** esquema relacional, RLS, autenticación de admin, Edge Functions para
checkout/pago/cotización/seguimiento, integración de Stripe (Checkout) y Skydropx (rating).

**No incluye (fuera de alcance por ahora):** generación de etiquetas/guías, tracking en
vivo del carrier dentro de la app, cuentas de cliente, multi-moneda, multi-admin con roles
granulares. La arquitectura queda lista para añadirlos después sin rehacer tablas.

---

## Esquema de datos (8 tablas)

Todas las llaves primarias son `uuid` con `default gen_random_uuid()`. Todas incluyen
`created_at timestamptz default now()` (y `updated_at` donde aplique).

### `products` — catálogo (agrupador)
| columna | tipo | notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `group` | text NOT NULL | grupo K-pop |
| `category` | text NOT NULL | CHECK IN (Albums, Lightsticks, Ropa, Photocards, Posters) |
| `description` | text | |
| `image_url` | text | |
| `is_active` | boolean NOT NULL default true | borrado suave / despublicar |

### `product_variants` — lo comprable (precio + stock)
| columna | tipo | notas |
|---|---|---|
| `id` | uuid PK | |
| `product_id` | uuid FK → products(id) ON DELETE CASCADE | |
| `label` | text NOT NULL | "Talla M", "Versión A", "Único" |
| `sku` | text UNIQUE | opcional |
| `price_cents` | integer NOT NULL | CHECK ≥ 0 |
| `stock` | integer NOT NULL default 0 | CHECK ≥ 0 |
| `weight_grams` | integer NOT NULL | requerido para cotizar envío |
| `length_cm` | integer | opcional (mejora la tarifa) |
| `width_cm` | integer | opcional |
| `height_cm` | integer | opcional |
| `image_url` | text | opcional, imagen propia de la variante |
| `is_active` | boolean NOT NULL default true | |

> Un producto sin variantes reales tiene una variante por defecto (`label = 'Único'`).

### `orders` — el pedido (cliente invitado)
| columna | tipo | notas |
|---|---|---|
| `id` | uuid PK | interno |
| `order_number` | text UNIQUE NOT NULL | "AIGO-XXXX" legible para el cliente |
| `customer_name` | text NOT NULL | |
| `customer_email` | citext NOT NULL | case-insensitive |
| `customer_phone` | text | |
| `shipping_address` | text NOT NULL | |
| `shipping_city` | text NOT NULL | |
| `shipping_state` | text NOT NULL | |
| `shipping_postal_code` | text NOT NULL | |
| `shipping_carrier` | text | "DHL", "FedEx", "Estafeta"… |
| `shipping_service` | text | "Express", "Nacional Terrestre"… |
| `shipping_service_code` | text | código que devuelve Skydropx |
| `shipping_cost_cents` | integer NOT NULL | recalculado en el servidor |
| `subtotal_cents` | integer NOT NULL | recalculado en el servidor |
| `total_cents` | integer NOT NULL | recalculado en el servidor |
| `payment_status` | text NOT NULL default 'pending' | pending \| paid \| failed \| refunded |
| `fulfillment_status` | text NOT NULL default 'pending' | pending \| preparing \| shipped \| delivered \| cancelled |
| `tracking_number` | text | el admin lo pega al enviar |
| `tracking_url` | text | opcional |
| `stripe_payment_intent_id` | text | |
| `stripe_checkout_session_id` | text | |

> Se separan **estado de pago** y **estado de envío** en dos columnas: con Stripe son ejes
> distintos (un pedido puede estar `paid` + `preparing`). La línea de tiempo del seguimiento
> los combina visualmente.

### `order_items` — renglones con snapshot
| columna | tipo | notas |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid FK → orders(id) ON DELETE CASCADE | |
| `variant_id` | uuid FK → product_variants(id) ON DELETE SET NULL | el pedido sobrevive si se borra la variante |
| `product_name` | text NOT NULL | **snapshot** |
| `variant_label` | text NOT NULL | **snapshot** |
| `unit_price_cents` | integer NOT NULL | **snapshot** |
| `quantity` | integer NOT NULL | CHECK > 0 |
| `line_total_cents` | integer NOT NULL | snapshot (unit × qty) |

### `order_status_history` — bitácora
| columna | tipo | notas |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid FK → orders(id) ON DELETE CASCADE | |
| `status` | text NOT NULL | |
| `note` | text | |
| `created_at` | timestamptz default now() | |

### `profiles` — quién es admin
| columna | tipo | notas |
|---|---|---|
| `id` | uuid PK FK → auth.users(id) | ligado a Supabase Auth |
| `is_admin` | boolean NOT NULL default false | **nunca** editable por el usuario |

### `settings` — configuración de la tienda (fila única)
| columna | tipo | notas |
|---|---|---|
| `id` | uuid PK | |
| `origin_address` | jsonb | dirección de origen para cotizar (calle, ciudad, estado, CP) |
| `fallback_standard_cents` | integer | tarifa plana si Skydropx falla |
| `fallback_express_cents` | integer | |

---

## Modelo de seguridad (RLS)

### Roles
- **`anon`** — visitante sin login (el cliente). Checkout de invitado.
- **`authenticated`** — usuarios con sesión; aquí solo entran los admins.
- **`service_role`** — omite RLS; **solo dentro de Edge Functions**.

### Principio central
El cliente (`anon`) **solo puede LEER el catálogo**. Todo lo sensible (crear pedido, cobrar,
cotizar, rastrear) pasa por Edge Functions con `service_role`. Esto elimina el panel-admin
falso, los precios falsificables y la enumeración de pedidos.

### Función auxiliar
`is_admin(uid uuid) returns boolean` — `SECURITY DEFINER`, consulta `profiles.is_admin`.
Se usa en las políticas: `USING (is_admin(auth.uid()))`.

### Políticas por tabla
| tabla | anon | authenticated (admin) | escritura |
|---|---|---|---|
| `products` | SELECT `is_active = true` | SELECT todo | INSERT/UPDATE/DELETE solo admin |
| `product_variants` | SELECT activos | SELECT todo | solo admin |
| `orders` | sin acceso | SELECT; UPDATE solo campos de envío/estado | INSERT solo `service_role`; `payment_status` solo webhook |
| `order_items` | sin acceso | SELECT | solo `service_role` |
| `order_status_history` | sin acceso | SELECT | admin / `service_role` |
| `profiles` | sin acceso | SELECT propio; admin ve todos | `is_admin` solo se siembra a mano / `service_role` |
| `settings` | sin acceso | SELECT/UPDATE admin | admin / `service_role` |

### Seguimiento sin IDOR
El cliente no consulta `orders` directo. La Edge Function `track-order` exige
**`order_number` + `customer_email`** y devuelve solo un subconjunto seguro (estado, línea de
tiempo, productos, carrier + rastreo). Con rate-limiting para evitar fuerza bruta.

### Admin real
Sin contraseña hardcodeada ni bandera de `localStorage`. El admin inicia sesión con
**Supabase Auth**; su permiso se valida con `is_admin()`. Los admins se crean sembrando
`profiles.is_admin = true` manualmente (no hay auto-registro).

### Secretos
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SKYDROPX_API_KEY` viven en los secretos de
Supabase y solo son visibles dentro de las Edge Functions. En el frontend solo va la llave
pública `pk_...` de Stripe.

---

## Edge Functions (4) y flujo

| función | quién llama | qué hace |
|---|---|---|
| `quote-shipping` | anon | CP + carrito → lee pesos/dimensiones → Skydropx → opciones (o fallback) |
| `create-checkout` | anon | crea pedido + sesión de Stripe con montos recalculados en servidor |
| `stripe-webhook` | Stripe | confirma pago (firma verificada), descuenta stock, marca pagado |
| `track-order` | anon | seguimiento con número + email, rate-limited |

### Flujo de compra y pago
1. Cliente arma carrito → solo manda `variant_id` + cantidad.
2. Ingresa CP → `quote-shipping` → opciones de Skydropx (o tarifa fallback).
3. Elige envío + da sus datos → `create-checkout`.
4. `create-checkout` (`service_role`):
   - Lee **precios y stock reales** de la BD (ignora precios del cliente).
   - Valida stock disponible.
   - Recalcula subtotal + envío + total.
   - Inserta `order` (`payment_status = pending`) + `order_items` (snapshot).
   - Crea Stripe Checkout Session por el total real; guarda `stripe_checkout_session_id`.
   - Devuelve la URL de Stripe.
5. Cliente paga en la página de Stripe → la tarjeta **nunca toca el servidor** (PCI SAQ-A).
6. Stripe dispara evento → `stripe-webhook`.
7. `stripe-webhook` (verifica firma):
   - Marca `order.payment_status = paid`.
   - **Descuenta stock atómicamente** (una transacción; si dos compran la última pieza,
     solo una gana).
   - Agrega entrada a `order_status_history`.
   - Dispara email de confirmación.
8. Cliente ve su número de pedido en la página de éxito.

> El pedido se crea **antes** de pagar (estado `pending`) para tener el número; se vuelve
> real solo cuando el webhook confirma. **Nunca** se marca pagado desde el regreso del
> navegador. Los pedidos `pending` no pagados quedan ahí (un job opcional los limpia).

### Seguimiento del paquete
Como el alcance es "solo cotizar", la app no jala el estado del carrier. El admin marca
"enviado" y pega el `tracking_number`; el cliente lo ve como enlace directo al sitio del
carrier.

### Operaciones del admin
El admin (autenticado + `is_admin`) habla directo a las tablas vía RLS:
- Productos/variantes: alta/edición/baja.
- Pedidos: actualiza `fulfillment_status` y `tracking_number` (el `payment_status` lo
  controla el webhook).
- Dashboard: lecturas con SQL (`SUM`, conteos por estado).

## Dependencias externas
- **Cuenta de Supabase** con un slot de proyecto libre (actualmente bloqueado por el límite
  del plan gratuito 2/2 — resolver antes de implementar).
- **Cuenta de Stripe** (llaves de test para desarrollo).
- **Cuenta de Skydropx** (llave de API).
- **Proveedor de email** (Resend / Postmark / Supabase) para confirmaciones — elegir al
  implementar.

## Migración desde el estado actual
- Los productos de `src/stores/products.js` se siembran en `products` + `product_variants`.
- Al pasar las zonas de envío a Skydropx se retira `src/stores/shipping.js` (y su bug de
  prefijos de CP duplicados `29`/`30` deja de existir).
- Los stores de Pinia dejan de leer/escribir `localStorage` y pasan a llamar a Supabase /
  Edge Functions. El carrito puede seguir en el cliente (Pinia + `localStorage`) hasta el
  checkout.

## Cumplimiento
- **PCI-DSS:** al usar Stripe Checkout, la tarjeta nunca toca nuestros servidores → alcance
  mínimo **SAQ-A**.
- **LFPDPPP (México):** se almacena PII (nombre, email, teléfono, dirección). Requiere aviso
  de privacidad y trato cuidadoso. Supabase cifra en reposo; RLS restringe el acceso.
