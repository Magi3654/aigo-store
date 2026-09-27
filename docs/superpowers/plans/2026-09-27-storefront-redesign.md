# Rediseño visual de la tienda pública — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el aspecto de plantilla de la tienda pública por el sistema visual aprobado (Barlow Condensed + base ciruela + lila, plano, foto protagonista), y añadir la categoría Velas.

**Architecture:** Tokens de diseño en `src/style.css` (con alias de compatibilidad para admin y checkout), un puñado de componentes compartidos (`BaseButton`, `ProductTile`, `SiteHeader`, `SiteFooter`…) y tres módulos puros testeables (`productTile`, `categories`, `filterProducts`). Cada pantalla pública se reescribe sobre esas piezas; su lógica de datos no cambia.

**Tech Stack:** Vue 3 (`script setup`) + vue-router + Pinia; Vitest; PostgreSQL/pgTAP (solo para Velas); Google Fonts (Barlow Condensed, Inter).

**Spec:** `docs/superpowers/specs/2026-09-27-storefront-redesign-design.md` — maqueta de referencia: `docs/superpowers/specs/assets/2026-09-27-home-mockup-v3.html`.

## Global Constraints

- **Colores (exactos):** `--ink #4A3347`, `--ink-muted #6F5A6D`, `--canvas #FBF8F8`, `--surface #F3E8EE`, `--lilac #E1C7EA`, `--signal #936DA4`, `--badge #EA92AE`, `--almond #FCD4C5`.
- **Contraste prohibido para texto normal:** blanco sobre `--badge`, `--signal` sobre `--lilac` o `--canvas`, `#A583AA` sobre superficies claras. Etiquetas: texto `--ink` sobre `--badge`.
- **Tipografía:** Barlow Condensed 800 (titulares, mayúsculas, interlineado 0.88) e Inter 400/500. Nada de Poppins.
- **Forma:** radio 0 en tarjetas y paneles; 2px en botones; 9999px en buscador, campos del seguimiento y etiquetas. Sin `box-shadow`. Sin `linear-gradient` salvo el sombreado inferior de la foto del hero.
- **Íconos:** sin Font Awesome en vistas públicas (excepto `CheckoutView.vue`) ni en componentes nuevos. Solo los 4 SVG de `src/components/icons/`.
- **No tocar:** `src/views/user/CheckoutView.vue`, vistas y componentes de admin (salvo heredar tokens), `src/stores/*.js`, `src/lib/mapProduct.js`, `src/lib/trackOrder.js`, `supabase/seed.sql`, migraciones existentes.
- **Base de datos local:** nunca `supabase db reset`. Migraciones con `supabase migration up`; seeds nuevos con `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f …`.
- **Los subagentes NO ejecutan git.** El controlador hace todos los commits. Los pasos "Commit" son para él.
- TDD estricto en todo lo que tiene lógica: test que falla → implementación mínima → test verde.

### Desviaciones del spec (decididas al planear)

- **`AnnouncementBar` es global** (en `App.vue`, sobre el header, en todas las rutas públicas), no solo en Inicio: la maqueta la pone encima del header y el aviso de envíos sirve en cualquier página. Su texto sigue viviendo en `src/content/home.js`.
- **Pie sin enlaces vacíos:** "Envíos" y "Preguntas frecuentes" no se muestran hasta que existan (un enlace a `#` es un callejón sin salida para lectores de pantalla). Las redes salen de `home.social`, que empieza vacío; el pie solo pinta las que tengan URL.
- **`--bg-card` queda en `#ffffff`** en vez de un token nuevo: el admin pinta tarjetas blancas sobre `--bg`; reasignarlo a `--surface` las teñiría de rosa.
- **Se retira el filtro por grupo del catálogo** (no tenía control visible en el diseño nuevo); la búsqueda ya encuentra por nombre de grupo.
- **Un producto con más de una variante** muestra "Ver opciones" (va al detalle) en lugar de "Agregar" en su tarjeta: agregar la variante por defecto a ciegas sería comprar algo que el cliente no eligió.

## Review Focus

1. Buscar con o sin acentos y en mayúsculas ("album", "ÁLBUM", "stray kids") → debe encontrar igual. Lo cubre `filterProducts` en la Task 3.
2. Usar el buscador del header o un enlace de categoría **estando ya en `/productos`** → la lista debe actualizarse sin recargar. Lo cubre `ProductsView` leyendo `route.query` de forma reactiva (Task 7, paso manual explícito).
3. `?cat=` con una categoría que no existe (enlace viejo o manipulado) → se muestra "Todas", no una lista vacía sin explicación. Lo cubre `normalizeCategory` en la Task 3.
4. Producto sin imagen, con `image_url` vacío o con placeholder de `placehold.co`, y artículo del carrito sin imagen → tarjeta tipográfica lila, nunca un ícono de imagen rota. Lo cubre `hasRealImage` en la Task 3.
5. Producto con stock 0 o sin variantes → "Agotado"/"No disponible" y botón deshabilitado, tanto en la tarjeta como en el detalle. Lo cubre `productBadge` en la Task 3.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `supabase/migrations/20260927100000_category_velas.sql` | CHECK de `products.category` con Velas | 1 |
| `supabase/tests/01_schema_products_test.sql` | prueba de Velas | 1 |
| `src/lib/validateProduct.js` + test | `CATEGORIES` con Velas | 1 |
| `src/style.css`, `index.html` | tokens, fuentes, utilidades globales | 2 |
| `src/lib/productTile.js` + test | `hasRealImage`, `productBadge` | 3 |
| `src/lib/categories.js` + test | `categoryLabel`, `normalizeCategory` | 3 |
| `src/lib/filterProducts.js` + test | búsqueda y filtro de catálogo | 3 |
| `src/components/icons/*.vue` | 4 íconos SVG | 4 |
| `src/components/BaseButton.vue`, `SectionHeading.vue`, `BrandMark.vue`, `AnnouncementBar.vue`, `ProductTile.vue` | piezas base | 4 |
| `src/content/home.js` | textos editables de portada y franja | 5 |
| `src/components/SiteHeader.vue`, `SiteFooter.vue`, `src/App.vue` | marco del sitio; se borra `NavBar.vue` | 5 |
| `src/assets/hero-concierto.jpg`, `src/assets/coleccion.jpg`, `src/views/user/HomeView.vue` | Inicio | 6 |
| `src/views/user/ProductsView.vue` | Catálogo | 7 |
| `src/views/user/ProductDetailView.vue` | Detalle | 8 |
| `src/views/user/CartView.vue` | Carrito | 9 |
| `src/views/user/TrackingView.vue` | Seguimiento (solo estilo) | 10 |
| `supabase/seed_catalog_local.sql`, `supabase/config.toml` | mockups + producto Velas de ejemplo (solo local); verificación final | 11 |

---

### Task 1: Categoría Velas

**Files:**
- Create: `supabase/migrations/20260927100000_category_velas.sql`
- Modify: `supabase/tests/01_schema_products_test.sql` (plan 12 → 13, nueva aserción)
- Modify: `src/lib/validateProduct.js:2`
- Test: `src/lib/validateProduct.test.js:33`

**Interfaces:**
- Produces: `CATEGORIES = ['Albums', 'Lightsticks', 'Ropa', 'Photocards', 'Posters', 'Velas']` (las Tasks 3, 6 y 7 lo importan). La BD acepta `category = 'Velas'`.

- [ ] **Step 1: Tests que fallan**

En `src/lib/validateProduct.test.js`, cambia la línea 33 a:

```js
    expect(CATEGORIES).toEqual(['Albums', 'Lightsticks', 'Ropa', 'Photocards', 'Posters', 'Velas'])
```

En `supabase/tests/01_schema_products_test.sql`, cambia `select plan(12);` por `select plan(13);` y añade justo antes de `select * from finish();`:

```sql
select lives_ok(
  $$ insert into public.products (name, "group", category) values ('Vela test','G','Velas') $$,
  'la categoria Velas es valida'
);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/validateProduct.test.js`
Esperado: FAIL — el array no incluye `'Velas'`.

Run: `supabase test db`
Esperado: FAIL en `01_schema_products_test.sql`, test 13, por `products_category_check`.

- [ ] **Step 3: Implementación**

Crea `supabase/migrations/20260927100000_category_velas.sql`:

```sql
-- La tienda vende velas: nueva categoria.
alter table public.products drop constraint products_category_check;
alter table public.products add constraint products_category_check
  check (category in ('Albums','Lightsticks','Ropa','Photocards','Posters','Velas'));
```

En `src/lib/validateProduct.js`, línea 2:

```js
export const CATEGORIES = ['Albums', 'Lightsticks', 'Ropa', 'Photocards', 'Posters', 'Velas']
```

Run: `supabase migration up`
Esperado: `Applying migration 20260927100000_category_velas.sql...`

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run` → todo verde.
Run: `supabase test db` → `All tests successful`, `Tests=113`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260927100000_category_velas.sql supabase/tests/01_schema_products_test.sql src/lib/validateProduct.js src/lib/validateProduct.test.js
git commit -m "feat: categoria Velas en la BD y en el admin"
```

