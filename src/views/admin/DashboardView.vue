<script setup>
import { computed, onMounted } from 'vue'
import AdminLayout from '../../components/AdminLayout.vue'
import { useAdminCatalogStore } from '../../stores/adminCatalog.js'
import { formatMXN } from '../../lib/format.js'

const catalog = useAdminCatalogStore()

onMounted(() => catalog.fetchAll())

// Solo metricas que existen hoy: el catalogo. Los pedidos llegan en la Fase 2c.
const activeVariants = computed(() =>
  catalog.products.flatMap((p) => p.variants.filter((v) => v.is_active))
)

const stats = computed(() => ({
  active: catalog.products.filter((p) => p.is_active).length,
  inactive: catalog.products.filter((p) => !p.is_active).length,
  variants: activeVariants.value.length,
  units: activeVariants.value.reduce((sum, v) => sum + v.stock, 0),
  outOfStock: activeVariants.value.filter((v) => v.stock === 0).length,
  inventoryValue: activeVariants.value.reduce((sum, v) => sum + v.price_cents * v.stock, 0),
}))

const lowStock = computed(() =>
  catalog.products
    .filter((p) => p.is_active)
    .flatMap((p) => p.variants.filter((v) => v.is_active && v.stock < 5).map((v) => ({ product: p, variant: v })))
    .sort((a, b) => a.variant.stock - b.variant.stock)
)
</script>

<template>
  <AdminLayout>
    <h1>Dashboard</h1>

    <p v-if="catalog.error" class="error-msg">{{ catalog.error }}</p>
    <p v-else-if="catalog.loading && !catalog.loaded" class="muted">Cargando catálogo…</p>

    <template v-else>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(234,146,174,0.2); color: #EA92AE;">
            <i class="fas fa-boxes-stacked"></i>
          </div>
          <div>
            <p class="stat-value">{{ stats.active }}</p>
            <p class="stat-label">Productos publicados</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(147,109,164,0.2); color: #936DA4;">
            <i class="fas fa-tags"></i>
          </div>
          <div>
            <p class="stat-value">{{ stats.variants }}</p>
            <p class="stat-label">Variantes activas</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(107,165,137,0.2); color: #6BA589;">
            <i class="fas fa-cubes"></i>
          </div>
          <div>
            <p class="stat-value">{{ stats.units }}</p>
            <p class="stat-label">Unidades en stock</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(200,112,112,0.2); color: #C87070;">
            <i class="fas fa-triangle-exclamation"></i>
          </div>
          <div>
            <p class="stat-value">{{ stats.outOfStock }}</p>
            <p class="stat-label">Variantes agotadas</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(193,135,151,0.2); color: #C18797;">
            <i class="fas fa-sack-dollar"></i>
          </div>
          <div>
            <p class="stat-value">{{ formatMXN(stats.inventoryValue) }}</p>
            <p class="stat-label">Valor del inventario</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(165,131,170,0.2); color: #A583AA;">
            <i class="fas fa-eye-slash"></i>
          </div>
          <div>
            <p class="stat-value">{{ stats.inactive }}</p>
            <p class="stat-label">Productos despublicados</p>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <h2>Bajo stock (menos de 5 unidades)</h2>
          <router-link to="/admin/productos" class="view-all">Gestionar <i class="fas fa-arrow-right"></i></router-link>
        </div>

        <div v-if="lowStock.length" class="stock-table">
          <div class="table-header"><span>Producto</span><span>Variante</span><span>Stock</span></div>
          <div v-for="row in lowStock" :key="row.variant.id" class="table-row">
            <span>{{ row.product.name }}</span>
            <span class="muted">{{ row.variant.label }}</span>
            <span :class="{ zero: row.variant.stock === 0 }">{{ row.variant.stock }} u.</span>
          </div>
        </div>
        <div v-else class="empty"><p>Todo el catálogo tiene 5 o más unidades</p></div>
      </div>

      <p class="note">
        <i class="fas fa-circle-info"></i>
        Las métricas de ventas y pedidos aparecerán cuando el checkout con Stripe entre en
        operación (Fase 2c).
      </p>
    </template>
  </AdminLayout>
</template>

<style scoped>
h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 24px; }
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 30px;
}
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
}
.stat-value { font-size: 1.5rem; font-weight: 700; }
.stat-label { font-size: 0.8rem; color: var(--text-muted); }

.section { margin-bottom: 30px; }
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.section-header h2 { font-size: 1.2rem; }
.view-all {
  color: var(--primary-light);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.stock-table {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.table-header, .table-row {
  display: grid;
  grid-template-columns: 2fr 1fr 0.6fr;
  padding: 12px 20px;
  gap: 10px;
  align-items: center;
  font-size: 0.9rem;
}
.table-header {
  background: var(--bg-input);
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--text-muted);
  text-transform: uppercase;
}
.table-row { border-top: 1px solid var(--border); }
.zero { color: var(--danger); font-weight: 600; }
.muted { color: var(--text-muted); }
.error-msg { color: var(--danger); }
.empty { text-align: center; padding: 40px; color: var(--text-muted); }
.note {
  color: var(--text-muted);
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 768px) {
  .table-header { display: none; }
  .table-row { grid-template-columns: 1fr 1fr; gap: 6px; }
}
</style>
