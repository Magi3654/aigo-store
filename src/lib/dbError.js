// Traduce los codigos de PostgreSQL/PostgREST a algo que el admin entienda.
export function describeDbError(error) {
  if (!error) return null
  const haystack = `${error.constraint ?? ''} ${error.message ?? ''} ${error.details ?? ''}`

  if (error.code === '23505') {
    if (haystack.includes('products_name_key')) return 'Ya existe un producto con ese nombre'
    if (haystack.includes('product_variants_sku_key')) return 'Ese SKU ya está en uso'
    return 'Ese valor ya existe en la base de datos'
  }
  if (error.code === '42501') return 'Tu cuenta no tiene permisos para esta acción'
  if (error.code === '23514') return 'Algún valor no cumple las reglas de la base de datos'

  console.error('[db]', error)
  return 'Ocurrió un error inesperado'
}