---

### Task 2: Tokens, fuentes y estilos globales

**Files:**
- Modify: `src/style.css` (reemplazo completo)
- Modify: `index.html` (fuentes, `lang`)

**Interfaces:**
- Produces (clases y variables globales que usan las Tasks 4–10): variables de la sección Global Constraints; `--font-display`, `--font-text`, `--radius-button`, `--radius-pill`, `--section-gap`; clases `.container`, `.display`, `.eyebrow`, `.product-grid`, `.state`, `.sr-only`. Alias de compatibilidad `--primary`, `--primary-dark`, `--primary-light`, `--secondary`, `--accent`, `--bg`, `--bg-card`, `--bg-input`, `--text`, `--text-muted`, `--border`, `--gradient`, `--thistle`, `--snow`, `--petal-pink`.

- [ ] **Step 1: Reemplazar `src/style.css`**

```css
*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  /* Color: cada token nombra su papel, no su tono. */
  --ink: #4A3347;
  --ink-muted: #6F5A6D;
  --canvas: #FBF8F8;
  --surface: #F3E8EE;
  --lilac: #E1C7EA;
  --signal: #936DA4;
  --badge: #EA92AE;
  --almond: #FCD4C5;
  --success: #6BA589;
  --warning: #D4A054;
  --danger: #C87070;

  /* Tipografia */
  --font-display: 'Barlow Condensed', 'Arial Narrow', sans-serif;
  --font-text: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;

  /* Forma y espacio */
  --radius-button: 2px;
  --radius-pill: 9999px;
  --section-gap: 96px;

  /* Compatibilidad: admin y checkout no se redisenan y siguen usando estos
     nombres. Apuntan a los tokens nuevos para heredar el estilo sin romperse. */
  --primary: var(--ink);
  --primary-dark: var(--ink);
  --primary-light: var(--ink);
  --secondary: var(--signal);
  --accent: var(--ink-muted);
  --bg: var(--canvas);
  --bg-card: #ffffff;
  --bg-input: var(--surface);
  --text: var(--ink);
  --text-muted: var(--ink-muted);
  --border: var(--lilac);
  --gradient: var(--ink);
  --thistle: var(--lilac);
  --snow: var(--canvas);
  --petal-pink: var(--signal);
}

@media (max-width: 768px) {
  :root { --section-gap: 56px; }
}

html { -webkit-text-size-adjust: 100%; }

body {
  font-family: var(--font-text);
  font-size: 16px;
  line-height: 1.5;
  background: var(--canvas);
  color: var(--ink);
  min-height: 100vh;
  color-scheme: light;
}

#app { min-height: 100vh; display: flex; flex-direction: column; }

a { text-decoration: none; color: inherit; }

button,
input,
select,
textarea { font: inherit; color: inherit; }

button { cursor: pointer; background: none; border: none; }

img { display: block; max-width: 100%; }

:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.container { width: 100%; max-width: 1280px; margin: 0 auto; padding: 0 24px; }

@media (max-width: 768px) {
  .container { padding: 0 16px; }
}

/* Titulares condensados */
.display {
  font-family: var(--font-display);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  line-height: 0.88;
}

/* Linea pequena en mayusculas sobre titulos */
.eyebrow {
  font-size: 12px;
  line-height: 1.33;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--ink-muted);
}

/* Cuadricula de tarjetas: 1px de separacion en el color del fondo */
.product-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  background: var(--canvas);
}

@media (max-width: 1024px) {
  .product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 768px) {
  .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* Mensajes de carga, error y vacio */
.state { padding: 48px 0; color: var(--ink-muted); }
.state > * + * { margin-top: 16px; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 2: Fuentes en `index.html`**

Cambia `<html lang="en">` por `<html lang="es">` y reemplaza la línea de Poppins por:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800&family=Inter:wght@400;500&display=swap" rel="stylesheet">
```

La hoja de Font Awesome se queda (admin y checkout la usan).

- [ ] **Step 3: Verificar**

Run:
```bash
npx vitest run
npm run build
grep -rn "Poppins" src index.html || echo "sin Poppins"
```
Esperado: Vitest verde, build sin errores, `sin Poppins`.

- [ ] **Step 4: Commit**

```bash
git add src/style.css index.html
git commit -m "feat(fe): tokens de diseno, Barlow Condensed + Inter y alias de compatibilidad"
```

---

### Task 3: Módulos puros de catálogo

**Files:**
- Create: `src/lib/productTile.js`, `src/lib/productTile.test.js`
- Create: `src/lib/categories.js`, `src/lib/categories.test.js`
- Create: `src/lib/filterProducts.js`, `src/lib/filterProducts.test.js`

**Interfaces:**
- Consumes: `CATEGORIES` (Task 1).
- Produces:
  - `hasRealImage(url: unknown) → boolean`
  - `productBadge(variant: { stock: number } | null) → { key: 'unavailable' | 'sold_out' | 'low_stock', label: string } | null`
  - `categoryLabel(category: string) → string`
  - `normalizeCategory(value: unknown) → string` (una de `CATEGORIES` o `''`)
  - `filterProducts(products, { q?: string, cat?: string }) → products[]`

- [ ] **Step 1: Tests que fallan**

`src/lib/productTile.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { hasRealImage, productBadge } from './productTile.js'

describe('hasRealImage', () => {
  it('acepta una URL de imagen real', () => {
    expect(hasRealImage('https://images.unsplash.com/photo-1?w=800')).toBe(true)
  })

  it('rechaza vacio, espacios, null y no-texto', () => {
    expect(hasRealImage('')).toBe(false)
    expect(hasRealImage('   ')).toBe(false)
    expect(hasRealImage(null)).toBe(false)
    expect(hasRealImage(undefined)).toBe(false)
    expect(hasRealImage(42)).toBe(false)
  })

  it('trata los placeholders de placehold.co como "sin imagen"', () => {
    expect(hasRealImage('https://placehold.co/400x400/F3E8EE/936DA4?text=BTS')).toBe(false)
    expect(hasRealImage('HTTP://PLACEHOLD.CO/10')).toBe(false)
  })
})

describe('productBadge', () => {
  it('sin variante: No disponible', () => {
    expect(productBadge(null)).toEqual({ key: 'unavailable', label: 'No disponible' })
  })

  it('stock 0: Agotado', () => {
    expect(productBadge({ stock: 0 })).toEqual({ key: 'sold_out', label: 'Agotado' })
  })

  it('stock de 1 a 4: Últimas piezas', () => {
    expect(productBadge({ stock: 1 })).toEqual({ key: 'low_stock', label: 'Últimas piezas' })
    expect(productBadge({ stock: 4 })).toEqual({ key: 'low_stock', label: 'Últimas piezas' })
  })

  it('stock de 5 o mas: sin etiqueta', () => {
    expect(productBadge({ stock: 5 })).toBe(null)
  })
})
```

`src/lib/categories.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { categoryLabel, normalizeCategory } from './categories.js'

describe('categoryLabel', () => {
  it('traduce las categorias al texto que ve el cliente', () => {
    expect(categoryLabel('Albums')).toBe('Álbumes')
    expect(categoryLabel('Posters')).toBe('Pósters')
    expect(categoryLabel('Velas')).toBe('Velas')
    expect(categoryLabel('Lightsticks')).toBe('Lightsticks')
  })

  it('deja tal cual una categoria desconocida', () => {
    expect(categoryLabel('Tazas')).toBe('Tazas')
  })
})

describe('normalizeCategory', () => {
  it('acepta solo categorias existentes', () => {
    expect(normalizeCategory('Velas')).toBe('Velas')
    expect(normalizeCategory('Inventada')).toBe('')
    expect(normalizeCategory(['Albums'])).toBe('')
    expect(normalizeCategory(undefined)).toBe('')
  })
})
```

`src/lib/filterProducts.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { filterProducts } from './filterProducts.js'

const P = [
  { id: 1, name: 'BTS - Album "Proof"', group: 'BTS', category: 'Albums' },
  { id: 2, name: 'Stray Kids - Hoodie "MANIAC"', group: 'Stray Kids', category: 'Ropa' },
  { id: 3, name: 'Vela aromática', group: 'AIGO', category: 'Velas' },
]

const ids = (list) => list.map((p) => p.id)

describe('filterProducts', () => {
  it('sin filtros devuelve todo', () => {
    expect(ids(filterProducts(P, {}))).toEqual([1, 2, 3])
  })

  it('filtra por categoria', () => {
    expect(ids(filterProducts(P, { cat: 'Ropa' }))).toEqual([2])
  })

  it('busca por nombre o grupo sin distinguir mayusculas', () => {
    expect(ids(filterProducts(P, { q: 'STRAY kids' }))).toEqual([2])
    expect(ids(filterProducts(P, { q: 'bts' }))).toEqual([1])
  })

  it('ignora acentos en ambos sentidos', () => {
    expect(ids(filterProducts(P, { q: 'aromatica' }))).toEqual([3])
    expect(ids(filterProducts(P, { q: 'ÁLBUM' }))).toEqual([1])
  })

  it('combina busqueda y categoria, e ignora espacios alrededor', () => {
    expect(ids(filterProducts(P, { q: '  bts ', cat: 'Ropa' }))).toEqual([])
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/productTile.test.js src/lib/categories.test.js src/lib/filterProducts.test.js`
Esperado: FAIL — los tres módulos no existen.

