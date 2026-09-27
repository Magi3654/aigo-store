import { describe, it, expect } from 'vitest'
import { bagLabel, resultsLabel } from './labels.js'

describe('bagLabel', () => {
  it('singular, plural y vacio', () => {
    expect(bagLabel(0)).toBe('Bolsa, vacía')
    expect(bagLabel(1)).toBe('Bolsa, 1 artículo')
    expect(bagLabel(3)).toBe('Bolsa, 3 artículos')
  })
})

describe('resultsLabel', () => {
  it('singular y plural', () => {
    expect(resultsLabel(0)).toBe('0 productos')
    expect(resultsLabel(1)).toBe('1 producto')
    expect(resultsLabel(12)).toBe('12 productos')
  })
})
