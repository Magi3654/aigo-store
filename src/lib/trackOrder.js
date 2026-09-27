import { supabase } from './supabase.js'

const STATUS_LABELS = {
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
  payment_failed: 'Pago rechazado',
  awaiting_payment: 'Esperando pago',
  paid: 'Pago confirmado',
  preparing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
}

const HISTORY_LABELS = {
  pending: 'Pedido creado',
  paid: 'Pago confirmado',
  failed: 'Pago rechazado',
  refunded: 'Reembolsado',
  preparing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export function normalizeOrderNumber(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

// Pago y envio son ejes distintos en la BD; el cliente ve una sola etiqueta.
// Cualquier pago que no sea exactamente 'paid' se muestra como pendiente.
export function displayStatus(payment, fulfillment) {
  let key
  if (fulfillment === 'cancelled') key = 'cancelled'
  else if (payment === 'refunded') key = 'refunded'
  else if (payment === 'failed') key = 'payment_failed'
  else if (payment !== 'paid') key = 'awaiting_payment'
  else if (fulfillment === 'preparing') key = 'preparing'
  else if (fulfillment === 'shipped') key = 'shipped'
  else if (fulfillment === 'delivered') key = 'delivered'
  else key = 'paid'
  return { key, label: STATUS_LABELS[key] }
}

export function historyLabel(status) {
  return HISTORY_LABELS[status] ?? status
}

// Vue no sanea href: solo enlazamos URLs http(s).
export function safeTrackingUrl(url) {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

export async function trackOrder(orderNumber, email) {
  try {
    const { data, error } = await supabase.rpc('track_order', {
      p_order_number: normalizeOrderNumber(orderNumber),
      p_email: typeof email === 'string' ? email.trim() : '',
    })
    if (error || !data) return { status: 'error' }
    if (data.status === 'ok' && data.order) return { status: 'ok', order: data.order }
    if (data.status === 'not_found' || data.status === 'rate_limited') return { status: data.status }
    return { status: 'error' }
  } catch {
    return { status: 'error' }
  }
}
