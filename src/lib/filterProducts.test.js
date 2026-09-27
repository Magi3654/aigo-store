import { describe, it, expect } from 'vitest'
import { filterProducts } from './filterProducts.js'

const P = [
  { id: 1, name: 'BTS - Album "Proof"', group: 'BTS', category: 'Albums' },
  { id: 2, name: 'Stray Kids - Hoodie "MANIAC"', group: 'Stray Kids', category: 'Ropa' },
  { id: 3, name: 'Vela aromática', group: 'AIGO', category: 'Velas' },
]

const ids = (list) => list.map((p) => p.id)

describe('filterProducts', () => {
  it('sin filtros devuelve todo', () => {
    expect(ids(filterProducts(P, {}))).toEqual([1, 2, 3])
  })

  it('filtra por categoria', () => {
    expect(ids(filterProducts(P, { cat: 'Ropa' }))).toEqual([2])
  })

  it('busca por nombre o grupo sin distinguir mayusculas', () => {
    expect(ids(filterProducts(P, { q: 'STRAY kids' }))).toEqual([2])
    expect(ids(filterProducts(P, { q: 'bts' }))).toEqual([1])
  })

  it('ignora acentos en ambos sentidos', () => {
    expect(ids(filterProducts(P, { q: 'aromatica' }))).toEqual([3])
    expect(ids(filterProducts(P, { q: 'ÁLBUM' }))).toEqual([1])
  })

  it('combina busqueda y categoria, e ignora espacios alrededor', () => {
    expect(ids(filterProducts(P, { q: '  bts ', cat: 'Ropa' }))).toEqual([])
  })
})
