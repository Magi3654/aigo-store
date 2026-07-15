# Diseño: Fase 2a — Cableado del cliente + catálogo real

**Fecha:** 2026-07-14
**Estado:** Aprobado (diseño) — pendiente de plan de implementación
**Rama:** `feature/supabase-backend`
**Precede a:** 2b (auth admin + CRUD), 2c (checkout + pagos), 2d (seguimiento)

## Contexto

La Fase 1 dejó el backend de Supabase (esquema + RLS + seed, 88/88 tests) listo pero
**desconectado del frontend**. Hoy el SPA de Vue lee un array hardcodeado de 12 productos
en `src/stores/products.js` y no importa `@supabase/supabase-js`.

Esta sub-fase conecta el frontend al stack **local** de Supabase y reescribe el **camino de
lectura del catálogo** para que salga de la BD real vía RLS anon, adoptando el modelo
producto+variante y precios en centavos. Es la rebanada de-riesgo que establece los patrones
de integración (cliente, env, manejo de errores async) antes de tocar dinero en 2c.

## Alcance

**Incluye:**
- Instalar y configurar `@supabase/supabase-js` (cliente + variables de entorno).
- Reescribir el store `products` para leer de la BD (Enfoque A: store con caché fetch-una-vez).
- Adoptar el modelo producto+variante en el frontend; precios en centavos con un helper de formato.
- Reescribir el camino de lectura público: `HomeView`, `ProductsView`, `ProductDetailView`.
- Migrar el carrito a su shape canónico (`variant_id` + snapshot en centavos), con shims de
  compatibilidad temporales para no romper `CheckoutView`.
- `CartView` al shape nuevo.
- Placeholder "en construcción (2b)" en el admin `ProductsManageView`.
- Introducir **Vitest** y tests unitarios sobre las funciones puras.

**No incluye (no-goals, con su fase):**
- Auth de admin real + CRUD vía RLS → **2b**.
- Edge Functions, Stripe, Skydropx, checkout real, retiro de `shipping.js` → **2c**.
- Edge Function `track-order` + rewiring de `TrackingView` → **2d**.
- Deploy a la nube. 2a apunta **solo al stack local**.
- Persistencia del carrito en `localStorage` (queda en memoria de Pinia como hoy).
- UI de selección de variante múltiple (el seed da 1 variante por producto; se auto-selecciona).
- Tests de componente con `@vue/test-utils` (opcionales/diferidos).

## Arquitectura y archivos nuevos

| Archivo | Propósito |
|---|---|
| `src/lib/supabase.js` | Crea y exporta el cliente desde `import.meta.env.VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Único punto de creación del cliente. |
| `src/lib/format.js` | `formatMXN(cents)` → `"$1,234.00"` vía `Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' })` sobre `cents/100`. Fuente única de formato de precio. |
| `src/lib/mapProduct.js` | `mapProductRow(row)` puro: fila BD (producto con `product_variants` anidadas) → shape de frontend. Aislado para testear sin red. |
| `.env.local` | **gitignored.** URL + anon key del stack local. |
| `.env.example` | **commiteado.** Mismos valores locales (la anon key local es un JWT de demo conocido, no secreto). Documenta las variables requeridas. |

`@supabase/supabase-js` se añade a `dependencies`. `vitest` (+ `jsdom` si hiciera falta para
algún test) a `devDependencies`, con script `test` (o `test:unit`) en `package.json`.

`.gitignore` gana `.env.local` (y `.env*.local`).

## Mapeo de datos (BD → frontend)

`mapProductRow(row)` produce:

```js
{
  id,            // uuid del producto
  name,
  group,
  category,
  description,
  image_url,
  variants: [    // solo activas (RLS anon ya las filtra)
    { id, label, price_cents, stock, weight_grams, sku, image_url }
  ],
  defaultVariant // variants[0] ?? null
}
```

Query base: `supabase.from('products').select('*, product_variants(*)')`.
La RLS anon devuelve solo `products`/`product_variants` con `is_active = true`, así que no se
añade filtro de actividad en el cliente. El orden puede fijarse con `.order('name')`.

Como el seed creó exactamente **una variante `"Único"` por producto**, `defaultVariant` es la
variante comprable; el detalle la auto-selecciona sin UI de selector. El array `variants`
existe desde ya para que 2c y la futura multi-variante no re-plomeen el modelo.

**Caso borde:** un producto sin variante activa da `defaultVariant = null`. Aunque el seed
garantiza una por producto, las vistas **no asumen** que exista: si `defaultVariant` es `null`,
el producto se muestra como "no disponible" (sin precio, sin botón de compra) en vez de
crashear al leer `defaultVariant.price_cents`. Esta guarda va en todas las vistas de catálogo.

## Store `products` (Enfoque A: gordo con caché)

**Estado:** `products` (ref `[]`), `loading` (ref `false`), `error` (ref `null`),
`loaded` (ref `false`).

**Acciones:**
- `fetchProducts()` — si `loaded` y sin error, no-op (idempotente). Marca `loading`, ejecuta la
  query, mapea con `mapProductRow`, llena `products`, `loaded = true`. En fallo, setea `error`
  (no lanza) y deja `loading = false`.
- `fetchProductById(id)` — `.eq('id', id).single()`; mapea y devuelve el producto (o `null` si
  no existe / error). Para deep-link o refresh directo a `/producto/:uuid` sin lista cargada.

**Computados:** `categories`, `groups` — `[...new Set(...)]` sobre `products` cargados.

**Se eliminan** (pasan a 2b, admin vía RLS): `getProductById(Number)`, `addProduct`,
`updateProduct`, `deleteProduct`, y el array hardcodeado.

