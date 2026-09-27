# Diseño: Rediseño visual de la tienda pública

**Fecha:** 2026-09-27
**Estado:** Aprobado (dirección visual con maquetas + diseño por secciones en conversación) — pendiente de revisión del spec escrito
**Rama:** `feature/supabase-backend`
**Maqueta de referencia:** `docs/superpowers/specs/assets/2026-09-27-home-mockup-v3.html` (abrir en el navegador). Donde la maqueta y este spec difieran (colores de etiquetas y de la línea "Hecho por ARMY", por contraste), manda el spec.

## Contexto

La tienda se ve "hecha con IA" porque junta los clichés de plantilla: Poppins, degradado
rosa→morado en botones y títulos (incluido texto con degradado), hero con círculos
decorativos, tarjetas redondeadas con sombra suave, un ícono de Font Awesome en cada botón
y categoría (34 en las vistas públicas), pastel en todas las superficies y textos genéricos.

La clienta es ARMY (fandom de BTS), pero la tienda vende varios grupos. El logo llega
después; el diseño debe aceptarlo sin rehacerse.

## Objetivo

Que la tienda parezca diseñada a propósito, con personalidad de marca, y que un comprador de
K-pop la perciba como una tienda real y confiable.

## Dirección visual (decidida con maquetas)

- **Referencia de estructura:** estilo Bose — casi monocromo, plano, titulares condensados
  muy gruesos, la fotografía como protagonista, controles de compra sobrios. Se toma el
  estilo, no la marca: ni su nombre, ni sus fuentes, ni sus assets.
- **Paleta:** se conserva la original de AIGO. Lo que cambia es el papel de cada color:
  ciruela como "tinta" (hace el papel del negro de Bose); lila como único color de
  superficie con carácter (franja de avisos y sección destacada); rosa solo en etiquetas;
  lavanda como guiño ARMY en detalles, nunca en bloques grandes.
- **Tipografía:** Barlow Condensed 800 para titulares (mayúsculas, interlineado 0.88);
  Inter 400/500 para todo lo demás.
- **Forma:** esquinas rectas; sin sombras; sin degradados en controles ni superficies.

## Tokens (`src/style.css`)

### Color

| token | valor | papel |
|---|---|---|
| `--ink` | `#4A3347` | texto, bordes de acción, botones sólidos, pie, línea bajo el header |
| `--ink-muted` | `#6F5A6D` | texto secundario (reemplaza a `#A583AA`, que no pasa AA) |
| `--canvas` | `#FBF8F8` | fondo de página, botón claro sobre foto |
| `--surface` | `#F3E8EE` | tarjetas de producto, campos, caja de resumen |
| `--lilac` | `#E1C7EA` | franja de avisos, sección destacada, tarjeta sin imagen, líneas finas |
| `--signal` | `#936DA4` | acento ARMY: solo texto ≥ 24px bold o elementos decorativos |
| `--badge` | `#EA92AE` | fondo de etiquetas ("Preventa", "Últimas piezas") |
| `--almond` | `#FCD4C5` | reservado |
| `--success` / `--warning` / `--danger` | se conservan | estados |

**Compatibilidad:** `--gradient` deja de ser degradado y pasa a `var(--ink)`; `--primary`,
`--text`, `--text-muted`, `--bg`, `--bg-card`, `--bg-input`, `--border` se reasignan a los
tokens nuevos. Así el admin y el checkout (que no se rediseñan) heredan el estilo sin romperse.

### Contraste (WCAG AA, texto normal ≥ 4.5:1)

| combinación | ratio | uso |
|---|---|---|
| `--ink` sobre `--canvas` | 10.72 | texto general |
| `--ink` sobre `--surface` | 9.48 | tarjetas |
| `--ink` sobre `--lilac` | 7.31 | franja y sección destacada |
| `--canvas` sobre `--ink` | 10.72 | botón sólido, pie |
| `--ink-muted` sobre `--surface` | 5.24 | metadatos en tarjetas |
| `--ink` sobre `--badge` | 4.97 | etiquetas |

**Prohibido para texto normal:** blanco sobre `--badge` (2.28), `--signal` sobre `--lilac`
(2.73), `--signal` sobre `--canvas` (4.01), `#A583AA` sobre cualquier superficie clara.
Por eso las etiquetas llevan texto ciruela y la línea "Hecho por ARMY…" va en `--ink`.

### Tipografía

Google Fonts: `Barlow Condensed` (800) e `Inter` (400, 500). Se retira Poppins de
`index.html` y de `style.css`.

| rol | familia | peso | tamaño | interlineado | extra |
|---|---|---|---|---|---|
| hero | Barlow Condensed | 800 | `clamp(56px, 9vw, 104px)` | 0.88 | mayúsculas, tracking 0.6px |
| sección | Barlow Condensed | 800 | `clamp(28px, 4vw, 40px)` | 1.0 | mayúsculas |
| nombre de producto (detalle) | Barlow Condensed | 800 | 40px | 1.0 | mayúsculas |
| cuerpo | Inter | 400 | 16px | 1.5 | |
| etiqueta de botón | Inter | 500 | 14px | 1.0 | mayúsculas, tracking 0.8px |
| navegación | Inter | 400 | 14px | 1.2 | mayúsculas, tracking 0.6px |
| microtexto | Inter | 400 | 12px | 1.33 | |

