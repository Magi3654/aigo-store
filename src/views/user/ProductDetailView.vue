<script setup>
import { useRoute, useRouter } from 'vue-router'
import { useProductsStore } from '../../stores/products'
import { useCartStore } from '../../stores/cart'
import { useShippingStore } from '../../stores/shipping'
import { ref, computed, onMounted } from 'vue'
import { formatMXN } from '../../lib/format'

const route = useRoute()
const router = useRouter()
const productsStore = useProductsStore()
const cart = useCartStore()
const shippingStore = useShippingStore()

const product = ref(null)
const loading = ref(true)
const quantity = ref(1)
const postalCode = ref('')
const shippingInfo = ref(null)
const added = ref(false)

const variant = computed(() => product.value?.defaultVariant ?? null)

onMounted(async () => {
  const id = route.params.id
  const cached = productsStore.products.find((p) => p.id === id)
  product.value = cached ?? (await productsStore.fetchProductById(id))
  loading.value = false
})

function calculateShipping() {
  shippingInfo.value = shippingStore.calculateShipping(postalCode.value)
}

function addToCart() {
  if (!product.value || !variant.value) return
  cart.addItem(product.value, variant.value, quantity.value)
  added.value = true
  setTimeout(() => (added.value = false), 2000)
}
</script>

<template>
  <div v-if="loading" class="detail-page container">
    <p class="state-msg">Cargando producto…</p>
  </div>

  <div v-else-if="!product" class="detail-page container">
    <p class="state-msg">Producto no encontrado.</p>
    <router-link to="/productos" class="btn-outline">Ver productos</router-link>
  </div>

  <div v-else class="detail-page container">
    <button class="back-btn" @click="router.back()">
      <i class="fas fa-arrow-left"></i> Volver
    </button>

    <div class="detail-grid">
      <div class="detail-img">
        <img :src="product.image_url" :alt="product.name" />
      </div>

      <div class="detail-info">
        <span class="detail-group">{{ product.group }}</span>
        <h1>{{ product.name }}</h1>
        <span class="detail-cat"><i class="fas fa-tag"></i> {{ product.category }}</span>
        <p class="detail-desc">{{ product.description }}</p>
        <p v-if="variant" class="detail-price">{{ formatMXN(variant.price_cents) }} MXN</p>
        <p v-else class="detail-price">No disponible</p>
        <p class="detail-stock" :class="{ low: variant && variant.stock < 5 }">
          <i class="fas fa-box"></i>
          {{ variant && variant.stock > 0 ? `${variant.stock} disponibles` : 'Agotado' }}
        </p>

        <div class="quantity-section">
          <label>Cantidad:</label>
          <div class="qty-controls">
            <button @click="quantity = Math.max(1, quantity - 1)">-</button>
            <span>{{ quantity }}</span>
            <button @click="quantity = Math.min(variant ? variant.stock : 1, quantity + 1)">+</button>
          </div>
        </div>

        <button
          class="btn-add"
          :class="{ added }"
          :disabled="!variant || variant.stock === 0"
          @click="addToCart"
        >
          <i :class="added ? 'fas fa-check' : 'fas fa-shopping-bag'"></i>
          {{ added ? 'Agregado!' : 'Agregar al carrito' }}
        </button>

        <!-- Cotizar envío -->
        <div class="shipping-quote">
          <h3><i class="fas fa-truck"></i> Cotizar envío</h3>
          <div class="shipping-input">
            <input
              v-model="postalCode"
              placeholder="Código postal (5 dígitos)"
              maxlength="5"
              @keyup.enter="calculateShipping"
            />
            <button @click="calculateShipping" :disabled="postalCode.length !== 5">Cotizar</button>
          </div>

          <div v-if="shippingInfo" class="shipping-results">
            <p class="zone-name"><i class="fas fa-map-marker-alt"></i> {{ shippingInfo.zoneName }}</p>
            <div class="shipping-options">
              <div class="ship-option">
                <div class="ship-type">
                  <i class="fas fa-box"></i> Estándar
                </div>
                <div class="ship-details">
                  <span class="ship-cost">${{ shippingInfo.standard.cost }} MXN</span>
                  <span class="ship-days">{{ shippingInfo.standard.days }} días hábiles</span>
                </div>
              </div>
              <div class="ship-option express">
                <div class="ship-type">
                  <i class="fas fa-bolt"></i> Express
                </div>
                <div class="ship-details">
                  <span class="ship-cost">${{ shippingInfo.express.cost }} MXN</span>
                  <span class="ship-days">{{ shippingInfo.express.days }} días hábiles</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page { padding: 30px 20px 80px; }
