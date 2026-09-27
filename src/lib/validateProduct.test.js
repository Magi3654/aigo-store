import { describe, it, expect } from 'vitest'
import { validateProduct, isValid, CATEGORIES } from './validateProduct.js'

function form(overrides = {}) {
  return {
    name: 'BTS - Album Proof',
    group: 'BTS',
    category: 'Albums',
    description: '',
    image_url: '',
    is_active: true,
    variants: [
      { label: 'Único', sku: null, price_cents: 85000, stock: 15, weight_grams: 300, image_url: null, is_active: true },
    ],
    ...overrides,
  }
}

describe('validateProduct', () => {
  it('acepta un formulario correcto', () => {
    const errors = validateProduct(form())
    expect(errors).toEqual({})
    expect(isValid(errors)).toBe(true)
  })

  it('exige nombre, grupo y categoria valida', () => {
    expect(validateProduct(form({ name: '   ' })).name).toBeTruthy()
    expect(validateProduct(form({ group: '' })).group).toBeTruthy()
    expect(validateProduct(form({ category: 'Peluches' })).category).toBeTruthy()
  })

  it('expone las categorias del CHECK de la tabla', () => {
    expect(CATEGORIES).toEqual(['Albums', 'Lightsticks', 'Ropa', 'Photocards', 'Posters'])
  })

  it('exige al menos una variante', () => {
    expect(validateProduct(form({ variants: [] })).variants).toBeTruthy()
  })

  it('exige que un producto activo tenga una variante activa', () => {
    const errors = validateProduct(form({
      variants: [{ label: 'Único', price_cents: 100, stock: 1, weight_grams: 300, is_active: false }],
    }))
    expect(errors.variants).toBe('Un producto activo necesita al menos una variante activa')
  })

  it('permite un producto inactivo sin variantes activas', () => {
    const errors = validateProduct(form({
      is_active: false,
      variants: [{ label: 'Único', price_cents: 100, stock: 1, weight_grams: 300, is_active: false }],
    }))
    expect(errors).toEqual({})
  })

  it('valida cada variante y reporta el indice', () => {
    const errors = validateProduct(form({
      variants: [
        { label: 'Único', price_cents: 85000, stock: 15, weight_grams: 300, is_active: true },
        { label: '  ', price_cents: null, stock: -1, weight_grams: 0, is_active: true },
      ],
    }))
    expect(errors.variantErrors[0]).toEqual({})
    expect(errors.variantErrors[1].label).toBeTruthy()
    expect(errors.variantErrors[1].price_cents).toBeTruthy()
    expect(errors.variantErrors[1].stock).toBeTruthy()
    expect(errors.variantErrors[1].weight_grams).toBe('El peso debe ser mayor a 0')
    expect(isValid(errors)).toBe(false)
  })

  it('rechaza precios y stock no enteros', () => {
    const errors = validateProduct(form({
      variants: [{ label: 'Único', price_cents: 85000.5, stock: 1.5, weight_grams: 300, is_active: true }],
    }))
    expect(errors.variantErrors[0].price_cents).toBeTruthy()
    expect(errors.variantErrors[0].stock).toBeTruthy()
  })
})
