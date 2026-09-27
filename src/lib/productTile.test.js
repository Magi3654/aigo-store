import { describe, it, expect } from 'vitest'
import { hasRealImage, productBadge } from './productTile.js'

describe('hasRealImage', () => {
  it('acepta una URL de imagen real', () => {
    expect(hasRealImage('https://images.unsplash.com/photo-1?w=800')).toBe(true)
  })

  it('rechaza vacio, espacios, null y no-texto', () => {
    expect(hasRealImage('')).toBe(false)
    expect(hasRealImage('   ')).toBe(false)
    expect(hasRealImage(null)).toBe(false)
    expect(hasRealImage(undefined)).toBe(false)
    expect(hasRealImage(42)).toBe(false)
  })

  it('trata los placeholders de placehold.co como "sin imagen"', () => {
    expect(hasRealImage('https://placehold.co/400x400/F3E8EE/936DA4?text=BTS')).toBe(false)
    expect(hasRealImage('HTTP://PLACEHOLD.CO/10')).toBe(false)
  })
})

describe('productBadge', () => {
  it('sin variante: No disponible', () => {
    expect(productBadge(null)).toEqual({ key: 'unavailable', label: 'No disponible' })
  })

  it('stock 0: Agotado', () => {
    expect(productBadge({ stock: 0 })).toEqual({ key: 'sold_out', label: 'Agotado' })
  })

  it('stock de 1 a 4: Últimas piezas', () => {
    expect(productBadge({ stock: 1 })).toEqual({ key: 'low_stock', label: 'Últimas piezas' })
    expect(productBadge({ stock: 4 })).toEqual({ key: 'low_stock', label: 'Últimas piezas' })
  })

  it('stock de 5 o mas: sin etiqueta', () => {
    expect(productBadge({ stock: 5 })).toBe(null)
  })
})
