<script setup>
import { useCartStore } from '../../stores/cart'
import { useShippingStore } from '../../stores/shipping'
import { useOrdersStore } from '../../stores/orders'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

const cart = useCartStore()
const shippingStore = useShippingStore()
const ordersStore = useOrdersStore()
const router = useRouter()

const form = ref({
  name: '', email: '', phone: '',
  address: '', city: '', state: '', postalCode: ''
})
const shippingType = ref('standard')
const shippingInfo = ref(null)
const orderCreated = ref(null)

const shippingCost = computed(() => {
  if (!shippingInfo.value) return 0
  return shippingInfo.value[shippingType.value].cost
})
const total = computed(() => cart.subtotal + shippingCost.value)

function onPostalCodeChange() {
  if (form.value.postalCode.length === 5) {
    shippingInfo.value = shippingStore.calculateShipping(form.value.postalCode)
  } else {
    shippingInfo.value = null
  }
}

function submitOrder() {
  if (!shippingInfo.value) return
  const order = ordersStore.createOrder({
    items: [...cart.items],
    customer: { ...form.value },
    shipping: {
      type: shippingType.value,
      cost: shippingCost.value,
      days: shippingInfo.value[shippingType.value].days,
      zone: shippingInfo.value.zoneName
    },
    subtotal: cart.subtotal,
    total: total.value
  })
  orderCreated.value = order
  cart.clearCart()
}
</script>

<template>
  <div class="checkout-page container">
    <!-- Order confirmation -->
    <div v-if="orderCreated" class="order-success">
      <div class="success-icon"><i class="fas fa-check-circle"></i></div>
      <h1>Pedido Confirmado!</h1>
      <p class="order-id">Tu número de pedido es:</p>
      <p class="order-number">{{ orderCreated.id }}</p>
      <p class="order-email">Te enviamos la confirmación a <strong>{{ orderCreated.customer.email }}</strong></p>
      <div class="success-actions">
        <router-link to="/seguimiento" class="btn-primary">Rastrear pedido</router-link>
        <router-link to="/productos" class="btn-outline">Seguir comprando</router-link>
      </div>
    </div>

    <!-- Checkout form -->
    <div v-else-if="cart.items.length">
      <h1>Checkout</h1>
      <div class="checkout-grid">
        <form @submit.prevent="submitOrder" class="checkout-form">
          <h2><i class="fas fa-user"></i> Datos de contacto</h2>
          <div class="form-row">
            <div class="form-group">
              <label>Nombre completo</label>
              <input v-model="form.name" required placeholder="Tu nombre" />
            </div>
          </div>
          <div class="form-row two">
            <div class="form-group">
              <label>Email</label>
              <input v-model="form.email" type="email" required placeholder="tu@email.com" />
            </div>
            <div class="form-group">
              <label>Teléfono</label>
              <input v-model="form.phone" required placeholder="10 dígitos" />
            </div>
          </div>

          <h2><i class="fas fa-map-marker-alt"></i> Dirección de envío</h2>
          <div class="form-group">
            <label>Dirección</label>
            <input v-model="form.address" required placeholder="Calle y número" />
          </div>
          <div class="form-row three">
            <div class="form-group">
              <label>Ciudad</label>
              <input v-model="form.city" required />
            </div>
            <div class="form-group">
              <label>Estado</label>
              <input v-model="form.state" required />
            </div>
            <div class="form-group">
              <label>Código Postal</label>
              <input v-model="form.postalCode" required maxlength="5" @input="onPostalCodeChange" placeholder="00000" />
            </div>
          </div>

          <div v-if="shippingInfo" class="shipping-section">
            <h2><i class="fas fa-truck"></i> Tipo de envío</h2>
            <label class="ship-radio" :class="{ active: shippingType === 'standard' }">
              <input type="radio" v-model="shippingType" value="standard" />
              <div class="ship-radio-content">
                <div>
                  <strong><i class="fas fa-box"></i> Estándar</strong>
                  <span class="ship-days">{{ shippingInfo.standard.days }} días hábiles</span>
                </div>
                <span class="ship-price">${{ shippingInfo.standard.cost }} MXN</span>
              </div>
            </label>
            <label class="ship-radio" :class="{ active: shippingType === 'express' }">
              <input type="radio" v-model="shippingType" value="express" />
              <div class="ship-radio-content">
                <div>
                  <strong><i class="fas fa-bolt"></i> Express</strong>
                  <span class="ship-days">{{ shippingInfo.express.days }} días hábiles</span>
                </div>
                <span class="ship-price">${{ shippingInfo.express.cost }} MXN</span>
              </div>
            </label>
          </div>

          <button type="submit" class="btn-submit" :disabled="!shippingInfo">
            <i class="fas fa-lock"></i> Confirmar Pedido — ${{ total.toLocaleString() }} MXN
          </button>
        </form>

        <div class="checkout-summary">
          <h3>Tu pedido</h3>
          <div v-for="item in cart.items" :key="item.id" class="summary-item">
            <img :src="item.image" :alt="item.name" />
            <div>
              <p class="si-name">{{ item.name }}</p>
              <p class="si-qty">x{{ item.quantity }}</p>
            </div>
            <p class="si-price">${{ (item.price * item.quantity).toLocaleString() }}</p>
          </div>
          <hr />
          <div class="summary-line"><span>Subtotal</span><span>${{ cart.subtotal.toLocaleString() }}</span></div>
          <div class="summary-line"><span>Envío</span><span>{{ shippingInfo ? `$${shippingCost}` : '—' }}</span></div>
          <hr />
          <div class="summary-line total"><span>Total</span><span>${{ total.toLocaleString() }} MXN</span></div>
        </div>
      </div>
    </div>

    <div v-else class="empty">
      <p>No hay productos en tu carrito</p>
      <router-link to="/productos" class="btn-primary">Ver productos</router-link>
    </div>
  </div>
