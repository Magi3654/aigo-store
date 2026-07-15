import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCartStore } from './cart.js'

const product = { id: 'p1', name: 'BTS Proof', image_url: 'img-p' }
const variant = { id: 'v1', label: 'Único', price_cents: 85000, stock: 3, image_url: null }

beforeEach(() => setActivePinia(createPinia()))

describe('cart store', () => {
  it('addItem guarda snapshot canónico y shims', () => {
    const cart = useCartStore()
    cart.addItem(product, variant, 1)
    const i = cart.items[0]
    expect(i.variant_id).toBe('v1')
    expect(i.product_name).toBe('BTS Proof')
    expect(i.variant_label).toBe('Único')
    expect(i.unit_price_cents).toBe(85000)
    expect(i.image_url).toBe('img-p')
    // shims para CheckoutView
    expect(i.id).toBe('v1')
    expect(i.name).toBe('BTS Proof')
    expect(i.price).toBe(850)
    expect(i.image).toBe('img-p')
  })

  it('addItem dedupe por variant_id y suma con clamp a stock', () => {
    const cart = useCartStore()
    cart.addItem(product, variant, 2)
    cart.addItem(product, variant, 5)
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].quantity).toBe(3) // clamp a stock=3
  })

  it('subtotalCents y subtotal (shim) son consistentes', () => {
    const cart = useCartStore()
    cart.addItem(product, variant, 2)
    expect(cart.subtotalCents).toBe(170000)
    expect(cart.subtotal).toBe(1700)
    expect(cart.totalItems).toBe(2)
  })

  it('updateQuantity respeta 1..stock y removeItem elimina por variant_id', () => {
    const cart = useCartStore()
    cart.addItem(product, variant, 1)
    cart.updateQuantity('v1', 99)
    expect(cart.items[0].quantity).toBe(3)
    cart.updateQuantity('v1', 0)
    expect(cart.items[0].quantity).toBe(1)
    cart.removeItem('v1')
    expect(cart.items).toHaveLength(0)
  })
})