.back-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.95rem;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: color 0.3s;
}
.back-btn:hover { color: var(--primary-light); }
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  align-items: start;
}
.detail-img {
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.detail-img img { width: 100%; display: block; }
.detail-group {
  font-size: 0.85rem;
  color: var(--primary-light);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 2px;
}
.detail-info h1 {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 8px 0 10px;
}
.detail-cat {
  color: var(--text-muted);
  font-size: 0.9rem;
}
.detail-desc {
  margin: 16px 0;
  line-height: 1.6;
  color: var(--text-muted);
}
.detail-price {
  font-size: 2rem;
  font-weight: 700;
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 10px 0;
}
.detail-stock {
  color: var(--success);
  font-size: 0.9rem;
}
.detail-stock.low { color: var(--warning); }
.quantity-section {
  display: flex;
  align-items: center;
  gap: 15px;
  margin: 20px 0;
}
.quantity-section label { font-weight: 500; }
.qty-controls {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.qty-controls button {
  background: var(--bg-input);
  border: none;
  color: var(--text);
  width: 40px;
  height: 40px;
  font-size: 1.1rem;
  transition: background 0.3s;
}
.qty-controls button:hover { background: var(--primary); color: white; }
.qty-controls span {
  padding: 0 20px;
  font-weight: 600;
}
.btn-add {
  width: 100%;
  padding: 14px;
  background: var(--gradient);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s;
}
.btn-add:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(234,146,174,0.3); }
.btn-add:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-add.added { background: var(--success); }

.shipping-quote {
  margin-top: 30px;
  padding: 20px;
  background: var(--bg-input);
  border-radius: 16px;
  border: 1px solid var(--border);
}
.shipping-quote h3 {
  font-size: 1rem;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.shipping-input {
  display: flex;
  gap: 10px;
}
.shipping-input input {
  flex: 1;
  padding: 10px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.95rem;
}
.shipping-input input:focus { outline: none; border-color: var(--primary); }
.shipping-input button {
  padding: 10px 20px;
  background: var(--secondary);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  transition: opacity 0.3s;
}
.shipping-input button:disabled { opacity: 0.5; }
.shipping-results { margin-top: 15px; }
.zone-name {
  color: var(--accent);
  font-weight: 500;
  margin-bottom: 12px;
}
.shipping-options { display: flex; flex-direction: column; gap: 10px; }
.ship-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--bg-card);
  border-radius: 10px;
  border: 1px solid var(--border);
}
.ship-option.express { border-color: var(--primary); }
.ship-type {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ship-details { text-align: right; }
.ship-cost { display: block; font-weight: 700; color: var(--primary-light); }
.ship-days { font-size: 0.8rem; color: var(--text-muted); }

.empty-detail { text-align: center; padding: 100px 20px; }
.state-msg {
  text-align: center;
  color: var(--text-muted);
  padding: 60px 20px;
}
.btn-outline {
  display: inline-block;
  margin-top: 15px;
  padding: 10px 24px;
  border: 2px solid var(--primary);
  color: var(--primary-light);
  border-radius: 50px;
  font-weight: 600;
}

@media (max-width: 768px) {
  .detail-grid { grid-template-columns: 1fr; gap: 20px; }
  .detail-info h1 { font-size: 1.4rem; }
  .detail-price { font-size: 1.5rem; }
}
</style>
