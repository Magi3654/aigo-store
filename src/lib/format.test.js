import { describe, it, expect } from 'vitest'
import { formatMXN } from './format.js'

describe('formatMXN', () => {
  it('formatea centavos como moneda MXN', () => {
    expect(formatMXN(85000)).toBe('$850.00')
  })
  it('formatea cero', () => {
    expect(formatMXN(0)).toBe('$0.00')
  })
  it('trata null/undefined como cero', () => {
    expect(formatMXN(null)).toBe('$0.00')
    expect(formatMXN(undefined)).toBe('$0.00')
  })
})