### Forma y espaciado

- Radios: tarjetas y paneles `0`; botones `2px`; buscador, campos del seguimiento y
  etiquetas `9999px`.
- Sin `box-shadow` ni `linear-gradient` en vistas públicas (única excepción: el sombreado
  inferior de la foto del hero para legibilidad del texto).
- Separación por líneas de 1px (`--lilac` o `--ink`) o cambio de superficie.
- Escala de espaciado en múltiplos de 4px: `--space-1` 4 … `--space-30` 120. Separación
  entre secciones: 96px en escritorio, 56px en móvil.

### Íconos

Se retira Font Awesome de las vistas públicas y de los componentes nuevos. Cuatro íconos SVG
de línea (trazo 1.5px, `currentColor`) en `src/components/icons/`: `IconSearch`, `IconBag`,
`IconMenu`, `IconClose`. El admin sigue usando Font Awesome (la hoja de estilos se queda en
`index.html` mientras el admin la use).

## Componentes nuevos (`src/components/`)

| componente | qué hace | props |
|---|---|---|
| `AnnouncementBar.vue` | franja `--lilac`, texto `--ink` 12px centrado | `text` |
| `SiteHeader.vue` | reemplaza a `NavBar.vue`. Grid de 3 columnas: navegación en mayúsculas a la izquierda (Inicio, Productos, Seguimiento), marca al centro, buscador en píldora + bolsa con contador a la derecha. Línea de 1px `--ink` debajo. En móvil (<768px): menú hamburguesa que abre panel a pantalla completa. El buscador envía a `/productos?q=…` | — |
| `BrandMark.vue` | la marca: hoy el texto "AIGO" en Barlow Condensed 800; mañana el logo. Único lugar a cambiar | — |
| `SiteFooter.vue` | fondo `--ink`, texto `--lilac`: marca, enlaces de ayuda (Seguimiento, Envíos, Preguntas frecuentes) y redes | — |
| `ProductTile.vue` | tarjeta de producto: imagen cuadrada sobre `--surface` (o tarjeta tipográfica si no hay imagen), etiqueta opcional, grupo, nombre, precio con `formatMXN`, botón "Agregar" con borde | `product` (forma de `mapProduct`) |
| `SectionHeading.vue` | título de sección en Barlow + enlace opcional a la derecha | `title`, `to?`, `linkText?` |
| `BaseButton.vue` | `variant`: `solid` (ciruela), `outline` (borde ciruela), `on-photo` (claro con borde, para el hero). Renderiza `router-link` si recibe `to`, si no `button` | `variant`, `to?`, `type?`, `disabled?` |

`App.vue` monta `SiteHeader` y `SiteFooter` en todas las rutas públicas (no en `/admin`); `NavBar.vue` se elimina.

**Tarjeta tipográfica (sin imagen):** si `image_url` está vacío o es un placeholder de
`placehold.co`, `ProductTile` muestra un cuadrado `--lilac` con el grupo en Barlow
Condensed. La regla vive en una función pura `hasRealImage(url)` en `src/lib/`, con test.

**Etiqueta de producto:** "Últimas piezas" cuando la variante por defecto tiene stock 1–4;
"Agotado" (y botón deshabilitado) con stock 0. No hay "Preventa" en el modelo de datos:
queda fuera hasta que exista.

## Pantallas

### Inicio (`HomeView.vue`)

Igual a la maqueta v3, de arriba abajo:
1. `AnnouncementBar` — "Envíos a todo México".
2. Hero a pantalla completa (altura `min(78vh, 720px)`), foto local, sombreado inferior
   ciruela, título y texto abajo a la izquierda, `BaseButton on-photo` "Ver colección" →
   `/productos` y enlace de texto "Novedades →" → `/productos`.
3. Fila de categorías tipográfica (6 celdas separadas por líneas `--lilac`), cada una →
   `/productos?cat=<Categoria>`.
4. "Lo más pedido": `SectionHeading` + 4 `ProductTile` (2 por fila en móvil). Mantiene el
   criterio actual de destacados.
5. Sección destacada: bloque `--lilac` de dos columnas (texto + foto), línea pequeña en
   mayúsculas, título en Barlow, texto y `BaseButton solid` "Explorar" → `/productos`.
6. `SiteFooter` (global).

**Textos de portada** en `src/content/home.js` (exporta un objeto con los textos del
hero, la sección destacada y la franja), para que se cambien sin tocar las vistas. Los
valores iniciales son los de la maqueta; la clienta los ajusta.

### Catálogo (`ProductsView.vue`)

Título "Productos" (Barlow); fila con pestañas de categoría (Todas + las 6) subrayadas en
`--ink` la activa; buscador en píldora que lee/escribe `?q=`; contador de resultados en
microtexto; cuadrícula de `ProductTile` (4/3/2 columnas según ancho) con separación de 1px;
estado vacío tipográfico "No encontramos productos" + `BaseButton outline` "Ver todo".
Conserva los filtros actuales (`?cat=`, búsqueda, estados de carga y error).

