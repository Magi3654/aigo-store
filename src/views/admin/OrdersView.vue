<script setup>
import { useOrdersStore } from '../../stores/orders'
import { ref, computed } from 'vue'
import AdminLayout from '../../components/AdminLayout.vue'

const ordersStore = useOrdersStore()
const filterStatus = ref('')
const selectedOrder = ref(null)
const newStatus = ref('')
const statusNote = ref('')

const filteredOrders = computed(() => {
  if (!filterStatus.value) return ordersStore.orders
  return ordersStore.orders.filter(o => o.status === filterStatus.value)
})

function openOrder(order) {
  selectedOrder.value = order
  newStatus.value = order.status
  statusNote.value = ''
}

function updateStatus() {
  if (newStatus.value && newStatus.value !== selectedOrder.value.status) {
    ordersStore.updateOrderStatus(selectedOrder.value.id, newStatus.value, statusNote.value)
    selectedOrder.value = ordersStore.getOrderById(selectedOrder.value.id)
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

const allStatuses = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled']
</script>

<template>
  <AdminLayout>
    <div class="orders-header">
      <h1>Gestión de Pedidos</h1>
      <select v-model="filterStatus" class="filter-select">
        <option value="">Todos los estados</option>
        <option v-for="s in allStatuses" :key="s" :value="s">{{ ordersStore.statusLabels[s] }}</option>
      </select>
    </div>

    <div v-if="filteredOrders.length" class="orders-list">
      <div
        v-for="order in filteredOrders"
        :key="order.id"
        class="order-row"
        @click="openOrder(order)"
        :class="{ active: selectedOrder?.id === order.id }"
      >
        <div class="order-main">
          <span class="order-id">{{ order.id }}</span>
          <span class="order-customer">{{ order.customer.name }}</span>
          <span class="order-total">${{ order.total.toLocaleString() }}</span>
          <span
            class="status-badge"
            :style="{ background: ordersStore.statusColors[order.status] + '22', color: ordersStore.statusColors[order.status] }"
          >{{ ordersStore.statusLabels[order.status] }}</span>
          <span class="order-date">{{ formatDate(order.createdAt) }}</span>
        </div>
      </div>
    </div>
    <div v-else class="empty">
      <i class="fas fa-inbox"></i>
      <p>No hay pedidos{{ filterStatus ? ' con este estado' : '' }}</p>
    </div>

    <!-- Modal detalle -->
    <div v-if="selectedOrder" class="modal-overlay" @click.self="selectedOrder = null">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ selectedOrder.id }}</h2>
          <button @click="selectedOrder = null" class="modal-close"><i class="fas fa-times"></i></button>
        </div>

        <div class="modal-body">
          <!-- Cliente -->
          <div class="modal-section">
            <h3><i class="fas fa-user"></i> Cliente</h3>
            <p>{{ selectedOrder.customer.name }}</p>
            <p>{{ selectedOrder.customer.email }} | {{ selectedOrder.customer.phone }}</p>
            <p>{{ selectedOrder.customer.address }}, {{ selectedOrder.customer.city }}, {{ selectedOrder.customer.state }} CP {{ selectedOrder.customer.postalCode }}</p>
          </div>

          <!-- Productos -->
          <div class="modal-section">
            <h3><i class="fas fa-box"></i> Productos</h3>
            <div v-for="item in selectedOrder.items" :key="item.id" class="modal-item">
              <span>{{ item.name }} x{{ item.quantity }}</span>
              <span>${{ (item.price * item.quantity).toLocaleString() }}</span>
            </div>
            <hr />
            <div class="modal-item"><span>Envío ({{ selectedOrder.shipping.type }})</span><span>${{ selectedOrder.shipping.cost }}</span></div>
            <div class="modal-item total"><span>Total</span><span>${{ selectedOrder.total.toLocaleString() }} MXN</span></div>
          </div>

          <!-- Actualizar estado -->
          <div class="modal-section update-section">
            <h3><i class="fas fa-edit"></i> Actualizar Estado</h3>
            <div class="status-update">
              <select v-model="newStatus">
                <option v-for="s in allStatuses" :key="s" :value="s">{{ ordersStore.statusLabels[s] }}</option>
              </select>
              <input v-model="statusNote" placeholder="Nota (opcional)" />
              <button @click="updateStatus" :disabled="newStatus === selectedOrder.status" class="btn-update">
                <i class="fas fa-check"></i> Actualizar
              </button>
            </div>
          </div>

          <!-- Historial -->
          <div class="modal-section">
            <h3><i class="fas fa-history"></i> Historial</h3>
            <div v-for="(entry, i) in selectedOrder.history" :key="i" class="history-entry">
              <span
                class="history-dot"
                :style="{ background: ordersStore.statusColors[entry.status] }"
              ></span>
              <div>
                <p class="history-status">{{ ordersStore.statusLabels[entry.status] }}</p>
                <p class="history-note">{{ entry.note }}</p>
                <p class="history-date">{{ formatDate(entry.date) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
.orders-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}
.orders-header h1 { font-size: 1.8rem; font-weight: 700; }
.filter-select {
  padding: 10px 16px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 0.9rem;
}

.order-row {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.3s;
}
.order-row:hover, .order-row.active {
  border-color: var(--primary);
  box-shadow: 0 4px 15px rgba(234,146,174,0.15);
}
.order-main {
  display: grid;
  grid-template-columns: 1.5fr 1fr 0.8fr 0.8fr 1fr;
  gap: 10px;
  align-items: center;
  font-size: 0.9rem;
}
.order-id { font-weight: 600; color: var(--primary-light); }
.order-total { font-weight: 600; }
.status-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
}
.order-date { color: var(--text-muted); font-size: 0.85rem; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(74,51,71,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}
.modal {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 20px;
  width: 100%;
  max-width: 600px;
  max-height: 85vh;
  overflow-y: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}
.modal-header h2 { font-size: 1.3rem; }
.modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.2rem;
}
.modal-body { padding: 24px; }
.modal-section {
  margin-bottom: 24px;
}
.modal-section h3 {
  font-size: 0.95rem;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--primary-light);
}
.modal-section p { font-size: 0.9rem; color: var(--text-muted); margin-bottom: 4px; }
.modal-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  margin-bottom: 6px;
}
.modal-item.total { font-weight: 700; font-size: 1rem; margin-top: 8px; }
hr { border: none; border-top: 1px solid var(--border); margin: 10px 0; }

.status-update {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.status-update select, .status-update input {
  padding: 10px 14px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.9rem;
  flex: 1;
  min-width: 120px;
}
.status-update select:focus, .status-update input:focus { outline: none; border-color: var(--primary); }
.btn-update {
  padding: 10px 18px;
  background: var(--success);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.3s;
}
.btn-update:disabled { opacity: 0.4; cursor: not-allowed; }

.history-entry {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
  align-items: flex-start;
}
.history-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}
.history-status { font-weight: 600; font-size: 0.9rem; color: var(--text) !important; }
.history-note { font-size: 0.8rem; }
.history-date { font-size: 0.75rem; }

.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty i { font-size: 3rem; margin-bottom: 12px; display: block; }

@media (max-width: 768px) {
  .order-main { grid-template-columns: 1fr 1fr; }
}
</style>
