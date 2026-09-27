import { describe, it, expect } from 'vitest'
import { categoryLabel, normalizeCategory } from './categories.js'

describe('categoryLabel', () => {
  it('traduce las categorias al texto que ve el cliente', () => {
    expect(categoryLabel('Albums')).toBe('Álbumes')
    expect(categoryLabel('Posters')).toBe('Pósters')
    expect(categoryLabel('Velas')).toBe('Velas')
    expect(categoryLabel('Lightsticks')).toBe('Lightsticks')
  })

  it('deja tal cual una categoria desconocida', () => {
    expect(categoryLabel('Tazas')).toBe('Tazas')
  })
})

describe('normalizeCategory', () => {
  it('acepta solo categorias existentes', () => {
    expect(normalizeCategory('Velas')).toBe('Velas')
    expect(normalizeCategory('Inventada')).toBe('')
    expect(normalizeCategory(['Albums'])).toBe('')
    expect(normalizeCategory(undefined)).toBe('')
  })
})
