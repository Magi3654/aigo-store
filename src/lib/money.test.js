import { describe, it, expect } from 'vitest'
import { pesosToCents, centsToPesos } from './money.js'

describe('pesosToCents', () => {
  it('convierte montos con dos decimales', () => {
    expect(pesosToCents('850.00')).toBe(85000)
    expect(pesosToCents('0')).toBe(0)
    expect(pesosToCents('1234.5')).toBe(123450)
  })

  it('no arrastra errores de punto flotante', () => {
    expect(pesosToCents('19.99')).toBe(1999)
    expect(pesosToCents('1.005')).toBe(null)
  })

  it('acepta numeros ademas de cadenas', () => {
    expect(pesosToCents(850)).toBe(85000)
    expect(pesosToCents(19.99)).toBe(1999)
  })

  it('ignora separadores de miles y espacios', () => {
    expect(pesosToCents(' 1,234.50 ')).toBe(123450)
  })

  it('devuelve null ante entradas invalidas', () => {
    expect(pesosToCents('')).toBe(null)
    expect(pesosToCents('   ')).toBe(null)
    expect(pesosToCents('abc')).toBe(null)
    expect(pesosToCents('-5')).toBe(null)
    expect(pesosToCents(null)).toBe(null)
    expect(pesosToCents(undefined)).toBe(null)
  })
})

describe('centsToPesos', () => {
  it('formatea con dos decimales', () => {
    expect(centsToPesos(85000)).toBe('850.00')
    expect(centsToPesos(1999)).toBe('19.99')
    expect(centsToPesos(0)).toBe('0.00')
  })

  it('trata null y undefined como cero', () => {
    expect(centsToPesos(null)).toBe('0.00')
    expect(centsToPesos(undefined)).toBe('0.00')
  })

  it('sobrevive la ida y vuelta', () => {
    expect(pesosToCents(centsToPesos(123450))).toBe(123450)
  })
})
