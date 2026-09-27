# Diseño: Fase 2b — Auth de admin + CRUD de catálogo

**Fecha:** 2026-08-01
**Estado:** Aprobado (diseño) — pendiente de plan de implementación
**Depende de:** Fase 1 (esquema + RLS, 88 tests pgTAP) y Fase 2a (cableado del catálogo público)
**Rama:** `feature/supabase-backend`

## Contexto

Tras la Fase 2a la tienda pública ya lee productos y variantes desde Supabase con la
llave `anon` y la RLS de solo-lectura. El panel de administración, en cambio, sigue
siendo el de la demo original:

- `src/views/admin/AdminLogin.vue:11` compara contra la cadena `'aigo2026'`, que viaja
  en el bundle de JavaScript.
- `src/router/index.js:27` protege las rutas con `localStorage.getItem('aigo_admin')`,
  una bandera que cualquiera escribe desde la consola del navegador.
- `src/components/AdminLayout.vue:7` "cierra sesión" borrando esa misma bandera.
- `DashboardView` y `OrdersView` leen pedidos inventados de `localStorage` vía
  `src/stores/orders.js`.
- `ProductsManageView` es el placeholder que dejó la Fase 2a.

Esta fase sustituye esa capa por autenticación real de Supabase, un guard basado en
`is_admin()` y el CRUD de productos y variantes contra la base de datos. La RLS que lo
respalda ya existe y está probada desde la Fase 1: `products_admin_write` y
`variants_admin_write` (ambas `for all` con `public.is_admin(auth.uid())`).

## Alcance

**Incluye:** login con Supabase Auth, guard real de rutas, CRUD de productos y sus
variantes, despublicado (soft delete), dashboard con métricas de catálogo, cierre del
registro público de usuarios y siembra de un admin local.

**No incluye:** subida de imágenes a Storage (el campo sigue siendo una URL de texto),
recuperación o cambio de contraseña, UI para administrar varios admins, edición de la
tabla `settings` (se hace en la Fase 2c, que es donde se necesita para cotizar envíos) y
toda la gestión de pedidos (Fase 2c, cuando las Edge Functions empiecen a crearlos).

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Alcance de 2b | Auth + CRUD de catálogo. Los pedidos esperan a 2c. |
| Imágenes | Campo de texto con la URL. Storage queda para una fase propia, sin cambiar el esquema. |
| Forma de la UI | Una sola ruta `/admin/productos`: lista + modal de edición con las variantes en el mismo formulario. |
| Borrado | Despublicar (`is_active = false`), reversible. Nada de `DELETE`. Única excepción: al crear un producto, si el insert de sus variantes falla, se borra el producto recién insertado (nunca tuvo variantes ni pedidos). |
| Dashboard | Métricas reales de catálogo. `OrdersView` pasa a placeholder honesto. |
| Alta de admin | Sembrada en `seed.sql` para desarrollo local; documentada para la nube. |
| Registro público | Deshabilitado (`enable_signup = false`). |

---

## Arquitectura

### Capa de autenticación

**`src/stores/auth.js`** (Pinia, setup store) es la única fuente de verdad de la sesión.

| miembro | tipo | qué hace |
|---|---|---|
| `session` | ref | sesión de Supabase o `null` |
| `user` | ref | usuario autenticado o `null` |
| `isAdmin` | ref | `profiles.is_admin` del usuario actual |
| `initialized` | ref | evita repetir `init()` en cada navegación |
| `loading`, `error` | ref | estado para la vista de login |
| `init()` | acción | `getSession()` → carga el perfil → se suscribe a `onAuthStateChange`. Idempotente. |
| `signIn(email, password)` | acción | autentica y valida que sea admin |
| `signOut()` | acción | `supabase.auth.signOut()` y limpia el estado |

`init()` se suscribe a `onAuthStateChange` para que el estado siga siendo correcto cuando
el token se refresca solo o cuando la sesión se cierra en otra pestaña.

