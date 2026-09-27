import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const orderResult = { value: null }
const singleResult = { value: null }

vi.mock('../lib/supabase.js', () => {
  const q = {
    select: () => q,
    order: () => Promise.resolve(orderResult.value),
    eq: () => q,
    single: () => Promise.resolve(singleResult.value),
  }
  return { supabase: { from: () => q } }
})

import { useProductsStore } from './products.js'

const row = {
  id: 'p1', name: 'BTS Proof', group: 'BTS', category: 'Albums',
  description: 'd', image_url: 'img',
  product_variants: [{ id: 'v1', label: 'Único', price_cents: 85000, stock: 15, weight_grams: 300, sku: null, image_url: null }],
}

beforeEach(() => {
  setActivePinia(createPinia())
  orderResult.value = null
  singleResult.value = null
})

describe('products store', () => {
  it('fetchProducts mapea filas y marca loaded', async () => {
    orderResult.value = { data: [row], error: null }
    const store = useProductsStore()
    await store.fetchProducts()
    expect(store.loaded).toBe(true)
    expect(store.error).toBe(null)
    expect(store.products).toHaveLength(1)
    expect(store.products[0].defaultVariant.price_cents).toBe(85000)
  })

  it('fetchProducts registra el error y no marca loaded', async () => {
    orderResult.value = { data: null, error: { message: 'boom' } }
    const store = useProductsStore()
    await store.fetchProducts()
    expect(store.error).toBe('boom')
    expect(store.loaded).toBe(false)
    expect(store.products).toEqual([])
  })

  it('fetchProductById devuelve un producto mapeado', async () => {
    singleResult.value = { data: row, error: null }
    const store = useProductsStore()
    const p = await store.fetchProductById('p1')
    expect(p.name).toBe('BTS Proof')
    expect(p.defaultVariant.stock).toBe(15)
  })

  it('fetchProductById devuelve null en error', async () => {
    singleResult.value = { data: null, error: { message: 'nope' } }
    const store = useProductsStore()
    expect(await store.fetchProductById('x')).toBe(null)
  })
})
