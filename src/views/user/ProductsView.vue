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