### Detalle (`ProductDetailView.vue`)

Dos columnas (una en móvil): imagen cuadrada grande sobre `--surface`; a la derecha grupo
(microtexto mayúsculas `--ink-muted`), nombre (Barlow 40px), precio, selector de variantes
como cuadros con borde (seleccionado: borde 2px `--ink`), selector de cantidad con borde,
`BaseButton solid` "Agregar a la bolsa" a todo el ancho, stock en microtexto. La cotización
de envío existente se conserva funcionalmente y solo se reestiliza como caja con borde
(la reemplaza Skydropx en la 2c). Enlace "← Volver" en texto, sin ícono.

### Carrito (`CartView.vue`)

Filas separadas por líneas `--lilac` (imagen 96px, nombre, variante, cantidad con borde,
precio, "Quitar" como enlace de texto); resumen en caja `--surface` fija al hacer scroll en
escritorio; `BaseButton solid` "Continuar al pago"; estado vacío tipográfico con
`BaseButton outline` "Ver productos". La lógica del carrito no cambia.

### Seguimiento (`TrackingView.vue`)

Misma estructura y lógica de la Fase 2d; estilos nuevos: campos en píldora `--surface`,
botón sólido, insignia de estado en píldora con texto `--ink` sobre el color de estado
suavizado, línea de tiempo con trazo de 1px `--lilac`, tarjetas `--surface` sin radio.
`STATUS_COLORS` se ajusta para que toda insignia cumpla 4.5:1.

### Admin y checkout

Solo heredan tokens y fuentes; no se toca su marcado. Se verifica que se vean coherentes y
que nada quede ilegible tras la reasignación de variables.

## Imágenes

- **Hero:** la foto de concierto de Unsplash (`photo-1493225457124-a3eb161ffa5f`, licencia
  Unsplash, uso comercial libre) se descarga a `src/assets/hero-concierto.jpg` (≤ 250 KB,
  ancho 1600px) para no depender de un enlace externo.
- **Mockups de producto (solo local):** `supabase/seed_catalog_local.sql` (también crea una vela de ejemplo en la categoría Velas), idempotente y añadido a
  `[db.seed] sql_paths`, actualiza `image_url` de productos sembrados con mockups de Unsplash
  donde encajan: playeras (`photo-1583743814966-8936f5b7be1a`,
  `photo-1521572163474-6864f9cf17ab`), álbumes (`photo-1619983081563-430f63602796`) y velas
  (`photo-1603006905003-be475563bc59`). Se aplica con `psql`, nunca con `db reset`.
- El resto de productos usa la tarjeta tipográfica. La clienta reemplaza cualquier imagen
  desde el panel (`image_url`).

## Orden y relación con otros cambios

1. **Antes (cambio aparte, ya aprobado):** categoría **Velas** — migración del CHECK de
   `products.category`, `CATEGORIES` en `validateProduct.js`, filtros del catálogo y pgTAP.
   El rediseño asume que existe.
2. Tokens + fuentes + componentes base.
3. Pantallas, en el orden Inicio → Catálogo → Detalle → Carrito → Seguimiento.

## Fuera de alcance

- Logo (llega después; entra por `BrandMark.vue`).
- Rediseño del admin y del checkout (el checkout se reescribe en la 2c).
- Página de "Envíos" y "Preguntas frecuentes": los enlaces del pie apuntan a `/seguimiento`
  y a `#` hasta que existan; se listan como pendientes.
- Etiqueta "Preventa" (no existe en el modelo de datos).
- Modo oscuro.

## Pruebas y verificación

- **Vitest:** `hasRealImage` (URL vacía, `null`, `placehold.co`, URL real); la regla de
  etiqueta de `ProductTile` extraída como función pura `productBadge(variant)` (stock 0,
  1–4, ≥ 5, sin variante). La suite existente sigue verde.
- `npm run build` sin errores ni advertencias.
- `grep` sin `Poppins`, `linear-gradient` (salvo el sombreado del hero), `box-shadow` ni
  `fas fa-` en `src/views/user/` (excepto `CheckoutView.vue`) y en los componentes nuevos.
- Contraste: la tabla de arriba es la referencia; ninguna combinación prohibida en el código.
- Manual en navegador, a 375px y 1280px: cada pantalla contra la maqueta v3; menú móvil;
  buscador del header; tarjeta tipográfica; producto agotado; carrito vacío; seguimiento con
  los 3 pedidos sembrados; admin y checkout siguen legibles.

## Criterios de éxito

1. Ninguno de los clichés listados en el Contexto aparece en las vistas públicas.
2. Inicio se corresponde con la maqueta v3.
3. Todas las combinaciones de texto cumplen WCAG AA.
4. Cambiar la marca por el logo requiere editar solo `BrandMark.vue`.
5. Tests y build en verde; admin y checkout funcionan igual que antes.