- [ ] **Step 3: Implementación**

`src/lib/productTile.js`:

```js
// Los productos sembrados usan placehold.co como imagen provisional: para la
// tienda eso es "sin imagen" y se muestra la tarjeta tipografica.
export function hasRealImage(url) {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  return !/^https?:\/\/placehold\.co\//i.test(trimmed)
}

export function productBadge(variant) {
  if (!variant) return { key: 'unavailable', label: 'No disponible' }
  if (variant.stock <= 0) return { key: 'sold_out', label: 'Agotado' }
  if (variant.stock < 5) return { key: 'low_stock', label: 'Últimas piezas' }
  return null
}
```

`src/lib/categories.js`:

```js
import { CATEGORIES } from './validateProduct.js'

const LABELS = {
  Albums: 'Álbumes',
  Posters: 'Pósters',
}

export function categoryLabel(category) {
  return LABELS[category] ?? category
}

export function normalizeCategory(value) {
  return typeof value === 'string' && CATEGORIES.includes(value) ? value : ''
}
```

`src/lib/filterProducts.js`:

```js
function normalize(text) {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function filterProducts(products, { q = '', cat = '' } = {}) {
  const needle = normalize(q)
  return products.filter(
    (p) =>
      (!cat || p.category === cat) &&
      (!needle || normalize(p.name).includes(needle) || normalize(p.group).includes(needle)),
  )
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/productTile.test.js src/lib/categories.test.js src/lib/filterProducts.test.js`
Esperado: PASS, 15 tests. Luego `npx vitest run`: todo verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/productTile.js src/lib/productTile.test.js src/lib/categories.js src/lib/categories.test.js src/lib/filterProducts.js src/lib/filterProducts.test.js
git commit -m "feat(fe): modulos puros para tarjetas, categorias y busqueda del catalogo"
```

---

### Task 4: Íconos y componentes base

**Files:**
- Create: `src/components/icons/IconSearch.vue`, `IconBag.vue`, `IconMenu.vue`, `IconClose.vue`
- Create: `src/components/BaseButton.vue`, `SectionHeading.vue`, `BrandMark.vue`, `AnnouncementBar.vue`, `ProductTile.vue`

**Interfaces:**
- Consumes: `hasRealImage`, `productBadge` (Task 3); `formatMXN`; `useCartStore().addItem(product, variant, quantity)`; clases globales de la Task 2.
- Produces:
  - `BaseButton` — props `variant: 'solid' | 'outline' | 'on-photo'` (por defecto `solid`), `to?`, `type?` (`button`), `disabled?`, `block?`; renderiza `router-link` si hay `to` y no está deshabilitado, si no `<button>`; el `@click` del padre llega al elemento raíz.
  - `SectionHeading` — props `title` (obligatorio), `to?`, `linkText?` (`'Ver todo'`).
  - `BrandMark` — sin props; enlace a `/` con "AIGO"; hereda `color` del padre.
  - `AnnouncementBar` — prop `text`.
  - `ProductTile` — prop `product` (forma de `mapProductRow`).

Sin infraestructura de tests de componentes: la lógica ya está cubierta en la Task 3; aquí se verifica con build + revisión en navegador en las tareas de pantallas.

- [ ] **Step 1: Íconos**

`src/components/icons/IconSearch.vue`:
```vue
<template>
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
</template>
```

`src/components/icons/IconBag.vue`:
```vue
<template>
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 8h14l-1 12H6L5 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
</template>
```

`src/components/icons/IconMenu.vue`:
```vue
<template>
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
</template>
```

`src/components/icons/IconClose.vue`:
```vue
<template>
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
</template>
```

- [ ] **Step 2: `BaseButton.vue`**

```vue
<script setup>
defineProps({
  variant: {
    type: String,
    default: 'solid',
    validator: (v) => ['solid', 'outline', 'on-photo'].includes(v),
  },
  to: { type: [String, Object], default: null },
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
})
</script>

<template>
  <router-link
    v-if="to && !disabled"
    :to="to"
    class="btn"
    :class="[`btn--${variant}`, { 'btn--block': block }]"
  >
    <slot />
  </router-link>
  <button
    v-else
    :type="type"
    class="btn"
    :class="[`btn--${variant}`, { 'btn--block': block }]"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border: 1px solid var(--ink);
  border-radius: var(--radius-button);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.8px;
  line-height: 1;
  text-transform: uppercase;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}
