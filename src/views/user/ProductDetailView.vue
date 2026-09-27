<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProductsStore } from '../../stores/products'
import { useCartStore } from '../../stores/cart'
import { useShippingStore } from '../../stores/shipping'
import { formatMXN } from '../../lib/format'
import { hasRealImage, productBadge } from '../../lib/productTile.js'
import { categoryLabel } from '../../lib/categories.js'
import BaseButton from '../../components/BaseButton.vue'

const route = useRoute()
const router = useRouter()
const productsStore = useProductsStore()
const cart = useCartStore()
const shippingStore = useShippingStore()

const product = ref(null)
const loading = ref(true)
const selectedId = ref(null)
const quantity = ref(1)
const postalCode = ref('')
const shippingInfo = ref(null)
const added = ref(false)

const variant = computed(() => {
  if (!product.value) return null
  return product.value.variants.find((v) => v.id === selectedId.value) ?? product.value.defaultVariant
})
const image = computed(() => variant.value?.image_url ?? product.value?.image_url)
const showImage = computed(() => hasRealImage(image.value))
const badge = computed(() => productBadge(variant.value))
const canAdd = computed(() => !!variant.value && variant.value.stock > 0)

onMounted(async () => {
  const id = route.params.id
  const cached = productsStore.products.find((p) => p.id === id)
  product.value = cached ?? (await productsStore.fetchProductById(id))
  selectedId.value = product.value?.defaultVariant?.id ?? null
  loading.value = false
})

watch(selectedId, () => {
  quantity.value = 1
})

function changeQuantity(delta) {
  const max = variant.value ? Math.max(1, variant.value.stock) : 1
  quantity.value = Math.min(max, Math.max(1, quantity.value + delta))
}

function calculateShipping() {
  shippingInfo.value = shippingStore.calculateShipping(postalCode.value)
}

function addToCart() {
  if (!canAdd.value) return
  cart.addItem(product.value, variant.value, quantity.value)
  added.value = true
  setTimeout(() => (added.value = false), 2000)
}
</script>

<template>
  <div class="detail container">
    <p v-if="loading" class="state">Cargando producto…</p>

    <div v-else-if="!product" class="state">
      <p>Producto no encontrado.</p>
      <BaseButton variant="outline" to="/productos">Ver productos</BaseButton>
    </div>

    <template v-else>
      <button type="button" class="detail__back" @click="router.back()">← Volver</button>

      <div class="detail__grid">
        <div class="detail__media">
          <img v-if="showImage" :src="image" :alt="product.name" />
          <span v-else class="detail__fallback display">{{ product.group }}</span>
        </div>

        <div class="detail__info">
          <p class="eyebrow">{{ product.group }} · {{ categoryLabel(product.category) }}</p>
          <h1 class="display detail__name">{{ product.name }}</h1>
          <p v-if="variant" class="detail__price">{{ formatMXN(variant.price_cents) }} MXN</p>

          <div v-if="product.variants.length > 1" class="detail__variants" role="radiogroup" aria-label="Versión">
            <button
              v-for="v in product.variants"
              :key="v.id"
              type="button"
              role="radio"
              class="detail__variant"
              :aria-checked="v.id === variant?.id"
              @click="selectedId = v.id"
            >{{ v.label }}</button>
          </div>

          <p v-if="product.description" class="detail__desc">{{ product.description }}</p>

          <div class="detail__buy">
            <div class="detail__qty" aria-label="Cantidad">
              <button type="button" aria-label="Menos" @click="changeQuantity(-1)">−</button>
              <span aria-live="polite">{{ quantity }}</span>
              <button type="button" aria-label="Más" @click="changeQuantity(1)">+</button>
            </div>
            <BaseButton block :disabled="!canAdd" @click="addToCart">
              {{ added ? 'Agregado a la bolsa' : canAdd ? 'Agregar a la bolsa' : badge?.label ?? 'No disponible' }}
            </BaseButton>
          </div>
          <p class="detail__stock">
            <template v-if="!variant">No disponible</template>
            <template v-else-if="variant.stock === 0">Agotado</template>
            <template v-else-if="variant.stock < 5">Últimas piezas: quedan {{ variant.stock }}</template>
            <template v-else>{{ variant.stock }} disponibles</template>
          </p>

          <!-- Cotizacion provisional: la reemplaza Skydropx en la Fase 2c. -->
          <div class="detail__ship">
            <p class="eyebrow">Cotizar envío</p>
            <form class="detail__ship-form" @submit.prevent="calculateShipping">
              <input v-model="postalCode" inputmode="numeric" maxlength="5" placeholder="Código postal" aria-label="Código postal" />
              <BaseButton variant="outline" type="submit" :disabled="postalCode.length !== 5">Cotizar</BaseButton>
            </form>
            <div v-if="shippingInfo" class="detail__ship-results">
              <p>{{ shippingInfo.zoneName }}</p>
              <p>Estándar: ${{ shippingInfo.standard.cost }} MXN · {{ shippingInfo.standard.days }} días hábiles</p>
              <p>Express: ${{ shippingInfo.express.cost }} MXN · {{ shippingInfo.express.days }} días hábiles</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail { padding-top: 32px; padding-bottom: var(--section-gap); }
.detail__back { font-size: 14px; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 24px; }
.detail__back:hover { text-decoration: underline; }
.detail__grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 48px; align-items: start; }
/* Sin esto, una columna no se encoge por debajo del ancho de su contenido y en movil se desborda. */
.detail__grid > * { min-width: 0; }
.detail__media { background: var(--surface); aspect-ratio: 1; overflow: hidden; }
.detail__media img { width: 100%; height: 100%; object-fit: cover; }
.detail__fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--lilac);
  font-size: clamp(40px, 6vw, 72px);
  padding: 24px;
  text-align: center;
}
.detail__info { display: flex; flex-direction: column; gap: 16px; }
.detail__name { font-size: 40px; line-height: 1; }
.detail__price { font-size: 22px; font-weight: 500; }
.detail__variants { display: flex; flex-wrap: wrap; gap: 8px; }
.detail__variant { border: 1px solid var(--ink); border-radius: var(--radius-button); padding: 10px 16px; font-size: 14px; }
.detail__variant[aria-checked='true'] { outline: 1px solid var(--ink); outline-offset: -3px; font-weight: 500; }
.detail__desc { color: var(--ink-muted); }
.detail__buy { display: flex; gap: 12px; align-items: stretch; }
.detail__buy > :last-child { flex: 1; min-width: 0; }
.detail__qty { display: flex; align-items: center; border: 1px solid var(--ink); border-radius: var(--radius-button); }
.detail__qty button { width: 40px; height: 100%; font-size: 18px; }
.detail__qty span { min-width: 28px; text-align: center; }
.detail__stock { font-size: 12px; color: var(--ink-muted); }
.detail__ship { border: 1px solid var(--lilac); padding: 20px; display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.detail__ship-form { display: flex; gap: 8px; }
.detail__ship-form input {
  flex: 1;
  min-width: 0;
  background: var(--surface);
  border: none;
  border-radius: var(--radius-pill);
  padding: 10px 16px;
}
.detail__ship-results { font-size: 14px; display: flex; flex-direction: column; gap: 4px; }

@media (max-width: 768px) {
  .detail__grid { grid-template-columns: minmax(0, 1fr); gap: 24px; }
  .detail__name { font-size: 32px; }
}
</style>
