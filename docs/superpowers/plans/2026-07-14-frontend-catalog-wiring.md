# Fase 2a — Cableado del cliente + catálogo real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el SPA de Vue al stack local de Supabase y reescribir el camino de lectura del catálogo (Home/Products/Detail/Cart) sobre el modelo producto+variante real, con precios en centavos.

**Architecture:** Un módulo cliente (`src/lib/supabase.js`) + helpers puros (`format`, `mapProduct`). El store `products` (Enfoque A: gordo con caché fetch-una-vez) obtiene el catálogo vía RLS anon y lo mapea. El carrito adopta el shape canónico (`variant_id` + snapshot en centavos) con shims de compatibilidad para no tocar `CheckoutView`. Vitest cubre las funciones puras y los stores; el resto se verifica en vivo contra el stack local.

**Tech Stack:** Vue 3 (script setup) + Pinia + vue-router (existentes); `@supabase/supabase-js`; Vitest (nuevo).

## Global Constraints

- **Solo stack local.** El frontend apunta a `http://127.0.0.1:54321`. Sin deploy, sin cuentas externas.
- **Precios en centavos** como fuente de verdad en el frontend; formateo únicamente vía `formatMXN`. Moneda MXN.
- **No tocar `src/views/user/CheckoutView.vue`** (WIP sin commitear, territorio de 2c). Sigue funcionando vía los shims del carrito.
- **No tocar `src/stores/shipping.js`** ni el guard de router `localStorage` (territorio de 2c/2b).
- El modelo de datos ya existe (Fase 1): tablas `products` + `product_variants`, RLS anon devuelve solo filas `is_active = true`. El seed tiene 1 variante `"Único"` por producto.
- Las vistas **no asumen** que `defaultVariant` exista: si es `null`, muestran "no disponible" en vez de crashear.
- TDD: test que falla → implementación mínima → test verde → commit. Commits frecuentes.
- Valores del stack local (verificar con `supabase status -o env`):
  - `VITE_SUPABASE_URL=http://127.0.0.1:54321`
  - `VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `src/lib/supabase.js` | Crea/exporta el cliente Supabase | 1 |
| `src/lib/format.js` | `formatMXN(cents)` | 1 |
| `src/lib/mapProduct.js` | `mapProductRow(row)` puro | 2 |
| `src/stores/products.js` | Store del catálogo (fetch + caché) | 3 |
| `src/stores/cart.js` | Carrito canónico + shims | 4 |
| `src/views/user/HomeView.vue` | Destacados desde el store | 5 |
| `src/views/user/ProductsView.vue` | Lista + filtros | 5 |
| `src/views/user/ProductDetailView.vue` | Detalle async + add-to-cart | 6 |
| `src/views/user/CartView.vue` | Carrito al shape nuevo | 7 |
| `src/views/admin/ProductsManageView.vue` | Placeholder "en construcción (2b)" | 7 |
| `vitest.config.js`, `.env.local`, `.env.example`, `package.json` | Tooling/config | 1 |

---

### Task 1: Tooling, env, cliente Supabase y `formatMXN`

**Files:**
- Modify: `package.json` (deps + scripts)
- Create: `vitest.config.js`
- Create: `.env.local`, `.env.example`
- Create: `src/lib/supabase.js`
- Create: `src/lib/format.js`
- Test: `src/lib/format.test.js`

**Interfaces:**
- Produces: `supabase` (cliente) desde `src/lib/supabase.js`; `formatMXN(cents: number): string` desde `src/lib/format.js`.

- [ ] **Step 1: Instalar dependencias**

```bash
npm install @supabase/supabase-js
npm install -D vitest
```

- [ ] **Step 2: Añadir scripts de test a `package.json`**

En la sección `"scripts"` añade:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Crear `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 4: Crear `.env.local` (ignorado por `*.local` en `.gitignore`)**

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

- [ ] **Step 5: Crear `.env.example` (commiteado)**

```
# Stack local de Supabase (supabase status -o env). La anon key local es un
# JWT de demo conocido, no es secreto. Para la nube (2c) se cambian estos
# valores por los del proyecto real; el codigo no cambia.
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

- [ ] **Step 6: Crear `src/lib/supabase.js`**

```js
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, anonKey)
```

- [ ] **Step 7: Escribir el test que falla — `src/lib/format.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { formatMXN } from './format.js'

