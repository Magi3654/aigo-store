import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useOrdersStore = defineStore('orders', () => {
  const orders = ref(JSON.parse(localStorage.getItem('aigo_orders') || '[]'))

  const statusLabels = {
    pending: 'Pendiente',
    confirmed: 'Confirmado',
    preparing: 'En preparación',
    shipped: 'Enviado',
    delivered: 'Entregado',
    cancelled: 'Cancelado'
  }

  const statusColors = {
    pending: '#C18797',
    confirmed: '#936DA4',
    preparing: '#BB82A8',
    shipped: '#A583AA',
    delivered: '#6BA589',
    cancelled: '#C87070'
  }

  function saveToStorage() {
    localStorage.setItem('aigo_orders', JSON.stringify(orders.value))
  }

  function createOrder(orderData) {
    const order = {
      id: 'AIGO-' + Date.now().toString(36).toUpperCase(),
      ...orderData,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [{ status: 'pending', date: new Date().toISOString(), note: 'Pedido creado' }]
    }
    orders.value.unshift(order)
    saveToStorage()
    return order
  }

  function updateOrderStatus(orderId, newStatus, note = '') {
    const order = orders.value.find(o => o.id === orderId)
    if (order) {
      order.status = newStatus
      order.updatedAt = new Date().toISOString()
      order.history.push({
        status: newStatus,
        date: new Date().toISOString(),
        note: note || `Estado actualizado a: ${statusLabels[newStatus]}`
      })
      saveToStorage()
    }
  }

  function getOrderById(orderId) {
    return orders.value.find(o => o.id === orderId)
  }

  function getOrdersByEmail(email) {
    return orders.value.filter(o => o.customer.email === email)
  }

  return { orders, statusLabels, statusColors, createOrder, updateOrderStatus, getOrderById, getOrdersByEmail }
})
