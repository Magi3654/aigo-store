import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCartStore = defineStore('cart', () => {
  const items = ref([])

  const totalItems = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))
  const subtotal = computed(() => items.value.reduce((sum, item) => sum + item.price * item.quantity, 0))

  function addItem(product, quantity = 1) {
    const existing = items.value.find(i => i.id === product.id)
    if (existing) {
      existing.quantity += quantity
    } else {
      items.value.push({ ...product, quantity })
    }
  }

  function removeItem(id) {
    items.value = items.value.filter(i => i.id !== id)
  }

  function updateQuantity(id, quantity) {
    const item = items.value.find(i => i.id === id)
    if (item) {
      item.quantity = Math.max(1, quantity)
    }
  }

  function clearCart() {
    items.value = []
  }

  return { items, totalItems, subtotal, addItem, removeItem, updateQuantity, clearCart }
})