describe('formatMXN', () => {
  it('formatea centavos como moneda MXN', () => {
    // 85000 centavos = $850.00 (price_cents = pesos x 100, ver seed.sql)
    expect(formatMXN(85000)).toBe('$850.00')
  })
  it('formatea cero', () => {
    expect(formatMXN(0)).toBe('$0.00')
  })
  it('trata null/undefined como cero', () => {
    expect(formatMXN(null)).toBe('$0.00')
    expect(formatMXN(undefined)).toBe('$0.00')
  })
})
```

- [ ] **Step 8: Correr el test y verlo fallar**

Run: `npm test -- format`
Expected: FAIL — `Cannot find module './format.js'` / `formatMXN is not a function`.

- [ ] **Step 9: Implementar `src/lib/format.js`**

```js
const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function formatMXN(cents) {
  return mxn.format((cents ?? 0) / 100)
}
```

- [ ] **Step 10: Correr el test y verlo pasar**

Run: `npm test -- format`
Expected: PASS (3 tests).
> Si tu runtime de node usa un ICU con símbolo distinto para MXN (p. ej. `MX$85,000.00`), ajusta las cadenas esperadas del test a lo que emita `formatMXN` — la función es correcta, solo cambia la representación local.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json vitest.config.js .env.example src/lib/supabase.js src/lib/format.js src/lib/format.test.js
git commit -m "feat(fe): add supabase client, vitest, and formatMXN helper"
```

---

### Task 2: Mapper puro `mapProductRow`

**Files:**
- Create: `src/lib/mapProduct.js`
- Test: `src/lib/mapProduct.test.js`

**Interfaces:**
- Produces: `mapProductRow(row)` → `{ id, name, group, category, description, image_url, variants: Array<{id,label,price_cents,stock,weight_grams,sku,image_url}>, defaultVariant }`. `defaultVariant = variants[0] ?? null`.

- [ ] **Step 1: Escribir el test que falla — `src/lib/mapProduct.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { mapProductRow } from './mapProduct.js'

const row = {
  id: 'p1', name: 'BTS Proof', group: 'BTS', category: 'Albums',
  description: 'desc', image_url: 'http://img/p1',
  product_variants: [
    { id: 'v1', label: 'Único', price_cents: 85000, stock: 15, weight_grams: 300, sku: null, image_url: null },
  ],
}

describe('mapProductRow', () => {
  it('mapea fila con una variante y fija defaultVariant', () => {
    const p = mapProductRow(row)
    expect(p.id).toBe('p1')
    expect(p.image_url).toBe('http://img/p1')
    expect(p.variants).toHaveLength(1)
    expect(p.variants[0].price_cents).toBe(85000)
    expect(p.defaultVariant).toBe(p.variants[0])
  })

  it('defaultVariant es null cuando no hay variantes activas', () => {
    const p = mapProductRow({ ...row, product_variants: [] })
    expect(p.variants).toEqual([])
    expect(p.defaultVariant).toBe(null)
  })

  it('con múltiples variantes, defaultVariant es la primera', () => {
    const p = mapProductRow({ ...row, product_variants: [
      { id: 'v1', label: 'A', price_cents: 100, stock: 1, weight_grams: 10, sku: null, image_url: null },
      { id: 'v2', label: 'B', price_cents: 200, stock: 2, weight_grams: 20, sku: null, image_url: null },
    ] })
    expect(p.defaultVariant.id).toBe('v1')
  })

  it('tolera product_variants ausente', () => {
    const { product_variants, ...noVariants } = row
    const p = mapProductRow(noVariants)
    expect(p.defaultVariant).toBe(null)
  })
})
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npm test -- mapProduct`
Expected: FAIL — módulo/función no existe.

- [ ] **Step 3: Implementar `src/lib/mapProduct.js`**

```js
export function mapProductRow(row) {
  const variants = (row.product_variants ?? []).map((v) => ({
    id: v.id,
    label: v.label,
    price_cents: v.price_cents,
    stock: v.stock,
    weight_grams: v.weight_grams,
    sku: v.sku ?? null,
    image_url: v.image_url ?? null,
  }))
  return {
    id: row.id,
    name: row.name,
    group: row.group,
    category: row.category,
    description: row.description ?? null,
    image_url: row.image_url ?? null,
    variants,
    defaultVariant: variants[0] ?? null,
  }
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `npm test -- mapProduct`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mapProduct.js src/lib/mapProduct.test.js
git commit -m "feat(fe): add pure mapProductRow mapper"
```

