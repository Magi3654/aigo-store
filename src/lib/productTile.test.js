import { describe, it, expect } from 'vitest'
import { hasRealImage, productBadge, tileBadge, preferredVariant, tileCta, displayImage } from './productTile.js'

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

describe('tileBadge', () => {
  const v = (stock) => ({ id: `v${stock}`, stock })

  it('sin variantes: No disponible', () => {
    expect(tileBadge({ variants: [] })).toEqual({ key: 'unavailable', label: 'No disponible' })
  })

  it('una variante: su propio stock', () => {
    expect(tileBadge({ variants: [v(3)] })).toEqual({ key: 'low_stock', label: 'Últimas piezas' })
  })

  it('varias variantes: no marca Agotado si alguna tiene stock', () => {
    expect(tileBadge({ variants: [v(0), v(9)] })).toBe(null)
  })

  it('varias variantes: Agotado solo si todas estan en 0', () => {
    expect(tileBadge({ variants: [v(0), v(0)] })).toEqual({ key: 'sold_out', label: 'Agotado' })
  })

  it('varias variantes: Últimas piezas segun el stock total', () => {
    expect(tileBadge({ variants: [v(0), v(2), v(1)] })).toEqual({ key: 'low_stock', label: 'Últimas piezas' })
  })
})

describe('preferredVariant', () => {
  it('elige la primera variante con stock', () => {
    const p = { variants: [{ id: 'a', stock: 0 }, { id: 'b', stock: 9 }], defaultVariant: { id: 'a', stock: 0 } }
    expect(preferredVariant(p).id).toBe('b')
  })

  it('si ninguna tiene stock, la primera', () => {
    const p = { variants: [{ id: 'a', stock: 0 }, { id: 'b', stock: 0 }] }
    expect(preferredVariant(p).id).toBe('a')
  })

  it('sin variantes o sin producto: null', () => {
    expect(preferredVariant({ variants: [] })).toBe(null)
    expect(preferredVariant(null)).toBe(null)
  })
})

describe('tileCta', () => {
  const v = (id, stock) => ({ id, stock })

  it('varias versiones: Ver opciones', () => {
    expect(tileCta({ variants: [v('a', 0), v('b', 3)] })).toEqual({ kind: 'options', label: 'Ver opciones' })
  })

  it('una version con stock: Agregar', () => {
    expect(tileCta({ variants: [v('a', 3)] })).toEqual({ kind: 'add', label: 'Agregar' })
  })

  it('una version sin stock: Agotado, deshabilitado', () => {
    expect(tileCta({ variants: [v('a', 0)] })).toEqual({ kind: 'disabled', label: 'Agotado' })
  })

  it('sin versiones: No disponible, igual que la etiqueta', () => {
    expect(tileCta({ variants: [] })).toEqual({ kind: 'disabled', label: 'No disponible' })
  })
})

describe('displayImage', () => {
  const product = { image_url: 'https://images.unsplash.com/p.jpg' }

  it('usa la imagen de la version si es real', () => {
    expect(displayImage(product, { image_url: 'https://images.unsplash.com/v.jpg' })).toBe('https://images.unsplash.com/v.jpg')
  })

  it('un placeholder en la version no tapa la foto real del producto', () => {
    expect(displayImage(product, { image_url: 'https://placehold.co/400' })).toBe('https://images.unsplash.com/p.jpg')
  })

  it('sin version, la del producto', () => {
    expect(displayImage(product, null)).toBe('https://images.unsplash.com/p.jpg')
  })

  it('si ninguna es real: null (tarjeta tipografica)', () => {
    expect(displayImage({ image_url: 'https://placehold.co/1' }, { image_url: null })).toBe(null)
  })
})
