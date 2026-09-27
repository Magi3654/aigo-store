import { describe, it, expect } from 'vitest'
import { describeDbError } from './dbError.js'

describe('describeDbError', () => {
  it('devuelve null si no hay error', () => {
    expect(describeDbError(null)).toBe(null)
    expect(describeDbError(undefined)).toBe(null)
  })

  it('traduce el nombre de producto duplicado', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "products_name_key"' }
    expect(describeDbError(err)).toBe('Ya existe un producto con ese nombre')
  })

  it('traduce el SKU duplicado', () => {
    const err = { code: '23505', message: 'duplicate key', details: 'Key (sku)=(SKU-M) already exists.', constraint: 'product_variants_sku_key' }
    expect(describeDbError(err)).toBe('Ese SKU ya está en uso')
  })

  it('traduce la falta de permisos', () => {
    expect(describeDbError({ code: '42501', message: 'permission denied for table products' }))
      .toBe('Tu cuenta no tiene permisos para esta acción')
  })

  it('traduce una violacion de CHECK', () => {
    expect(describeDbError({ code: '23514', message: 'new row violates check constraint' }))
      .toBe('Algún valor no cumple las reglas de la base de datos')
  })

  it('cae al mensaje original cuando no reconoce el codigo', () => {
    expect(describeDbError({ code: 'PGRST301', message: 'JWT expired' })).toBe('JWT expired')
  })

  it('tiene un mensaje generico si no hay nada que mostrar', () => {
    expect(describeDbError({})).toBe('Ocurrió un error inesperado')
  })
})