---

### Task 3: Reescribir el store `products`

**Files:**
- Modify: `src/stores/products.js` (reemplazo completo)
- Test: `src/stores/products.test.js`

**Interfaces:**
- Consumes: `supabase` (Task 1), `mapProductRow` (Task 2).
- Produces: store `products` con `products` (ref array), `loading`, `error` (string|null), `loaded`, `fetchProducts()`, `fetchProductById(id)` → producto mapeado | null, computados `categories`, `groups`.

- [ ] **Step 1: Escribir el test que falla — `src/stores/products.test.js`**

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const orderResult = { value: null }
const singleResult = { value: null }

vi.mock('../lib/supabase.js', () => {
  const q = {
    select: () => q,
    order: () => Promise.resolve(orderResult.value),
    eq: () => q,
    single: () => Promise.resolve(singleResult.value),
  }
  return { supabase: { from: () => q } }
})

import { useProductsStore } from './products.js'

const row = {
  id: 'p1', name: 'BTS Proof', group: 'BTS', category: 'Albums',
  description: 'd', image_url: 'img',
  product_variants: [{ id: 'v1', label: 'Único', price_cents: 85000, stock: 15, weight_grams: 300, sku: null, image_url: null }],
}

beforeEach(() => {
  setActivePinia(createPinia())
  orderResult.value = null
  singleResult.value = null
})

describe('products store', () => {
  it('fetchProducts mapea filas y marca loaded', async () => {
    orderResult.value = { data: [row], error: null }
    const store = useProductsStore()
    await store.fetchProducts()
    expect(store.loaded).toBe(true)
    expect(store.error).toBe(null)
    expect(store.products).toHaveLength(1)
    expect(store.products[0].defaultVariant.price_cents).toBe(85000)
    expect(store.categories).toEqual(['Albums'])
    expect(store.groups).toEqual(['BTS'])
  })

  it('fetchProducts registra el error y no marca loaded', async () => {
    orderResult.value = { data: null, error: { message: 'boom' } }
    const store = useProductsStore()
    await store.fetchProducts()
    expect(store.error).toBe('boom')
    expect(store.loaded).toBe(false)
    expect(store.products).toEqual([])
  })

  it('fetchProductById devuelve un producto mapeado', async () => {
    singleResult.value = { data: row, error: null }
    const store = useProductsStore()
    const p = await store.fetchProductById('p1')
    expect(p.name).toBe('BTS Proof')
    expect(p.defaultVariant.stock).toBe(15)
  })

  it('fetchProductById devuelve null en error', async () => {
    singleResult.value = { data: null, error: { message: 'nope' } }
    const store = useProductsStore()
    expect(await store.fetchProductById('x')).toBe(null)
  })
})
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npm test -- products`
Expected: FAIL — el store aún expone el array hardcodeado y `getProductById`, no `fetchProducts`.

- [ ] **Step 3: Reemplazar `src/stores/products.js` por completo**

```js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase.js'
import { mapProductRow } from '../lib/mapProduct.js'

