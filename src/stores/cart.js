import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCartStore = defineStore('cart', () => {
  const items = ref([])

  const totalItems = computed(() => items.value.reduce((s, i) => s + i.quantity, 0))
  const subtotalCents = computed(() =>
    items.value.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0)
  )
  // shim temporal para CheckoutView (2c lo elimina)
  const subtotal = computed(() => subtotalCents.value / 100)

  function addItem(product, variant, quantity = 1) {
    const existing = items.value.find((i) => i.variant_id === variant.id)
    if (existing) {
      existing.quantity = Math.min(variant.stock, existing.quantity + quantity)
      return
    }
    const image = variant.image_url ?? product.image_url
    items.value.push({
      variant_id: variant.id,
      product_id: product.id,
      product_name: product.name,
      variant_label: variant.label,
      unit_price_cents: variant.price_cents,
      image_url: image,
      stock: variant.stock,
      quantity: Math.min(variant.stock, quantity),
      // shims temporales para CheckoutView (2c los elimina)
      id: variant.id,
      name: product.name,
      price: variant.price_cents / 100,
      image,
    })
  }

  function removeItem(variantId) {
    items.value = items.value.filter((i) => i.variant_id !== variantId)
  }

  function updateQuantity(variantId, quantity) {
    const item = items.value.find((i) => i.variant_id === variantId)
    if (item) item.quantity = Math.max(1, Math.min(item.stock, quantity))
  }

  function clearCart() {
    items.value = []
  }

  return { items, totalItems, subtotalCents, subtotal, addItem, removeItem, updateQuantity, clearCart }
})
