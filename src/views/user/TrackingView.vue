<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { formatMXN } from '../../lib/format.js'
import IconSearch from '../../components/icons/IconSearch.vue'
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
  return { background: color + '33', color: 'var(--ink)', border: '1px solid ' + color }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <div class="tracking-page container">
    <h1 class="display tracking__title">Seguimiento</h1>

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
          <IconSearch v-if="!loading" />
          {{ loading ? 'Buscando…' : 'Buscar' }}
        </button>
      </div>
    </form>

    <div v-if="message" class="not-found" role="status">
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
          <h3 class="eyebrow">Productos</h3>
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
          <h3 class="eyebrow">Envío</h3>
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
            Rastrear paquete →
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

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
