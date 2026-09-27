<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { formatMXN } from '../../lib/format.js'
import {
  trackOrder, normalizeOrderNumber, displayStatus, historyLabel, safeTrackingUrl,
} from '../../lib/trackOrder.js'

const STATUS_COLORS = {
  awaiting_payment: '#C18797',
  paid: '#936DA4',
  preparing: '#BB82A8',
  shipped: '#A583AA',
  delivered: '#6BA589',
  cancelled: '#C87070',
  refunded: '#C87070',
  payment_failed: '#C87070',
}

const HISTORY_COLORS = {
  pending: '#C18797',
  paid: '#936DA4',
  preparing: '#BB82A8',
  shipped: '#A583AA',
  delivered: '#6BA589',
  cancelled: '#C87070',
  refunded: '#C87070',
  failed: '#C87070',
}

const MESSAGES = {
  not_found: 'No encontramos un pedido con ese número y correo.',
  rate_limited: 'Demasiados intentos. Intenta de nuevo en unos minutos.',
  error: 'No pudimos consultar tu pedido. Intenta de nuevo.',
}

const route = useRoute()
const orderNumber = ref('')
const email = ref('')
const loading = ref(false)
const result = ref(null)

// Enlace directo desde la pagina de exito o el correo (Fase 2c): el cliente
// solo tiene que escribir su correo.
onMounted(() => {
  orderNumber.value = normalizeOrderNumber(route.query.pedido)
})

const canSearch = computed(
  () => orderNumber.value.trim() !== '' && email.value.trim() !== '' && !loading.value,
)

const order = computed(() => (result.value?.status === 'ok' ? result.value.order : null))
const status = computed(() =>
  order.value ? displayStatus(order.value.payment_status, order.value.fulfillment_status) : null,
)
const trackingUrl = computed(() => safeTrackingUrl(order.value?.tracking_url))
const message = computed(() => MESSAGES[result.value?.status] ?? null)

async function search() {
  if (!canSearch.value) return
  orderNumber.value = normalizeOrderNumber(orderNumber.value)
  loading.value = true
  result.value = await trackOrder(orderNumber.value, email.value)
  loading.value = false
}

function badgeStyle(color) {
  return { background: color + '22', color, border: '1px solid ' + color }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <div class="tracking-page container">
    <h1><i class="fas fa-truck"></i> Seguimiento de Pedido</h1>

    <form class="search-section" @submit.prevent="search">
      <div class="search-box">
        <input
          v-model="orderNumber"
          aria-label="Número de pedido"
          placeholder="Número de pedido (ej: AIGO-3FA91C07)"
          autocomplete="off"
        />
        <input
          v-model="email"
          type="email"
          aria-label="Correo electrónico"
          placeholder="Correo con el que compraste"
          autocomplete="email"
        />
        <button type="submit" :disabled="!canSearch">
          <i class="fas" :class="loading ? 'fa-spinner fa-spin' : 'fa-search'"></i>
          {{ loading ? 'Buscando…' : 'Buscar' }}
        </button>
      </div>
    </form>

    <div v-if="message" class="not-found" role="status">
      <i class="fas fa-exclamation-circle"></i>
      <p>{{ message }}</p>
    </div>

    <div v-if="order" class="order-detail">
      <div class="order-header">
        <div>
          <h2>{{ order.order_number }}</h2>
          <p class="order-date">Creado: {{ formatDate(order.created_at) }}</p>
        </div>
        <span class="status-badge" :style="badgeStyle(STATUS_COLORS[status.key])">
          {{ status.label }}
        </span>
      </div>

      <div v-if="order.history.length" class="timeline">
        <div
          v-for="(entry, i) in order.history"
          :key="i"
          class="timeline-item"
          :class="{ last: i === order.history.length - 1 }"
        >
          <div class="timeline-dot" :style="{ background: HISTORY_COLORS[entry.status] ?? '#999' }"></div>
          <div class="timeline-content">
            <p class="timeline-status">{{ historyLabel(entry.status) }}</p>
            <p v-if="entry.note" class="timeline-note">{{ entry.note }}</p>
            <p class="timeline-date">{{ formatDate(entry.created_at) }}</p>
          </div>
        </div>
      </div>

      <div class="order-info-grid">
        <div class="info-card">
          <h3><i class="fas fa-box"></i> Productos</h3>
          <div v-for="(item, i) in order.items" :key="i" class="info-item">
            <span>{{ item.product_name }} ({{ item.variant_label }}) x{{ item.quantity }}</span>
            <span>{{ formatMXN(item.line_total_cents) }}</span>
          </div>
          <hr />
          <div class="info-item"><span>Subtotal</span><span>{{ formatMXN(order.subtotal_cents) }}</span></div>
          <div class="info-item"><span>Envío</span><span>{{ formatMXN(order.shipping_cost_cents) }}</span></div>
          <div class="info-item total"><span>Total</span><span>{{ formatMXN(order.total_cents) }}</span></div>
        </div>
        <div class="info-card">
          <h3><i class="fas fa-map-marker-alt"></i> Envío</h3>
          <p>{{ order.shipping_city }}, {{ order.shipping_state }}</p>
          <p v-if="order.shipping_carrier">
            {{ order.shipping_carrier }}<template v-if="order.shipping_service"> — {{ order.shipping_service }}</template>
          </p>
          <p v-if="order.tracking_number" class="mt">Guía: {{ order.tracking_number }}</p>
          <a
            v-if="trackingUrl"
            :href="trackingUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="track-link"
          >
            <i class="fas fa-external-link-alt"></i> Rastrear paquete
          </a>
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
.search-box { display: flex; gap: 10px; max-width: 760px; flex-wrap: wrap; }
.search-box input { min-width: 220px; }
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

.track-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 16px;
  background: var(--gradient);
  color: white;
  border-radius: 10px;
  font-weight: 600;
  text-decoration: none;
}

@media (max-width: 768px) {
  .search-box { flex-direction: column; }
  .search-box input { min-width: 0; }
  .order-info-grid { grid-template-columns: 1fr; }
  .order-header { flex-direction: column; gap: 10px; }
}
</style>