## Carrito y frontera con CheckoutView

**Shape canónico del item** (fuente de verdad para 2c):
`{ variant_id, product_id, product_name, variant_label, unit_price_cents, image_url, stock, quantity }`.

**Shims de compatibilidad temporales:** cada item lleva *además* los campos planos que
`CheckoutView` (WIP intocable, se reescribe en 2c) espera hoy, como propiedades planas:
`id = variant_id`, `name = product_name`, `price = unit_price_cents / 100`, `image = image_url`.
El store expone `subtotalCents` (canónico) **y** `subtotal` (pesos, `= subtotalCents/100`) para
`CheckoutView`. Estos alias están marcados en el código como cruft temporal; **2c los elimina**
al reescribir el checkout. `CheckoutView` no se modifica en 2a.

**Acciones del carrito:**
- `addItem(product, variant, quantity = 1)` — dedupe por `variant_id`; si existe, suma cantidad
  (clamp a `variant.stock`); si no, empuja el snapshot con ambos juegos de campos.
- `removeItem(variantId)`, `updateQuantity(variantId, qty)` (clamp `1..stock`), `clearCart()`.

**Computados:** `totalItems` (suma de cantidades), `subtotalCents`, `subtotal` (shim).

`CartView` se reescribe al shape canónico (usa `variant_id`, `variant_label`, `formatMXN`).

> Nota de compatibilidad de claves: `CheckoutView` y `CartView` usan `:key="item.id"`. Con el
> shim `id = variant_id` ambas siguen teniendo una clave estable y única por renglón.

## Cambios por vista

| Vista | Cambio |
|---|---|
| `HomeView` | Dispara `fetchProducts()` on-mount; estados loading/error/empty; `formatMXN(defaultVariant.price_cents)`; `image_url`. |
| `ProductsView` | `fetchProducts()` on-mount; filtros por `category`/`group` desde el store; loading/error/empty; precio/stock/imagen desde `defaultVariant`/`image_url`. |
| `ProductDetailView` | De computado síncrono a async: intenta caché (`products` por `id` string) y cae a `fetchProductById(uuid)`; estados loading/no-encontrado; `addItem(product, defaultVariant, qty)`; stock/precio desde `defaultVariant`. |
| `CartView` | Reescrita al shape canónico + `formatMXN`. |
| `ProductsManageView` (admin) | Reemplazada por un placeholder "en construcción (2b)" para no crashear con el shape nuevo. |
| `AdminLogin` / `DashboardView` / `OrdersView` | Sin cambios. No crashean por el cambio de shape; el conteo de productos del Dashboard puede salir vacío hasta 2b (aceptado). |
| `NavBar` | Sin cambios (solo usa `cart.totalItems`). |
| `CheckoutView` | **No se toca** (WIP + 2c). Funciona vía los shims del carrito. |
| Guard de router | Sin cambios (`localStorage` es el auth falso; lo reemplaza 2b). |

## Manejo de errores y estados asíncronos

El catálogo pasa de síncrono a asíncrono. Cada vista de lectura maneja tres estados:
- **Cargando:** indicador simple (spinner/skeleton) mientras `loading`.
- **Error:** mensaje claro + botón "Reintentar" que re-invoca la acción. El store captura el
  error en `error` en lugar de lanzar, para que la vista decida la UX.
- **Vacío:** catálogo sin filas o filtro sin coincidencias → mensaje neutro.

`fetchProductById` que devuelve `null` en el detalle → vista "producto no encontrado".

## Testing

**Vitest** (net-new; el repo no tiene runner de JS hoy). TDD sobre las costuras puras:
- `mapProductRow`: fila BD (incluida `product_variants` anidada, producto sin variantes,
  múltiples variantes) → shape esperado; `defaultVariant` correcto.
- `formatMXN`: centavos → cadena MXN; 0, miles, negativos defensivos.
- Carrito: `addItem` dedupe por `variant_id`, suma con clamp a `stock`, `subtotalCents`, y que
  los shims (`price`, `subtotal`) queden consistentes con los campos canónicos.

**Verificación en vivo** (skill `verify`/`run`): levantar Vite contra el stack local y
confirmar que el catálogo proviene de la BD (p. ej. verificar un dato presente en la BD pero
no en el viejo array, o que los precios llegan desde `price_cents`) y que Home → Products →
Detail → agregar al carrito → Cart funciona end-to-end.

Los tests de componente (`@vue/test-utils`) quedan diferidos: el valor de 2a está en las
funciones puras y en la verificación en vivo.

## Criterios de éxito

1. El catálogo de Home/Products/Detail se renderiza desde la BD local (no del array hardcodeado).
2. Agregar al carrito, ver el carrito y navegar funcionan; `CheckoutView` sigue operando sin
   modificarlo.
3. Deep-link directo a `/producto/:uuid` carga el producto vía `fetchProductById`.
4. Estados de carga/error/vacío visibles y con reintento.
5. `npm run test` (Vitest) verde sobre las funciones puras.
6. El admin `ProductsManageView` muestra el placeholder sin lanzar errores.

## Dependencias y riesgos

- Requiere el **stack local de Supabase corriendo** (ya lo está). Sin cuentas externas ni deploy.
- La anon key local va en `.env.example` (no secreto). Al pasar a la nube (2c) se cambia el
  `.env.local` por los valores del proyecto real; el código no cambia.
- Los shims del carrito son deuda técnica **intencional y acotada**; 2c debe eliminarlos al
  reescribir el checkout (anotarlo como tarea de 2c).