export const useProductsStore = defineStore('products', () => {
  const products = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  async function fetchProducts() {
    if (loaded.value && !error.value) return
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .order('name')
    if (err) {
      error.value = err.message
    } else {
      products.value = data.map(mapProductRow)
      loaded.value = true
    }
    loading.value = false
  }

  async function fetchProductById(id) {
    const { data, error: err } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .eq('id', id)
      .single()
    if (err || !data) return null
    return mapProductRow(data)
  }

  const categories = computed(() => [...new Set(products.value.map((p) => p.category))])
  const groups = computed(() => [...new Set(products.value.map((p) => p.group))])

  return { products, loading, error, loaded, fetchProducts, fetchProductById, categories, groups }
})
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `npm test -- products`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/products.js src/stores/products.test.js
git commit -m "feat(fe): rewrite products store to fetch from Supabase"
```

> Nota: tras esta tarea, las vistas que aún leen `product.price`/`product.image` (Home/Products/Detail) y el admin `ProductsManageView` fallan en runtime hasta las Tareas 5–7. Es esperado; la app queda coherente al final (verificado en la Tarea 8). Los unit tests de esta tarea pasan de forma aislada.

---

### Task 4: Reescribir el store `cart` (canónico + shims)

**Files:**
- Modify: `src/stores/cart.js` (reemplazo completo)
- Test: `src/stores/cart.test.js`

**Interfaces:**
- Produces: store `cart` con item canónico `{ variant_id, product_id, product_name, variant_label, unit_price_cents, image_url, stock, quantity }` **+ shims** `{ id, name, price, image }`; `totalItems`, `subtotalCents`, `subtotal` (shim, pesos); `addItem(product, variant, quantity=1)`, `removeItem(variantId)`, `updateQuantity(variantId, quantity)`, `clearCart()`.

- [ ] **Step 1: Escribir el test que falla — `src/stores/cart.test.js`**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCartStore } from './cart.js'

const product = { id: 'p1', name: 'BTS Proof', image_url: 'img-p' }
const variant = { id: 'v1', label: 'Único', price_cents: 85000, stock: 3, image_url: null }

beforeEach(() => setActivePinia(createPinia()))

describe('cart store', () => {
  it('addItem guarda snapshot canónico y shims', () => {
    const cart = useCartStore()
    cart.addItem(product, variant, 1)
    const i = cart.items[0]
    expect(i.variant_id).toBe('v1')
    expect(i.product_name).toBe('BTS Proof')
    expect(i.variant_label).toBe('Único')
    expect(i.unit_price_cents).toBe(85000)
    expect(i.image_url).toBe('img-p')
    // shims para CheckoutView
    expect(i.id).toBe('v1')
    expect(i.name).toBe('BTS Proof')
    expect(i.price).toBe(850)
    expect(i.image).toBe('img-p')
  })

  it('addItem dedupe por variant_id y suma con clamp a stock', () => {
    const cart = useCartStore()
    cart.addItem(product, variant, 2)
    cart.addItem(product, variant, 5)
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].quantity).toBe(3) // clamp a stock=3
  })

  it('subtotalCents y subtotal (shim) son consistentes', () => {
    const cart = useCartStore()
    cart.addItem(product, variant, 2)
    expect(cart.subtotalCents).toBe(170000)
    expect(cart.subtotal).toBe(1700)
    expect(cart.totalItems).toBe(2)
  })

  it('updateQuantity respeta 1..stock y removeItem elimina por variant_id', () => {
    const cart = useCartStore()
    cart.addItem(product, variant, 1)
    cart.updateQuantity('v1', 99)
    expect(cart.items[0].quantity).toBe(3)
    cart.updateQuantity('v1', 0)
    expect(cart.items[0].quantity).toBe(1)
    cart.removeItem('v1')
    expect(cart.items).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npm test -- cart`
Expected: FAIL — `addItem` con firma nueva y campos canónicos no existen.

- [ ] **Step 3: Reemplazar `src/stores/cart.js` por completo**

```js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCartStore = defineStore('cart', () => {
  const items = ref([])

  const totalItems = computed(() => items.value.reduce((s, i) => s + i.quantity, 0))
  const subtotalCents = computed(() =>
    items.value.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0)
  )
  // shim temporal para CheckoutView (2c lo elimina)
  const subtotal = computed(() => subtotalCents.value / 100)

  function addItem(product, variant, quantity = 1) {
    const existing = items.value.find((i) => i.variant_id === variant.id)
    if (existing) {
      existing.quantity = Math.min(variant.stock, existing.quantity + quantity)
      return
    }
    const image = variant.image_url ?? product.image_url
    items.value.push({
      variant_id: variant.id,
      product_id: product.id,
      product_name: product.name,
      variant_label: variant.label,
      unit_price_cents: variant.price_cents,
      image_url: image,
      stock: variant.stock,
      quantity: Math.min(variant.stock, quantity),
      // shims temporales para CheckoutView (2c los elimina)
      id: variant.id,
      name: product.name,
      price: variant.price_cents / 100,
      image,
    })
  }

  function removeItem(variantId) {
    items.value = items.value.filter((i) => i.variant_id !== variantId)
  }

  function updateQuantity(variantId, quantity) {
    const item = items.value.find((i) => i.variant_id === variantId)
    if (item) item.quantity = Math.max(1, Math.min(item.stock, quantity))
  }

  function clearCart() {
    items.value = []
  }

  return { items, totalItems, subtotalCents, subtotal, addItem, removeItem, updateQuantity, clearCart }
})
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `npm test -- cart`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/cart.js src/stores/cart.test.js
git commit -m "feat(fe): rewrite cart store to variant snapshot with compat shims"
```

