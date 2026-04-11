<script setup>
import { useOrdersStore } from '../../stores/orders'
import { ref } from 'vue'

const ordersStore = useOrdersStore()
const searchId = ref('')
const order = ref(null)
const notFound = ref(false)

function searchOrder() {
  const found = ordersStore.getOrderById(searchId.value.trim().toUpperCase())
  if (found) {
    order.value = found
    notFound.value = false
  } else {
    order.value = null
    notFound.value = true
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}
</script>

<template>
  <div class="tracking-page container">
    <h1><i class="fas fa-truck"></i> Seguimiento de Pedido</h1>

    <div class="search-section">
      <div class="search-box">
        <input
          v-model="searchId"
          placeholder="Ingresa tu número de pedido (ej: AIGO-XXXX)"
          @keyup.enter="searchOrder"
        />
        <button @click="searchOrder" :disabled="!searchId.trim()">
          <i class="fas fa-search"></i> Buscar
        </button>
      </div>
    </div>

    <div v-if="notFound" class="not-found">
      <i class="fas fa-exclamation-circle"></i>
      <p>No se encontró ningún pedido con ese número</p>
    </div>

    <div v-if="order" class="order-detail">
      <div class="order-header">
        <div>
          <h2>{{ order.id }}</h2>
          <p class="order-date">Creado: {{ formatDate(order.createdAt) }}</p>
        </div>
        <span
          class="status-badge"
          :style="{ background: ordersStore.statusColors[order.status] + '22', color: ordersStore.statusColors[order.status], border: '1px solid ' + ordersStore.statusColors[order.status] }"
        >
          {{ ordersStore.statusLabels[order.status] }}
        </span>
      </div>

      <!-- Timeline -->
      <div class="timeline">
        <div
          v-for="(entry, i) in order.history"
          :key="i"
          class="timeline-item"
          :class="{ last: i === order.history.length - 1 }"
        >
          <div class="timeline-dot" :style="{ background: ordersStore.statusColors[entry.status] }"></div>
          <div class="timeline-content">
            <p class="timeline-status">{{ ordersStore.statusLabels[entry.status] }}</p>
            <p class="timeline-note">{{ entry.note }}</p>
            <p class="timeline-date">{{ formatDate(entry.date) }}</p>
          </div>
        </div>
      </div>

      <!-- Order info -->
      <div class="order-info-grid">
        <div class="info-card">
          <h3><i class="fas fa-box"></i> Productos</h3>
          <div v-for="item in order.items" :key="item.id" class="info-item">
            <span>{{ item.name }} x{{ item.quantity }}</span>
            <span>${{ (item.price * item.quantity).toLocaleString() }}</span>
          </div>
          <hr />
          <div class="info-item"><span>Envío ({{ order.shipping.type }})</span><span>${{ order.shipping.cost }}</span></div>
          <div class="info-item total"><span>Total</span><span>${{ order.total.toLocaleString() }} MXN</span></div>
        </div>
        <div class="info-card">
          <h3><i class="fas fa-map-marker-alt"></i> Envío</h3>
          <p>{{ order.customer.name }}</p>
          <p>{{ order.customer.address }}</p>
          <p>{{ order.customer.city }}, {{ order.customer.state }}</p>
          <p>CP: {{ order.customer.postalCode }}</p>
          <p class="mt">{{ order.shipping.zone }} — {{ order.shipping.days }} días hábiles</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tracking-page { padding: 40px 20px 80px; }
.tracking-page h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 30px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.search-section { margin-bottom: 30px; }
.search-box { display: flex; gap: 10px; max-width: 600px; }
.search-box input {
  flex: 1;
  padding: 14px 18px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  font-size: 1rem;
}
.search-box input:focus { outline: none; border-color: var(--primary); }
.search-box button {
  padding: 14px 24px;
  background: var(--gradient);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.search-box button:disabled { opacity: 0.5; }
.not-found {
  text-align: center;
  padding: 40px;
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border);
}
.not-found i { font-size: 2rem; color: var(--warning); margin-bottom: 10px; }

.order-detail {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 30px;
}
.order-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
}
.order-header h2 { font-size: 1.4rem; }
.order-date { color: var(--text-muted); font-size: 0.85rem; margin-top: 4px; }
.status-badge {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
}

.timeline { margin-bottom: 30px; padding-left: 20px; border-left: 2px solid var(--border); }
.timeline-item { position: relative; padding: 0 0 24px 24px; }
.timeline-item.last { padding-bottom: 0; }
.timeline-dot {
  position: absolute;
  left: -9px;
  top: 4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
}
.timeline-status { font-weight: 600; }
.timeline-note { font-size: 0.85rem; color: var(--text-muted); margin: 4px 0; }
.timeline-date { font-size: 0.8rem; color: var(--text-muted); }

.order-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.info-card {
  background: var(--bg-input);
  border-radius: 12px;
  padding: 20px;
}
.info-card h3 {
  font-size: 1rem;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--primary-light);
}
.info-item { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem; }
.info-item.total { font-weight: 700; font-size: 1rem; margin-top: 8px; }
.info-card p { font-size: 0.9rem; margin-bottom: 4px; color: var(--text-muted); }
hr { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
.mt { margin-top: 12px; color: var(--accent) !important; }

@media (max-width: 768px) {
  .order-info-grid { grid-template-columns: 1fr; }
  .order-header { flex-direction: column; gap: 10px; }
}
</style>
