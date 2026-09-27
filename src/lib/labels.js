export function bagLabel(count) {
  if (count === 0) return 'Bolsa, vacía'
  return `Bolsa, ${count} ${count === 1 ? 'artículo' : 'artículos'}`
}

export function resultsLabel(count) {
  return `${count} ${count === 1 ? 'producto' : 'productos'}`
}
