<script setup>
import { computed, ref } from 'vue'
import { formatMXN } from '../lib/format.js'
import { hasRealImage, tileBadge, tileCta } from '../lib/productTile.js'
import { useCartStore } from '../stores/cart.js'
import BaseButton from './BaseButton.vue'

const props = defineProps({ product: { type: Object, required: true } })

const cart = useCartStore()
// Texto temporal tras pulsar Agregar: 'Agregado' o, si ya no cabia, 'Sin más stock'.
const feedback = ref(null)

const variant = computed(() => props.product.defaultVariant)
const badge = computed(() => tileBadge(props.product))
const showImage = computed(() => hasRealImage(props.product.image_url))
const cta = computed(() => tileCta(props.product))
const link = computed(() => `/producto/${props.product.id}`)

function quantityInCart() {
  return cart.items.find((i) => i.variant_id === variant.value.id)?.quantity ?? 0
}

function add() {
  if (cta.value.kind !== 'add') return
  const before = quantityInCart()
  cart.addItem(props.product, variant.value, 1)
  // El carrito recorta al stock: si no subio, avisamos en vez de fingir que se agrego.
  feedback.value = quantityInCart() > before ? 'Agregado' : 'Sin más stock'
  setTimeout(() => (feedback.value = null), 1500)
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
        <BaseButton v-if="cta.kind === 'options'" variant="outline" :to="link" block>{{ cta.label }}</BaseButton>
        <BaseButton v-else variant="outline" block :disabled="cta.kind === 'disabled'" @click="add">
          <span aria-live="polite">{{ feedback ?? cta.label }}</span>
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
/* En columnas estrechas (movil) el texto del boton no debe partirse en dos lineas. */
.tile__action :deep(.btn) { white-space: nowrap; padding-left: 8px; padding-right: 8px; }
@media (max-width: 768px) {
  .tile__action :deep(.btn) { letter-spacing: 0.4px; font-size: 13px; }
}
</style>
