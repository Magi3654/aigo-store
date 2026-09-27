import { describe, it, expect } from 'vitest'
import { variantDiff } from './variantDiff.js'

const loaded = [
  { id: 'v1', label: 'Único', sku: null, price_cents: 85000, stock: 15, weight_grams: 300, image_url: null, is_active: true },
  { id: 'v2', label: 'Talla M', sku: 'SKU-M', price_cents: 75000, stock: 5, weight_grams: 400, image_url: null, is_active: true },
]

describe('variantDiff', () => {
  it('sin cambios no produce operaciones', () => {
    const diff = variantDiff(loaded.map((v) => ({ ...v })), loaded)
    expect(diff).toEqual({ toInsert: [], toUpdate: [], toDeactivate: [] })
  })

  it('detecta una variante nueva (sin id)', () => {
    const nueva = { label: 'Talla L', sku: null, price_cents: 75000, stock: 3, weight_grams: 420, image_url: null, is_active: true }
    const diff = variantDiff([...loaded, nueva], loaded)
    expect(diff.toInsert).toEqual([nueva])
    expect(diff.toUpdate).toEqual([])
  })

  it('detecta cambios de precio y stock', () => {
    const editada = { ...loaded[0], price_cents: 90000, stock: 12 }
    const diff = variantDiff([editada, { ...loaded[1] }], loaded)
    expect(diff.toUpdate).toEqual([editada])
    expect(diff.toInsert).toEqual([])
  })

  it('una variante guardada que se quita del formulario se desactiva', () => {
    const diff = variantDiff([{ ...loaded[0] }], loaded)
    expect(diff.toDeactivate).toEqual(['v2'])
  })

  it('no desactiva dos veces una variante ya inactiva', () => {
    const conInactiva = [loaded[0], { ...loaded[1], is_active: false }]
    const diff = variantDiff([{ ...loaded[0] }], conInactiva)
    expect(diff.toDeactivate).toEqual([])
  })

  it('desactivar desde el formulario cuenta como update, no como baja', () => {
    const desactivada = { ...loaded[1], is_active: false }
    const diff = variantDiff([{ ...loaded[0] }, desactivada], loaded)
    expect(diff.toUpdate).toEqual([desactivada])
    expect(diff.toDeactivate).toEqual([])
  })

  it('trata null y undefined como el mismo valor vacio', () => {
    const igual = { ...loaded[0], sku: undefined, image_url: undefined }
    const diff = variantDiff([igual, { ...loaded[1] }], loaded)
    expect(diff.toUpdate).toEqual([])
  })

  it('funciona con un producto nuevo (sin variantes cargadas)', () => {
    const nueva = { label: 'Único', price_cents: 100, stock: 1, weight_grams: 300, is_active: true }
    expect(variantDiff([nueva], [])).toEqual({ toInsert: [nueva], toUpdate: [], toDeactivate: [] })
  })
})
