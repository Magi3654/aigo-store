// Los productos sembrados usan placehold.co como imagen provisional: para la
// tienda eso es "sin imagen" y se muestra la tarjeta tipografica.
export function hasRealImage(url) {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  return !/^https?:\/\/placehold\.co\//i.test(trimmed)
}

export function productBadge(variant) {
  if (!variant) return { key: 'unavailable', label: 'No disponible' }
  if (variant.stock <= 0) return { key: 'sold_out', label: 'Agotado' }
  if (variant.stock < 5) return { key: 'low_stock', label: 'Últimas piezas' }
  return null
}

// En la tarjeta, un producto con varias versiones solo esta agotado si lo estan
// todas: la etiqueta se calcula sobre el stock total, no sobre la primera.
export function tileBadge(product) {
  const variants = product?.variants ?? []
  if (variants.length === 0) return productBadge(null)
  if (variants.length === 1) return productBadge(variants[0])
  return productBadge({ stock: variants.reduce((sum, v) => sum + v.stock, 0) })
}

// El detalle abre en la primera version que se puede comprar.
export function preferredVariant(product) {
  const variants = product?.variants ?? []
  return variants.find((v) => v.stock > 0) ?? variants[0] ?? null
}