`signIn` tiene una regla explícita: si las credenciales son válidas pero el usuario **no**
es admin, se hace `signOut()` inmediato y se devuelve el error "esta cuenta no tiene
acceso al panel". Nunca queda una sesión a medias con la que el usuario crea estar dentro.

La sesión persiste donde la deja `supabase-js` por defecto (localStorage). Eso ya no es un
problema de seguridad: lo que se guarda es un JWT firmado con caducidad, no una bandera
booleana. Falsificarlo es imposible sin la llave del servidor.

### Guard de rutas

`src/router/guards.js` exporta una función pura `resolveAdminRoute(to, auth)` que devuelve
`true` o un objeto de redirección. `src/router/index.js` la usa dentro de un `beforeEach`
asíncrono que primero espera `auth.init()`.

Reglas:
1. Ruta con `meta.requiresAdmin` sin sesión o sin `isAdmin` → `AdminLogin` con
   `query.redirect = to.fullPath`.
2. Ruta `AdminLogin` con una sesión de admin ya activa → `AdminDashboard` (o el
   `redirect` recibido).
3. Cualquier otra ruta → `true`.

Separar la decisión en una función pura permite probarla con Vitest sin montar el router.

> **El guard es solo experiencia de usuario, no seguridad.** La barrera real es el JWT más
> la RLS: sin una fila en `profiles` con `is_admin = true`, PostgreSQL rechaza toda
> escritura aunque alguien fuerce la ruta a mano o llame a PostgREST directamente. Eso ya
> está probado en `supabase/tests/04_rls_catalog_test.sql`.

Se elimina toda referencia a `aigo_admin` del código.

### Store de catálogo de administración

**`src/stores/adminCatalog.js`**, separado del store público `src/stores/products.js`. Son
consumidores distintos de la misma tabla: el público es anónimo, cacheado y solo ve lo
activo; el de administración necesita ver todo, incluidos productos y variantes inactivos,
y no debe invalidar la caché del catálogo del cliente.

La consulta es la misma (`select('*, product_variants(*)')`), pero autenticado como admin
la política `products_admin_write` —que al ser `for all` cubre también `SELECT`— devuelve
las filas inactivas.

Acciones: `fetchAll()`, `createProduct(form)`, `updateProduct(form)`, `setProductActive(id, bool)`.

Las filas se mapean con un `mapAdminProductRow` propio que conserva `is_active`,
`sku` y las dimensiones. `src/lib/mapProduct.js` (público) **no se toca**: descarta
`is_active` a propósito y cambiarlo afectaría a la tienda.

### Módulos puros

Tres piezas se extraen de las vistas para poder probarlas sin base de datos ni DOM:

- **`src/lib/money.js`** — `pesosToCents('850.00') → 85000` usando `Math.round` para no
  arrastrar errores de punto flotante, y `centsToPesos(85000) → '850.00'` para rellenar el
  formulario. `formatMXN` sigue viviendo en `src/lib/format.js`.
- **`src/lib/validateProduct.js`** — valida el formulario antes de tocar la red y devuelve
  un mapa de errores por campo.
- **`src/lib/variantDiff.js`** — compara las variantes del formulario contra las cargadas y
  devuelve `{ toInsert, toUpdate, toDeactivate }`.

### Reglas de validación

| campo | regla |
|---|---|
| `name` | obligatorio, sin espacios sobrantes |
| `group` | obligatorio |
| `category` | dentro de `Albums, Lightsticks, Ropa, Photocards, Posters` (el mismo CHECK de la tabla) |
| `image_url` | opcional |
| variantes | al menos una activa si el producto está activo |
| `label` | obligatorio en cada variante |
| `price_cents` | entero ≥ 0 |
| `stock` | entero ≥ 0 |
| `weight_grams` | entero **> 0** |

La regla de `weight_grams` es más estricta que el CHECK de la base (`>= 0`)
deliberadamente: un peso de cero rompería la cotización de envíos de la Fase 2c, y es más
barato exigirlo al capturar que descubrirlo en el checkout.