---

### Task 5: Vistas de lista (Home + Products)

**Files:**
- Modify: `src/views/user/HomeView.vue` (`<script setup>` + bloque de destacados)
- Modify: `src/views/user/ProductsView.vue` (`<script setup>` + grid + estados)

**Interfaces:**
- Consumes: store `products` (`fetchProducts`, `products`, `loading`, `error`, `categories`, `groups`), `formatMXN`.

Verificación en vivo (no unit test; los tests de componente están diferidos por el spec).

- [ ] **Step 1: HomeView — reemplazar el `<script setup>` (líneas 1–7)**

```html
<script setup>
import { computed, onMounted } from 'vue'
import { useProductsStore } from '../../stores/products'
import { formatMXN } from '../../lib/format'

const store = useProductsStore()
const featured = computed(() => store.products.slice(0, 4))

onMounted(() => store.fetchProducts())
</script>
```

- [ ] **Step 2: HomeView — reemplazar el bloque de destacados (sección `<section class="featured container">`, líneas 55–77)**

Reemplaza el `<section class="featured container"> … </section>` completo por:

```html
    <!-- Destacados -->
    <section class="featured container">
      <h2>Productos Destacados</h2>

      <p v-if="store.loading" class="state-msg">Cargando productos…</p>

      <div v-else-if="store.error" class="state-msg">
        <p>No se pudo cargar el catálogo.</p>
        <button class="btn-outline" @click="store.fetchProducts()">Reintentar</button>
      </div>

      <div v-else class="products-grid">
        <router-link
          v-for="product in featured"
          :key="product.id"
          :to="`/producto/${product.id}`"
          class="product-card"
        >
          <div class="product-img">
            <img :src="product.image_url" :alt="product.name" />
          </div>
          <div class="product-info">
            <span class="product-group">{{ product.group }}</span>
            <h3>{{ product.name }}</h3>
            <p v-if="product.defaultVariant" class="product-price">
              {{ formatMXN(product.defaultVariant.price_cents) }} MXN
            </p>
            <p v-else class="product-price">No disponible</p>
          </div>
        </router-link>
      </div>

      <div class="see-all">
        <router-link to="/productos" class="btn-outline">Ver todos los productos</router-link>
      </div>
    </section>
```

- [ ] **Step 3: HomeView — añadir estilo `.state-msg` al final del `<style scoped>` (antes de `</style>`)**

```css
.state-msg {
  text-align: center;
  color: var(--text-muted);
  padding: 40px 20px;
}
```

- [ ] **Step 4: ProductsView — reemplazar el `<script setup>` (líneas 1–25)**

```html
<script setup>
import { useProductsStore } from '../../stores/products'
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { formatMXN } from '../../lib/format'

const store = useProductsStore()
const route = useRoute()

const search = ref('')
const selectedCategory = ref('')
const selectedGroup = ref('')

onMounted(() => {
  if (route.query.cat) selectedCategory.value = route.query.cat
  store.fetchProducts()
})

const filtered = computed(() => {
  return store.products.filter((p) => {
    const matchSearch =
      !search.value ||
      p.name.toLowerCase().includes(search.value.toLowerCase()) ||
      p.group.toLowerCase().includes(search.value.toLowerCase())
    const matchCat = !selectedCategory.value || p.category === selectedCategory.value
    const matchGroup = !selectedGroup.value || p.group === selectedGroup.value
    return matchSearch && matchCat && matchGroup
  })
})
</script>
```

- [ ] **Step 5: ProductsView — reemplazar desde `<p class="results-count">` hasta el cierre del bloque vacío (líneas 47–72)**

