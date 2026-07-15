import { describe, it, expect } from 'vitest'
import { mapProductRow } from './mapProduct.js'

const row = {
  id: 'p1', name: 'BTS Proof', group: 'BTS', category: 'Albums',
  description: 'desc', image_url: 'http://img/p1',
  product_variants: [
    { id: 'v1', label: 'Único', price_cents: 85000, stock: 15, weight_grams: 300, sku: null, image_url: null },
  ],
}

describe('mapProductRow', () => {
  it('mapea fila con una variante y fija defaultVariant', () => {
    const p = mapProductRow(row)
    expect(p.id).toBe('p1')
    expect(p.image_url).toBe('http://img/p1')
    expect(p.variants).toHaveLength(1)
    expect(p.variants[0].price_cents).toBe(85000)
    expect(p.defaultVariant).toBe(p.variants[0])
  })

  it('defaultVariant es null cuando no hay variantes activas', () => {
    const p = mapProductRow({ ...row, product_variants: [] })
    expect(p.variants).toEqual([])
    expect(p.defaultVariant).toBe(null)
  })

  it('con múltiples variantes, defaultVariant es la primera', () => {
    const p = mapProductRow({ ...row, product_variants: [
      { id: 'v1', label: 'A', price_cents: 100, stock: 1, weight_grams: 10, sku: null, image_url: null },
      { id: 'v2', label: 'B', price_cents: 200, stock: 2, weight_grams: 20, sku: null, image_url: null },
    ] })
    expect(p.defaultVariant.id).toBe('v1')
  })

  it('tolera product_variants ausente', () => {
    const { product_variants, ...noVariants } = row
    const p = mapProductRow(noVariants)
    expect(p.defaultVariant).toBe(null)
  })
})
