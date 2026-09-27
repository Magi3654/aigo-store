import { describe, it, expect, vi } from 'vitest'
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

  it('cae a un mensaje generico y registra el detalle en consola cuando no reconoce el codigo', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = { code: 'PGRST301', message: 'JWT expired' }
    expect(describeDbError(err)).toBe('Ocurrió un error inesperado')
    expect(spy).toHaveBeenCalledWith('[db]', err)
    spy.mockRestore()
  })

  it('tiene un mensaje generico y registra el detalle en consola si no hay nada que mostrar', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = {}
    expect(describeDbError(err)).toBe('Ocurrió un error inesperado')
    expect(spy).toHaveBeenCalledWith('[db]', err)
    spy.mockRestore()
  })
})