```html
    <p v-if="!store.loading && !store.error" class="results-count">
      {{ filtered.length }} productos encontrados
    </p>

    <p v-if="store.loading" class="empty">Cargando productos…</p>

    <div v-else-if="store.error" class="empty">
      <p>No se pudo cargar el catálogo.</p>
      <button class="btn-outline" @click="store.fetchProducts()">Reintentar</button>
    </div>

    <template v-else>
      <div class="products-grid">
        <router-link
          v-for="product in filtered"
          :key="product.id"
          :to="`/producto/${product.id}`"
          class="product-card"
        >
          <div class="product-img">
            <img :src="product.image_url" :alt="product.name" />
            <span v-if="product.defaultVariant && product.defaultVariant.stock < 5" class="low-stock">
              Pocas unidades
            </span>
          </div>
          <div class="product-info">
            <span class="product-group">{{ product.group }}</span>
            <h3>{{ product.name }}</h3>
            <span class="product-cat">{{ product.category }}</span>
            <p v-if="product.defaultVariant" class="product-price">
              {{ formatMXN(product.defaultVariant.price_cents) }} MXN
            </p>
            <p v-else class="product-price">No disponible</p>
          </div>
        </router-link>
      </div>

      <div v-if="!filtered.length" class="empty">
        <i class="fas fa-search"></i>
        <p>No se encontraron productos</p>
      </div>
    </template>
```

> `.btn-outline` no está definido en el `<style>` de ProductsView; el botón "Reintentar" heredará estilos globales. Es aceptable para 2a. Si se ve sin estilo, copia la regla `.btn-outline` de `HomeView.vue`.

- [ ] **Step 6: Verificar en vivo**

Usa la skill `run`/`verify` para levantar la app (`npm run dev`) contra el stack local y confirmar:
- Home muestra 4 destacados **desde la BD** (los nombres coinciden con `supabase/seed.sql`, no con el viejo array — p. ej. precios que salen de `price_cents`).
- Products lista los 12 productos; filtros de categoría/grupo funcionan; el buscador filtra.
- Con el stack detenido momentáneamente, Products muestra el estado de error + "Reintentar" (opcional).

- [ ] **Step 7: Commit**

```bash
git add src/views/user/HomeView.vue src/views/user/ProductsView.vue
git commit -m "feat(fe): read Home and Products catalog from Supabase store"
```

---

### Task 6: ProductDetailView (async + add-to-cart)

**Files:**
- Modify: `src/views/user/ProductDetailView.vue` (`<script setup>` líneas 1–30 + bloque de info del producto, y estados de carga)

**Interfaces:**
- Consumes: store `products` (`products`, `fetchProductById`), store `cart` (`addItem(product, variant, qty)`), `formatMXN`. Mantiene `useShippingStore` intacto.

Verificación en vivo.

- [ ] **Step 1: Reemplazar el `<script setup>` (líneas 1–30)**

```html
<script setup>
import { useRoute, useRouter } from 'vue-router'
import { useProductsStore } from '../../stores/products'
import { useCartStore } from '../../stores/cart'
import { useShippingStore } from '../../stores/shipping'
import { ref, computed, onMounted } from 'vue'
import { formatMXN } from '../../lib/format'

const route = useRoute()
const router = useRouter()
const productsStore = useProductsStore()
const cart = useCartStore()
const shippingStore = useShippingStore()

const product = ref(null)
const loading = ref(true)
const quantity = ref(1)
const postalCode = ref('')
const shippingInfo = ref(null)
const added = ref(false)

const variant = computed(() => product.value?.defaultVariant ?? null)

onMounted(async () => {
  const id = route.params.id
  const cached = productsStore.products.find((p) => p.id === id)
  product.value = cached ?? (await productsStore.fetchProductById(id))
  loading.value = false
})

function calculateShipping() {
  shippingInfo.value = shippingStore.calculateShipping(postalCode.value)
}

function addToCart() {
  if (!product.value || !variant.value) return
  cart.addItem(product.value, variant.value, quantity.value)
  added.value = true
  setTimeout(() => (added.value = false), 2000)
}
</script>
```

> `formatMXN` queda disponible en el template por el `import` de arriba (en `<script setup>` todo lo importado es visible en la plantilla; no se re-exporta).

- [ ] **Step 2: Envolver el contenido y manejar loading/no-encontrado**

La plantilla actual abre con `<div class="detail-page container" v-if="product">`. Reemplaza esa apertura y añade estados. Cambia la línea:

```html
  <div class="detail-page container" v-if="product">
```

por:

```html
  <div v-if="loading" class="detail-page container">
    <p class="state-msg">Cargando producto…</p>
  </div>

  <div v-else-if="!product" class="detail-page container">
    <p class="state-msg">Producto no encontrado.</p>
    <router-link to="/productos" class="btn-outline">Ver productos</router-link>
  </div>

  <div v-else class="detail-page container">
```

