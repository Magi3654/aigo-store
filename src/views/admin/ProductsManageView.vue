<script setup>
import { ref, computed, onMounted } from 'vue'
import AdminLayout from '../../components/AdminLayout.vue'
import { useAdminCatalogStore } from '../../stores/adminCatalog.js'
import { formatMXN } from '../../lib/format.js'
import { CATEGORIES } from '../../lib/validateProduct.js'

const catalog = useAdminCatalogStore()

const search = ref('')
const categoryFilter = ref('')
const showInactive = ref(false)
const actionError = ref(null)

onMounted(() => catalog.fetchAll())

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return catalog.products.filter((p) => {
    if (!showInactive.value && !p.is_active) return false
    if (categoryFilter.value && p.category !== categoryFilter.value) return false
    if (term && !p.name.toLowerCase().includes(term) && !p.group.toLowerCase().includes(term)) return false
    return true
  })
})

function activeVariants(product) {
  return product.variants.filter((v) => v.is_active)
}

function priceRange(product) {
  const prices = activeVariants(product).map((v) => v.price_cents)
  if (!prices.length) return 'sin variantes activas'
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? formatMXN(min) : `${formatMXN(min)} – ${formatMXN(max)}`
}

function totalStock(product) {
  return activeVariants(product).reduce((sum, v) => sum + v.stock, 0)
}

async function toggleActive(product) {
  actionError.value = null
  const res = await catalog.setProductActive(product.id, !product.is_active)
  if (!res.ok) actionError.value = res.error
}
</script>

<template>
  <AdminLayout>
    <div class="products-header">
      <h1>Productos</h1>
      <button class="btn-primary" disabled>
        <i class="fas fa-plus"></i> Nuevo producto
      </button>
    </div>

    <div class="toolbar">
      <input v-model="search" class="search" type="search" placeholder="Buscar por nombre o grupo…" />
      <select v-model="categoryFilter" class="filter-select">
        <option value="">Todas las categorías</option>
        <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
      </select>
      <label class="checkbox">
        <input v-model="showInactive" type="checkbox" /> Ver inactivos
      </label>
    </div>

    <p v-if="actionError" class="error-msg">{{ actionError }}</p>
    <p v-if="catalog.error" class="error-msg">{{ catalog.error }}</p>
    <p v-else-if="catalog.loading && !catalog.loaded" class="muted">Cargando catálogo…</p>

    <div v-else-if="filtered.length" class="product-list">
      <div v-for="p in filtered" :key="p.id" class="product-row" :class="{ inactive: !p.is_active }">
        <img v-if="p.image_url" :src="p.image_url" :alt="p.name" class="thumb" />
        <div v-else class="thumb thumb-empty"><i class="fas fa-image"></i></div>

        <div class="product-info">
          <p class="product-name">
            {{ p.name }}
            <span v-if="!p.is_active" class="tag">inactivo</span>
          </p>
          <p class="product-meta">
            {{ p.group }} · {{ p.category }} ·
            {{ activeVariants(p).length }} {{ activeVariants(p).length === 1 ? 'variante' : 'variantes' }}
          </p>
        </div>

        <span class="product-price">{{ priceRange(p) }}</span>
        <span class="product-stock" :class="{ zero: totalStock(p) === 0 }">{{ totalStock(p) }} u.</span>

        <div class="row-actions">
          <button class="icon-btn" title="Editar" disabled><i class="fas fa-pen"></i></button>
          <button
            class="icon-btn"
            :title="p.is_active ? 'Despublicar' : 'Republicar'"
            @click="toggleActive(p)"
          >
            <i :class="p.is_active ? 'fas fa-trash' : 'fas fa-rotate-left'"></i>
          </button>
        </div>
      </div>
    </div>

    <div v-else class="empty">
      <i class="fas fa-box-open"></i>
      <p>No hay productos que coincidan con el filtro</p>
    </div>
  </AdminLayout>
</template>

<style scoped>
.products-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
h1 { font-size: 1.8rem; font-weight: 700; }
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--gradient);
  color: white;
  border: none;
  border-radius: 12px;
  padding: 12px 20px;
  font-weight: 600;
}
.btn-primary:disabled { opacity: 0.6; }

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.search, .filter-select {
  padding: 10px 14px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 0.9rem;
}
.search { flex: 1; min-width: 200px; }
.checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.product-list {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.product-row {
  display: grid;
  grid-template-columns: 48px 1fr auto auto auto;
  gap: 14px;
  align-items: center;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
}
.product-row:first-child { border-top: none; }
.product-row.inactive { opacity: 0.55; }
.thumb {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
}
.thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-input);
  color: var(--text-muted);
}
.product-name { font-weight: 600; font-size: 0.95rem; }
.product-meta { color: var(--text-muted); font-size: 0.8rem; }
.tag {
  font-size: 0.65rem;
  background: var(--bg-input);
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: 6px;
  text-transform: uppercase;
}
.product-price { font-weight: 600; font-size: 0.9rem; }
.product-stock { color: var(--text-muted); font-size: 0.85rem; }
.product-stock.zero { color: var(--danger); font-weight: 600; }
.row-actions { display: flex; gap: 6px; }
.icon-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 34px;
  height: 34px;
  color: var(--text-muted);
  transition: all 0.2s;
}
.icon-btn:hover:not(:disabled) { color: var(--primary-light); border-color: var(--primary); }
.icon-btn:disabled { opacity: 0.4; }

.error-msg { color: var(--danger); margin-bottom: 16px; }
.muted { color: var(--text-muted); }
.empty { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty i { font-size: 2.5rem; margin-bottom: 12px; color: var(--primary-light); }

@media (max-width: 768px) {
  .product-row { grid-template-columns: 40px 1fr auto; }
  .product-price, .product-stock { grid-column: 2 / -1; font-size: 0.8rem; }
}
</style>
