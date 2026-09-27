<script setup>
import { useCartStore } from '../../stores/cart'
import { formatMXN } from '../../lib/format'
import { hasRealImage } from '../../lib/productTile.js'
import BaseButton from '../../components/BaseButton.vue'

const cart = useCartStore()
</script>

<template>
  <div class="cart container">
    <h1 class="display cart__title">Tu bolsa</h1>

    <div v-if="cart.items.length" class="cart__layout">
      <ul class="cart__items">
        <li v-for="item in cart.items" :key="item.variant_id" class="cart__item">
          <router-link :to="`/producto/${item.product_id}`" class="cart__thumb" tabindex="-1" aria-hidden="true">
            <img v-if="hasRealImage(item.image_url)" :src="item.image_url" alt="" />
            <span v-else class="cart__thumb-fallback"></span>
          </router-link>
          <div class="cart__info">
            <router-link :to="`/producto/${item.product_id}`" class="cart__name">{{ item.product_name }}</router-link>
            <p class="cart__variant">{{ item.variant_label }} · {{ formatMXN(item.unit_price_cents) }}</p>
            <button type="button" class="cart__remove" @click="cart.removeItem(item.variant_id)">Quitar</button>
          </div>
          <div class="cart__qty" :aria-label="`Cantidad de ${item.product_name}`">
            <button type="button" aria-label="Menos" @click="cart.updateQuantity(item.variant_id, item.quantity - 1)">−</button>
            <span>{{ item.quantity }}</span>
            <button type="button" aria-label="Más" @click="cart.updateQuantity(item.variant_id, item.quantity + 1)">+</button>
          </div>
          <p class="cart__line">{{ formatMXN(item.unit_price_cents * item.quantity) }}</p>
        </li>
      </ul>

      <aside class="cart__summary">
        <p class="eyebrow">Resumen</p>
        <div class="cart__row"><span>Productos ({{ cart.totalItems }})</span><span>{{ formatMXN(cart.subtotalCents) }}</span></div>
        <div class="cart__row cart__row--muted"><span>Envío</span><span>Se calcula al pagar</span></div>
        <div class="cart__row cart__row--total"><span>Subtotal</span><span>{{ formatMXN(cart.subtotalCents) }} MXN</span></div>
        <BaseButton to="/checkout" block>Continuar al pago</BaseButton>
      </aside>
    </div>

    <div v-else class="cart__empty">
      <p class="display cart__empty-title">Tu bolsa está vacía</p>
      <p>Agrega algo de tus grupos favoritos.</p>
      <BaseButton variant="outline" to="/productos">Ver productos</BaseButton>
    </div>
  </div>
</template>

<style scoped>
.cart { padding-top: 48px; padding-bottom: var(--section-gap); }
.cart__title { font-size: clamp(48px, 7vw, 80px); margin-bottom: 32px; }
.cart__layout { display: grid; grid-template-columns: 1fr 360px; gap: 48px; align-items: start; }
.cart__items { list-style: none; border-top: 1px solid var(--lilac); }
.cart__item {
  display: grid;
  grid-template-columns: 96px 1fr auto auto;
  gap: 20px;
  align-items: center;
  padding: 20px 0;
  border-bottom: 1px solid var(--lilac);
}
.cart__thumb { width: 96px; aspect-ratio: 1; background: var(--surface); display: block; overflow: hidden; }
.cart__thumb img { width: 100%; height: 100%; object-fit: cover; }
.cart__thumb-fallback { display: block; width: 100%; height: 100%; background: var(--lilac); }
.cart__info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cart__name { font-weight: 500; }
.cart__name:hover { text-decoration: underline; }
.cart__variant { font-size: 14px; color: var(--ink-muted); }
.cart__remove { align-self: flex-start; font-size: 12px; letter-spacing: 0.8px; text-transform: uppercase; border-bottom: 1px solid var(--ink); }
.cart__qty { display: flex; align-items: center; border: 1px solid var(--ink); border-radius: var(--radius-button); }
.cart__qty button { width: 36px; height: 36px; font-size: 18px; }
.cart__qty span { min-width: 24px; text-align: center; }
.cart__line { font-weight: 500; min-width: 96px; text-align: right; }
.cart__summary {
  position: sticky;
  top: 96px;
  background: var(--surface);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cart__row { display: flex; justify-content: space-between; gap: 16px; }
.cart__row--muted { color: var(--ink-muted); font-size: 14px; }
.cart__row--total { font-weight: 500; font-size: 18px; padding-top: 16px; border-top: 1px solid var(--lilac); }
.cart__empty { padding: 48px 0; display: flex; flex-direction: column; align-items: flex-start; gap: 16px; }
.cart__empty-title { font-size: clamp(32px, 5vw, 48px); }

@media (max-width: 900px) {
  .cart__layout { grid-template-columns: 1fr; }
  .cart__summary { position: static; }
}

@media (max-width: 600px) {
  .cart__item { grid-template-columns: 72px 1fr; }
  .cart__thumb { width: 72px; }
  .cart__qty { grid-column: 2; justify-self: start; }
  .cart__line { grid-column: 2; text-align: left; }
}
</style>