**Invariante del catálogo:** un producto activo debe tener al menos una variante activa. Si
no, la tienda pública mostraría un producto sin nada comprable, porque `variants_read`
filtra las inactivas y `mapProductRow` devolvería `defaultVariant: null`. El formulario
bloquea guardar en ese estado.

### Traducción de errores de la base

Los códigos de PostgreSQL se convierten en mensajes que el admin entiende:

| código | mensaje |
|---|---|
| `23505` en `products.name` | "Ya existe un producto con ese nombre" |
| `23505` en `product_variants.sku` | "Ese SKU ya está en uso" |
| `42501` | "Tu cuenta no tiene permisos para esta acción" |
| cualquier otro | mensaje genérico con el detalle en consola |

---

## Interfaz

### `/admin/productos` — lista

Tabla con imagen miniatura, nombre, categoría, número de variantes, precio y stock
sumado. Controles: búsqueda por nombre, filtro por categoría, casilla "ver inactivos"
(apagada por defecto), y botón "Nuevo producto". Cada fila tiene editar (✎) y despublicar
o republicar (🗑 / ↺). Las filas inactivas se muestran atenuadas y con una etiqueta.

### Modal de producto

Campos del producto (nombre, grupo, categoría, URL de imagen, descripción, activo) y una
sección de variantes donde cada renglón captura etiqueta, precio en pesos, stock, peso en
gramos, SKU opcional y su propio `activo`. "Añadir variante" agrega un renglón vacío.

Semántica del borrado dentro del modal:

- Variante **ya guardada**: se marca `is_active = false`. No se borra, para no perder el
  vínculo con los `order_items` de pedidos futuros (`variant_id` es `ON DELETE SET NULL`,
  así que el pedido sobreviviría, pero se perdería la trazabilidad).
- Variante **recién añadida y aún sin guardar**: se quita del formulario sin tocar la base.

Guardar aplica el diff en una secuencia: `insert` o `update` del producto según sea nuevo,
y luego los `insert`, `update` y desactivaciones de variantes. Si algo falla, se muestra el error y se recarga el
producto desde la base para que el formulario no quede desincronizado.

### Dashboard

`DashboardView` deja de importar `src/stores/orders.js` y muestra métricas que sí existen
hoy, leídas de `adminCatalog`: productos activos e inactivos, total de variantes, unidades
en stock, variantes agotadas, valor del inventario (`Σ price_cents × stock`, mostrado con
`formatMXN`) y una lista de variantes con menos de 5 unidades.

### Pedidos

`OrdersView` pasa a ser un placeholder honesto ("disponible en la Fase 2c"), con el mismo
patrón que usó `ProductsManageView` en la Fase 2a. No se muestran datos falsos.

`src/stores/orders.js` **no se borra todavía**: `CheckoutView` y `TrackingView` siguen
dependiendo de él hasta las fases 2c y 2d.

---

## Cambios en base de datos y configuración

No hay migraciones nuevas: el esquema y la RLS de la Fase 1 ya cubren todo lo que esta
fase necesita. Los cambios son de configuración y siembra.

### `supabase/config.toml`

`enable_signup = false`. No existen cuentas de cliente por diseño (el checkout es de
invitado) y los admins se siembran a mano, así que el registro abierto solo es superficie
de ataque: permitiría llenar `auth.users` y gastar el envío de correos. Un usuario
registrado nunca ganaría permisos —no tendría fila en `profiles` e `is_admin()` devolvería
`false`— pero no hay razón para dejarlo abierto.

### `supabase/seed.sql`

Se añade un admin de desarrollo (`admin@aigo.local`) con su fila en `profiles`
(`is_admin = true`), bajo un comentario que deja claro que es **solo para el entorno
local**. Así, tras cada `supabase db reset`, se puede entrar al panel sin pasos manuales.
El despliegue a la nube no ejecuta `seed.sql`; ahí el admin se crea desde Supabase Studio y
se le inserta su fila en `profiles`, procedimiento que se documenta en el README.

