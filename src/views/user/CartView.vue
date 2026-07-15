<script setup>
import { useCartStore } from '../../stores/cart'
import { formatMXN } from '../../lib/format'

const cart = useCartStore()
</script>

<template>
  <div class="cart-page container">
    <h1><i class="fas fa-shopping-bag"></i> Tu Carrito</h1>

    <div v-if="cart.items.length" class="cart-layout">
      <div class="cart-items">
        <div v-for="item in cart.items" :key="item.variant_id" class="cart-item">
          <img :src="item.image_url" :alt="item.product_name" class="cart-item-img" />
          <div class="cart-item-info">
            <span class="cart-item-group">{{ item.variant_label }}</span>
            <h3>{{ item.product_name }}</h3>
            <p class="cart-item-price">{{ formatMXN(item.unit_price_cents) }} MXN</p>
          </div>
          <div class="cart-item-qty">
            <button @click="cart.updateQuantity(item.variant_id, item.quantity - 1)">-</button>
            <span>{{ item.quantity }}</span>
            <button @click="cart.updateQuantity(item.variant_id, item.quantity + 1)">+</button>
          </div>
          <p class="cart-item-total">{{ formatMXN(item.unit_price_cents * item.quantity) }}</p>
          <button class="cart-item-remove" @click="cart.removeItem(item.variant_id)">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>

      <div class="cart-summary">
        <h3>Resumen</h3>
        <div class="summary-row">
          <span>Productos ({{ cart.totalItems }})</span>
          <span>{{ formatMXN(cart.subtotalCents) }} MXN</span>
        </div>
        <div class="summary-row">
          <span>Envío</span>
          <span class="text-muted">Se calcula al checkout</span>
        </div>
        <hr />
        <div class="summary-row total">
          <span>Subtotal</span>
          <span>{{ formatMXN(cart.subtotalCents) }} MXN</span>
        </div>
        <router-link to="/checkout" class="btn-checkout">
          Proceder al checkout <i class="fas fa-arrow-right"></i>
        </router-link>
      </div>
    </div>

    <div v-else class="empty-cart">
      <i class="fas fa-shopping-bag"></i>
      <h2>Tu carrito está vacío</h2>
      <p>Agrega productos de tus grupos favoritos</p>
      <router-link to="/productos" class="btn-primary">Ver productos</router-link>
    </div>
  </div>
</template>

<style scoped>
.cart-page { padding: 40px 20px 80px; }
.cart-page h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 30px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.cart-layout {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 30px;
  align-items: start;
}
.cart-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  margin-bottom: 12px;
}
.cart-item-img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 10px;
}
.cart-item-info { flex: 1; }
.cart-item-group {
  font-size: 0.75rem;
  color: var(--primary-light);
  font-weight: 600;
  text-transform: uppercase;
}
.cart-item-info h3 { font-size: 0.95rem; margin: 4px 0; }
.cart-item-price { color: var(--text-muted); font-size: 0.85rem; }
.cart-item-qty {
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.cart-item-qty button {
  background: var(--bg-input);
  border: none;
  color: var(--text);
  width: 32px;
  height: 32px;
  font-size: 1rem;
}
.cart-item-qty button:hover { background: var(--primary); color: white; }
.cart-item-qty span { padding: 0 12px; font-weight: 600; font-size: 0.9rem; }
.cart-item-total { font-weight: 700; min-width: 100px; text-align: right; }
.cart-item-remove {
  background: none;
  border: none;
  color: var(--danger);
  font-size: 0.9rem;
  padding: 8px;
  transition: opacity 0.3s;
}
.cart-item-remove:hover { opacity: 0.7; }

.cart-summary {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  position: sticky;
  top: 80px;
}
.cart-summary h3 { font-size: 1.2rem; margin-bottom: 20px; }
.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 0.95rem;
}
.summary-row.total { font-weight: 700; font-size: 1.1rem; }
.text-muted { color: var(--text-muted); font-size: 0.85rem; }
hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
.btn-checkout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 14px;
  background: var(--gradient);
  color: white;
  border-radius: 12px;
  font-weight: 600;
  font-size: 1rem;
  margin-top: 20px;
  transition: transform 0.3s, box-shadow 0.3s;
}
.btn-checkout:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(234,146,174,0.3); }

.empty-cart {
  text-align: center;
  padding: 80px 20px;
}
.empty-cart i { font-size: 4rem; color: var(--text-muted); margin-bottom: 20px; }
.empty-cart h2 { margin-bottom: 10px; }
.empty-cart p { color: var(--text-muted); margin-bottom: 20px; }
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--gradient);
  color: white;
  padding: 12px 28px;
  border-radius: 50px;
  font-weight: 600;
}

@media (max-width: 768px) {
  .cart-layout { grid-template-columns: 1fr; }
  .cart-item { flex-wrap: wrap; }
  .cart-item-total { min-width: auto; }
}
</style>