> Esto asume que el `v-else` de "producto no encontrado" que existía más abajo en el archivo se elimina o se vuelve redundante. Revisa el final del `<template>`: si hay un bloque `<div v-else …>` de "no encontrado" al mismo nivel del `v-if="product"` original, bórralo (ahora lo cubre el nuevo `v-else-if="!product"`).

- [ ] **Step 3: Reemplazar imagen, precio y stock en el bloque de info (líneas ~40–52)**

- Imagen: `:src="product.image"` → `:src="product.image_url"`.
- Precio: la línea `<p class="detail-price">${{ product.price.toLocaleString() }} MXN</p>` →

```html
        <p v-if="variant" class="detail-price">{{ formatMXN(variant.price_cents) }} MXN</p>
        <p v-else class="detail-price">No disponible</p>
```

- Stock: el bloque `<p class="detail-stock" …>` que usa `product.stock` →

```html
        <p class="detail-stock" :class="{ low: variant && variant.stock < 5 }">
          <i class="fas fa-box"></i>
          {{ variant && variant.stock > 0 ? `${variant.stock} disponibles` : 'Agotado' }}
        </p>
```

- Botón `+` de cantidad: `@click="quantity = Math.min(product.stock, quantity + 1)"` → `@click="quantity = Math.min(variant ? variant.stock : 1, quantity + 1)"`.
- Botón agregar: `:disabled="product.stock === 0"` → `:disabled="!variant || variant.stock === 0"`.

- [ ] **Step 4: Añadir `.state-msg` al `<style scoped>` (antes de `</style>`)**

```css
.state-msg {
  text-align: center;
  color: var(--text-muted);
  padding: 60px 20px;
}
```

- [ ] **Step 5: Verificar en vivo**

- Navega Home/Products → clic en un producto → el detalle carga vía caché.
- Refresca directo en `/producto/<uuid>` (copiando el uuid de la URL) → carga vía `fetchProductById`.
- "Agregar al carrito" incrementa el badge del NavBar; la cotización de envío (shipping.js) sigue funcionando.
- Visita `/producto/no-existe` → "Producto no encontrado".

- [ ] **Step 6: Commit**

```bash
git add src/views/user/ProductDetailView.vue
git commit -m "feat(fe): load product detail async with variant-aware add-to-cart"
```

---

### Task 7: CartView + placeholder de admin

**Files:**
- Modify: `src/views/user/CartView.vue` (`<script setup>` + renglones del carrito)
- Modify: `src/views/admin/ProductsManageView.vue` (reemplazo completo → placeholder)

**Interfaces:**
- Consumes: store `cart` (shape canónico + `subtotalCents`), `formatMXN`.

- [ ] **Step 1: CartView — reemplazar el `<script setup>` (líneas 1–5)**

```html
<script setup>
import { useCartStore } from '../../stores/cart'
import { formatMXN } from '../../lib/format'

const cart = useCartStore()
</script>
```

- [ ] **Step 2: CartView — reemplazar los renglones y el resumen (líneas 13–46)**

Renglón del carrito (`<div v-for="item in cart.items" …>`):

```html
        <div v-for="item in cart.items" :key="item.variant_id" class="cart-item">
          <img :src="item.image_url" :alt="item.product_name" class="cart-item-img" />
          <div class="cart-item-info">
            <span class="cart-item-group">{{ item.variant_label }}</span>
            <h3>{{ item.product_name }}</h3>
            <p class="cart-item-price">{{ formatMXN(item.unit_price_cents) }} MXN</p>
          </div>
          <div class="cart-item-qty">
            <button @click="cart.updateQuantity(item.variant_id, item.quantity - 1)">-</button>
            <span>{{ item.quantity }}</span>
            <button @click="cart.updateQuantity(item.variant_id, item.quantity + 1)">+</button>
          </div>
          <p class="cart-item-total">{{ formatMXN(item.unit_price_cents * item.quantity) }}</p>
          <button class="cart-item-remove" @click="cart.removeItem(item.variant_id)">
            <i class="fas fa-trash"></i>
          </button>
        </div>
```

Resumen (las dos líneas de subtotal que usan `cart.subtotal.toLocaleString()`):

