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