### Riesgo conocido: tests pgTAP no herméticos

`supabase/tests/06_rls_profiles_settings_test.sql:89` hace `results_eq` sobre **toda** la
tabla `profiles` para comprobar que un admin ve todos los perfiles. Como la siembra corre
antes que los tests, la fila del admin sembrado rompería esa aserción. Se arregla con la
convención que ya se aprendió en la Fase 1: limpiar la tabla dentro de la transacción del
test antes de sembrar sus propios datos. Hay que revisar con el mismo criterio los tests
04, 05 y 06, que insertan en `profiles`.

---

## Pruebas

### Vitest (nuevas, con el cliente de Supabase mockeado)

| archivo | cubre |
|---|---|
| `src/stores/auth.test.js` | login correcto; credenciales inválidas; usuario válido pero no admin → `signOut` y error; `signOut` limpia el estado |
| `src/router/guards.test.js` | sin sesión redirige; sesión sin admin redirige; admin pasa; login con sesión activa rebota al dashboard; se conserva `redirect` |
| `src/lib/money.test.js` | `'850.00' → 85000`; `'0' → 0`; entradas vacías o no numéricas; decimales que sufrirían con float (`'19.99'`); ida y vuelta |
| `src/lib/validateProduct.test.js` | cada regla de la tabla de validación, incluido el invariante de la variante activa |
| `src/lib/variantDiff.test.js` | alta, edición, desactivación, sin cambios, y variante nueva sin guardar |

Los 15 tests de la Fase 2a deben seguir en verde.

### pgTAP

Ajustar los tests que rompa el admin sembrado y mantener los 88 existentes en verde.

### Verificación manual contra el stack local

1. Entrar con el admin sembrado; comprobar que una contraseña incorrecta falla.
2. Crear un producto con dos variantes; verlo aparecer en la tienda pública.
3. Editarlo: cambiar precio y stock, desactivar una variante.
4. Despublicarlo y confirmar que desaparece del catálogo público (anon) pero sigue
   visible en el panel con el filtro de inactivos.
5. Cerrar sesión y comprobar que `/admin/productos` redirige al login.

---

## Archivos afectados

**Nuevos:** `src/stores/auth.js`, `src/stores/adminCatalog.js`, `src/lib/money.js`,
`src/lib/validateProduct.js`, `src/lib/variantDiff.js`, `src/router/guards.js` y sus
archivos de prueba.

**Reescritos:** `src/views/admin/AdminLogin.vue`, `src/views/admin/ProductsManageView.vue`,
`src/views/admin/DashboardView.vue`, `src/views/admin/OrdersView.vue` (a placeholder),
`src/components/AdminLayout.vue` (cierre de sesión real), `src/router/index.js`.

**Configuración:** `supabase/config.toml`, `supabase/seed.sql`, tests pgTAP afectados,
`README.md` (cómo crear el admin en la nube).

**Intocados:** `src/lib/mapProduct.js`, `src/stores/products.js`, `src/stores/cart.js`,
las vistas de la tienda pública y `src/views/user/CheckoutView.vue`.

## Criterios de éxito

1. El login del panel usa Supabase Auth; no queda ninguna contraseña en el bundle ni
   ninguna referencia a `aigo_admin`.
2. Un usuario autenticado sin `is_admin` no entra al panel ni puede escribir en el
   catálogo.
3. El admin crea, edita y despublica productos y variantes desde la UI, y los cambios se
   reflejan en la tienda pública.
4. El dashboard muestra únicamente métricas reales de catálogo; ninguna pantalla muestra
   datos inventados.
5. Todas las pruebas en verde: las 15 de la Fase 2a, las nuevas de Vitest y las 88 de
   pgTAP.
6. `npm run build` compila sin errores.