```html
        <div class="summary-row">
          <span>Productos ({{ cart.totalItems }})</span>
          <span>{{ formatMXN(cart.subtotalCents) }} MXN</span>
        </div>
        <div class="summary-row">
          <span>Envío</span>
          <span class="text-muted">Se calcula al checkout</span>
        </div>
        <hr />
        <div class="summary-row total">
          <span>Subtotal</span>
          <span>{{ formatMXN(cart.subtotalCents) }} MXN</span>
        </div>
```

- [ ] **Step 3: Reemplazar `src/views/admin/ProductsManageView.vue` por completo (placeholder)**

```html
<script setup>
// Placeholder temporal (Fase 2a). El CRUD real de productos/variantes vía
// Supabase Auth + RLS llega en la Fase 2b.
</script>

<template>
  <div class="wip container">
    <i class="fas fa-screwdriver-wrench"></i>
    <h1>Gestión de productos</h1>
    <p>Esta sección se reconstruye en la Fase 2b (auth de admin + CRUD vía Supabase).</p>
    <router-link to="/admin/dashboard" class="btn-outline">Volver al dashboard</router-link>
  </div>
</template>

<style scoped>
.wip {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-muted);
}
.wip i {
  font-size: 3rem;
  color: var(--primary-light);
  margin-bottom: 16px;
}
.wip h1 {
  font-size: 1.6rem;
  margin-bottom: 10px;
  color: var(--text);
}
.btn-outline {
  display: inline-block;
  margin-top: 20px;
  padding: 12px 28px;
  border: 2px solid var(--primary);
  color: var(--primary-light);
  border-radius: 50px;
  font-weight: 600;
}
</style>
```

- [ ] **Step 4: Verificar en vivo**

- El carrito muestra los items con nombre, variante, precio (`formatMXN`), cantidad ± y total; el subtotal cuadra.
- **`CheckoutView` sigue funcionando sin tocarlo:** ve a `/checkout` con items en el carrito y confirma que la lista de productos y el subtotal se renderizan (usa los shims `item.image/name/price` y `cart.subtotal`).
- `/admin/productos` muestra el placeholder (tras "iniciar sesión" con el guard falso actual).

- [ ] **Step 5: Commit**

```bash
git add src/views/user/CartView.vue src/views/admin/ProductsManageView.vue
git commit -m "feat(fe): cart view on canonical shape; admin products placeholder"
```

---

### Task 8: Verificación integral y suite

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Correr toda la suite de Vitest**

Run: `npm test`
Expected: PASS — `format`, `mapProduct`, `products`, `cart` en verde.

- [ ] **Step 2: Verificación en vivo end-to-end (skill `run`/`verify`)**

Levanta `npm run dev` contra el stack local y confirma los criterios de éxito del spec:
1. Home/Products/Detail renderizan el catálogo **desde la BD** (dato presente en el seed, ausente del viejo array).
2. Flujo completo: Home → Products (filtros) → Detail → agregar al carrito → Cart (totales correctos) → Checkout renderiza vía shims sin haber tocado `CheckoutView.vue`.
3. Deep-link directo a `/producto/<uuid>` carga vía `fetchProductById`.
4. Estados de carga/error/vacío visibles (probar error deteniendo el stack y usando "Reintentar").
5. `/admin/productos` muestra el placeholder sin errores de consola.

- [ ] **Step 3: Confirmar que `git status` solo tiene `CheckoutView.vue` como cambio no relacionado sin commitear**

Run: `git status --short`
Expected: solo `M src/views/user/CheckoutView.vue` (el WIP preexistente), nada más pendiente.

- [ ] **Step 4: (Opcional) Actualizar el ledger de progreso**

Anota en `.superpowers/sdd/progress.md` que la Fase 2a quedó completa y que **2c debe eliminar los shims del carrito** (`id/name/price/image` en el item y `subtotal` en el store) al reescribir `CheckoutView`.

---

## Notas de decomposición futura (fuera de alcance de este plan)

- **2b:** Supabase Auth para admin + `is_admin` gate real (reemplaza el guard `localStorage`) + CRUD de productos/variantes y gestión de pedidos vía RLS (reconstruye `ProductsManageView`, `DashboardView`, `OrdersView`, `AdminLogin`).
- **2c:** Edge Functions `quote-shipping` / `create-checkout` / `stripe-webhook`, Stripe + Skydropx + email, reescritura de `CheckoutView` (**elimina los shims del carrito**), retiro de `src/stores/shipping.js`, y deploy a la nube.
- **2d:** Edge Function `track-order` + reescritura de `TrackingView`.