</template>

<style scoped>
.checkout-page { padding: 40px 20px 80px; }
.checkout-page h1 { font-size: 2rem; font-weight: 700; margin-bottom: 30px; }
.checkout-grid {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 30px;
  align-items: start;
}
.checkout-form {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 30px;
}
.checkout-form h2 {
  font-size: 1.1rem;
  margin: 24px 0 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--primary-light);
}
.checkout-form h2:first-child { margin-top: 0; }
.form-row { display: grid; gap: 12px; }
.form-row.two { grid-template-columns: 1fr 1fr; }
.form-row.three { grid-template-columns: 1fr 1fr 1fr; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 0.85rem; margin-bottom: 6px; color: var(--text-muted); }
.form-group input {
  width: 100%;
  padding: 11px 14px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.95rem;
}
.form-group input:focus { outline: none; border-color: var(--primary); }

.ship-radio {
  display: block;
  margin-bottom: 10px;
  cursor: pointer;
  border: 2px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  transition: border-color 0.3s;
}
.ship-radio.active { border-color: var(--primary); }
.ship-radio input { display: none; }
.ship-radio-content { display: flex; justify-content: space-between; align-items: center; }
.ship-radio-content strong { display: flex; align-items: center; gap: 8px; }
.ship-days { display: block; font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; }
.ship-price { font-weight: 700; color: var(--primary-light); }

.btn-submit {
  width: 100%;
  padding: 16px;
  background: var(--gradient);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1.05rem;
  font-weight: 600;
  margin-top: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s;
}
.btn-submit:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(234,146,174,0.3); }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

.checkout-summary {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  position: sticky;
  top: 80px;
}
.checkout-summary h3 { font-size: 1.1rem; margin-bottom: 16px; }
.summary-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.summary-item img { width: 50px; height: 50px; border-radius: 8px; object-fit: cover; }
.si-name { font-size: 0.85rem; font-weight: 500; }
.si-qty { font-size: 0.8rem; color: var(--text-muted); }
.si-price { margin-left: auto; font-weight: 600; font-size: 0.9rem; }
hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
.summary-line { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.95rem; }
.summary-line.total { font-weight: 700; font-size: 1.15rem; margin-top: 8px; }

.order-success { text-align: center; padding: 80px 20px; }
.success-icon { font-size: 5rem; color: var(--success); margin-bottom: 20px; }
.order-success h1 { margin-bottom: 10px; }
.order-id { color: var(--text-muted); }
.order-number {
  font-size: 1.8rem;
  font-weight: 700;
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 10px 0 20px;
}
.order-email { color: var(--text-muted); font-size: 0.9rem; }
.success-actions { display: flex; gap: 12px; justify-content: center; margin-top: 30px; }
.btn-primary {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--gradient); color: white; padding: 12px 28px;
  border-radius: 50px; font-weight: 600;
}
.btn-outline {
  display: inline-block; padding: 12px 28px;
  border: 2px solid var(--primary); color: var(--primary-light);
  border-radius: 50px; font-weight: 600;
}
.empty { text-align: center; padding: 80px 20px; }

@media (max-width: 768px) {
  .checkout-grid { grid-template-columns: 1fr; }
  .form-row.two, .form-row.three { grid-template-columns: 1fr; }
}
</style>
