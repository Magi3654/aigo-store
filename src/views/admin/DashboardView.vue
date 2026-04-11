<script setup>
import { useOrdersStore } from '../../stores/orders'
import { useProductsStore } from '../../stores/products'
import { computed } from 'vue'
import AdminLayout from '../../components/AdminLayout.vue'

const ordersStore = useOrdersStore()
const productsStore = useProductsStore()

const stats = computed(() => ({
  totalOrders: ordersStore.orders.length,
  pending: ordersStore.orders.filter(o => o.status === 'pending').length,
  revenue: ordersStore.orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0),
  products: productsStore.products.length
}))

const recentOrders = computed(() => ordersStore.orders.slice(0, 5))

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
</script>

<template>
  <AdminLayout>
    <h1>Dashboard</h1>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(234,146,174,0.2); color: #EA92AE;">
          <i class="fas fa-shopping-bag"></i>
        </div>
        <div>
          <p class="stat-value">{{ stats.totalOrders }}</p>
          <p class="stat-label">Pedidos totales</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(193,135,151,0.2); color: #C18797;">
          <i class="fas fa-clock"></i>
        </div>
        <div>
          <p class="stat-value">{{ stats.pending }}</p>
          <p class="stat-label">Pendientes</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(107,165,137,0.2); color: #6BA589;">
          <i class="fas fa-dollar-sign"></i>
        </div>
        <div>
          <p class="stat-value">${{ stats.revenue.toLocaleString() }}</p>
          <p class="stat-label">Ingresos</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(147,109,164,0.2); color: #936DA4;">
          <i class="fas fa-boxes-stacked"></i>
        </div>
        <div>
          <p class="stat-value">{{ stats.products }}</p>
          <p class="stat-label">Productos</p>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Pedidos Recientes</h2>
        <router-link to="/admin/pedidos" class="view-all">Ver todos <i class="fas fa-arrow-right"></i></router-link>
      </div>

      <div v-if="recentOrders.length" class="orders-table">
        <div class="table-header">
          <span>Pedido</span><span>Cliente</span><span>Total</span><span>Estado</span><span>Fecha</span>
        </div>
        <div v-for="order in recentOrders" :key="order.id" class="table-row">
          <span class="order-id">{{ order.id }}</span>
          <span>{{ order.customer.name }}</span>
          <span>${{ order.total.toLocaleString() }}</span>
          <span
            class="status-badge"
            :style="{ background: ordersStore.statusColors[order.status] + '22', color: ordersStore.statusColors[order.status] }"
          >{{ ordersStore.statusLabels[order.status] }}</span>
          <span class="date">{{ formatDate(order.createdAt) }}</span>
        </div>
      </div>
      <div v-else class="empty">
        <p>No hay pedidos aún</p>
      </div>
    </div>
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

.orders-table {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.table-header, .table-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.8fr 0.8fr 0.6fr;
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
.order-id { font-weight: 600; color: var(--primary-light); }
.status-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
}
.date { color: var(--text-muted); font-size: 0.85rem; }
.empty { text-align: center; padding: 40px; color: var(--text-muted); }

@media (max-width: 768px) {
  .table-header { display: none; }
  .table-row {
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
}
</style>