.btn--solid { background: var(--ink); color: var(--canvas); }
.btn--solid:hover:not(:disabled) { background: #3a2838; }
.btn--outline { background: transparent; color: var(--ink); }
.btn--outline:hover:not(:disabled) { background: var(--ink); color: var(--canvas); }
.btn--on-photo { background: var(--canvas); color: var(--ink); }
.btn--on-photo:hover { background: var(--surface); }
.btn--block { width: 100%; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
```

- [ ] **Step 3: `SectionHeading.vue`, `BrandMark.vue`, `AnnouncementBar.vue`**

`src/components/SectionHeading.vue`:
```vue
<script setup>
defineProps({
  title: { type: String, required: true },
  to: { type: [String, Object], default: null },
  linkText: { type: String, default: 'Ver todo' },
})
</script>

<template>
  <div class="section-heading">
    <h2 class="display">{{ title }}</h2>
    <router-link v-if="to" :to="to" class="section-heading__link">{{ linkText }} →</router-link>
  </div>
</template>

<style scoped>
.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
h2 { font-size: clamp(28px, 4vw, 40px); line-height: 1; }
.section-heading__link {
  font-size: 14px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  border-bottom: 1px solid var(--ink);
  padding-bottom: 2px;
  white-space: nowrap;
}
</style>
```

`src/components/BrandMark.vue`:
```vue
<!-- Unico lugar de la marca: cuando llegue el logo, se cambia aqui. -->
<template>
  <router-link to="/" class="brand display" aria-label="AIGO, ir al inicio">AIGO</router-link>
</template>

<style scoped>
.brand { font-size: 30px; letter-spacing: 2px; line-height: 1; color: inherit; }
</style>
```

`src/components/AnnouncementBar.vue`:
```vue
<script setup>
defineProps({ text: { type: String, required: true } })
</script>

<template>
  <div class="announcement" role="note">{{ text }}</div>
</template>

<style scoped>
.announcement {
  background: var(--lilac);
  color: var(--ink);
  font-size: 12px;
  line-height: 1.33;
  text-align: center;
  padding: 8px 16px;
}
</style>
```

- [ ] **Step 4: `ProductTile.vue`**

```vue
<script setup>
import { computed, ref } from 'vue'
import { formatMXN } from '../lib/format.js'
import { hasRealImage, productBadge } from '../lib/productTile.js'
import { useCartStore } from '../stores/cart.js'
import BaseButton from './BaseButton.vue'

const props = defineProps({ product: { type: Object, required: true } })

const cart = useCartStore()
const added = ref(false)

const variant = computed(() => props.product.defaultVariant)
const badge = computed(() => productBadge(variant.value))
const showImage = computed(() => hasRealImage(props.product.image_url))
const hasOptions = computed(() => props.product.variants.length > 1)
const canAdd = computed(() => !!variant.value && variant.value.stock > 0)
const link = computed(() => `/producto/${props.product.id}`)

function add() {
  if (!canAdd.value) return
  cart.addItem(props.product, variant.value, 1)
  added.value = true
  setTimeout(() => (added.value = false), 1500)
}
</script>

<template>
  <article class="tile">
    <router-link :to="link" class="tile__media" tabindex="-1" aria-hidden="true">
      <img v-if="showImage" :src="product.image_url" alt="" loading="lazy" />
      <span v-else class="tile__fallback display">{{ product.group }}</span>
    </router-link>
    <div class="tile__body">
      <span v-if="badge" class="tile__badge">{{ badge.label }}</span>
      <p class="tile__group">{{ product.group }}</p>
      <router-link :to="link" class="tile__name">{{ product.name }}</router-link>
      <p v-if="variant" class="tile__price">{{ formatMXN(variant.price_cents) }}</p>
      <div class="tile__action">
        <BaseButton v-if="hasOptions" variant="outline" :to="link" block>Ver opciones</BaseButton>
        <BaseButton v-else variant="outline" block :disabled="!canAdd" @click="add">
          {{ added ? 'Agregado' : canAdd ? 'Agregar' : 'Agotado' }}
        </BaseButton>
      </div>
    </div>
  </article>
</template>

<style scoped>
.tile { background: var(--surface); display: flex; flex-direction: column; }
.tile__media { display: block; aspect-ratio: 1; overflow: hidden; }
.tile__media img { width: 100%; height: 100%; object-fit: cover; }
.tile__fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
  background: var(--lilac);
  color: var(--ink);
  font-size: clamp(24px, 3vw, 36px);
}
.tile__body { padding: 16px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
.tile__badge {
  align-self: flex-start;
  background: var(--badge);
  color: var(--ink);
  border-radius: var(--radius-pill);
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 500;
  margin-bottom: 4px;
}
.tile__group { font-size: 12px; letter-spacing: 0.8px; text-transform: uppercase; color: var(--ink-muted); }
.tile__name { font-size: 15px; font-weight: 500; line-height: 1.35; }
.tile__name:hover { text-decoration: underline; }
.tile__price { font-size: 15px; }
.tile__action { margin-top: auto; padding-top: 12px; }
</style>
```

- [ ] **Step 5: Verificar**

Run: `npm run build` → sin errores. `npx vitest run` → todo verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/icons src/components/BaseButton.vue src/components/SectionHeading.vue src/components/BrandMark.vue src/components/AnnouncementBar.vue src/components/ProductTile.vue
git commit -m "feat(fe): iconos de linea y componentes base del nuevo sistema visual"
```

---

### Task 5: Marco del sitio — franja, header y pie

**Files:**
- Create: `src/content/home.js`
- Create: `src/components/SiteHeader.vue`, `src/components/SiteFooter.vue`
- Modify: `src/App.vue` (reemplazo completo)
- Delete: `src/components/NavBar.vue`

**Interfaces:**
- Consumes: `BrandMark`, `AnnouncementBar`, íconos (Task 4); `useCartStore().totalItems`.
- Produces: `home` en `src/content/home.js` con `announcement`, `hero {title,text,cta,secondary}`, `featured {title}`, `band {kicker,title,text,cta}`, `social: Array<{label,url}>` (la Task 6 lo usa). El buscador del header navega a `/productos?q=<texto>` (la Task 7 lo lee).

- [ ] **Step 1: `src/content/home.js`**

```js
// Textos editables de la portada y de la franja de avisos. Cambiarlos aqui no
// requiere tocar las vistas.
export const home = {
  announcement: 'Envíos a todo México',
  hero: {
    title: 'Nuevo comeback',
    text: 'Álbumes, lightsticks y ropa oficial, con envío a todo México.',
    cta: 'Ver colección',
    secondary: 'Novedades',
  },
  featured: { title: 'Lo más pedido' },
  band: {
    kicker: 'Hecho por ARMY, para todos los fandoms',
    title: 'Colección morada',
    text: 'Lo que más nos gusta de la temporada, elegido por quien lo colecciona.',
    cta: 'Explorar',
  },
  // { label: 'Instagram', url: 'https://instagram.com/…' } — vacio hasta tener las cuentas.
  social: [],
}
```

- [ ] **Step 2: `src/components/SiteHeader.vue`**

```vue
<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart.js'
import BrandMark from './BrandMark.vue'
import IconSearch from './icons/IconSearch.vue'
import IconBag from './icons/IconBag.vue'
import IconMenu from './icons/IconMenu.vue'
import IconClose from './icons/IconClose.vue'

const cart = useCartStore()
const route = useRoute()
const router = useRouter()
const menuOpen = ref(false)
const query = ref('')

const links = [
  { to: '/', label: 'Inicio' },
  { to: '/productos', label: 'Productos' },
  { to: '/seguimiento', label: 'Seguimiento' },
]

// Cualquier navegacion cierra el menu movil.
watch(() => route.fullPath, () => {
  menuOpen.value = false
})

function search() {
  const q = query.value.trim()
  router.push({ path: '/productos', query: q ? { q } : {} })
  query.value = ''
}
</script>

<template>
  <header class="site-header">
    <div class="site-header__bar container">
      <button
        class="site-header__toggle"
        type="button"
        aria-label="Abrir menú"
        aria-controls="site-menu"
        :aria-expanded="menuOpen"
        @click="menuOpen = true"
      >
        <IconMenu />
      </button>

      <nav id="site-menu" class="site-header__nav" :class="{ 'is-open': menuOpen }" aria-label="Principal">
        <button class="site-header__close" type="button" aria-label="Cerrar menú" @click="menuOpen = false">
          <IconClose />
        </button>
        <router-link v-for="l in links" :key="l.to" :to="l.to" class="site-header__link">{{ l.label }}</router-link>
      </nav>

      <BrandMark class="site-header__brand" />

      <div class="site-header__tools">
        <form class="site-header__search" role="search" @submit.prevent="search">
          <IconSearch />
          <input v-model="query" type="search" placeholder="Buscar" aria-label="Buscar productos" />
        </form>
        <router-link to="/carrito" class="site-header__bag" :aria-label="`Bolsa, ${cart.totalItems} artículos`">
          <IconBag />
          <span v-if="cart.totalItems" class="site-header__count">{{ cart.totalItems }}</span>
        </router-link>
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--canvas);
  border-bottom: 1px solid var(--ink);
}
.site-header__bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  min-height: 64px;
}
.site-header__toggle,
.site-header__close { display: none; color: var(--ink); }
.site-header__nav { display: flex; gap: 24px; }
.site-header__link {
  font-size: 14px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  padding: 4px 0;
  border-bottom: 1px solid transparent;
}
.site-header__link:hover,
.site-header__link.router-link-exact-active { border-bottom-color: var(--ink); }
.site-header__brand { justify-self: center; }
.site-header__tools { justify-self: end; display: flex; align-items: center; gap: 16px; }
.site-header__search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border-radius: var(--radius-pill);
  padding: 8px 16px;
}
.site-header__search input {
  border: none;
  background: transparent;
  width: 140px;
  font-size: 14px;
  outline: none;
}
.site-header__search input::placeholder { color: var(--ink-muted); }
.site-header__search:focus-within { outline: 2px solid var(--ink); outline-offset: 2px; }
.site-header__bag { position: relative; display: flex; }
.site-header__count {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: var(--canvas);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

@media (max-width: 768px) {
  .site-header__toggle { display: flex; }
  .site-header__nav {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 30;
    flex-direction: column;
    gap: 8px;
    padding: 24px 16px;
    background: var(--canvas);
  }
  .site-header__nav.is-open { display: flex; }
  .site-header__close { display: flex; align-self: flex-end; margin-bottom: 24px; }
  .site-header__link {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 40px;
    line-height: 1.1;
    letter-spacing: 0.6px;
  }
  .site-header__search { padding: 6px 12px; }
  .site-header__search input { width: 80px; }
}
</style>
```

- [ ] **Step 3: `src/components/SiteFooter.vue`**

```vue
<script setup>
import BrandMark from './BrandMark.vue'
import { home } from '../content/home.js'
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__grid container">
      <div>
        <BrandMark />
        <p class="site-footer__tagline">K-pop merch en México.</p>
      </div>
      <nav aria-label="Ayuda">
        <p class="site-footer__title">Ayuda</p>
        <router-link to="/seguimiento">Seguimiento de pedido</router-link>
      </nav>
      <nav v-if="home.social.length" aria-label="Redes sociales">
        <p class="site-footer__title">Síguenos</p>
        <a v-for="s in home.social" :key="s.url" :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.label }}</a>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
.site-footer { margin-top: auto; background: var(--ink); color: var(--lilac); padding: 56px 0; }
.site-footer__grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 32px; }
.site-footer :deep(.brand) { color: var(--canvas); }
.site-footer__tagline { margin-top: 8px; font-size: 14px; }
.site-footer nav { display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
.site-footer nav a:hover { text-decoration: underline; }
.site-footer__title { font-size: 12px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--canvas); }

@media (max-width: 768px) {
  .site-footer__grid { grid-template-columns: 1fr; }
}
</style>
```

- [ ] **Step 4: `src/App.vue` y retirar `NavBar.vue`**

Reemplaza `src/App.vue`:

```vue
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AnnouncementBar from './components/AnnouncementBar.vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { home } from './content/home.js'

const route = useRoute()
const isAdmin = computed(() => route.path.startsWith('/admin'))
</script>

<template>
  <router-view v-if="isAdmin" />
  <template v-else>
    <AnnouncementBar :text="home.announcement" />
    <SiteHeader />
    <main class="site-main"><router-view /></main>
    <SiteFooter />
  </template>
</template>

<style>
.site-main { flex: 1; }
</style>
```

Borra `src/components/NavBar.vue` y confirma que nadie la importa:

Run: `rm src/components/NavBar.vue && grep -rn "NavBar" src || echo "NavBar retirada"`
Esperado: `NavBar retirada`.

- [ ] **Step 5: Verificar**

Run: `npx vitest run && npm run build` → verde, sin errores.
Manual (con `npm run dev`): en `/`, `/productos` y `/carrito` se ven la franja lila, el header con AIGO al centro y el pie ciruela; en `/admin/…` no aparecen. A 375px el menú hamburguesa abre el panel a pantalla completa y se cierra al navegar. Buscar "bts" en el header lleva a `/productos?q=bts`.

- [ ] **Step 6: Commit**

```bash
git add src/content/home.js src/components/SiteHeader.vue src/components/SiteFooter.vue src/App.vue src/components/NavBar.vue
git commit -m "feat(fe): franja de avisos, header y pie nuevos; se retira NavBar"
```

---

### Task 6: Inicio

**Files:**
- Create: `src/assets/hero-concierto.jpg`, `src/assets/coleccion.jpg`
- Modify: `src/views/user/HomeView.vue` (reemplazo completo)

**Interfaces:**
- Consumes: `home` (Task 5); `CATEGORIES` (Task 1); `categoryLabel` (Task 3); `ProductTile`, `SectionHeading`, `BaseButton` (Task 4); `useProductsStore()` (`products`, `loading`, `error`, `fetchProducts`).

- [ ] **Step 1: Descargar las fotos (licencia Unsplash)**

```bash
curl -sL "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1600&q=80" -o /tmp/hero.jpg
magick /tmp/hero.jpg -resize 1600x -strip -quality 78 src/assets/hero-concierto.jpg
curl -sL "https://images.unsplash.com/photo-1619983081563-430f63602796?w=1200&q=80" -o /tmp/coleccion.jpg
magick /tmp/coleccion.jpg -resize 1000x -strip -quality 78 src/assets/coleccion.jpg
ls -la src/assets/hero-concierto.jpg src/assets/coleccion.jpg
```
Esperado: los dos archivos existen; `hero-concierto.jpg` ≤ 250 KB.

- [ ] **Step 2: Reemplazar `src/views/user/HomeView.vue`**

```vue
<script setup>
import { computed, onMounted } from 'vue'
import { useProductsStore } from '../../stores/products'
import { CATEGORIES } from '../../lib/validateProduct.js'
import { categoryLabel } from '../../lib/categories.js'
import { home } from '../../content/home.js'
import ProductTile from '../../components/ProductTile.vue'
import SectionHeading from '../../components/SectionHeading.vue'
import BaseButton from '../../components/BaseButton.vue'
import heroImg from '../../assets/hero-concierto.jpg'
import bandImg from '../../assets/coleccion.jpg'

const store = useProductsStore()
const featured = computed(() => store.products.slice(0, 4))

onMounted(() => store.fetchProducts())
</script>

<template>
  <div class="home">
    <section class="hero" :style="{ backgroundImage: `url(${heroImg})` }">
      <div class="hero__copy container">
        <h1 class="display hero__title">{{ home.hero.title }}</h1>
        <p class="hero__text">{{ home.hero.text }}</p>
        <div class="hero__actions">
          <BaseButton variant="on-photo" to="/productos">{{ home.hero.cta }}</BaseButton>
          <router-link to="/productos" class="hero__link">{{ home.hero.secondary }} →</router-link>
        </div>
      </div>
    </section>

    <nav class="cats" aria-label="Categorías">
      <router-link
        v-for="c in CATEGORIES"
        :key="c"
        :to="{ path: '/productos', query: { cat: c } }"
        class="cats__item display"
      >{{ categoryLabel(c) }}</router-link>
    </nav>

    <section class="section container">
      <SectionHeading :title="home.featured.title" to="/productos" />
      <p v-if="store.loading" class="state">Cargando productos…</p>
      <div v-else-if="store.error" class="state">
        <p>No se pudo cargar el catálogo.</p>
        <BaseButton variant="outline" @click="store.fetchProducts()">Reintentar</BaseButton>
      </div>
      <div v-else class="product-grid">
        <ProductTile v-for="p in featured" :key="p.id" :product="p" />
      </div>
    </section>

    <section class="band">
      <div class="band__text">
        <p class="band__kicker">{{ home.band.kicker }}</p>
        <h2 class="display band__title">{{ home.band.title }}</h2>
        <p class="band__body">{{ home.band.text }}</p>
        <BaseButton to="/productos">{{ home.band.cta }}</BaseButton>
      </div>
      <div class="band__image" :style="{ backgroundImage: `url(${bandImg})` }" role="img" :aria-label="home.band.title"></div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  min-height: min(78vh, 720px);
  display: flex;
  align-items: flex-end;
  background-size: cover;
  background-position: center 30%;
}
/* Unica excepcion a "sin degradados": sombra inferior para leer el texto sobre la foto. */
.hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(74, 51, 71, 0.8), rgba(74, 51, 71, 0) 60%);
}
.hero__copy { position: relative; z-index: 1; padding-bottom: 48px; color: var(--canvas); }
.hero__title { font-size: clamp(56px, 9vw, 104px); max-width: 8ch; margin-bottom: 16px; }
.hero__text { font-size: 18px; font-weight: 500; max-width: 40ch; margin-bottom: 24px; }
.hero__actions { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.hero__link { font-size: 14px; letter-spacing: 0.8px; text-transform: uppercase; }
.hero__link:hover { text-decoration: underline; }

.cats {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1px;
  background: var(--lilac);
  border-bottom: 1px solid var(--lilac);
}
.cats__item {
  background: var(--canvas);
  text-align: center;
  padding: 24px 8px;
  font-size: clamp(18px, 2vw, 24px);
  line-height: 1;
}
.cats__item:hover { background: var(--surface); }

.section { padding-top: var(--section-gap); padding-bottom: var(--section-gap); }

.band { display: grid; grid-template-columns: 1.1fr 1fr; background: var(--lilac); color: var(--ink); }
.band__text { padding: 64px 48px; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-start; gap: 16px; }
.band__kicker { font-size: 12px; letter-spacing: 1.4px; text-transform: uppercase; }
.band__title { font-size: clamp(40px, 6vw, 72px); }
.band__body { max-width: 40ch; }
.band__image { min-height: 360px; background-size: cover; background-position: center; }

@media (max-width: 768px) {
  .cats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .band { grid-template-columns: 1fr; }
  .band__text { padding: 40px 16px; }
  .band__image { min-height: 240px; order: -1; }
}
</style>
```

- [ ] **Step 3: Verificar**

Run: `npx vitest run && npm run build` → verde.
Manual: `/` corresponde con la maqueta v3 (`docs/superpowers/specs/assets/2026-09-27-home-mockup-v3.html`); la categoría "Velas" lleva a `/productos?cat=Velas`; a 375px las categorías van en 3 columnas y los productos en 2.

- [ ] **Step 4: Commit**

```bash
git add src/assets/hero-concierto.jpg src/assets/coleccion.jpg src/views/user/HomeView.vue
git commit -m "feat(fe): nueva portada con hero, categorias, destacados y seccion lila"
```

---

### Task 7: Catálogo

**Files:**
- Modify: `src/views/user/ProductsView.vue` (reemplazo completo)

**Interfaces:**
- Consumes: `filterProducts` (Task 3), `normalizeCategory`, `categoryLabel` (Task 3), `CATEGORIES` (Task 1), `ProductTile`, `BaseButton` (Task 4), `?q=` del header (Task 5).

- [ ] **Step 1: Reemplazar `src/views/user/ProductsView.vue`**

```vue
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProductsStore } from '../../stores/products'
import { CATEGORIES } from '../../lib/validateProduct.js'
import { categoryLabel, normalizeCategory } from '../../lib/categories.js'
import { filterProducts } from '../../lib/filterProducts.js'
import ProductTile from '../../components/ProductTile.vue'
import BaseButton from '../../components/BaseButton.vue'
import IconSearch from '../../components/icons/IconSearch.vue'

const store = useProductsStore()
const route = useRoute()
const router = useRouter()

// La URL es la fuente de verdad: el buscador del header y los enlaces de
// categoria cambian la query y esta vista reacciona aunque ya este abierta.
const cat = computed(() => normalizeCategory(route.query.cat))
const q = ref('')
// Solo se sobreescribe el campo si la URL dice algo distinto de lo que ya hay
// escrito: si no, el trim de onSearch se comeria el espacio mientras se teclea
// ("stray kids").
watch(
  () => route.query.q,
  (value) => {
    const next = typeof value === 'string' ? value : ''
    if (next !== q.value.trim()) q.value = next
  },
  { immediate: true },
)

const filtered = computed(() => filterProducts(store.products, { q: q.value, cat: cat.value }))

function setCategory(value) {
  router.replace({ query: { ...route.query, cat: value || undefined } })
}

function onSearch() {
  router.replace({ query: { ...route.query, q: q.value.trim() || undefined } })
}

function clearFilters() {
  router.replace({ query: {} })
}

onMounted(() => store.fetchProducts())
</script>

<template>
  <div class="catalog container">
    <h1 class="display catalog__title">Productos</h1>

    <div class="catalog__controls">
      <div class="catalog__tabs" role="group" aria-label="Categorías">
        <button type="button" class="catalog__tab" :aria-pressed="!cat" @click="setCategory('')">Todas</button>
        <button
          v-for="c in CATEGORIES"
          :key="c"
          type="button"
          class="catalog__tab"
          :aria-pressed="cat === c"
          @click="setCategory(c)"
        >{{ categoryLabel(c) }}</button>
      </div>
      <form class="catalog__search" role="search" @submit.prevent="onSearch">
        <IconSearch />
        <input v-model="q" type="search" placeholder="Buscar por producto o grupo" aria-label="Buscar productos" @input="onSearch" />
      </form>
    </div>

    <p v-if="store.loading" class="state">Cargando productos…</p>
    <div v-else-if="store.error" class="state">
      <p>No se pudo cargar el catálogo.</p>
      <BaseButton variant="outline" @click="store.fetchProducts()">Reintentar</BaseButton>
    </div>
    <template v-else>
      <p class="catalog__count">{{ filtered.length }} {{ filtered.length === 1 ? 'producto' : 'productos' }}</p>
      <div v-if="filtered.length" class="product-grid">
        <ProductTile v-for="p in filtered" :key="p.id" :product="p" />
      </div>
      <div v-else class="catalog__empty">
        <p class="display catalog__empty-title">No encontramos productos</p>
        <BaseButton variant="outline" @click="clearFilters">Ver todo</BaseButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.catalog { padding-top: 48px; padding-bottom: var(--section-gap); }
.catalog__title { font-size: clamp(48px, 7vw, 80px); margin-bottom: 32px; }
.catalog__controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--lilac);
  margin-bottom: 16px;
}
.catalog__tabs { display: flex; gap: 20px; flex-wrap: wrap; }
.catalog__tab {
  font-size: 14px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  padding: 4px 0;
  border-bottom: 1px solid transparent;
}
.catalog__tab:hover,
.catalog__tab[aria-pressed='true'] { border-bottom-color: var(--ink); }
.catalog__search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border-radius: var(--radius-pill);
  padding: 10px 20px;
  min-width: 280px;
}
.catalog__search input { border: none; background: transparent; outline: none; width: 100%; }
.catalog__search input::placeholder { color: var(--ink-muted); }
.catalog__search:focus-within { outline: 2px solid var(--ink); outline-offset: 2px; }
.catalog__count { font-size: 12px; color: var(--ink-muted); margin-bottom: 16px; }
.catalog__empty { padding: 64px 0; display: flex; flex-direction: column; align-items: flex-start; gap: 24px; }
.catalog__empty-title { font-size: clamp(32px, 5vw, 48px); }

@media (max-width: 768px) {
  .catalog__search { min-width: 0; width: 100%; }
}
</style>
```

- [ ] **Step 2: Verificar**

Run: `npx vitest run && npm run build` → verde.
Manual:
1. `/productos?cat=Velas` → pestaña "Velas" subrayada; `/productos?cat=Inventada` → "Todas".
2. Estando en `/productos?cat=Ropa`, buscar "bts" en el **header** → la lista cambia sin recargar y la URL queda `?q=bts`.
3. Buscar "album" en el buscador del catálogo → aparecen los álbumes. Escribir "stray kids" (con espacio) letra por letra → el espacio no desaparece.
4. Búsqueda sin resultados → "No encontramos productos" + "Ver todo" limpia los filtros.

- [ ] **Step 3: Commit**

```bash
git add src/views/user/ProductsView.vue
git commit -m "feat(fe): catalogo con pestanas de categoria, busqueda sin acentos y URL como fuente de verdad"
```

---

### Task 8: Detalle de producto

**Files:**
- Modify: `src/views/user/ProductDetailView.vue` (reemplazo completo)

**Interfaces:**
- Consumes: `hasRealImage`, `productBadge` (Task 3); `categoryLabel` (Task 3); `BaseButton` (Task 4); `useProductsStore().fetchProductById`, `useCartStore().addItem`, `useShippingStore().calculateShipping(cp)` → `{ zoneName, standard: { cost, days }, express: { cost, days } }` (sin cambios).

- [ ] **Step 1: Reemplazar `src/views/user/ProductDetailView.vue`**

```vue
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProductsStore } from '../../stores/products'
import { useCartStore } from '../../stores/cart'
import { useShippingStore } from '../../stores/shipping'
import { formatMXN } from '../../lib/format'
import { hasRealImage, productBadge } from '../../lib/productTile.js'
import { categoryLabel } from '../../lib/categories.js'
import BaseButton from '../../components/BaseButton.vue'

const route = useRoute()
const router = useRouter()
const productsStore = useProductsStore()
const cart = useCartStore()
const shippingStore = useShippingStore()

const product = ref(null)
const loading = ref(true)
const selectedId = ref(null)
const quantity = ref(1)
const postalCode = ref('')
const shippingInfo = ref(null)
const added = ref(false)

const variant = computed(() => {
  if (!product.value) return null
  return product.value.variants.find((v) => v.id === selectedId.value) ?? product.value.defaultVariant
})
const image = computed(() => variant.value?.image_url ?? product.value?.image_url)
const showImage = computed(() => hasRealImage(image.value))
const badge = computed(() => productBadge(variant.value))
const canAdd = computed(() => !!variant.value && variant.value.stock > 0)

onMounted(async () => {
  const id = route.params.id
  const cached = productsStore.products.find((p) => p.id === id)
  product.value = cached ?? (await productsStore.fetchProductById(id))
  selectedId.value = product.value?.defaultVariant?.id ?? null
  loading.value = false
})

watch(selectedId, () => {
  quantity.value = 1
})

function changeQuantity(delta) {
  const max = variant.value ? Math.max(1, variant.value.stock) : 1
  quantity.value = Math.min(max, Math.max(1, quantity.value + delta))
}

function calculateShipping() {
  shippingInfo.value = shippingStore.calculateShipping(postalCode.value)
}

function addToCart() {
  if (!canAdd.value) return
  cart.addItem(product.value, variant.value, quantity.value)
  added.value = true
  setTimeout(() => (added.value = false), 2000)
}
</script>

<template>
  <div class="detail container">
    <p v-if="loading" class="state">Cargando producto…</p>

    <div v-else-if="!product" class="state">
      <p>Producto no encontrado.</p>
      <BaseButton variant="outline" to="/productos">Ver productos</BaseButton>
    </div>

    <template v-else>
      <button type="button" class="detail__back" @click="router.back()">← Volver</button>

      <div class="detail__grid">
        <div class="detail__media">
          <img v-if="showImage" :src="image" :alt="product.name" />
          <span v-else class="detail__fallback display">{{ product.group }}</span>
        </div>

        <div class="detail__info">
          <p class="eyebrow">{{ product.group }} · {{ categoryLabel(product.category) }}</p>
          <h1 class="display detail__name">{{ product.name }}</h1>
          <p v-if="variant" class="detail__price">{{ formatMXN(variant.price_cents) }} MXN</p>

          <div v-if="product.variants.length > 1" class="detail__variants" role="radiogroup" aria-label="Versión">
            <button
              v-for="v in product.variants"
              :key="v.id"
              type="button"
              role="radio"
              class="detail__variant"
              :aria-checked="v.id === variant?.id"
              @click="selectedId = v.id"
            >{{ v.label }}</button>
          </div>

          <p v-if="product.description" class="detail__desc">{{ product.description }}</p>

          <div class="detail__buy">
            <div class="detail__qty" aria-label="Cantidad">
              <button type="button" aria-label="Menos" @click="changeQuantity(-1)">−</button>
              <span aria-live="polite">{{ quantity }}</span>
              <button type="button" aria-label="Más" @click="changeQuantity(1)">+</button>
            </div>
            <BaseButton block :disabled="!canAdd" @click="addToCart">
              {{ added ? 'Agregado a la bolsa' : canAdd ? 'Agregar a la bolsa' : badge?.label ?? 'No disponible' }}
            </BaseButton>
          </div>
          <p class="detail__stock">
            <template v-if="!variant">No disponible</template>
            <template v-else-if="variant.stock === 0">Agotado</template>
            <template v-else-if="variant.stock < 5">Últimas piezas: quedan {{ variant.stock }}</template>
            <template v-else>{{ variant.stock }} disponibles</template>
          </p>

          <!-- Cotizacion provisional: la reemplaza Skydropx en la Fase 2c. -->
          <div class="detail__ship">
            <p class="eyebrow">Cotizar envío</p>
            <form class="detail__ship-form" @submit.prevent="calculateShipping">
              <input v-model="postalCode" inputmode="numeric" maxlength="5" placeholder="Código postal" aria-label="Código postal" />
              <BaseButton variant="outline" type="submit" :disabled="postalCode.length !== 5">Cotizar</BaseButton>
            </form>
            <div v-if="shippingInfo" class="detail__ship-results">
              <p>{{ shippingInfo.zoneName }}</p>
              <p>Estándar: ${{ shippingInfo.standard.cost }} MXN · {{ shippingInfo.standard.days }} días hábiles</p>
              <p>Express: ${{ shippingInfo.express.cost }} MXN · {{ shippingInfo.express.days }} días hábiles</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail { padding-top: 32px; padding-bottom: var(--section-gap); }
.detail__back { font-size: 14px; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 24px; }
.detail__back:hover { text-decoration: underline; }
.detail__grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 48px; align-items: start; }
.detail__media { background: var(--surface); aspect-ratio: 1; overflow: hidden; }
.detail__media img { width: 100%; height: 100%; object-fit: cover; }
.detail__fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--lilac);
  font-size: clamp(40px, 6vw, 72px);
  padding: 24px;
  text-align: center;
}
.detail__info { display: flex; flex-direction: column; gap: 16px; }
.detail__name { font-size: 40px; line-height: 1; }
.detail__price { font-size: 22px; font-weight: 500; }
.detail__variants { display: flex; flex-wrap: wrap; gap: 8px; }
.detail__variant { border: 1px solid var(--ink); border-radius: var(--radius-button); padding: 10px 16px; font-size: 14px; }
.detail__variant[aria-checked='true'] { outline: 1px solid var(--ink); outline-offset: -3px; font-weight: 500; }
.detail__desc { color: var(--ink-muted); }
.detail__buy { display: flex; gap: 12px; align-items: stretch; }
.detail__qty { display: flex; align-items: center; border: 1px solid var(--ink); border-radius: var(--radius-button); }
.detail__qty button { width: 40px; height: 100%; font-size: 18px; }
.detail__qty span { min-width: 28px; text-align: center; }
.detail__stock { font-size: 12px; color: var(--ink-muted); }
.detail__ship { border: 1px solid var(--lilac); padding: 20px; display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.detail__ship-form { display: flex; gap: 8px; }
.detail__ship-form input {
  flex: 1;
  min-width: 0;
  background: var(--surface);
  border: none;
  border-radius: var(--radius-pill);
  padding: 10px 16px;
}
.detail__ship-results { font-size: 14px; display: flex; flex-direction: column; gap: 4px; }

@media (max-width: 768px) {
  .detail__grid { grid-template-columns: 1fr; gap: 24px; }
  .detail__name { font-size: 32px; }
}
</style>
```

- [ ] **Step 2: Verificar**

Run: `npx vitest run && npm run build` → verde.
Manual: un producto con imagen, uno sin imagen (tarjeta lila), la cantidad no pasa del stock ni baja de 1, "Agregar a la bolsa" suma al contador del header, la cotización sigue funcionando con un CP de 5 dígitos. Si algún producto tiene más de una variante (créalo desde el admin), cambiar de versión cambia precio y stock y reinicia la cantidad.

- [ ] **Step 3: Commit**

```bash
git add src/views/user/ProductDetailView.vue
git commit -m "feat(fe): detalle de producto con selector de version y estilo nuevo"
```

---

### Task 9: Carrito

**Files:**
- Modify: `src/views/user/CartView.vue` (reemplazo completo)

**Interfaces:**
- Consumes: `useCartStore()` (`items`, `totalItems`, `subtotalCents`, `updateQuantity`, `removeItem`), `hasRealImage` (Task 3), `BaseButton` (Task 4), `formatMXN`.

- [ ] **Step 1: Reemplazar `src/views/user/CartView.vue`**

```vue
<script setup>
import { useCartStore } from '../../stores/cart'
import { formatMXN } from '../../lib/format'
import { hasRealImage } from '../../lib/productTile.js'
import BaseButton from '../../components/BaseButton.vue'

const cart = useCartStore()
</script>

<template>
  <div class="cart container">
    <h1 class="display cart__title">Tu bolsa</h1>

    <div v-if="cart.items.length" class="cart__layout">
      <ul class="cart__items">
        <li v-for="item in cart.items" :key="item.variant_id" class="cart__item">
          <router-link :to="`/producto/${item.product_id}`" class="cart__thumb" tabindex="-1" aria-hidden="true">
            <img v-if="hasRealImage(item.image_url)" :src="item.image_url" alt="" />
            <span v-else class="cart__thumb-fallback"></span>
          </router-link>
          <div class="cart__info">
            <router-link :to="`/producto/${item.product_id}`" class="cart__name">{{ item.product_name }}</router-link>
            <p class="cart__variant">{{ item.variant_label }} · {{ formatMXN(item.unit_price_cents) }}</p>
            <button type="button" class="cart__remove" @click="cart.removeItem(item.variant_id)">Quitar</button>
          </div>
          <div class="cart__qty" :aria-label="`Cantidad de ${item.product_name}`">
            <button type="button" aria-label="Menos" @click="cart.updateQuantity(item.variant_id, item.quantity - 1)">−</button>
            <span>{{ item.quantity }}</span>
            <button type="button" aria-label="Más" @click="cart.updateQuantity(item.variant_id, item.quantity + 1)">+</button>
          </div>
          <p class="cart__line">{{ formatMXN(item.unit_price_cents * item.quantity) }}</p>
        </li>
      </ul>

      <aside class="cart__summary">
        <p class="eyebrow">Resumen</p>
        <div class="cart__row"><span>Productos ({{ cart.totalItems }})</span><span>{{ formatMXN(cart.subtotalCents) }}</span></div>
        <div class="cart__row cart__row--muted"><span>Envío</span><span>Se calcula al pagar</span></div>
        <div class="cart__row cart__row--total"><span>Subtotal</span><span>{{ formatMXN(cart.subtotalCents) }} MXN</span></div>
        <BaseButton to="/checkout" block>Continuar al pago</BaseButton>
      </aside>
    </div>

    <div v-else class="cart__empty">
      <p class="display cart__empty-title">Tu bolsa está vacía</p>
      <p>Agrega algo de tus grupos favoritos.</p>
      <BaseButton variant="outline" to="/productos">Ver productos</BaseButton>
    </div>
  </div>
</template>

<style scoped>
.cart { padding-top: 48px; padding-bottom: var(--section-gap); }
.cart__title { font-size: clamp(48px, 7vw, 80px); margin-bottom: 32px; }
.cart__layout { display: grid; grid-template-columns: 1fr 360px; gap: 48px; align-items: start; }
.cart__items { list-style: none; border-top: 1px solid var(--lilac); }
.cart__item {
  display: grid;
  grid-template-columns: 96px 1fr auto auto;
  gap: 20px;
  align-items: center;
  padding: 20px 0;
  border-bottom: 1px solid var(--lilac);
}
.cart__thumb { width: 96px; aspect-ratio: 1; background: var(--surface); display: block; overflow: hidden; }
.cart__thumb img { width: 100%; height: 100%; object-fit: cover; }
.cart__thumb-fallback { display: block; width: 100%; height: 100%; background: var(--lilac); }
.cart__info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cart__name { font-weight: 500; }
.cart__name:hover { text-decoration: underline; }
.cart__variant { font-size: 14px; color: var(--ink-muted); }
.cart__remove { align-self: flex-start; font-size: 12px; letter-spacing: 0.8px; text-transform: uppercase; border-bottom: 1px solid var(--ink); }
.cart__qty { display: flex; align-items: center; border: 1px solid var(--ink); border-radius: var(--radius-button); }
.cart__qty button { width: 36px; height: 36px; font-size: 18px; }
.cart__qty span { min-width: 24px; text-align: center; }
.cart__line { font-weight: 500; min-width: 96px; text-align: right; }
.cart__summary {
  position: sticky;
  top: 96px;
  background: var(--surface);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cart__row { display: flex; justify-content: space-between; gap: 16px; }
.cart__row--muted { color: var(--ink-muted); font-size: 14px; }
.cart__row--total { font-weight: 500; font-size: 18px; padding-top: 16px; border-top: 1px solid var(--lilac); }
.cart__empty { padding: 48px 0; display: flex; flex-direction: column; align-items: flex-start; gap: 16px; }
.cart__empty-title { font-size: clamp(32px, 5vw, 48px); }

@media (max-width: 900px) {
  .cart__layout { grid-template-columns: 1fr; }
  .cart__summary { position: static; }
}

@media (max-width: 600px) {
  .cart__item { grid-template-columns: 72px 1fr; }
  .cart__thumb { width: 72px; }
  .cart__qty { grid-column: 2; justify-self: start; }
  .cart__line { grid-column: 2; text-align: left; }
}
</style>
```

- [ ] **Step 2: Verificar**

Run: `npx vitest run && npm run build` → verde.
Manual: agregar 2 productos, subir/bajar cantidades (no baja de 1 ni pasa del stock), "Quitar", bolsa vacía con "Ver productos", "Continuar al pago" abre el checkout de siempre. A 375px las filas se apilan sin desbordarse.

- [ ] **Step 3: Commit**

```bash
git add src/views/user/CartView.vue
git commit -m "feat(fe): carrito con filas finas, resumen fijo y estado vacio tipografico"
```

---

### Task 10: Seguimiento (solo estilo)

**Files:**
- Modify: `src/views/user/TrackingView.vue` (template: quitar íconos; `STATUS_COLORS`/`badgeStyle`; bloque `<style scoped>` completo)

**Interfaces:**
- Consumes: lo mismo que hoy (`src/lib/trackOrder.js`, sin cambios); `IconSearch` (Task 4).

La lógica no cambia. Solo el marcado de íconos, el estilo de la insignia y el CSS.

- [ ] **Step 1: Cambios en `<script setup>`**

Añade el import:

```js
import IconSearch from '../../components/icons/IconSearch.vue'
```

Reemplaza la función `badgeStyle` por esta. El texto de la insignia pasa a ciruela para cumplir el contraste; el color de estado queda como fondo suave y borde:

```js
function badgeStyle(color) {
  return { background: color + '33', color: 'var(--ink)', border: '1px solid ' + color }
}
```

- [ ] **Step 2: Cambios en `<template>`**

- Título: `<h1><i class="fas fa-truck"></i> Seguimiento de Pedido</h1>` → `<h1 class="display tracking__title">Seguimiento</h1>`.
- Botón de búsqueda: reemplaza `<i class="fas" :class="loading ? 'fa-spinner fa-spin' : 'fa-search'"></i>` por `<IconSearch v-if="!loading" />`.
- Mensaje: borra `<i class="fas fa-exclamation-circle"></i>`.
- Tarjetas: `<h3><i class="fas fa-box"></i> Productos</h3>` → `<h3 class="eyebrow">Productos</h3>`; `<h3><i class="fas fa-map-marker-alt"></i> Envío</h3>` → `<h3 class="eyebrow">Envío</h3>`.
- Enlace de rastreo: borra `<i class="fas fa-external-link-alt"></i> ` y deja `Rastrear paquete →`.

Luego confirma:

Run: `grep -n "fas fa-\|class=\"fas" src/views/user/TrackingView.vue || echo "sin Font Awesome"`
Esperado: `sin Font Awesome`.

- [ ] **Step 3: Reemplazar el bloque `<style scoped>`**

```css
<style scoped>
.tracking-page { padding-top: 48px; padding-bottom: var(--section-gap); }
.tracking__title { font-size: clamp(48px, 7vw, 80px); margin-bottom: 32px; }
.search-section { margin-bottom: 32px; }
.search-box { display: flex; gap: 12px; max-width: 760px; flex-wrap: wrap; }
.search-box input {
  flex: 1;
  min-width: 220px;
  padding: 14px 20px;
  background: var(--surface);
  border: none;
  border-radius: var(--radius-pill);
}
.search-box input::placeholder { color: var(--ink-muted); }
.search-box input:focus { outline: 2px solid var(--ink); outline-offset: 2px; }
.search-box button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 24px;
  background: var(--ink);
  color: var(--canvas);
  border-radius: var(--radius-button);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
.search-box button:disabled { opacity: 0.45; cursor: not-allowed; }
.not-found { padding: 24px; background: var(--surface); }

.order-detail { border-top: 1px solid var(--ink); padding-top: 32px; }
.order-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 32px; }
.order-header h2 { font-family: var(--font-display); font-weight: 800; font-size: 40px; line-height: 1; letter-spacing: 0.6px; }
.order-date { color: var(--ink-muted); font-size: 14px; margin-top: 4px; }
.status-badge { padding: 6px 16px; border-radius: var(--radius-pill); font-size: 14px; font-weight: 500; white-space: nowrap; }

.timeline { margin-bottom: 32px; padding-left: 20px; border-left: 1px solid var(--lilac); }
.timeline-item { position: relative; padding: 0 0 24px 24px; }
.timeline-item.last { padding-bottom: 0; }
.timeline-dot { position: absolute; left: -26px; top: 6px; width: 11px; height: 11px; border-radius: 50%; }
.timeline-status { font-weight: 500; }
.timeline-note { font-size: 14px; color: var(--ink-muted); margin: 4px 0; }
.timeline-date { font-size: 12px; color: var(--ink-muted); }

.order-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--canvas); }
.info-card { background: var(--surface); padding: 24px; }
.info-card h3 { margin-bottom: 16px; }
.info-item { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 8px; font-size: 14px; }
.info-item.total { font-weight: 500; font-size: 16px; margin-top: 8px; }
.info-card p { font-size: 14px; margin-bottom: 4px; }
hr { border: none; border-top: 1px solid var(--lilac); margin: 12px 0; }
.mt { margin-top: 12px; }
.track-link {
  display: inline-block;
  margin-top: 16px;
  padding: 12px 20px;
  border: 1px solid var(--ink);
  border-radius: var(--radius-button);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
.track-link:hover { background: var(--ink); color: var(--canvas); }

@media (max-width: 768px) {
  .order-info-grid { grid-template-columns: 1fr; }
  .order-header { flex-direction: column; }
  .search-box { flex-direction: column; }
  .search-box input { min-width: 0; }
}
</style>
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run && npm run build` → verde.
Manual: los 3 pedidos sembrados (`AIGO-SEED0001..3` + `cliente@aigo.local`) se ven con el estilo nuevo; la insignia de estado se lee bien; el mensaje de "no encontrado" sigue apareciendo.

- [ ] **Step 5: Commit**

```bash
git add src/views/user/TrackingView.vue
git commit -m "feat(fe): seguimiento con el estilo nuevo y sin Font Awesome"
```

---

### Task 11: Mockups locales y verificación final

**Files:**
- Create: `supabase/seed_catalog_local.sql`
- Modify: `supabase/config.toml` (`[db.seed] sql_paths`)

**Interfaces:**
- Consumes: productos de `supabase/seed.sql`; categoría `Velas` (Task 1).

- [ ] **Step 1: `supabase/seed_catalog_local.sql`**

```sql
-- ============================================================
-- IMAGENES DE MOCKUP Y PRODUCTO "VELAS" DE EJEMPLO — SOLO STACK LOCAL.
-- `supabase db push` NO ejecuta seeds. Fotos de Unsplash (licencia Unsplash:
-- uso comercial libre). La clienta las reemplaza desde el panel (image_url).
-- Idempotente.
-- ============================================================

update public.products set image_url = 'https://images.unsplash.com/photo-1619983081563-430f63602796?w=800&q=75'
 where name in ('BTS - Album "Proof"', 'TWICE - Album "READY TO BE"');

update public.products set image_url = 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&q=75'
 where name = 'Stray Kids - Hoodie "MANIAC"';

update public.products set image_url = 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=75'
 where name = 'BLACKPINK - T-shirt "Born Pink"';

insert into public.products (name, "group", category, description, image_url)
values ('Vela aromática "Purple"', 'AIGO', 'Velas',
        'Vela de soya con aroma a lavanda, hecha a mano. 200 g.',
        'https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800&q=75')
on conflict (name) do nothing;

insert into public.product_variants (product_id, label, price_cents, stock, weight_grams)
select p.id, 'Único', 32000, 12, 350
  from public.products p
 where p.name = 'Vela aromática "Purple"'
   and not exists (select 1 from public.product_variants v where v.product_id = p.id);
```

- [ ] **Step 2: Registrar y aplicar (sin reset)**

En `supabase/config.toml`, sección `[db.seed]`:

```toml
sql_paths = ["./seed.sql", "./seed_orders.sql", "./seed_catalog_local.sql"]
```

Run (dos veces, para comprobar idempotencia):
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/seed_catalog_local.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/seed_catalog_local.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -Atc "select count(*) from public.product_variants v join public.products p on p.id=v.product_id where p.category='Velas'"
```
Esperado: sin errores; la segunda pasada inserta 0 filas; el conteo final es `1`.

- [ ] **Step 3: Verificación automática de la fase**

Run:
```bash
npx vitest run
npm run build
supabase test db
grep -rn "Poppins" src index.html || echo "OK: sin Poppins"
grep -rln "fas fa-" src/views/user src/components | grep -v CheckoutView || echo "OK: sin Font Awesome en vistas publicas"
grep -rn "box-shadow" src/views/user src/components | grep -v CheckoutView || echo "OK: sin sombras"
grep -rn "linear-gradient" src/views/user src/components | grep -v CheckoutView
grep -rn "#A583AA\|#a583aa" src/views/user src/components | grep -v CheckoutView || echo "OK: sin #A583AA"
```
Esperado: Vitest y pgTAP (`Tests=113`) verdes; build limpio; los `OK`; el grep de `linear-gradient` devuelve **solo** la línea del `.hero::after` de `HomeView.vue`.

- [ ] **Step 4: Verificación manual (375px y 1280px)**

1. Inicio contra la maqueta v3; "Velas" muestra la vela de ejemplo.
2. Menú móvil, buscador del header, contador de la bolsa.
3. Tarjeta tipográfica en productos sin mockup (lightsticks, photocards, pósters).
4. Producto agotado: pon el stock de un producto en 0 desde el admin → etiqueta "Agotado" y botón deshabilitado en tarjeta y detalle.
5. Carrito vacío y con productos; seguimiento con los 3 pedidos sembrados.
6. **Admin** (`/admin`) y **checkout** siguen legibles con la paleta heredada (botones ciruela, textos legibles).

- [ ] **Step 5: Commit**

```bash
git add supabase/seed_catalog_local.sql supabase/config.toml
git commit -m "feat(db): mockups de catalogo y vela de ejemplo para desarrollo local"
```

---

## Criterios de éxito (del spec)

1. Ninguno de los clichés listados en el Contexto del spec aparece en las vistas públicas.
2. Inicio se corresponde con la maqueta v3.
3. Todas las combinaciones de texto cumplen WCAG AA.
4. Cambiar la marca por el logo requiere editar solo `BrandMark.vue`.
5. Tests y build en verde; admin y checkout funcionan igual que antes.
